import { describe, expect, it } from 'vitest';
import { LobbyService } from '../../server/LobbyService';
import { emptyCommand } from '../../src/sim/entities/Agent';
import { applySnapshot, captureSnapshot, decode, encode } from '../../src/net/snapshot';
import { PROTOCOL_VERSION, QUEUE_WAIT_MS, sanitizeCommand, validBuyItem, type ServerMessage, type MatchStart } from '../../src/net/protocol';
import { RemoteMatch } from '../../src/net/RemoteMatch';
import type { OnlineClient } from '../../src/net/OnlineClient';
import { Vector3 } from 'three';

const options = { teamSize: 3, length: 'quick' };
function setup() {
  let now = 1000;
  const service = new LobbyService(() => now);
  const peer = () => {
    const messages: ServerMessage[] = [];
    const id = service.connect({ send: m => messages.push(JSON.parse(JSON.stringify(m))) });
    const send = (m: unknown) => service.receive(id, m);
    return { id, messages, send };
  };
  const create = (p: ReturnType<typeof peer>, visibility = 'private', teamSize = 3) => {
    p.send({ type: 'create', name: 'Casey', visibility, options: { ...options, teamSize } });
    return [...service.rooms.values()].at(-1)!;
  };
  return { service, peer, create, advance: (ms: number) => { now += ms; service.step(); } };
}
function started(messages: ServerMessage[]): MatchStart {
  const m = messages.find(m => m.type === 'started');
  if (m?.type !== 'started') throw new Error('No match start');
  return m.match;
}

