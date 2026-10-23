import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { MOVE } from '../src/config/movement';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS } from '../src/config/weapons';
import { Agent, emptyCommand } from '../src/sim/entities/Agent';
import { CollisionWorld, rayBox } from '../src/sim/physics/CollisionWorld';
import { createMotorState, eyeOf, heightOf, motorRadii, stepMotor, type MoveInput, type MotorState } from '../src/sim/physics/CharacterMotor';
import { inaccuracy, traceBullet } from '../src/sim/combat/Ballistics';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { KillcamRecorder } from '../src/render/Killcam';

const DT = 1 / 64;
const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const input = (o: Partial<MoveInput> = {}): MoveInput => ({ forward: 0, right: 0, jump: false, crouch: false, walk: false, yaw: 0, maxSpeed: MOVE.knifeSpeed, frozen: false, ...o });
const height = (s: MotorState) => heightOf(s.duck, s.prone, s.slidePose);
function floor() {
  const w = new CollisionWorld();
  w.add({ minX: -50, minY: -1, minZ: -50, maxX: 50, maxY: 0, maxZ: 50, surface: 'floor' });
  w.build(); return w;
}
function step(w: CollisionWorld, s: MotorState, i: Partial<MoveInput>, n = 64) {
  for (let k = 0; k < n; k++) stepMotor(w, s, input(i), DT);
}

describe('prone clearance and handling', () => {
  it('lowers the body and eye smoothly, crawls slowly and rises on release', () => {
    const w = floor(), s = createMotorState(0, 0, 0);
    step(w, s, { crouch: true, prone: true }, 8);
    expect(height(s)).toBeLessThan(MOVE.standHeight);
    expect(height(s)).toBeGreaterThan(MOVE.proneHeight);
    step(w, s, { crouch: true, prone: true, forward: 1 });
    expect(height(s)).toBeCloseTo(MOVE.proneHeight);
    expect(eyeOf(s.duck, s.prone)).toBeCloseTo(MOVE.proneEye);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(MOVE.knifeSpeed * MOVE.proneMult);
    step(w, s, {});
    expect(height(s)).toBeCloseTo(MOVE.standHeight);
    expect(s.pos.y).toBeCloseTo(0);
  });

  it('cannot rise through a low ceiling and can crawl out before standing', () => {
    const w = floor(), s = createMotorState(0, 0, 0);
    step(w, s, { prone: true });
    w.add({ minX: -2, minY: 0.65, minZ: -2, maxX: 2, maxY: 2, maxZ: 2, surface: 'ceiling' }); w.build();
    step(w, s, {});
    expect(height(s)).toBeLessThanOrEqual(0.65);
    step(w, s, { forward: 1 }, 320);
    expect(s.pos.z).toBeLessThan(-3);
    expect(s.prone).toBe(0);
    expect(height(s)).toBeCloseTo(MOVE.standHeight);
  });

  it('keeps the entire prone body out of a wall and does not step up tall cover', () => {
    const w = floor(), s = createMotorState(0, 0, 2);
    w.add({ minX: -5, minY: 0, minZ: -2, maxX: 5, maxY: 0.35, maxZ: 0, surface: 'wood' }); w.build();
    step(w, s, { prone: true, forward: 1 }, 256);
    expect(s.prone).toBe(1);
    expect(s.pos.z).toBeGreaterThanOrEqual(MOVE.proneHalfLength);
    expect(s.pos.y).toBeCloseTo(0);
  });

  it('does not lengthen or rotate through nearby walls', () => {
    const w = floor(), s = createMotorState(0, 0, 0.45);
    w.add({ minX: -5, minY: 0, minZ: -2, maxX: 5, maxY: 3, maxZ: 0, surface: 'wall' }); w.build();
    step(w, s, { crouch: true, prone: true });
    expect(s.prone).toBeLessThan(0.2);
    const side = createMotorState(0, 0, 0.45);
    step(w, side, { prone: true, yaw: Math.PI / 2 });
    expect(side.prone).toBe(1);
    step(w, side, { prone: true, yaw: 0 });
    const r = motorRadii(side.prone, side.bodyYaw);
    expect(side.pos.z - r.z).toBeGreaterThanOrEqual(0);
    expect(side.bodyYaw).toBeGreaterThan(1);
  });

  it('cannot enter prone while airborne or jump from prone', () => {
    const w = floor(), s = createMotorState(0, 3, 0); s.onGround = false;
    step(w, s, { prone: true }, 8);
    expect(s.prone).toBe(0);
    step(w, s, { prone: true });
    expect(s.prone).toBe(1);
    step(w, s, { prone: true, jump: true }, 10);
    expect(s.onGround).toBe(true);
    expect(s.jumpBuffer).toBe(0);
  });
});

