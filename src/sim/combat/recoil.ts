import type { WeaponDef } from '../../config/weapons';
import { Random } from '../../core/Random';

/**
 * Deterministic spray patterns. pattern[2k], pattern[2k+1] = cumulative (yaw, pitch) aim-punch
 * in degrees after k shots. Positive pitch = up, positive yaw = left.
 * Like CS, every gun has a fixed learnable pattern: vertical climb, then horizontal sway.
 */
const cache = new Map<string, Float32Array>();

export function sprayPattern(def: WeaponDef): Float32Array {
  const key = def.patternKey ?? def.id;
  let p = cache.get(key);
  if (p) return p;
  const r = def.recoil;
  const n = Math.max(def.mag, 1) + 2;
  p = new Float32Array(n * 2);
  const rng = new Random(r.seed * 7919);
  let pitch = 0, yaw = 0;
  for (let k = 1; k < n; k++) {
    if (k <= r.climbShots) {
      pitch += r.climb * (1 - 0.35 * (k - 1) / Math.max(1, r.climbShots));
      yaw += -r.firstSide * r.climb * 0.08 + rng.range(-r.jitter, r.jitter) * 0.5;
    } else {
      const phase = (k - r.climbShots) / r.swayPeriod;
      pitch += r.lateClimb * (Math.sin(phase * 2.3) * 0.6 + 0.4) + rng.range(-r.jitter, r.jitter) * 0.4;
      const target = r.firstSide * r.sway * Math.sin(Math.PI * phase);
      yaw += (target - yaw) * 0.55 + rng.range(-r.jitter, r.jitter);
    }
    p[k * 2] = yaw;
    p[k * 2 + 1] = pitch;
  }
  cache.set(key, p);
  return p;
}

/** Interpolated aim punch for a (fractional) recoil index. */
export function punchAt(def: WeaponDef, idx: number): { yaw: number; pitch: number } {
  const p = sprayPattern(def);
  const n = p.length / 2;
  const i = Math.max(0, Math.min(n - 1.001, idx));
  const i0 = Math.floor(i), f = i - i0;
  return {
    yaw: p[i0 * 2] + (p[(i0 + 1) * 2] - p[i0 * 2]) * f,
    pitch: p[i0 * 2 + 1] + (p[(i0 + 1) * 2 + 1] - p[i0 * 2 + 1]) * f,
  };
}

/** CS view_recoil_tracking: camera shows this fraction of the bullet punch. */
export const VIEW_PUNCH_FRACTION = 0.45;