describe('online rooms and matchmaking', () => {
  it('assigns unique five-digit codes, keeps private rooms out of public matchmaking and matches compatible public queues', () => {
    const { peer, create, service } = setup();
    const a = peer(), b = peer(), c = peer(), d = peer(), e = peer();
    const privateRoom = create(a);
    expect(privateRoom.code).toMatch(/^\d{5}$/);
    b.send({ type: 'queue', name: 'Bee', options });
    c.send({ type: 'queue', name: 'See', options });
    d.send({ type: 'queue', name: 'Dee', options: { ...options, teamSize: 4 } });
    e.send({ type: 'queue', name: 'Eee', options: { ...options, length: 'standard' } });
    expect(service.rooms.size).toBe(4);
    const publicRoom = [...service.rooms.values()].find(r => r.players.some(p => p.id === b.id))!;
    expect(publicRoom.players.map(p => p.id)).toEqual([b.id, c.id]);
    expect(new Set([...service.rooms.keys()]).size).toBe(4);
    c.send({ type: 'create', visibility: 'private', name: 'Duplicate', options });
    expect(service.rooms.size).toBe(4);
  });
  it('lets five friends join a 3v3 private room by code, restricts Play now to its owner, and fills exactly one bot', () => {
    const { peer, create } = setup();
    const a = peer(), r = create(a);
    const friends = Array.from({ length: 4 }, () => peer());
    for (const [i, p] of friends.entries()) p.send({ type: 'join', code: r.code, name: `Friend ${i}` });
    expect(r.players.filter(p => p.team === 'T')).toHaveLength(3);
    expect(r.players.filter(p => p.team === 'CT')).toHaveLength(2);
    friends[0].send({ type: 'start' });
    expect(r.match).toBeNull();
    a.send({ type: 'start' });
    expect(r.match?.agents).toHaveLength(6);
    expect(r.match?.bots.size).toBe(1);
    expect(new Set([a, ...friends].map(p => started(p.messages).playerId)).size).toBe(5);
    const late = peer(); late.send({ type: 'join', code: r.code, name: 'Late' });
    expect(late.messages.at(-1)?.type).toBe('error');
    expect(r.players).toHaveLength(5);
  });
  it('starts full public rooms immediately and creates a fresh queue for the next player', () => {
    const { peer, service } = setup();
    const a = peer(), b = peer(), c = peer();
    for (const p of [a, b, c]) p.send({ type: 'queue', name: 'Player', options: { ...options, teamSize: 1 } });
    expect(service.rooms.size).toBe(2);
    const rooms = [...service.rooms.values()];
    expect(rooms[0].match?.bots.size).toBe(0);
    expect(rooms[1].match).toBeNull();
    expect(started(a.messages).config.roster?.filter(a => !a.isBot)).toHaveLength(2);
  });
  it.each([1, 2, 3, 4, 5])('starts %iv%i after exactly three wall-clock minutes with all vacant spots filled', teamSize => {
    const { peer, create, advance } = setup();
    const a = peer(), r = create(a, 'public', teamSize);
    advance(QUEUE_WAIT_MS - 1); expect(r.match).toBeNull();
    advance(1); expect(r.match?.agents).toHaveLength(teamSize * 2);
    expect(r.match?.bots.size).toBe(teamSize * 2 - 1);
    for (const side of ['T', 'CT']) expect(r.match?.agents.filter(a => a.team === side)).toHaveLength(teamSize);
  });
  it('transfers lobby ownership, preserves its deadline, replaces a disconnected human with a bot and removes empty rooms', () => {
    const { peer, create, service } = setup();
    const a = peer(), b = peer(), r = create(a);
    b.send({ type: 'join', name: 'B', code: r.code });
    const deadline = r.startsAt;
    service.disconnect(a.id);
    expect(r.ownerId).toBe(b.id); expect(r.startsAt).toBe(deadline);
    b.send({ type: 'start' });
    const id = started(b.messages).playerId;
    const c = peer(); c.send({ type: 'join', code: r.code, name: 'Too late' });
    const a2 = peer(); const r2 = create(a2);
    const b2 = peer(); b2.send({ type: 'join', name: 'Second', code: r2.code }); a2.send({ type: 'start' });
    const target = r2.match!.getAgent(started(a2.messages).playerId)!;
    target.money = 321;
    service.disconnect(a2.id);
    expect(target.isBot).toBe(true); expect(target.money).toBe(321);
    expect(r2.match!.bots.has(target.id)).toBe(true);
    service.disconnect(b.id); expect(service.rooms.has(r.code)).toBe(false);
    expect(id).toBeGreaterThan(0);
    service.disconnect(b2.id); expect(service.rooms.size).toBe(0);
  });
  it('validates malformed messages, room settings, codes, buys, non-finite input and prototype keys', () => {
    const { peer, service } = setup(); const p = peer();
    for (const v of [null, 1, [], {}, { type: 'create', options: { teamSize: 500, length: 'quick' } },
      { type: 'create', visibility: 'private', options: { teamSize: 3, length: '__proto__' } }, { type: 'join', code: 'nope' }]) p.send(v);
    expect(service.rooms.size).toBe(0);
    expect(sanitizeCommand({ ...emptyCommand(), yaw: NaN })).toBeNull();
    const safe = sanitizeCommand({ ...emptyCommand(), forward: 900, health: 9000, position: [900, 0, 0] })!;
    expect(safe.forward).toBe(1); expect('health' in safe).toBe(false);
    expect(validBuyItem({ kind: 'weapon', id: '__proto__' })).toBe(false);
    expect(validBuyItem({ kind: 'attachment', id: '__proto__', weapon: 'ravager' })).toBe(false);
    expect(validBuyItem({ kind: 'weapon', id: 'ravager' })).toBe(true);
    expect(validBuyItem({ kind: 'weapon', id: 'disruptor' })).toBe(false);
    expect(p.messages[0]).toMatchObject({ type: 'welcome', id: p.id, version: PROTOCOL_VERSION });
  });
  it('applies commands to the correct humans once per server tick, clears stale movement, rejects replay and validates purchases', () => {
    const { peer, create, service, advance } = setup();
    const a = peer(), b = peer(), r = create(a);
    b.send({ type: 'join', name: 'B', code: r.code }); a.send({ type: 'start' });
    const m = r.match!, aa = m.getAgent(started(a.messages).playerId)!, bb = m.getAgent(started(b.messages).playerId)!;
    a.send({ type: 'input', seq: 1, command: { ...emptyCommand(), yaw: 1, pitch: .2, light: true } });
    b.send({ type: 'input', seq: 1, command: { ...emptyCommand(), yaw: -2 } });
    service.step(); expect(aa.yaw).toBe(1); expect(bb.yaw).toBe(-2);
    expect(aa.cmd.light).toBe(true); service.step(); expect(aa.cmd.light).toBe(false);
    a.send({ type: 'input', seq: 1, command: { ...emptyCommand(), yaw: 2 } }); service.step(); expect(aa.yaw).toBe(1);
    a.send({ type: 'input', seq: 2, command: { ...emptyCommand(), forward: 1, fire: true } });
    advance(251); expect(aa.cmd.forward).toBe(0); expect(aa.cmd.fire).toBe(false);
    const before = aa.money;
    a.send({ type: 'buy', item: { kind: 'weapon', id: 'disruptor' } });
    expect(m.tryBuy(aa, { kind: 'weapon', id: 'disruptor' })).toBe(false);
    expect(aa.money).toBe(before); expect(aa.primary).toBeNull();
    a.send({ type: 'buy', item: { kind: 'weapon', id: 'ravager' } });
    expect(aa.money).toBe(before); expect(aa.primary).toBeNull();
    a.send({ type: 'buy', item: { kind: 'gear', id: 'kevlar' } });
    expect(aa.armor).toBe(100); expect(aa.money).toBe(before - 650);
    service.flush();
    const packet = a.messages.at(-1); expect(packet?.type).toBe('snapshot');
    if (packet?.type === 'snapshot') expect(packet.ack).toBe(2);
  });
  it('serializes each snapshot once per room and the shared encoding matches every client message', () => {
    let now = 0; const service = new LobbyService(() => now);
    const sent: { message: ServerMessage; encoded?: string }[][] = [[], []];
    const ids = sent.map(log => service.connect({ send: (message, encoded) => log.push({ message, encoded }) }));
    service.receive(ids[0], { type: 'create', visibility: 'private', name: 'A', options });
    service.receive(ids[1], { type: 'join', name: 'B', code: [...service.rooms.keys()][0] });
    service.receive(ids[0], { type: 'start' });
    service.receive(ids[0], { type: 'input', seq: 3, command: emptyCommand() });
    now += 16; service.step(); service.flush();
    for (const log of sent) {
      const last = log.at(-1)!;
      expect(last.message.type).toBe('snapshot');
      expect(JSON.parse(last.encoded!)).toEqual(JSON.parse(JSON.stringify(last.message)));
    }
    expect(JSON.parse(sent[0].at(-1)!.encoded!).ack).toBe(3);
    expect(JSON.parse(sent[1].at(-1)!.encoded!).ack).toBe(0);
  });
  it('slows snapshots to 1 Hz once a match result is final', () => {
    const { peer, create, service, advance } = setup(); const a = peer(), r = create(a); a.send({ type: 'start' });
    r.match!.forceEnd('T'); service.step();
    const count = () => a.messages.filter(m => m.type === 'snapshot').length;
    service.flush(); const first = count();
    const finalPacket = a.messages.at(-1);
    expect(finalPacket?.type === 'snapshot' && finalPacket.events.some(e => e.type === 'matchEnd')).toBe(true);
    service.flush(); service.flush(); expect(count()).toBe(first);
    advance(1001); service.flush(); expect(count()).toBe(first + 1);
  });
  it('bounds input backlog and prevents packet floods from advancing simulation time', () => {
    const { peer, create, service } = setup(); const a = peer(), r = create(a); a.send({ type: 'start' });
    const tick = r.match!.tick;
    for (let seq = 1; seq <= 150; seq++) a.send({ type: 'input', seq, command: { ...emptyCommand(), forward: 1 } });
    expect(service.clients.get(a.id)!.pending).toHaveLength(8);
    expect(r.match!.tick).toBe(tick); service.step(); expect(r.match!.tick).toBe(tick + 1);
  });
});

