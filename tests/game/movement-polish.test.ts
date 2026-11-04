import { describe, expect, it } from 'vitest';
import { MOVE } from '../../src/config/movement';
import { TAU } from '../../src/core/math';
import { MovementCycle, LandingSpring, StairMotion } from '../../src/render/MovementMotion';
import { CollisionWorld } from '../../src/sim/physics/CollisionWorld';
import { createMotorState, stepMotor, type MoveInput } from '../../src/sim/physics/CharacterMotor';

const DT = 1 / 64;
const input = (override: Partial<MoveInput> = {}): MoveInput => ({ forward: 1, right: 0, yaw: 0, maxSpeed: MOVE.knifeSpeed,
  jump: false, crouch: false, walk: false, frozen: false, ...override });
function stage() {
  const world = new CollisionWorld();
  world.add({ minX: -100, minY: -1, minZ: -100, maxX: 100, maxY: 0, maxZ: 100, surface: 'floor' });
  world.build();
  return { world, motor: createMotorState(0, 0, 0) };
}

describe('running and slide transitions', () => {
  it('gets moving promptly, keeps the speed limit, and settles after releasing movement', () => {
    const { world, motor } = stage();
    for (let i = 0; i < 24; i++) stepMotor(world, motor, input(), DT);
    expect(motor.vel.length()).toBeGreaterThan(MOVE.knifeSpeed * 0.95);
    expect(motor.vel.length()).toBeLessThanOrEqual(MOVE.knifeSpeed);
    for (let i = 0; i < 48; i++) stepMotor(world, motor, input({ forward: 0 }), DT);
    expect(motor.vel.length()).toBe(0);
  });

  it.each([0.1, 0.25, 0.5])('preserves %s input strength, including silent walking', (strength) => {
    for (const walk of [false, true]) {
      const { world, motor } = stage();
      for (let i = 0; i < 128; i++) stepMotor(world, motor, input({ forward: strength, walk }), DT);
      expect(motor.vel.length()).toBeCloseTo(MOVE.knifeSpeed * strength * (walk ? MOVE.walkMult : 1), 5);
    }
  });

  it('brakes smoothly into walking and never gains extra walk speed by turning', () => {
    const { world, motor } = stage();
    motor.vel.z = -MOVE.knifeSpeed;
    stepMotor(world, motor, input({ walk: true }), DT);
    expect(motor.vel.length()).toBeGreaterThan(MOVE.knifeSpeed * 0.8);
    for (let i = 0; i < 40; i++) stepMotor(world, motor, input({ walk: true }), DT);
    for (let i = 0; i < 128; i++) {
      stepMotor(world, motor, input({ walk: true, right: 1, yaw: i * 0.13 }), DT);
      expect(motor.vel.length()).toBeLessThanOrEqual(MOVE.knifeSpeed * MOVE.walkMult + 1e-6);
    }
  });

  it('cannot start a forward slide with backward momentum or a walk request', () => {
    for (const [velocity, walk] of [[6, false], [-6, true]] as const) {
      const { world, motor } = stage(); motor.vel.z = velocity;
      stepMotor(world, motor, input({ slide: true, walk }), DT);
      expect(motor.slideTime).toBe(0);
    }
  });

  it('recovers from a slide without a sudden crouch-speed clamp', () => {
    const { world, motor } = stage(); motor.vel.z = -MOVE.knifeSpeed;
    stepMotor(world, motor, input({ slide: true }), DT);
    while (motor.slideTime > DT) stepMotor(world, motor, input(), DT);
    const before = motor.vel.length();
    stepMotor(world, motor, input(), DT);
    expect(motor.slideTime).toBe(0);
    expect(motor.slidePose).toBeGreaterThan(0.8);
    expect(motor.vel.length()).toBeGreaterThan(before - 0.15);
    for (let i = 0; i < 64; i++) stepMotor(world, motor, input(), DT);
    expect(motor.slidePose).toBe(0);
    expect(motor.duck).toBe(0);
    expect(motor.vel.length()).toBeCloseTo(MOVE.knifeSpeed);
  });

  it.each([{ walk: true }, { forward: -1 }])('lets the player brake out of a slide: %j', (brake) => {
    const { world, motor } = stage(); motor.vel.z = -6;
    stepMotor(world, motor, input({ slide: true }), DT);
    const speed = motor.vel.length();
    stepMotor(world, motor, input(brake), DT);
    expect(motor.slideTime).toBe(0);
    expect(motor.slideCooldown).toBeGreaterThan(0);
    expect(motor.vel.length()).toBeLessThan(speed);
  });

  it('does not retain running speed when a slide ends beneath a low ceiling', () => {
    const { world, motor } = stage();
    world.add({ minX: -10, minY: 1.2, minZ: -10, maxX: 10, maxY: 3, maxZ: 10, surface: 'ceiling' }); world.build();
    motor.duck = 1; motor.slidePose = 1; motor.slideTime = DT / 2; motor.vel.z = -6;
    for (let i = 0; i < 32; i++) stepMotor(world, motor, input(), DT);
    expect(motor.vel.length()).toBeLessThan(MOVE.knifeSpeed * MOVE.walkMult);
    expect(motor.slidePose).toBeGreaterThan(0.7);
    expect(motor.duck).toBeGreaterThan(0.7);
  });
});

