import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CollisionWorld } from '../src/sim/physics/CollisionWorld';
import { createMotorState, stepMotor, type MoveInput } from '../src/sim/physics/CharacterMotor';
import { MOVE } from '../src/config/movement';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { emptyCommand } from '../src/sim/entities/Agent';
import { updateWeapon } from '../src/sim/combat/WeaponSystem';

const DT = 1 / 64;
const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const input = (o: Partial<MoveInput>): MoveInput => ({
  forward: 0, right: 0, jump: false, crouch: false, walk: false, yaw: -Math.PI / 2, maxSpeed: MOVE.knifeSpeed, frozen: false, ...o,
});

function boxWorld(h: number, depth = 28) {
  const w = new CollisionWorld();
  w.add({ minX: -50, minY: -1, minZ: -50, maxX: 50, maxY: 0, maxZ: 50, surface: 'floor' });
  w.add({ minX: 2, minY: 0, minZ: -2, maxX: 2 + depth, maxY: h, maxZ: 2, surface: 'wood' });
  w.build();
  return w;
}

/** Walk into a box holding forward + jump the whole time; returns where we end up. */
function holdJumpInto(h: number, depth = 28) {
  const w = boxWorld(h, depth), s = createMotorState(-3, 0, 0);
  let mantles = 0;
  for (let i = 0; i < 256; i++) {
    const r = stepMotor(w, s, input({ forward: 1, jump: s.pos.x > 0.9 }), DT);
    if (r.mantled) mantles++;
  }
  return { y: s.pos.y, x: s.pos.x, mantles };
}

describe('mantling and coyote time', () => {
  it('holding jump into a chest-high ledge mantles on top', () => {
    const r = holdJumpInto(1.5);
    expect(r.mantles).toBe(1);
    expect(r.y).toBeCloseTo(1.5, 1);
    expect(r.x).toBeGreaterThan(2.3);
  });

  it('does not mantle walls taller than the limit, or thin edges with nothing to stand on', () => {
    expect(holdJumpInto(2.4).y).toBeLessThan(0.1);
    expect(holdJumpInto(1.4, 0.1).mantles).toBe(0); // 10 cm thick ledge: nowhere to land
  });

  it('a normal hop onto a low crate is still a jump, not a mantle', () => {
    expect(holdJumpInto(0.8).mantles).toBe(0);
    expect(holdJumpInto(0.8).y).toBeCloseTo(0.8, 1);
  });

  it('jumping just after running off an edge still works (coyote time)', () => {
    const w = new CollisionWorld();
    w.add({ minX: -50, minY: -1, minZ: -50, maxX: 0, maxY: 2, maxZ: 50, surface: 'floor' }); // platform ends at x = 0
    w.add({ minX: -50, minY: -4, minZ: -50, maxX: 50, maxY: -3, maxZ: 50, surface: 'floor' });
    w.build();
    const s = createMotorState(-3, 2, 0);
    let leftAt = -1, jumped = false;
    for (let i = 0; i < 120; i++) {
      const offEdge = !s.onGround && leftAt < 0;
      if (offEdge) leftAt = i;
      // press jump 3 ticks (~47 ms) after leaving the edge
      const jump = leftAt >= 0 && i === leftAt + 3;
      stepMotor(w, s, input({ forward: 1, jump }), DT);
      if (jump && s.vel.y > 2) jumped = true;
    }
    expect(jumped).toBe(true);
  });
});

function stage(teamSize = 2) {
  const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 31, rules: { teamSize, freezeTime: 999 } });
  m.skipFreeze();
  m.step(DT);
  const ts = m.agents.filter((a) => a.team === 'T'), cts = m.agents.filter((a) => a.team === 'CT');
  for (const a of m.agents) a.armor = 0;
  return { m, t: ts[0], t2: ts[1], ct: cts[0], ct2: cts[1] };
}
const act = (m: Match, a: ReturnType<typeof stage>['t'], c: Partial<ReturnType<typeof emptyCommand>>) =>
  updateWeapon(m, a, { ...emptyCommand(), yaw: a.yaw, pitch: a.pitch, ...c }, DT);
