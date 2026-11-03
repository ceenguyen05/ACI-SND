import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { LobbyService, MATCH_TIME_LIMIT_MS } from '../../server/LobbyService';
import { ZombiesMatch } from '../../src/sim/zombies/ZombiesMatch';
import { RemoteZombiesMatch } from '../../src/net/RemoteZombiesMatch';
import { emptyCommand } from '../../src/sim/entities/Agent';
import { captureSnapshot } from '../../src/net/snapshot';
import type { OnlineClient } from '../../src/net/OnlineClient';
import type { RoomOptions, ServerMessage } from '../../src/net/protocol';
import { zWeapon } from '../../src/sim/zombies/zweapons';

function setup() {
  let now = 0; const service = new LobbyService(() => now);
  const peer = () => { const messages: ServerMessage[] = [], id = service.connect({ send: m => messages.push(JSON.parse(JSON.stringify(m))) });
    return { id, messages, send: (m: unknown) => service.receive(id, m) }; };
  const create = (p: ReturnType<typeof peer>, options: Partial<RoomOptions> = {}, visibility = 'private') => {
    p.send({ type: 'create', visibility, name: 'Owner', options: { teamSize: 3, length: 'quick', mode: 'zombies', ...options } }); return [...service.rooms.values()].at(-1)!;
  };
  return { service, peer, create, advance: (ms: number) => { now += ms; service.step(); } };
}
describe('online Zombies coop', () => {
  it('keeps queues separated by mode/difficulty and starts two humans plus one ally against AI zombies', () => {
    const { service, peer, create } = setup(), a = peer(), b = peer(), c = peer();
    const r = create(a); b.send({ type: 'join', code: r.code, name: 'Friend' }); a.send({ type: 'start' });
    const z = r.match as ZombiesMatch;
    expect(z).toBeInstanceOf(ZombiesMatch); expect(z.humans.filter(h => !h.isBot)).toHaveLength(2);
    expect(z.humans.filter(h => h.isBot)).toHaveLength(1); expect(z.allies.size).toBe(1);
    expect(z.zombiePool).toHaveLength(36); expect(z.zombiePool.every(z => z.isBot && z.team === 'T')).toBe(true);
    expect(z.humans.every(h => h.team === 'CT')).toBe(true); expect(r.ranked).toBe(false);
    a.send({ type: 'input', seq: 1, command: { ...emptyCommand(), yaw: .4 } });
    b.send({ type: 'input', seq: 1, command: { ...emptyCommand(), yaw: -.7 } }); service.step();
    expect(z.getAgent(service.clients.get(a.id)!.agentId)!.yaw).toBeCloseTo(.4);
    expect(z.getAgent(service.clients.get(b.id)!.agentId)!.yaw).toBeCloseTo(-.7);
    c.send({ type: 'queue', name: 'Other', options: { teamSize: 3, length: 'quick' } });
    expect(service.rooms.size).toBe(2);
  });
  it('fills open survivor slots after three minutes and preserves a departing player inventory under ally AI', () => {
    const { peer, create, advance, service } = setup(), a = peer(), b = peer(), r = create(a, { teamSize: 5 });
    b.send({ type: 'join', code: r.code, name: 'Friend' }); advance(179999); expect(r.match).toBeNull(); advance(1);
    const z = r.match as ZombiesMatch; expect(z.allies.size).toBe(3);
    const id = service.clients.get(a.id)!.agentId!, h = z.getAgent(id)!; h.money = 3456;
    service.disconnect(a.id); expect(z.allies.has(id)).toBe(true); expect(h.money).toBe(3456); expect(h.isBot).toBe(true);
  });
  it('replicates shared machines, gates, power, revives, hazards, pooled zombie ids and forged weapon stats without client simulation', () => {
    const { peer, create } = setup(), a = peer(), r = create(a); a.send({ type: 'start' });
    const z = r.match as ZombiesMatch, start = a.messages.find(m => m.type === 'started'); if (start?.type !== 'started') throw new Error();
    let packet: any = null;
    const client = { connected: true, lastSnapshotAt: performance.now(), input: () => 1, takeSnapshot: () => packet, send: () => {} } as unknown as OnlineClient;
    const replica = new RemoteZombiesMatch(client, start.match);
    const me = z.getAgent(start.match.playerId)!;
    me.primary = zWeapon('ravager', 1, ['rapidFire']); me.zp!.perks = ['rapidFire']; me.active = 'primary';
    z.power = true; z.openGate(me, 0, true); z.box.state = 'ready'; z.box.weapon = 'disruptor';
    z.gas.push({ id: 9, pos: new Vector3(1, 0, 2), radius: 3, start: 0, until: 10 });
    const spawned = z.spawnZombie('walker', 2, -28); expect(spawned).toBeTruthy();
    packet = { snapshot: JSON.parse(JSON.stringify(captureSnapshot(z))), ack: 0, events: [] };
    replica.receiveSnapshot();
    expect(replica.player!.id).toBe(me.id); expect(replica.player!.primary!.def.damage).toBe(me.primary.def.damage);
    expect(replica.player!.primary!.def.mag).toBe(me.primary.def.mag); expect(replica.power).toBe(true); expect(replica.gates[0].open).toBe(true);
    expect(replica.box.state).toBe('ready'); expect(replica.gas[0].pos).toBeInstanceOf(Vector3);
    expect(replica.zombiePool.map(z => z.id)).toEqual(z.zombiePool.map(z => z.id)); expect(replica.aliveZombies()).toHaveLength(z.aliveZombies().length);
    const time = replica.time, hp = replica.humans.map(h => h.health); replica.setPlayerCommand(emptyCommand()); replica.step(1 / 64);
    expect(replica.time).toBe(time); expect(replica.humans.map(h => h.health)).toEqual(hp); expect(replica.allies.size).toBe(0);
  });
  it('sends idle pooled zombies as identity only, while a replica keeps their state and sees new spawns in full', () => {
    const { peer, create } = setup(), a = peer(), r = create(a); a.send({ type: 'start' });
    const z = r.match as ZombiesMatch, start = a.messages.find(m => m.type === 'started'); if (start?.type !== 'started') throw new Error();
    const compact = captureSnapshot(z), full = captureSnapshot(z, true);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length / 3);
    expect(start.match.snapshot.agents.every(a => Object.keys(a as object).length > 2)).toBe(true);
    let packet: any = null;
    const client = { connected: true, lastSnapshotAt: performance.now(), input: () => 1, takeSnapshot: () => packet, send: () => {} } as unknown as OnlineClient;
    const replica = new RemoteZombiesMatch(client, start.match);
    const zombie = z.spawnZombie('walker', 2, -28)!; expect(zombie).toBeTruthy();
    packet = { snapshot: JSON.parse(JSON.stringify(captureSnapshot(z))), ack: 0, events: [] }; replica.receiveSnapshot();
    const copy = replica.getAgent(zombie.id)!;
    expect(copy.alive).toBe(true); expect(copy.pos.distanceTo(zombie.pos)).toBeLessThan(.001); expect(copy.zombie!.kind).toBe(zombie.zombie!.kind);
    const idle = replica.zombiePool.find(p => p.id !== zombie.id)!;
    expect(idle.alive).toBe(false); expect(idle.zombie).toBeTruthy(); expect(idle.maxHealth).toBeGreaterThan(0);
  });
  it('rejects armory purchases from across the map and never allows a client to control a zombie', () => {
    const { peer, create, service } = setup(), a = peer(), r = create(a); a.send({ type: 'start' });
    const z = r.match as ZombiesMatch, me = z.getAgent(service.clients.get(a.id)!.agentId)!;
    me.money = 10000; const before = me.money;
    a.send({ type: 'armory', item: 'kevlar' }); expect(me.money).toBe(before); expect(me.armor).toBe(0);
    a.send({ type: 'input', seq: 1, agentId: 100, command: { ...emptyCommand(), yaw: 1 } }); service.step();
    expect(me.yaw).toBe(1); expect(z.zombiePool.every(z => z.isBot)).toBe(true);
  });
});
describe('ranked eligibility and fair matchmaking', () => {
  it('rejects new accounts/private ranked rooms and never rates a bot-filled fallback', () => {
    const { peer, create, service } = setup(), a = peer();
    a.send({ type: 'queue', name: 'New', options: { teamSize: 3, length: 'quick', playlist: 'ranked' } });
    expect(service.rooms.size).toBe(0);
    const c = service.clients.get(a.id)!.account.career; c.xp = 20000; c.matches = 5;
    a.send({ type: 'create', name: 'New', visibility: 'private', options: { teamSize: 3, length: 'quick', playlist: 'ranked' } }); expect(service.rooms.size).toBe(0);
    const r = create(a, { mode: 'snd', playlist: 'ranked' }, 'public'); a.send({ type: 'start' });
    expect(r.ranked).toBe(false); expect(r.match!.bots.size).toBe(5); expect(c.rank.games).toBe(0);
  });
  it('uses server skill, narrows initial searches and widens them within a hard bound', () => {
    const { peer, service, advance } = setup(), a = peer(), b = peer(), c = peer();
    service.clients.get(a.id)!.account.career.rank.mmr = 1000;
    service.clients.get(b.id)!.account.career.rank.mmr = 1260;
    service.clients.get(c.id)!.account.career.rank.mmr = 2200;
    const options = { teamSize: 3, length: 'quick' };
    a.send({ type: 'queue', name: 'A', options }); b.send({ type: 'queue', name: 'B', options }); expect(service.rooms.size).toBe(2);
    b.send({ type: 'leave' }); advance(90000); b.send({ type: 'queue', name: 'B', options }); expect(service.rooms.size).toBe(1);
    c.send({ type: 'queue', name: 'C', options }); expect(service.rooms.size).toBe(2);
  });
  it('merges compatible waiting public rooms automatically when their skill windows expand', () => {
    const { peer, service, advance } = setup(), a = peer(), b = peer();
    service.clients.get(a.id)!.account.career.rank.mmr = 1000; service.clients.get(b.id)!.account.career.rank.mmr = 1260;
    for (const p of [a, b]) p.send({ type: 'queue', name: 'Player', options: { teamSize: 3, length: 'quick' } });
    expect(service.rooms.size).toBe(2); advance(89000); expect(service.rooms.size).toBe(2);
    advance(1000); expect(service.rooms.size).toBe(1); expect([...service.rooms.values()][0].players).toHaveLength(2);
  });
  const rankedRoom = () => {
    const s = setup(); const peers = Array.from({ length: 6 }, () => s.peer());
    for (const p of peers) Object.assign(s.service.clients.get(p.id)!.account.career, { xp: 20000, matches: 5 });
    const r = s.create(peers[0], { mode: 'snd', playlist: 'ranked' }, 'public');
    for (const p of peers.slice(1)) p.send({ type: 'join', name: 'Player', code: r.code });
    expect(r.ranked).toBe(true);
    return { ...s, r, careers: peers.map(p => s.service.clients.get(p.id)!.account.career) };
  };
  it('ends a match at the server time limit as a normal result instead of an abandonment', () => {
    const { r, careers, advance } = rankedRoom(), m = r.match!;
    for (const p of r.participants) p.activityTicks = 64 * 35;
    m.time = 600; m.score.T = 4; m.score.CT = 2;
    advance(MATCH_TIME_LIMIT_MS.snd + 1);
    expect(m.phase).toBe('matchOver'); expect(m.winner).toBe('T'); expect(r.finishedAt).not.toBeNull();
    for (const c of careers) { expect(c.matches).toBe(6); expect(c.rank.games).toBe(1); expect(c.rank.abandons).toBe(0); }
  });
  it('does not rate or charge an abandon for a ranked match that ended too quickly to mean anything', () => {
    const { r, careers, service } = rankedRoom(), m = r.match!;
    for (const p of r.participants) p.activityTicks = 64 * 35;
    m.time = 40; m.matchOver = true; m.phase = 'matchOver'; m.winner = 'CT';
    service.step();
    expect(r.finishedAt).not.toBeNull();
    for (const c of careers) { expect(c.rank.games).toBe(0); expect(c.rank.abandons).toBe(0); expect(c.matches).toBe(5); }
  });
  it('settles full-human ranked results once, penalizes abandonment once, and excludes private/PvE activity from rank', () => {
    const { peer, create, service } = setup(); const peers = Array.from({ length: 6 }, () => peer());
    for (const p of peers) Object.assign(service.clients.get(p.id)!.account.career, { xp: 20000, matches: 5 });
    const r = create(peers[0], { mode: 'snd', playlist: 'ranked' }, 'public');
    for (const p of peers.slice(1)) p.send({ type: 'join', name: 'Player', code: r.code });
    expect(r.ranked).toBe(true); expect(r.match!.bots.size).toBe(0);
    const firstCareer = service.clients.get(peers[0].id)!.account.career;
    peers[0].send({ type: 'leave' }); expect(firstCareer.rank.games).toBe(1); expect(firstCareer.rank.abandons).toBe(1);
    const m = r.match!; m.time = 200; m.matchOver = true; m.phase = 'matchOver'; m.winner = 'T'; m.score.T = 5;
    for (const p of r.participants) p.activityTicks = 64 * 35;
    service.step(); service.step();
    expect(firstCareer.rank.games).toBe(1); expect(firstCareer.matches).toBe(5);
    for (const p of peers.slice(1)) expect(service.clients.get(p.id)!.account.career.rank.games).toBe(1);
  });
});