describe('online replication and prediction', () => {
  it('invalidates visibility after smoke arrives in an authoritative snapshot', () => {
    const { peer, create } = setup(); const p = peer(), r = create(p); p.send({ type: 'start' });
    const m = r.match!, start = started(p.messages), a = m.getAgent(start.playerId)!;
    const enemy = m.agents.find(e => e.team !== a.team)!;
    m.debugTeleport(a, -1, 15, 0); m.debugTeleport(enemy, -1, 9, Math.PI);
    start.snapshot = captureSnapshot(m);
    let packet: any = null;
    const replica = new RemoteMatch({ takeSnapshot: () => packet } as unknown as OnlineClient, start);
    expect(replica.los(replica.player!, replica.getAgent(enemy.id)!)).toBe(true);
    m.utility.smokes.push({ id: 77, pos: new Vector3(-1, 0, 12), start: -10, end: 30 });
    packet = { snapshot: captureSnapshot(m), ack: 0, events: [] };
    replica.receiveSnapshot();
    expect(replica.los(replica.player!, replica.getAgent(enemy.id)!)).toBe(false);
  });
  it('round-trips vectors, maps, weapons/attachments, devices and dynamic colliders into a method-bearing replica', () => {
    const { peer, create } = setup(); const p = peer(), r = create(p); p.send({ type: 'start' });
    const m = r.match!, start = started(p.messages);
    const replica = new RemoteMatch({} as OnlineClient, start);
    const a = m.getAgent(start.playerId)!;
    a.motor.pos.set(1, 2, 3); a.damageTaken.set(77, 12);
    m.utility.smokes.push({ id: 5, pos: new Vector3(6, 7, 8), start: 0, end: 20 });
    m.world.collision.addDynamic({ minX: 2, minY: 0, minZ: 2, maxX: 3, maxY: 2, maxZ: 3, surface: 'metal' });
    applySnapshot(replica, JSON.parse(JSON.stringify(captureSnapshot(m))));
    expect(replica.player!.eyePos(new Vector3())).toBeInstanceOf(Vector3);
    expect(replica.player!.pos.toArray()).toEqual([1, 2, 3]);
    expect(replica.player!.damageTaken.get(77)).toBe(12);
    expect(replica.player!.activeWeapon()?.def.id).toBe(a.activeWeapon()?.def.id);
    expect(replica.utility.smokes[0].pos.distanceTo(new Vector3(6, 7, 8))).toBe(0);
    expect(replica.world.collision.dynamic).toHaveLength(1);
    const event = decode(JSON.parse(JSON.stringify(encode({ point: new Vector3(1, 2, 3) }))));
    expect(event.point.clone().toArray()).toEqual([1, 2, 3]);
  });
  it('predicts with shared collision physics, reconciles acknowledged input, and never locally advances damage or the round', () => {
    const { peer, create, service } = setup(); const p = peer(), r = create(p); p.send({ type: 'start' });
    const start = started(p.messages), m = r.match!;
    m.phase = 'live'; m.phaseEnd = 1000;
    start.snapshot = captureSnapshot(m);
    let seq = 0, packet: any = null;
    const client = { connected: true, lastSnapshotAt: performance.now(), input: (command: any) => { p.send({ type: 'input', command, seq: ++seq }); return seq; },
      takeSnapshot: () => { const result = packet; packet = null; return result; } } as unknown as OnlineClient;
    const replica = new RemoteMatch(client, start);
    const command = { ...emptyCommand(), right: 1, yaw: .3 };
    for (let i = 0; i < 6; i++) { replica.setPlayerCommand(command); replica.step(1 / 64); service.step(); }
    const authoritative = m.getAgent(start.playerId)!;
    expect(replica.player!.pos.distanceTo(authoritative.pos)).toBeLessThan(.001);
    expect(replica.time).toBe(0); expect(replica.tick).toBe(0);
    packet = { snapshot: captureSnapshot(m), ack: 6, events: [] };
    replica.receiveSnapshot();
    expect(replica.player!.pos.distanceTo(authoritative.pos)).toBeLessThan(.001);
    const health = replica.agents.map(a => a.health), time = replica.time;
    replica.setPlayerCommand({ ...command, fire: true }); replica.step(1 / 64);
    expect(replica.agents.map(a => a.health)).toEqual(health); expect(replica.time).toBe(time);
  });
});
