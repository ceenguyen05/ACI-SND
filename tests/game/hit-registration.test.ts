import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { OUTFITS } from '../../src/config/cosmetics';
import { WEAPONS } from '../../src/config/weapons';
import { Agent } from '../../src/sim/entities/Agent';
import { inaccuracy, traceBullet, traceGunBullet } from '../../src/sim/combat/Ballistics';
import { Match } from '../../src/sim/mode/Match';
import { ACI_HQ } from '../../src/sim/maps/aciHq';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
function stage() {
  const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'CT', playerName: 'Test', playerLook: look, seed: 3, rules: { teamSize: 1 } });
  const p = m.player!, e = m.agents.find((a) => a.team !== p.team)!;
  const collision = m.world.collision;
  collision.boxes.length = 0; collision.clearDynamic();
  collision.add({ minX: -100, maxX: 100, minZ: -100, maxZ: 100, minY: -1, maxY: 0, surface: 'floor' });
  collision.build();
  p.pos.set(0, 0, 0); e.pos.set(0, 0, -10);
  // Stage facing too: spawn facing varies by round, and prone / leaning hitboxes follow it.
  for (const a of [p, e]) { a.yaw = 0; a.motor.bodyYaw = 0; }
  return { m, p, e, collision };
}

describe('forgiving player hit registration', () => {
  it.each(['standing', 'crouching', 'prone', 'leaning', 'large zombie'] as const)('accepts a small body graze on a %s target, on the original straight ray', (pose) => {
    const { m, p, e } = stage();
    if (pose === 'crouching') e.motor.duck = 1;
    if (pose === 'prone') e.motor.prone = 1;
    if (pose === 'leaning') e.lean = 1;
    if (pose === 'large zombie') { e.scaleW = 1.65; e.scaleH = 1.25; }
    const chest = e.hitboxes().find((b) => b.group === 'chest')!;
    const origin = new Vector3(chest.maxX + 0.035, (chest.minY + chest.maxY) / 2, 0), dir = new Vector3(0, 0, -1);
    expect(traceBullet(m, p, origin, dir, 50).agent).toBeNull();
    const hit = traceGunBullet(m, p, origin, dir, 50);
    expect(hit.agent).toBe(e); expect(hit.group).toBe('chest');
    expect(hit.point.clone().sub(origin).cross(dir).length()).toBeLessThan(1e-8);
    origin.x += 0.06;
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBeNull();
  });

  it('gives heads less tolerance and never promotes a direct chest hit to a headshot', () => {
    const { m, p, e } = stage();
    const dir = new Vector3(0, 0, -1), head = e.hitboxes()[0], chest = e.hitboxes()[1];
    const origin = new Vector3(head.maxX + 0.015, (head.minY + head.maxY) / 2, 0);
    expect(traceGunBullet(m, p, origin, dir, 50).group).toBe('head');
    origin.x += 0.02;
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBeNull();
    origin.set(0, chest.maxY - 0.01, 0);
    expect(traceGunBullet(m, p, origin, dir, 50).group).toBe('chest');
  });

  it('never expands friendly or bot shots; exact nearer hits take priority', () => {
    const { m, p, e } = stage();
    const origin = new Vector3(0.25, 1.2, 0), dir = new Vector3(0, 0, -1);
    e.team = p.team;
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBeNull();
    e.team = 'T'; p.isBot = true;
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBeNull();
    p.isBot = false;
    const ally = new Agent('Ally', p.team, true, look); ally.pos.set(0.25, 0, -5); m.agents.push(ally);
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBe(ally);
  });

  it('does not grow tolerance with range', () => {
    const { m, p, e } = stage();
    const origin = new Vector3(0.29, 1.2, 0), dir = new Vector3(0, 0, -1);
    for (const distance of [3, 10, 50, 90]) {
      e.pos.z = -distance;
      expect(traceGunBullet(m, p, origin, dir, 100).agent).toBeNull();
    }
  });

  it('cannot hit padding protruding in front of a wall hiding the actual body', () => {
    const { m, p, e, collision } = stage();
    collision.add({ minX: -1, maxX: 1, minZ: -9.77, maxZ: -9.75, minY: 0, maxY: 3, surface: 'metal' }); collision.build();
    const hit = traceGunBullet(m, p, new Vector3(0.25, 1.2, 0), new Vector3(0, 0, -1), 50);
    expect(hit.agent).toBeNull(); expect(hit.surface).toBe('metal');
    expect(e.alive).toBe(true);
  });

  it('disables edge assistance in smoke or while blind, while exact hits still register', () => {
    const { m, p, e } = stage();
    const origin = new Vector3(0.25, 1.2, 0), dir = new Vector3(0, 0, -1);
    m.utility.smokes.push({ id: 1, pos: new Vector3(0, 1, -5), start: -5, end: 50 });
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBeNull();
    expect(traceGunBullet(m, p, new Vector3(0, 1.2, 0), dir, 50).agent).toBe(e);
    m.utility.smokes.length = 0; p.flashUntil = m.time + 2;
    expect(traceGunBullet(m, p, origin, dir, 50).agent).toBeNull();
  });
});

describe('player precision', () => {
  it('tightens player ADS while keeping recoil, movement and airborne accuracy penalties', () => {
    const { p, e } = stage(), def = WEAPONS.sentinel;
    p.motor.onGround = e.motor.onGround = true; p.motor.landTime = e.motor.landTime = 10;
    const hip = inaccuracy(def, p);
    expect(hip).toBeLessThan(inaccuracy(def, e));
    p.wpn.ads = true; e.wpn.ads = true;
    const aimed = inaccuracy(def, p);
    expect(aimed).toBeLessThan(hip); expect(aimed).toBeLessThan(inaccuracy(def, e));
    p.vel.x = def.moveSpeed;
    expect(inaccuracy(def, p)).toBeGreaterThan(hip);
    p.vel.x = 0; p.motor.onGround = false;
    expect(inaccuracy(def, p)).toBeGreaterThan(hip);
    p.motor.onGround = true; p.wpn.fireInacc = 10;
    expect(inaccuracy(def, p)).toBeGreaterThan(aimed);
  });
});
