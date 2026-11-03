import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createGameServer } from '../../server/index';
import type { ServerMessage } from '../../src/net/protocol';
import { emptyCommand } from '../../src/sim/entities/Agent';

const servers: ReturnType<typeof createGameServer>[] = [];
afterEach(async () => { for (const s of servers.splice(0)) await s.close(); });
async function boot(origins?: string[]) {
  const app = createGameServer({ origins }); servers.push(app);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return { ...app, port: address.port };
}
function connect(port: number, origin?: string, credential?: string) {
  const url = `ws://127.0.0.1:${port}/online`;
  const ws = credential ? new WebSocket(url, ['aci-v2', `aci-auth.${credential}`], { origin }) : new WebSocket(url, { origin });
  const messages: ServerMessage[] = [];
  ws.on('message', data => messages.push(JSON.parse(String(data))));
  const wait = async (predicate: (m: ServerMessage) => boolean) => {
    const until = Date.now() + 5000;
    while (Date.now() < until) { const found = messages.find(predicate); if (found) return found; await new Promise(r => setTimeout(r, 10)); }
    throw new Error('Timed out waiting for server message');
  };
  return { ws, messages, wait, send: (v: unknown) => ws.send(JSON.stringify(v)) };
}
describe('real WebSocket game server', () => {
  it('resumes a saved device credential and rejects a concurrent connection without disturbing the original session', async () => {
    const app = await boot(), a = connect(app.port), welcome = await a.wait(m => m.type === 'welcome');
    if (welcome.type !== 'welcome') throw new Error();
    app.lobby.clients.get(welcome.id)!.account.career.xp = 1234;
    const duplicate = connect(app.port, undefined, welcome.token);
    expect(await new Promise<number>(resolve => duplicate.ws.once('close', resolve))).toBe(1008);
    expect(app.lobby.clients.size).toBe(1);
    a.ws.close(); await new Promise(resolve => a.ws.once('close', resolve));
    await new Promise(resolve => setTimeout(resolve, 30));
    const b = connect(app.port, undefined, welcome.token), resumed = await b.wait(m => m.type === 'welcome');
    expect(resumed).toMatchObject({ accountId: welcome.accountId, career: { xp: 1234 } }); b.ws.close();
  });
  it('serves health and synchronizes two isolated clients with authoritative input, purchase and disconnect/bot takeover', async () => {
    const app = await boot();
    expect((await fetch(`http://127.0.0.1:${app.port}/health`)).status).toBe(200);
    const a = connect(app.port), b = connect(app.port);
    await Promise.all([a.wait(m => m.type === 'welcome'), b.wait(m => m.type === 'welcome')]);
    a.send({ type: 'create', visibility: 'private', name: 'A', options: { teamSize: 2, length: 'quick' } });
    const lobby = await a.wait(m => m.type === 'lobby');
    if (lobby.type !== 'lobby') throw new Error();
    b.send({ type: 'join', code: lobby.lobby.code, name: 'B' });
    await b.wait(m => m.type === 'lobby'); a.send({ type: 'start' });
    const [as, bs] = await Promise.all([a.wait(m => m.type === 'started'), b.wait(m => m.type === 'started')]);
    if (as.type !== 'started' || bs.type !== 'started') throw new Error();
    expect(as.match.playerId).not.toBe(bs.match.playerId);
    a.send({ type: 'input', seq: 1, command: { ...emptyCommand(), yaw: 1.25 } });
    a.send({ type: 'buy', item: { kind: 'gear', id: 'kevlar' } });
    await a.wait(m => m.type === 'snapshot' && m.ack === 1);
    const room = app.lobby.rooms.get(lobby.lobby.code)!;
    expect(room.match!.getAgent(as.match.playerId)!.yaw).toBe(1.25);
    expect(room.match!.getAgent(as.match.playerId)!.armor).toBe(100);
    a.ws.close();
    await new Promise(resolve => a.ws.once('close', resolve));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(room.match!.getAgent(as.match.playerId)!.isBot).toBe(true);
    expect(room.match!.bots.size).toBe(3);
    b.ws.close();
  });
  it('rejects an unlisted origin and closes malformed JSON without crashing the service', async () => {
    const app = await boot(['https://game.example']);
    const denied = connect(app.port, 'https://unlisted.example');
    const error = await new Promise<Error>(resolve => denied.ws.once('error', resolve));
    expect(error.message).toContain('403');
    const accepted = connect(app.port, 'https://game.example'); await accepted.wait(m => m.type === 'welcome');
    accepted.ws.send('{');
    const code = await new Promise<number>(resolve => accepted.ws.once('close', resolve));
    expect(code).toBe(1007);
    expect(app.lobby.rooms.size).toBe(0);
  });
});