const moving = { speed: 5, forward: 5, right: 0, onGround: true, crouch: 0, slide: 0, prone: 0 };
describe('movement presentation', () => {
  it.each([0.3, -0.3])('does not kick the camera the wrong way on a %s m stair', (rise) => {
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      const stairs = new StairMotion(MOVE.stepHeight);
      stairs.step(rise);
      // Interpolated feet + camera compensation must start at the old height.
      expect(rise * alpha + stairs.update(0, alpha)).toBeCloseTo(0, 8);
      const next = rise * alpha + stairs.update(1 / 144, alpha);
      expect(next / rise).toBeGreaterThan(0);
      expect(next / rise).toBeLessThan(0.2);
      stairs.step();
      let previous = next;
      for (let i = 0; i < 60; i++) {
        const y = rise + stairs.update(1 / 60, 1);
        expect(y / rise).toBeGreaterThan(previous / rise);
        expect(y / rise).toBeLessThanOrEqual(1);
        previous = y;
      }
      expect(previous).toBeCloseTo(rise, 6);
      stairs.reset();
      expect(stairs.update(1 / 60, 0)).toBe(0);
    }
  });

  it('keeps speed response and cadence close at 30, 60 and 144 FPS', () => {
    const motions = [30, 60, 144].map((fps) => {
      const m = new MovementCycle();
      for (let i = 0; i < fps * 2; i++) m.update(moving, 1 / fps);
      return m;
    });
    for (const m of motions.slice(1)) {
      expect(m.speed).toBeCloseTo(motions[0].speed, 6);
      expect(Math.abs(Math.atan2(Math.sin(m.phase - motions[0].phase), Math.cos(m.phase - motions[0].phase)))).toBeLessThan(0.15);
    }
  });

  it('blends a direction reversal and retains the foot direction while stopping', () => {
    const m = new MovementCycle(); m.update(moving, 1);
    m.update({ ...moving, forward: -5 }, 1 / 144);
    expect(m.forward).toBeGreaterThan(0.7);
    for (let i = 0; i < 30; i++) m.update({ ...moving, forward: -5 }, 1 / 60);
    expect(m.forward).toBeLessThan(-0.99);
    const forward = m.forward;
    m.update({ ...moving, speed: 0, forward: 0 }, 1 / 60);
    expect(m.forward).toBe(forward);
    expect(m.speed).toBeGreaterThan(0);
  });

  it('does not pedal in midair or while sliding', () => {
    const m = new MovementCycle(); m.update(moving, 1);
    const phase = m.phase;
    m.update({ ...moving, slide: 1 }, 1 / 60);
    expect(m.phase).toBe(phase);
    for (let i = 0; i < 60; i++) m.update({ ...moving, onGround: false }, 1 / 60);
    expect(m.phase).toBe(phase);
    expect(Math.abs(m.foot(0).travel)).toBeLessThan(0.001);
  });

  it.each([1.5, 3.3, 6.35])('plants the feet at ground speed and blends toe-off / contact at %s m/s', (speed) => {
    const m = new MovementCycle(); m.update({ ...moving, speed, forward: speed }, 2);
    m.phase = 0.1 * m.stance * TAU;
    const start = m.foot(0);
    m.phase += speed / m.stride * TAU * 0.001;
    expect((m.foot(0).travel - start.travel) / 0.001).toBeCloseTo(-speed, 5);
    expect(start.lift).toBe(0);
    for (const contact of [m.stance, 1]) {
      const sample = (phase: number) => { m.phase = phase * TAU; return m.foot(0); };
      const before = sample(contact - 0.00001), at = sample(contact), after = sample(contact + 0.00001);
      expect(Math.abs(before.travel - after.travel)).toBeLessThan(0.0001);
      expect((at.travel - before.travel) / 0.00001).toBeCloseTo((after.travel - at.travel) / 0.00001, 2);
      expect(at.lift).toBeCloseTo(0);
    }
  });

  it('compresses on landing without an instant jump and settles consistently across frame rates', () => {
    for (const fps of [30, 60, 144]) {
      const spring = new LandingSpring(); spring.kick();
      expect(spring.value).toBe(0);
      let peak = 0;
      for (let i = 0; i < fps; i++) peak = Math.max(peak, spring.update(1 / fps));
      expect(peak).toBeGreaterThan(0.018);
      expect(peak).toBeLessThan(0.021);
      expect(spring.value).toBeLessThan(0.0001);
    }
    const a = new LandingSpring(), b = new LandingSpring(); a.kick(1.6); b.kick(1.6);
    a.update(0.2);
    for (let i = 0; i < 12; i++) b.update(1 / 60);
    expect(a.value).toBeCloseTo(b.value, 10);
  });
});