const tick = (m: Match) => { (m as unknown as { time: number }).time += DT; };

describe('new guns', () => {
  it('the Talon fires exactly 3 rounds per trigger pull, even if released early', () => {
    const { m, t } = stage();
    m.debugGive(t, 'talon');
    t.wpn.drawUntil = 0;
    act(m, t, { fire: false }); tick(m);
    const start = t.primary!.mag;
    act(m, t, { fire: true }); tick(m);
    for (let i = 0; i < 20; i++) { act(m, t, { fire: false }); tick(m); }
    expect(start - t.primary!.mag).toBe(3);
    // holding the trigger doesn't start another burst
    for (let i = 0; i < 40; i++) { act(m, t, { fire: true }); tick(m); }
    expect(start - t.primary!.mag).toBe(6);
  });

  it('the Viper MP is fully automatic and the Marshal DMR stays scoped between shots', () => {
    const { m, t, t2 } = stage();
    m.debugGive(t, 'viper');
    t.wpn.drawUntil = 0;
    act(m, t, { fire: false }); tick(m);
    for (let i = 0; i < 32; i++) { act(m, t, { fire: true }); tick(m); }
    expect(t.secondary!.def.mag - t.secondary!.mag).toBeGreaterThanOrEqual(6);
    m.debugGive(t2, 'marshal');
    t2.wpn.drawUntil = 0;
    act(m, t2, { alt: true }); tick(m);
    expect(t2.wpn.scope).toBe(1);
    act(m, t2, { fire: true }); tick(m);
    expect(t2.wpn.scope).toBe(1);
  });
});

describe('stun grenade, throwing knife, heartbeat sensor, pings', () => {
  it('a stun grenade slows the movement and aim of anyone close by', () => {
    const { m, t, ct } = stage();
    // open lane in the bullpen
    m.debugTeleport(ct, -36, -2, 0);
    m.debugTeleport(t, -36, 4, 0);
    m.utility.projectiles.push({ id: 999, kind: 'stun', ownerId: t.id, team: t.team, pos: new Vector3(-36, 0.3, -1), vel: new Vector3(), thrownAt: m.time - 1.39, restSince: -1, spin: 0 });
    for (let i = 0; i < 4; i++) m.step(DT);
    expect(ct.stunAt(m.time)).toBeGreaterThan(0.6);
    expect(ct.stunAt(m.time + 5)).toBe(0);
  });

  it('a throwing knife kills in one hit and can be picked up again', () => {
    const { m, t, ct } = stage();
    m.debugTeleport(t, -36, 4, 0, 0);
    m.debugTeleport(ct, -36, -3, 0, 0);
    for (const a of m.agents) if (a !== t && a !== ct) a.alive = false;
    const bots = (m as unknown as { bots: Map<number, unknown> }).bots;
    bots.delete(t.id); bots.delete(ct.id); // both stand still
    ct.health = 100; ct.armor = 100; ct.helmet = true;
    t.grenades.tknife = 1;
    t.pitch = Math.atan2(ct.pos.y + 1.2 - (t.pos.y + t.eyeHeight), 7);
    m.ordnance.throwKnife(t, 1);
    t.grenades.tknife = 0;
    for (let i = 0; i < 40; i++) m.step(DT);
    expect(ct.alive).toBe(false);
    expect(m.ordnance.knives.length).toBe(1);
    const k = m.ordnance.knives[0];
    m.debugTeleport(t, k.pos.x, k.pos.z, 0);
    m.step(DT);
    expect(t.grenades.tknife).toBe(1);
    expect(m.ordnance.knives.length).toBe(0);
  });

  it('the heartbeat sensor shows enemies in front through walls, not behind', () => {
    const { m, t, ct, ct2 } = stage();
    m.debugTeleport(t, 36, -20, 0, 0);
    m.debugTeleport(ct, 36, -35, 0, 0);   // 15 m ahead (walls don't matter)
    m.debugTeleport(ct2, 36, -8, 0, 0);   // 12 m behind
    m.debugGiveGadget(t, 'heartbeat', 1);
    t.wpn.drawUntil = 0; t.heartbeatNext = 0;
    act(m, t, {});
    expect(t.heartbeat?.blips.map((b) => b.id)).toEqual([ct.id]);
  });

  it('pinging an enemy spots them for the team and sends idle bots to look', () => {
    const { m, t, t2, ct } = stage();
    m.debugTeleport(t, -36, 4, 0, 0);
    m.debugTeleport(ct, -36, -4, 0, 0);
    t.pitch = Math.atan2(ct.pos.y + 1.1 - (t.pos.y + t.eyeHeight), 8);
    let pinged: number | null = -1;
    m.events.on('teamPing', (e) => { pinged = e.enemyId; });
    m.teamPing(t);
    expect(pinged).toBe(ct.id);
    expect(ct.spottedUntil).toBeGreaterThan(m.time + 4);
    const bot = (m as unknown as { bots: Map<number, { heard: unknown; target: unknown; onTeamPing(p: Vector3): void }> }).bots.get(t2.id)!;
    bot.target = null; bot.heard = null;
    m.teamPing(t); // ping again now that the teammate isn't busy fighting
    expect(bot.heard).not.toBeNull();
  });
});

