import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LobbyService, STALE_CLIENT_MS } from '../../server/LobbyService';
import { AccountStore } from '../../server/AccountStore';
import { balanceTeams, sameQueue, skillFits } from '../../server/matchmaking';
import { emptyCommand } from '../../src/sim/entities/Agent';
import { applySnapshot, captureSnapshot, decode, encode } from '../../src/net/snapshot';
import { roomOptions, sanitizeCommand, type ServerMessage } from '../../src/net/protocol';
import { RemoteMatch } from '../../src/net/RemoteMatch';
import type { OnlineClient } from '../../src/net/OnlineClient';
import { awardAction, newCareer } from '../../src/progression/career';

function setup() {
  let now = 1000; const service = new LobbyService(() => now);
  const peer = () => {
    const messages: ServerMessage[] = [], close = vi.fn();
    const id = service.connect({ send: m => messages.push(JSON.parse(JSON.stringify(m))), close });
    return { id, messages, close, send: (m: unknown) => service.receive(id, m) };
  };
  const room = (p: ReturnType<typeof peer>, teamSize = 2) => {
    p.send({ type: 'create', visibility: 'private', name: 'Host', options: { teamSize, length: 'quick' } });
    return [...service.rooms.values()].at(-1)!;
  };
  return { service, peer, room, tick: (ms = 16) => { now += ms; service.step(); } };
}
const started = (messages: ServerMessage[]) => {
  const m = messages.find(m => m.type === 'started'); if (m?.type !== 'started') throw new Error('No match start'); return m.match;
};

