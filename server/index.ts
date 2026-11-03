import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { LobbyService } from './LobbyService';
import { MOVE } from '../src/config/movement';
import { AccountStore } from './AccountStore';

export function createGameServer(options: { origins?: string[]; maxClients?: number; maxRooms?: number; now?: () => number; staticDir?: string; dataFile?: string; accounts?: AccountStore } = {}) {
  const lobby = new LobbyService(options.now, options.maxRooms, options.accounts ?? new AccountStore(options.dataFile));
  const root = resolve(options.staticDir ?? 'dist');
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
  const server = createServer(async (req, res) => {
    // /health is liveness (the host's restart probe): a storage outage must not restart live matches,
    // so it stays 200 and reports storage in the body. /ready is 503 while saves are failing.
    if (req.url === '/health' || req.url === '/ready') {
      const healthy = lobby.accounts.healthy;
      res.writeHead(req.url === '/ready' && !healthy ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: healthy ? 'ok' : 'storage_unavailable', storage: lobby.accounts.storage, rooms: lobby.rooms.size, players: lobby.clients.size }));
      return;
    }
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found');
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, handleProtocols: protocols => protocols.has('aci-v2') ? 'aci-v2' : false,
    perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true, concurrencyLimit: 4, zlibDeflateOptions: { level: 3 } } });
  const origins = options.origins ?? (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const perIP = new Map<string, number>();
  const configuredPerIP = Number(process.env.MAX_CONNECTIONS_PER_IP ?? 16);
  const maxPerIP = Number.isInteger(configuredPerIP) && configuredPerIP > 0 ? configuredPerIP : 16;
  server.on('upgrade', (req, socket, head) => {
    // Exact origin allow-list when configured. Same-origin/LAN is convenient in local development.
    const ip = req.socket.remoteAddress ?? 'unknown';
    let path: string;
    try { path = new URL(req.url ?? '/', 'http://localhost').pathname; }
    catch { socket.destroy(); return; }
    socket.on('error', () => socket.destroy());
    if (path !== '/online' ||
      (origins.length > 0 && !origins.includes(req.headers.origin ?? '')) ||
      lobby.clients.size >= (options.maxClients ?? 128) || (perIP.get(ip) ?? 0) >= maxPerIP) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      perIP.set(ip, (perIP.get(ip) ?? 0) + 1);
      const credential = req.headers['sec-websocket-protocol']?.split(',').map(p => p.trim()).find(p => p.startsWith('aci-auth.'))?.slice(9);
      wss.emit('connection', ws, ip, credential);
    });
  });
  const alive = new WeakSet<WebSocket>();
  wss.on('connection', (ws: WebSocket, ip: string, credential?: string) => {
    alive.add(ws);
    ws.on('error', () => ws.terminate());
    let id: string;
    try { id = lobby.connect({ send(message, encoded) {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (ws.bufferedAmount > 2_000_000) { ws.close(1013, 'Connection too slow'); return; }
      ws.send(encoded ?? JSON.stringify(message));
    }, close() { ws.terminate(); } }, credential); } catch (error) {
      const duplicate = error instanceof Error && error.message.includes('already connected');
      if (!duplicate) console.error('Online profile storage unavailable', error);
      ws.close(duplicate ? 1008 : 1011, duplicate ? 'Online profile already connected' : 'Online profile storage unavailable');
      const count = (perIP.get(ip) ?? 1) - 1; if (count > 0) perIP.set(ip, count); else perIP.delete(ip);
      return;
    }
    ws.on('pong', () => alive.add(ws));
    ws.on('message', (data, binary) => {
      if (binary) { ws.close(1003, 'JSON text required'); return; }
      let value: unknown;
      try { value = JSON.parse(data.toString()); } catch { ws.close(1007, 'Invalid JSON'); return; }
      lobby.receive(id, value);
    });
    ws.once('close', () => { lobby.disconnect(id); const n = (perIP.get(ip) ?? 1) - 1; if (n > 0) perIP.set(ip, n); else perIP.delete(ip); });
  });
  // Fixed-step accumulator avoids the drift caused by a 15ms/16ms timer at 64Hz.
  let last = performance.now(), acc = 0;
  const tick = setInterval(() => {
    const now = performance.now(); acc += Math.min(125, now - last); last = now;
    let steps = 0;
    while (acc >= 1000 / MOVE.tickRate && steps++ < 8) { lobby.step(); acc -= 1000 / MOVE.tickRate; }
  }, 4);
  const snapshots = setInterval(() => lobby.flush(), 50);
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!alive.has(ws)) ws.terminate(); else { alive.delete(ws); ws.ping(); } } }, 15_000);
  const persist = () => { void Promise.resolve().then(() => lobby.accounts.flush()).catch(() => console.error('Online profile save failed. Check server storage.')); };
  // Match results flush immediately; this timer only bounds how much mid-match XP a crash can lose.
  const persistence = setInterval(persist, lobby.accounts.storage === 'mysql' ? 15_000 : 5000);
  const close = async () => {
    lobby.shuttingDown = true;
    clearInterval(tick); clearInterval(snapshots); clearInterval(heartbeat); clearInterval(persistence);
    persist();
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>(done => wss.close(() => done()));
    await new Promise<void>(done => server.close(() => done()));
    await lobby.accounts.close();
  };
  return { server, lobby, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const storage = process.env.ACCOUNT_STORAGE ?? (process.env.MYSQL_HOST ? 'mysql' : 'file');
  if (!['file', 'mysql'].includes(storage)) throw new Error('ACCOUNT_STORAGE must be file or mysql');
  let accounts: AccountStore;
  if (storage === 'mysql') {
    const { mysqlPersistence } = await import('./MySqlPersistence');
    accounts = await AccountStore.fromPersistence(mysqlPersistence());
  } else accounts = new AccountStore(resolve(process.env.DATA_DIR ?? 'server-data', 'accounts.json'));
  const app = createGameServer({ accounts });
  const port = Number(process.env.PORT ?? 3001);
  app.server.listen(port, '0.0.0.0', () => console.log(`ACI online server listening on port ${port}; profile storage: ${accounts.storage}`));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void app.close().then(() => process.exit(0)).catch(() => { console.error('Server stopped with unsaved profile changes. Check database availability.'); process.exit(1); });
  });
}
