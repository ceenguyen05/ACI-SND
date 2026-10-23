import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../src/sim/physics/CollisionWorld';
import { createMotorState, stepMotor, type MoveInput } from '../src/sim/physics/CharacterMotor';
import { MOVE } from '../src/config/movement';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS } from '../src/config/weapons';
import { fireGun } from '../src/sim/combat/Ballistics';
import { World } from '../src/sim/world/World';
import { buildLayout, lightingHash } from '../src/render/lighting/LightLayout';

const DT = 1 / 64;
const input = (o: Partial<MoveInput>): MoveInput => ({
  forward: 0, right: 0, jump: false, crouch: false, walk: false, yaw: -Math.PI / 2, maxSpeed: MOVE.knifeSpeed, frozen: false, ...o,
});

function ledgeWorld(h: number) {
  const w = new CollisionWorld();
  w.add({ minX: -50, minY: -1, minZ: -50, maxX: 50, maxY: 0, maxZ: 50, surface: 'floor' });
  w.add({ minX: 2, minY: 0, minZ: -2, maxX: 30, maxY: h, maxZ: 2, surface: 'wood' }); // long crate stack
  w.build();
  return w;
}

/** Run at the ledge, jump, optionally crouch in the air; returns final height. */
function attempt(h: number, crouchJump: boolean) {
  const w = ledgeWorld(h), s = createMotorState(-8, 0, 0);
  let jumpTick = -1;
  for (let i = 0; i < 200; i++) {
    const jump = jumpTick < 0 && s.pos.x >= -0.5;
    if (jump) jumpTick = i;
    const airborne = jumpTick >= 0 && i > jumpTick + 1 && i < jumpTick + 60;
    stepMotor(w, s, input({ forward: 1, jump, crouch: crouchJump && airborne }), DT);
  }
  return s.pos.y;
}

describe('movement mechanics', () => {
  it('crouch-jumping clears ledges a plain jump cannot', () => {
    expect(attempt(1.7, false)).toBeLessThan(0.1);
    expect(attempt(1.7, true)).toBeCloseTo(1.7, 1);
  });

  it('crouching in the air keeps the eyes level (no camera pop)', () => {
    const w = ledgeWorld(0.01), s = createMotorState(-20, 0, 0);
    stepMotor(w, s, input({ jump: true }), DT);
    for (let i = 0; i < 6; i++) stepMotor(w, s, input({}), DT);
    const eyeBefore = s.pos.y + MOVE.standEye + (MOVE.crouchEye - MOVE.standEye) * s.duck;
    stepMotor(w, s, input({ crouch: true }), DT);
    const eyeAfter = s.pos.y + MOVE.standEye + (MOVE.crouchEye - MOVE.standEye) * s.duck;
    // only gravity / velocity should move the eye, not the duck itself
    expect(Math.abs(eyeAfter - eyeBefore)).toBeLessThan(0.12);
  });

  it('chained jumps lose height (jump stamina)', () => {
    const w = ledgeWorld(0.01), s = createMotorState(-20, 0, 0);
    const peaks: number[] = [];
    let peak = 0, wasGround = true;
    for (let i = 0; i < 64 * 4; i++) {
      stepMotor(w, s, input({ jump: s.onGround && i % 2 === 0 }), DT);
      peak = Math.max(peak, s.pos.y);
      if (s.onGround && !wasGround) { peaks.push(peak); peak = 0; }
      wasGround = s.onGround;
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks[2]).toBeLessThan(peaks[0] * 0.92);
  });
});

describe('combat mechanics', () => {
  const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
  function duel() {
    const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 3, rules: { teamSize: 1, freezeTime: 999 } });
    const t = m.agents.find((a) => a.team === 'T')!, ct = m.agents.find((a) => a.team === 'CT')!;
    ct.armor = 0;
    return { m, t, ct };
  }

  it('rifle rounds penetrate a wooden crate (wallbang) with reduced damage', () => {
    const { m, t, ct } = duel();
    // crate at (16, -9) 1.4 m in the warehouse; shooter crouched behind it, target standing beyond
    m.debugTeleport(t, 16, -11.5, Math.PI, 0);
    t.motor.duck = 1;
    m.debugTeleport(ct, 16, -6.2, 0, 0);
    t.pitch = Math.atan2(ct.pos.y + 1.15 - (t.pos.y + t.eyeHeight), 5.3);
    const hits: { wallbang?: boolean; amount: number }[] = [];
    m.events.on('hit', (e) => hits.push(e));
    fireGun(m, t, WEAPONS.ravager);
    expect(hits.length).toBe(1);
    expect(hits[0].wallbang).toBe(true);
    expect(hits[0].amount).toBeGreaterThan(0);
    expect(hits[0].amount).toBeLessThan(36);
  });

  it('walls stop bullets and pistols cannot punch through thick crates', () => {
    const { m, t, ct } = duel();
    m.debugTeleport(t, 16, -11.5, Math.PI, 0);
    t.motor.duck = 1;
    m.debugTeleport(ct, 16, -6.2, 0, 0);
    t.pitch = Math.atan2(ct.pos.y + 1.15 - (t.pos.y + t.eyeHeight), 5.3);
    const hits: unknown[] = [];
    m.events.on('hit', (e) => hits.push(e));
    fireGun(m, t, WEAPONS.k9);
    expect(hits.length).toBe(0);
  });

  it('getting shot kicks your aim and is logged for the death-screen report', () => {
    const { m, t, ct } = duel();
    m.debugTeleport(t, 36, -20, 0, 0);
    m.debugTeleport(ct, 36, -26, Math.PI, 0);
    t.pitch = Math.atan2(ct.pos.y + 1.2 - (t.pos.y + t.eyeHeight), 6);
    fireGun(m, t, WEAPONS.ravager);
    expect(ct.health).toBeLessThan(100);
    expect(ct.flinchPitch).toBeGreaterThan(0.5);
    const report = m.damageReport(ct.id);
    expect(report.find((r) => r.otherId === t.id)?.taken.hits).toBe(1);
  });
});

describe('baked lighting', () => {
  it('atlas layout is deterministic', () => {
    const a = buildLayout(new World(ACI_HQ)), b = buildLayout(new World(ACI_HQ));
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.walls.map((r) => [r.px, r.py])).toEqual(b.walls.map((r) => [r.px, r.py]));
  });

  it('shipped lightmaps match the current map (run `npm run bake` after editing the map)', () => {
    const meta = JSON.parse(readFileSync('public/lightmaps/aci_hq.json', 'utf8'));
    const world = new World(ACI_HQ);
    expect(meta.hash).toBe(lightingHash(world));
    const layout = buildLayout(world);
    expect([meta.atlas.width, meta.atlas.height]).toEqual([layout.width, layout.height]);
  });
});