describe('untrusted input cannot crash the server', () => {
  it('reduces camera-cycle input to a whole step, so a fractional value never indexes the feed list', () => {
    expect(sanitizeCommand({ ...emptyCommand(), camCycle: 0.5 })!.camCycle).toBe(1);
    expect(sanitizeCommand({ ...emptyCommand(), camCycle: -0.01 })!.camCycle).toBe(-1);
    const { peer, room, tick, service } = setup(), a = peer(), r = room(a); a.send({ type: 'start' });
    const me = r.match!.getAgent(started(a.messages).playerId)!;
    me.team = 'CT'; r.match!.skipFreeze();
    a.send({ type: 'input', seq: 1, command: { ...emptyCommand(), cams: true } }); tick();
    expect(me.operating).not.toBeNull(); // watching building CCTV: the crash needed an active feed
    a.send({ type: 'input', seq: 2, command: { ...emptyCommand(), camCycle: 0.5 } });
    expect(() => tick()).not.toThrow();
    expect(service.rooms.has(r.code)).toBe(true);
    expect(() => r.match!.gadgets.cycle(me, 0.5)).not.toThrow();
    expect(me.operating).not.toBeNull();
  });
  it('contains a simulation failure to its own room, without abandon penalties, and keeps other rooms running', () => {
    const { peer, room, tick, service } = setup(), a = peer(), b = peer();
    const broken = room(a), healthy = room(b);
    a.send({ type: 'start' }); b.send({ type: 'start' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      broken.match!.step = () => { throw new Error('simulated fault'); };
      const tickBefore = healthy.match!.tick;
      tick();
      expect(service.rooms.has(broken.code)).toBe(false);
      expect(healthy.match!.tick).toBe(tickBefore + 1);
      expect(a.messages.some(m => m.type === 'error' && m.message.includes('server error'))).toBe(true);
      const career = service.clients.get(a.id)!.account.career;
      expect(career.recentMatches).toHaveLength(0); expect(service.clients.get(a.id)!.room).toBeNull();
      a.send({ type: 'create', visibility: 'private', name: 'Again', options: { teamSize: 1, length: 'quick' } });
      expect(service.clients.get(a.id)!.room).not.toBeNull();
    } finally { log.mockRestore(); }
  });
});

describe('replication of non-JSON state', () => {
  it('round-trips Sets, so a replicated ammo box still answers whether a player has used it', () => {
    expect(decode(JSON.parse(JSON.stringify(encode({ ids: new Set([3, 5]) })))).ids).toEqual(new Set([3, 5]));
    const { peer, room } = setup(), a = peer(), r = room(a); a.send({ type: 'start' });
    const m = r.match!, start = started(a.messages), me = m.getAgent(start.playerId)!;
    const replica = new RemoteMatch({} as OnlineClient, start);
    expect(m.gadgets.placeAt(me, 'ammoBox', me.pos.clone(), 0)).toBe(true);
    const placed = m.gadgets.devices.find(d => d.kind === 'ammoBox')!;
    placed.usedBy = new Set([me.id]);
    applySnapshot(replica, JSON.parse(JSON.stringify(captureSnapshot(m))));
    const box = replica.gadgets.devices.find(d => d.id === placed.id)!;
    expect(box.usedBy).toBeInstanceOf(Set);
    expect(() => replica.gadgets.ammoBoxNear(replica.player!)).not.toThrow();
    expect(replica.gadgets.ammoBoxNear(replica.player!)).toBeNull();
  });
});

describe('sessions and disconnects', () => {
  it('lets a reconnect replace a silent dead session, but still rejects a second live tab', () => {
    let now = 0; const service = new LobbyService(() => now), close = vi.fn(), messages: ServerMessage[] = [];
    const first = service.connect({ send: m => messages.push(m), close });
    const welcome = messages[0]; if (welcome.type !== 'welcome') throw new Error();
    awardAction(service.clients.get(first)!.account.career, 'kill', 0);
    now += 1000; service.receive(first, { type: 'ping', sentAt: 1 });
    expect(() => service.connect({ send: () => {} }, welcome.token)).toThrow(/already connected/);
    now += STALE_CLIENT_MS + 1;
    const resumed: ServerMessage[] = [];
    const second = service.connect({ send: m => resumed.push(m) }, welcome.token);
    expect(close).toHaveBeenCalledOnce(); expect(service.clients.has(first)).toBe(false);
    expect(resumed[0]).toMatchObject({ type: 'welcome', accountId: welcome.accountId });
    expect(service.clients.get(second)!.account.career.kills).toBe(1);
  });
  it('takes a departing player out of a camera feed so their bot replacement can act', () => {
    const { peer, room, service } = setup(), a = peer(), b = peer(), r = room(a);
    b.send({ type: 'join', name: 'B', code: r.code }); a.send({ type: 'start' });
    const m = r.match!, me = m.getAgent(started(a.messages).playerId)!;
    me.operating = 12345;
    service.disconnect(a.id);
    expect(me.isBot).toBe(true); expect(me.operating).toBeNull();
  });
});

describe('profile storage failures', () => {
  it('keeps the game running and reports unhealthy storage when the save file cannot be written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aci-store-'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const blocker = join(dir, 'not-a-directory'); writeFileSync(blocker, '');
      const store = new AccountStore(join(blocker, 'accounts.json'));
      const login = store.authenticate(); awardAction(login.account.career, 'plant', 0); store.changed();
      expect(() => store.flush()).not.toThrow();
      expect(store.healthy).toBe(false);
    } finally { log.mockRestore(); rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('matchmaking rules', () => {
  const snd = roomOptions({ teamSize: 3, length: 'quick' })!;
  const career = (mmr: number, matches = 10) => { const c = newCareer(); c.rank.mmr = mmr; c.matches = matches; return c; };
  it('groups rooms by mode, size, playlist and the length rules that apply to that mode', () => {
    expect(sameQueue(snd, { ...snd })).toBe(true);
    expect(sameQueue(snd, { ...snd, length: 'standard' })).toBe(false);
    expect(sameQueue(snd, { ...snd, teamSize: 4 })).toBe(false);
    const z = roomOptions({ teamSize: 3, length: 'quick', mode: 'zombies' })!;
    expect(sameQueue(z, { ...z, length: 'standard' })).toBe(true);
    expect(sameQueue(z, { ...z, zDifficulty: 'nightmare' })).toBe(false);
  });
  it('widens the skill window with waiting time and separates newcomers only at first', () => {
    expect(skillFits(snd, [career(1000)], career(1200), 0)).toBe(false);
    expect(skillFits(snd, [career(1000)], career(1200), 60_000)).toBe(true);
    expect(skillFits(snd, [career(1200)], career(1200, 0), 0)).toBe(false);
    expect(skillFits(snd, [career(1200)], career(1200, 0), 90_000)).toBe(true);
    expect(skillFits({ ...snd, mode: 'zombies' }, [career(100)], career(3000), 0)).toBe(true);
  });
  it('balances public teams by skill while keeping sizes equal', () => {
    const players = [2000, 1500, 1400, 1300, 1200, 900].map(mmr => ({ team: 'T' as 'T' | 'CT', mmr }));
    balanceTeams(players, p => p.mmr, 3);
    const total = (t: string) => players.filter(p => p.team === t).reduce((n, p) => n + p.mmr, 0);
    expect(players.filter(p => p.team === 'T')).toHaveLength(3);
    expect(Math.abs(total('T') - total('CT'))).toBeLessThan(500);
  });
});