describe('final killcam recording', async () => {
  const { KillcamRecorder, KillcamPlayer } = await import('../src/render/Killcam');
  it('keeps the last seconds of a match and replays the deciding kill with slow motion', () => {
    const m = new Match({ map: ACI_HQ, difficulty: 'hard', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 77,
      rules: { roundsToWin: 8, halfLength: 7, freezeTime: 1, roundEndDelay: 2 } });
    const rec = new KillcamRecorder();
    m.events.on('kill', (e) => rec.record({ k: 'kill', killerId: e.killerId, victimId: e.victimId, weapon: e.weapon, headshot: e.headshot }));
    m.events.on('shot', (e) => rec.record({ k: 'shot', agentId: e.agentId, sound: e.sound, o: [0, 0, 0], e: [0, 0, 0], tracer: false, pellet: e.pellet, kick: 1 }));
    let ended = false;
    m.events.on('roundEnd', (e) => { if (e.reason === 'elimination') ended = true; });
    for (let t = 0; t < 900 && !ended && m.phase !== 'matchOver'; t += DT) { m.step(DT); rec.capture(m, () => 'w:p30:', () => 1); }
    expect(ended).toBe(true);
    expect(rec.frames.length).toBeLessThanOrEqual(Math.ceil(7.5 * 64) + 2);
    const k = rec.lastKill()!;
    expect(k).not.toBeNull();
    const kc = new KillcamPlayer(rec.frames, k.idx, { killerId: k.ev.killerId, victimId: k.ev.victimId, killerName: 'a', victimName: 'b', killerTeam: 'T',
      weapon: k.ev.weapon, headshot: k.ev.headshot, final: false, firstPerson: true });
    let sawKill = false, sawSlow = false, steps = 0;
    while (!kc.done && steps++ < 2000) {
      if (kc.advance(1 / 60).some((e) => e.k === 'kill' && e.victimId === k.ev.victimId)) sawKill = true;
      if (kc.slowMo) sawSlow = true;
      const s = kc.sample();
      expect(s.alpha).toBeGreaterThanOrEqual(0); expect(s.alpha).toBeLessThanOrEqual(1);
    }
    expect(sawKill).toBe(true);
    expect(sawSlow).toBe(true);
    expect(kc.end - kc.start).toBeGreaterThan(1.5);
  }, 60_000);
});
