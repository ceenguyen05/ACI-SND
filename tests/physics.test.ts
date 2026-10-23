import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CollisionWorld } from '../src/sim/physics/CollisionWorld';
import { createMotorState, stepMotor, type MoveInput } from '../src/sim/physics/CharacterMotor';
import { MOVE } from '../src/config/movement';

function makeWorld() {
  const w = new CollisionWorld();
  w.add({ minX: -50, minY: -1, minZ: -50, maxX: 50, maxY: 0, maxZ: 50, surface: 'floor' });
  w.add({ minX: 5, minY: 0, minZ: -10, maxX: 6, maxY: 3, maxZ: 10, surface: 'wall' });   // wall at x = 5
  w.add({ minX: -6, minY: 0, minZ: -1, maxX: -4, maxY: 0.3, maxZ: 1, surface: 'wood' }); // low step
  w.build();
  return w;
}
const input = (o: Partial<MoveInput>): MoveInput => ({
  forward: 0, right: 0, jump: false, crouch: false, walk: false, yaw: 0, maxSpeed: MOVE.knifeSpeed, frozen: false, ...o,
});
const DT = 1 / 64;

describe('character motor', () => {
  it('accelerates to max speed and no further', () => {
    const w = makeWorld(); const s = createMotorState(0, 0, 0);
    for (let i = 0; i < 128; i++) stepMotor(w, s, input({ forward: 1 }), DT);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(MOVE.knifeSpeed, 1);
  });
  it('walking is ~52% speed and crouching ~34%', () => {
    const w = makeWorld();
    const a = createMotorState(0, 0, 0), b = createMotorState(0, 0, 20);
    for (let i = 0; i < 128; i++) {
      stepMotor(w, a, input({ forward: 1, walk: true }), DT);
      stepMotor(w, b, input({ forward: 1, crouch: true }), DT);
    }
    expect(Math.hypot(a.vel.x, a.vel.z) / MOVE.knifeSpeed).toBeCloseTo(0.52, 1);
    expect(Math.hypot(b.vel.x, b.vel.z) / MOVE.knifeSpeed).toBeCloseTo(0.34, 1);
  });
  it('cannot pass through walls', () => {
    const w = makeWorld(); const s = createMotorState(0, 0, 0);
    for (let i = 0; i < 300; i++) stepMotor(w, s, input({ forward: 1, yaw: -Math.PI / 2 }), DT); // faces +X
    expect(s.pos.x).toBeLessThan(5 - MOVE.radius + 0.01);
  });
  it('steps up small ledges', () => {
    const w = makeWorld(); const s = createMotorState(-2, 0, 0);
    for (let i = 0; i < 60; i++) stepMotor(w, s, input({ forward: 1, yaw: Math.PI / 2 }), DT); // faces -X
    expect(s.pos.x).toBeLessThan(-4);
  });
  it('jumps about 1.4m and lands', () => {
    const w = makeWorld(); const s = createMotorState(0, 0, 0);
    stepMotor(w, s, input({}), DT);
    let maxY = 0;
    for (let i = 0; i < 120; i++) { stepMotor(w, s, input({ jump: i < 2 }), DT); maxY = Math.max(maxY, s.pos.y); }
    expect(maxY).toBeGreaterThan(1.2);
    expect(maxY).toBeLessThan(1.6);
    expect(s.onGround).toBe(true);
  });
  it('raycast hits walls with correct normal', () => {
    const w = makeWorld();
    const hit = w.raycast(new Vector3(0, 1, 0), new Vector3(1, 0, 0), 50)!;
    expect(hit.t).toBeCloseTo(5, 3);
    expect(hit.normal.x).toBe(-1);
  });

  it('opposite strafe input reaches accurate speed sooner than coasting', () => {
    const w = makeWorld();
    const coast = createMotorState(0, 0, 20), brake = createMotorState(0, 0, 20);
    coast.vel.x = brake.vel.x = MOVE.knifeSpeed;
    let coastTicks = 0, brakeTicks = 0;
    while (coast.vel.x > MOVE.knifeSpeed * 0.34 && coastTicks++ < 64) stepMotor(w, coast, input({}), DT);
    while (brake.vel.x > MOVE.knifeSpeed * 0.34 && brakeTicks++ < 64) stepMotor(w, brake, input({ right: -1 }), DT);
    expect(brakeTicks).toBeLessThan(coastTicks);
    expect(brakeTicks * DT).toBeLessThan(0.13);
  });

  it('diagonal movement and repeated turns never exceed ground speed', () => {
    const w = makeWorld(), s = createMotorState(0, 0, 20);
    let peak = 0;
    for (let i = 0; i < 128; i++) {
      stepMotor(w, s, input({ forward: 1, right: 1, yaw: Math.max(0, i - 64) * 0.08 }), DT);
      peak = Math.max(peak, Math.hypot(s.vel.x, s.vel.z));
    }
    expect(peak).toBeLessThanOrEqual(MOVE.knifeSpeed + 1e-6);
    expect(peak).toBeGreaterThan(MOVE.knifeSpeed * 0.9);
  });

  it('buffers a fresh jump just before landing without auto-jumping on hold', () => {
    const w = makeWorld(), s = createMotorState(0, 0.07, 0);
    s.onGround = false; s.vel.y = -3;
    for (let i = 0; i < 8; i++) stepMotor(w, s, input({ jump: true }), DT);
    expect(s.pos.y).toBeGreaterThan(0.3);
    expect(s.vel.y).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) stepMotor(w, s, input({ jump: true }), DT);
    expect(s.onGround).toBe(true);
    expect(s.pos.y).toBeCloseTo(0, 2);
  });

  it('expires an early jump press and ignores jumps during freeze', () => {
    const w = makeWorld(), s = createMotorState(0, 2, 0);
    s.onGround = false;
    for (let i = 0; i < 100; i++) stepMotor(w, s, input({ jump: i === 0 }), DT);
    expect(s.onGround).toBe(true);
    for (let i = 0; i < 10; i++) stepMotor(w, s, input({ jump: true, frozen: true }), DT);
    expect(s.pos.y).toBeCloseTo(0, 3);
    stepMotor(w, s, input({ jump: true }), DT);
    expect(s.onGround).toBe(true);
  });

  it('keeps the capsule crouched beneath a low ceiling', () => {
    const w = makeWorld(), s = createMotorState(0, 0, 0);
    w.add({ minX: -2, minY: 1.44, minZ: -2, maxX: 2, maxY: 2, maxZ: 2, surface: 'ceiling' });
    w.build(); s.duck = 1;
    for (let i = 0; i < 32; i++) stepMotor(w, s, input({}), DT);
    expect(s.duck).toBeGreaterThan(0.8);
  });
});
