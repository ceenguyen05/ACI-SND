import { describe, expect, it } from 'vitest';
import { LobbyService } from '../../server/LobbyService';
import { roomOptions, PROTOCOL_VERSION, type MatchStart, type ServerMessage } from '../../src/net/protocol';
import { sameQueue } from '../../server/matchmaking';
import { RemoteMatch } from '../../src/net/RemoteMatch';
import type { OnlineClient } from '../../src/net/OnlineClient';
import { SND_MAP_IDS } from '../../src/sim/maps/index';

function setup() {
  let now = 1000;
  const service = new LobbyService(() => now);
  const peer = () => {
    const messages: ServerMessage[] = [];
    const id = service.connect({ send: m => messages.push(JSON.parse(JSON.stringify(m))) });
    return { id, messages, send: (m: unknown) => service.receive(id, m) };
  };
  return { service, peer, advance: (ms: number) => { now += ms; service.step(); } };
}
const started = (messages: ServerMessage[]): MatchStart => {
  const m = messages.find(m => m.type === 'started');
  if (m?.type !== 'started') throw new Error('No match start');
  return m.match;
};
const snd = (map?: unknown, teamSize = 2) => ({ teamSize, length: 'quick', mode: 'snd', map });

describe('online Search & Destroy map choice', () => {
  it('uses protocol version 3', () => expect(PROTOCOL_VERSION).toBe(3));

  it('validates the map option', () => {
    expect(roomOptions(snd('aci_b2'))?.map).toBe('aci_b2');
    expect(roomOptions(snd())?.map).toBe('random');
    expect(roomOptions(snd('random'))?.map).toBe('random');
    expect(roomOptions(snd('de_dust2'))).toBeNull();
    expect(roomOptions(snd(42))).toBeNull();
    expect(roomOptions({ teamSize: 2, length: 'quick', mode: 'zombies', map: 'aci_b2' })?.map).toBe('aci_hq');
  });

  it('a private room plays the map its owner chose, and the client replica builds that map', () => {
    const { peer, service } = setup();
    const a = peer();
    a.send({ type: 'create', name: 'Owner', visibility: 'private', options: snd('aci_b2') });
    a.send({ type: 'start' });
    const start = started(a.messages);
    expect(start.mapId).toBe('aci_b2');
    expect([...service.rooms.values()][0].match!.world.map.id).toBe('aci_b2');
    const client = { input: () => 1, send: () => {}, takeSnapshot: () => null, connected: true, lastSnapshotAt: 0 } as unknown as OnlineClient;
    const replica = new RemoteMatch(client, start);
    expect(replica.world.map.id).toBe('aci_b2');
    expect(replica.agents.length).toBe(4);
  });

  it("each round's spawn areas reach the client, so it can buy where it spawned", () => {
    for (const map of ['aci_hq', 'aci_b2']) {
      const { peer, service } = setup();
      const a = peer();
      a.send({ type: 'create', name: 'Owner', visibility: 'private', options: snd(map) });
      a.send({ type: 'start' });
      const start = started(a.messages);
      const server = [...service.rooms.values()][0].match!;
      const client = { input: () => 1, send: () => {}, takeSnapshot: () => null, connected: true, lastSnapshotAt: 0 } as unknown as OnlineClient;
      const replica = new RemoteMatch(client, start);
      expect(replica.spawnAreas).toEqual(server.spawnAreas);
      expect(server.spawnAreas.T.length).toBe(1);
      const me = replica.player!, onServer = server.getAgent(me.id)!;
      expect(me.pos.distanceTo(onServer.pos)).toBeLessThan(1e-6);
      expect(replica.canBuyNow(me), map).toBe(true);
    }
  });

  it('a room left on Randomize rolls one of the maps at start', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24 && seen.size < SND_MAP_IDS.length; i++) {
      const { peer } = setup();
      const a = peer();
      a.send({ type: 'create', name: 'Owner', visibility: 'private', options: snd('random') });
      a.send({ type: 'start' });
      seen.add(started(a.messages).mapId!);
    }
    expect(seen).toEqual(new Set(SND_MAP_IDS));
  });

  it('public queues keep different maps apart and fold Randomize into a specific choice', () => {
    expect(sameQueue(roomOptions(snd('aci_hq'))!, roomOptions(snd('aci_b2'))!)).toBe(false);
    expect(sameQueue(roomOptions(snd('random'))!, roomOptions(snd('aci_b2'))!)).toBe(true);
    const { peer, service } = setup();
    const hq = peer(), b2 = peer(), any = peer();
    hq.send({ type: 'queue', name: 'HQ', options: snd('aci_hq') });
    b2.send({ type: 'queue', name: 'B2', options: snd('aci_b2') });
    expect(service.rooms.size).toBe(2);
    any.send({ type: 'queue', name: 'Any', options: snd('random') });
    // "random" joins the first open compatible room and does not widen it.
    const rooms = [...service.rooms.values()];
    expect(rooms.reduce((n, r) => n + r.players.length, 0)).toBe(3);
    const joined = rooms.find(r => r.players.some(p => p.name === 'Any'))!;
    expect(joined.players.length).toBe(2);
    expect(joined.options.map).not.toBe('random');
  });

  it('a Randomize room narrows to the map of the first specific player that joins, then starts on it', () => {
    const { peer, service } = setup();
    const any = peer(), b2 = peer(), hq = peer();
    any.send({ type: 'queue', name: 'Any', options: snd('random', 1) });
    const room = [...service.rooms.values()][0];
    expect(room.options.map).toBe('random');
    hq.send({ type: 'queue', name: 'HQ', options: snd('aci_hq', 2) }); // other team size: another queue
    b2.send({ type: 'queue', name: 'B2', options: snd('aci_b2', 1) });
    // 1v1 room is now full and started on Building 2
    expect(started(any.messages).mapId).toBe('aci_b2');
    expect(started(b2.messages).mapId).toBe('aci_b2');
  });

  it('merging waiting public rooms respects and narrows map choices', () => {
    const { peer, service, advance } = setup();
    const a = peer(), b = peer(), c = peer();
    a.send({ type: 'create', name: 'A', visibility: 'public', options: snd('random', 2) });
    b.send({ type: 'create', name: 'B', visibility: 'public', options: snd('aci_hq', 2) });
    c.send({ type: 'create', name: 'C', visibility: 'public', options: snd('aci_b2', 2) });
    expect(service.rooms.size).toBe(3);
    advance(1500);
    // The Randomize room absorbs one specific room; the other choice cannot share it.
    expect(service.rooms.size).toBe(2);
    const maps = [...service.rooms.values()].map(r => r.options.map).sort();
    expect(maps).toEqual(['aci_b2', 'aci_hq']);
  });

  it('Zombies rooms ignore the map choice and stay on ACI HQ', () => {
    const { peer } = setup();
    const a = peer();
    a.send({ type: 'create', name: 'Z', visibility: 'private', options: { teamSize: 1, length: 'quick', mode: 'zombies', map: 'aci_b2' } });
    a.send({ type: 'start' });
    const start = started(a.messages);
    expect(start.mode).toBe('zombies');
    expect(start.mapId).toBeUndefined();
  });
});