describe('momentum slide', () => {
  it('requires forward momentum, ground contact and a fresh key press', () => {
    const w = floor();
    for (const bad of [{}, { forward: -1 }, { forward: 1, frozen: true }]) {
      const s = createMotorState(0, 0, 0); s.vel.z = -6;
      step(w, s, { slide: true, ...bad }, 1);
      expect(s.slideTime).toBe(0);
    }
    const s = createMotorState(0, 0, 0);
    step(w, s, { slide: true, forward: 1 }); // holding it from rest cannot auto-trigger
    expect(s.slideTime).toBe(0);
    step(w, s, { forward: 1 }, 1);
    step(w, s, { forward: 1, slide: true }, 1);
    expect(s.slideTime).toBeGreaterThan(0);
    const air = createMotorState(0, 3, 0); air.onGround = false; air.vel.z = -6;
    step(w, air, { forward: 1, slide: true }, 1);
    expect(air.slideTime).toBe(0);
  });

  it('decelerates without boosting, lowers the eye and has a cooldown', () => {
    const w = floor(), s = createMotorState(0, 0, 0); s.vel.z = -6;
    let speed = 6;
    for (let i = 0; i < 12; i++) {
      step(w, s, { forward: 1, slide: true, right: 1 }, 1);
      const next = Math.hypot(s.vel.x, s.vel.z);
      expect(next).toBeLessThan(speed); speed = next;
      expect(s.vel.x).toBe(0); // no instant steering or side boosts
    }
    expect(height(s)).toBeCloseTo(MOVE.slideHeight);
    expect(eyeOf(s.duck, s.prone, s.slidePose)).toBeCloseTo(MOVE.slideEye);
    step(w, s, { forward: 1 }, 40);
    expect(s.slideTime).toBe(0);
    expect(s.slideCooldown).toBeGreaterThan(0);
    step(w, s, { forward: 1, slide: true }, 1);
    expect(s.slideTime).toBe(0);
    step(w, s, { forward: 1 }, 90);
    step(w, s, { forward: 1, slide: true }, 1);
    expect(s.slideTime).toBeGreaterThan(0);
  });

  it('stops against cover and cancels when frozen', () => {
    const w = floor(), s = createMotorState(0, 0, 1); s.vel.z = -6;
    w.add({ minX: -5, minY: 0, minZ: -2, maxX: 5, maxY: 3, maxZ: 0, surface: 'wall' }); w.build();
    step(w, s, { forward: 1, slide: true }, 16);
    expect(s.pos.z).toBeGreaterThanOrEqual(MOVE.radius);
    expect(s.slideTime).toBe(0);
    s.pos.z = 4; s.duck = 0; s.slideCooldown = 0; s.slideHeld = false; s.vel.z = -6;
    step(w, s, { forward: 1, slide: true }, 1);
    expect(s.slideTime).toBeGreaterThan(0);
    step(w, s, { frozen: true }, 1);
    expect(s.slideTime).toBe(0); expect(s.vel.length()).toBe(0);
  });
});

