import { PROTOCOL_VERSION, type ClientMessage, type LobbyState, type MatchStart, type ServerMessage } from './protocol';
import type { MatchSnapshot, WireEvent } from './snapshot';
import type { Award, Career } from '../progression/career';

export function defaultServerUrl() {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
  if (configured) return configured;
  const url = new URL('/online', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
export function normalizeServerUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || !['https:', 'http:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Enter a valid game server URL.');
  if (location.protocol === 'https:' && ['http:', 'ws:'].includes(url.protocol)) throw new Error('This page needs a secure game server URL (wss://).');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  if (url.pathname === '/') url.pathname = '/online';
  url.hash = ''; url.search = '';
  return url.href;
}

/** A single connection moves from menu to lobby to gameplay without changing identity. */
export class OnlineClient {
  id = '';
  pingMs = 0;
  connected = false;
  lastSnapshotAt = performance.now();
  onLobby: (lobby: LobbyState) => void = () => {};
  onStart: (match: MatchStart) => void = () => {};
  onError: (message: string) => void = () => {};
  onClose: () => void = () => {};
  onLeft: () => void = () => {};
  onCareer: (career: Career, awards: Award[], rankDelta?: number, ranked?: boolean) => void = () => {};
  career: Career | null = null;
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pending: { snapshot: MatchSnapshot; ack: number; events: WireEvent[] } | null = null;
  private seq = 0;
  private intentional = false;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const endpoint = normalizeServerUrl(url), key = `aci.online.identity:${endpoint}`;
      let token: string | null = null;
      try { token = localStorage.getItem(key); } catch { /* Session-only identity when storage is unavailable. */ }
      const ws = this.socket = new WebSocket(endpoint, ['aci-v2', ...(/^[a-f0-9]{64}$/.test(token ?? '') ? [`aci-auth.${token}`] : [])]);
      let settled = false;
      const timeout = setTimeout(() => { if (!settled) { settled = true; ws.close(); reject(new Error('Game server did not respond. Check its address and that it is running.')); } }, 10_000);
      ws.onmessage = event => {
        const m = JSON.parse(event.data) as ServerMessage;
        if (m.type === 'welcome') {
          clearTimeout(timeout);
          if (m.version !== PROTOCOL_VERSION) { ws.close(); if (!settled) { settled = true; reject(new Error('Game/server versions differ. Refresh the game or update the server.')); } return; }
          this.id = m.id; this.connected = true; this.lastSnapshotAt = performance.now();
          if (m.token) try { localStorage.setItem(key, m.token); } catch { /* Session-only identity. */ }
          if (m.career) { this.career = m.career; this.onCareer(m.career, []); }
          if (!settled) { settled = true; resolve(); }
          this.heartbeat = setInterval(() => this.send({ type: 'ping', sentAt: performance.now() }), 2000);
        } else if (m.type === 'lobby') this.onLobby(m.lobby);
        else if (m.type === 'started') { this.seq = 0; this.pending = null; this.lastSnapshotAt = performance.now(); this.onStart(m.match); }
        else if (m.type === 'snapshot') {
          this.lastSnapshotAt = performance.now();
          const events = [...(this.pending?.events ?? []), ...m.events].slice(-2048);
          this.pending = { snapshot: m.snapshot, ack: m.ack, events };
        } else if (m.type === 'error') this.onError(m.message);
        else if (m.type === 'left') this.onLeft();
        else if (m.type === 'pong') this.pingMs = Math.round(performance.now() - m.sentAt);
        else if (m.type === 'career') { this.career = m.career; this.onCareer(m.career, m.awards, m.rankDelta, m.ranked); }
      };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Cannot reach the game server. Check its address and network connection.')); } };
      ws.onclose = event => {
        clearTimeout(timeout); this.connected = false;
        if (this.heartbeat) clearInterval(this.heartbeat);
        if (!settled) { settled = true; reject(new Error(event.reason || 'Game server connection closed.')); }
        if (!this.intentional) this.onClose();
      };
    });
  }
  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 64_000) this.socket.send(JSON.stringify(message));
  }
  input(command: import('../sim/entities/Agent').AgentCommand) { const seq = ++this.seq; this.send({ type: 'input', seq, command }); return seq; }
  takeSnapshot() { const p = this.pending; this.pending = null; return p; }
  close() {
    this.intentional = true; this.connected = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close(); this.pending = null;
  }
}
