import { Vector3 } from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);

/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed difference b - a. */
export const angleDiff = (a: number, b: number) => wrapAngle(b - a);

/**
 * Convention used everywhere: yaw = 0 looks down -Z (north), positive yaw turns left
 * (counter-clockwise seen from above, same as three.js rotation.y). Positive pitch looks up.
 */
export function dirFromAngles(yaw: number, pitch: number, out = new Vector3()): Vector3 {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function yawTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function anglesFromDir(d: Vector3): { yaw: number; pitch: number } {
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(clamp(d.y / len, -1, 1)) };
}

export const dist2D = (ax: number, az: number, bx: number, bz: number) => Math.hypot(bx - ax, bz - az);

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const rectCenter = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

/** Ray / sphere intersection length of the segment a->b inside the sphere (for smoke occlusion). */
export function segmentSphereOverlap(a: Vector3, b: Vector3, c: Vector3, r: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return 0;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const ox = a.x - c.x, oy = a.y - c.y, oz = a.z - c.z;
  const bq = ox * ux + oy * uy + oz * uz;
  const cq = ox * ox + oy * oy + oz * oz - r * r;
  const disc = bq * bq - cq;
  if (disc <= 0) return 0;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, -bq - s), t1 = Math.min(len, -bq + s);
  return Math.max(0, t1 - t0);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
