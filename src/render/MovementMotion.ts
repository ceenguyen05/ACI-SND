import { clamp, damp, TAU } from '../core/math';

/** Smooth stair height without applying the unrendered part of a simulation step twice. */
export class StairMotion {
  private offset = 0;
  private rise = 0;

  constructor(private limit: number) {}

  step(rise = 0) {
    this.rise = rise;
    this.offset = clamp(this.offset - rise, -this.limit, this.limit);
  }

  update(dt: number, alpha: number) {
    this.offset = damp(this.offset, 0, 18, dt);
    return this.offset + this.rise * (1 - clamp(alpha, 0, 1));
  }

  reset() { this.offset = this.rise = 0; }
}

/** Presentation only: distance-driven steps, with a short settle on stops and turns. */
export class MovementCycle {
  phase = 0;
  speed = 0;
  forward = 1;
  right = 0;
  grounded = 1;
  stride = 1.2;
  stance = 0.56;
  lift = 0.08;

  update(s: { speed: number; forward: number; right: number; onGround: boolean; crouch: number; slide: number; prone: number }, dt: number) {
    const speed = Math.max(0, s.speed);
    // Integrate the exponential speed response, not speed * dt at the end of a frame.
    // This keeps cadence consistent across render rates while starts / stops ease in.
    const decay = Math.exp(-14 * dt);
    const distance = speed * dt + (this.speed - speed) * (1 - decay) / 14;
    this.speed = damp(this.speed, speed, 14, dt);
    this.grounded = damp(this.grounded, s.onGround ? 1 : 0, 18, dt);
    if (speed > 0.05) {
      const length = Math.max(speed, Math.hypot(s.forward, s.right));
      this.forward = damp(this.forward, s.forward / length, 16, dt);
      this.right = damp(this.right, s.right / length, 16, dt);
    }
    const run = clamp((this.speed - 2.4) / 3.4, 0, 1);
    const blend = run * run * (3 - 2 * run);
    this.stride = (1.2 + blend * 1.4) * (1 - s.crouch * 0.3);
    this.stance = 0.56 - blend * 0.26 + s.crouch * 0.06;
    this.lift = (0.08 + blend * 0.15) * (1 - s.crouch * 0.45);
    if (s.onGround) this.phase = (this.phase + distance / this.stride * TAU * (1 - s.slide) * (1 - s.prone * 0.65)) % TAU;
  }

  foot(offset: number) {
    const cycle = (this.phase / TAU + offset) % 1;
    const amplitude = clamp(this.speed / 0.9, 0, 1) * this.grounded;
    if (cycle < this.stance) {
      // The planted foot travels backwards at ground speed, reducing foot skating.
      return { travel: (0.5 - cycle / this.stance) * this.stride * this.stance * amplitude, lift: 0 };
    }
    const t = (cycle - this.stance) / (1 - this.stance);
    // Hermite recovery matches the planted velocity at both ends of the step.
    const tangent = -(1 - this.stance) / this.stance;
    const travel = -0.5 + t * t * (3 - 2 * t) + tangent * (2 * t * t * t - 3 * t * t + t);
    return { travel: travel * this.stride * this.stance * amplitude, lift: Math.sin(t * Math.PI) ** 2 * this.lift * amplitude };
  }
}

/** Exact critically damped impulse response: a landing compresses, then settles smoothly. */
export class LandingSpring {
  value = 0;
  private velocity = 0;

  kick(strength = 1) { this.velocity = Math.max(this.velocity, clamp(strength, 0, 2)); }

  update(dt: number) {
    const frequency = 18;
    const j = this.velocity + frequency * this.value;
    const decay = Math.exp(-frequency * dt);
    this.value = (this.value + j * dt) * decay;
    this.velocity = (this.velocity - frequency * j * dt) * decay;
    return this.value;
  }
}