describe('stance combat and lifecycle', () => {
  it('bots can see and shoot a prone target', () => {
    const m = new Match({ map: ACI_HQ, difficulty: 'hard', playerTeam: 'T', playerName: 'test', playerLook: look, seed: 43, rules: { teamSize: 1 } });
    m.skipFreeze();
    const p = m.player!, bot = m.agents.find((a) => a !== p)!;
    m.debugTeleport(p, -36, -4, Math.PI); m.debugTeleport(bot, -36, 4, 0);
    p.motor.duck = p.motor.prone = 1; p.motor.bodyYaw = p.yaw; p.health = 1000;
    let hits = 0;
    m.events.on('hit', (e) => { if (e.victimId === p.id && e.attackerId === bot.id) hits++; });
    m.setPlayerCommand({ ...emptyCommand(), crouch: true, prone: true, yaw: p.yaw });
    for (let i = 0; i < 320 && !hits; i++) m.step(DT);
    expect(hits).toBeGreaterThan(0);
  });

  it('aligns prone eyes and damage volumes with the body in every direction', () => {
    const a = new Agent('target', 'T', false, look); a.motor.duck = a.motor.prone = 1;
    for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      a.motor.bodyYaw = a.yaw = yaw;
      const eye = a.eyePos(), head = a.hitboxes()[0];
      expect(eye.y).toBeCloseTo(MOVE.proneEye);
      expect(eye.x).toBeGreaterThan(head.minX); expect(eye.x).toBeLessThan(head.maxX);
      expect(eye.z).toBeGreaterThan(head.minZ); expect(eye.z).toBeLessThan(head.maxZ);
      for (const b of a.hitboxes()) expect(b.maxY).toBeLessThanOrEqual(MOVE.proneHeight);
      for (const headshot of [false, true]) {
        const target = a.aimPoint(headshot), box = a.hitboxes()[headshot ? 0 : 1];
        expect(target.x).toBeGreaterThan(box.minX); expect(target.x).toBeLessThan(box.maxX);
        expect(target.y).toBeGreaterThan(box.minY); expect(target.y).toBeLessThan(box.maxY);
        expect(target.z).toBeGreaterThan(box.minZ); expect(target.z).toBeLessThan(box.maxZ);
      }
      const above = rayBox(new Vector3(0, 1.6, 4), new Vector3(0, 0, -1), head, 10);
      expect(above).toBeNull();
    }
  });

  it('traces the feet beyond the old standing broadphase and records the prone pose', () => {
    const m = new Match({ map: ACI_HQ, difficulty: 'easy', playerTeam: 'T', playerName: 'test', playerLook: look, seed: 43 });
    const a = m.player!;
    for (const other of m.agents) if (other !== a) other.alive = false;
    a.pos.set(0, 12, 0); a.motor.duck = a.motor.prone = 1; a.motor.bodyYaw = 0;
    const hit = traceBullet(m, null, new Vector3(-3, 12.15, 0.85), new Vector3(1, 0, 0), 10);
    expect(hit.agent).toBe(a); expect(hit.group).toBe('legs');
    const rec = new KillcamRecorder(); rec.capture(m, () => '', () => 1);
    const frame = rec.frames[0].agents.find((f) => f.id === a.id)!;
    expect(frame.prone).toBe(1); expect(frame.bodyYaw).toBe(0);
    expect(frame.ey).toBeCloseTo(a.eyePos().y);
  });

  it('rewards settled prone aim but penalizes sliding, crawling and changing stance', () => {
    const a = new Agent('test', 'T', false, look), w = WEAPONS.ravager;
    a.motor.duck = 1;
    const crouch = inaccuracy(w, a);
    a.motor.prone = 1;
    const prone = inaccuracy(w, a);
    expect(prone).toBeLessThan(crouch);
    a.vel.z = -w.moveSpeed * MOVE.proneMult;
    expect(inaccuracy(w, a)).toBeGreaterThan(prone);
    a.vel.set(0, 0, 0); a.motor.prone = 0.5;
    expect(inaccuracy(w, a)).toBeGreaterThan(crouch);
    a.motor.prone = 0; a.motor.slidePose = 1;
    expect(inaccuracy(w, a)).toBeGreaterThan(crouch);
  });

  it('clears prone, slide, jump fatigue and cooldowns between rounds', () => {
    const a = new Agent('test', 'T', false, look);
    Object.assign(a.motor, { prone: 1, duck: 1, slideTime: 0.5, slidePose: 1, slideHeld: true, slideCooldown: 1, stamina: 1, onGround: false });
    a.resetForRound(false, 'p30');
    expect(a.motor.prone + a.motor.slidePose + a.motor.slideTime + a.motor.slideCooldown + a.motor.stamina).toBe(0);
    expect(a.motor.slideHeld).toBe(false); expect(a.motor.onGround).toBe(true);
  });
});
