import type { Batcher } from './Materials';

/** Wall-mounted detail stays within the wall's trim; playable cover remains in MapDef. */
export function dressWall(b: Batcher, x: number, z: number, height: number, angle: number,
  kind: string, outdoors: boolean, seed: number) {
  const co = Math.cos(angle), si = Math.sin(angle);
  const box = (mat: string, w: number, h: number, d: number, u: number, y: number, v = 0.03) =>
    b.box(mat, w, h, d, x + co * u + si * v, y, z - si * u + co * v, angle);
  const industrial = kind === 'factory';
  if (industrial) {
    // Fired-brick plinth, coping, panel joints and electrical trunking.
    box('masonry', 2, 1.28, 0.035, 0, 0);
    box('m:#717774', 2, 0.065, 0.075, 0, 1.28, 0.045);
    box('m:#777d76', 2, 0.042, 0.045, 0, 2.72);
    if (seed % 4 === 0) {
      box('m:#65716e', 0.08, height - 1.35, 0.075, -0.94, 1.35);
      for (let y = 1.5; y < height; y += 1.1) box('metal', 0.04, 0.04, 0.018, -0.94, y, 0.08);
    }
    if (seed % 13 === 3) {
      box('m:#75837d', 0.42, 0.58, 0.11, -0.45, 1.6, 0.075);
      box('m:#a4ada6', 0.36, 0.51, 0.015, -0.45, 1.635, 0.138);
      box('rubber', 0.025, 0.1, 0.02, -0.31, 1.82, 0.155);
      box('m:#727d76', 0.035, 0.6, 0.03, -0.45, 2.18);
      box('hazard', 0.14, 0.12, 0.005, -0.5, 1.91, 0.151);
    }
    // High glazed bands give the factory a recognizable architectural scale.
    if (height > 7 && seed % 4 !== 0) {
      box('m:#394649', 1.75, 1.25, 0.045, 0, height - 2.05, 0.06);
      box('window', 1.63, 1.12, 0.012, 0, height - 1.99, 0.089);
      box('m:#838e89', 0.045, 1.18, 0.018, 0, height - 2.015, 0.105);
      box('m:#838e89', 1.73, 0.04, 0.018, 0, height - 1.43, 0.105);
      box('m:#68746e', 1.85, 0.065, 0.13, 0, height - 2.1, 0.07);
    }
  } else if (outdoors && height > 4.5) {
    // Facade piers, flashing and sealed reflective glazing. These are not openings.
    box('concrete', 0.16, height, 0.09, -0.95, 0, 0.045);
    box('m:#3e5059', 2, 0.15, 0.18, 0, height - 0.16, 0.07);
    if (seed % 3 !== 0) {
      box('m:#37434b', 1.5, 1.7, 0.065, 0, 2.35, 0.055);
      box('window', 1.34, 1.54, 0.012, 0, 2.43, 0.095);
      box('m:#9da49d', 0.055, 1.59, 0.022, 0, 2.4, 0.108);
      box('concrete', 1.65, 0.09, 0.21, 0, 2.27, 0.08);
    }
  } else if (!outdoors) {
    // Offices get ventilation, switches and real door-height wall trim.
    if (seed % 11 === 4) {
      box('m:#9aa29c', 0.68, 0.26, 0.045, 0.1, 2.57);
      box('rubber', 0.6, 0.19, 0.012, 0.1, 2.605, 0.06);
      for (let k = 0; k < 5; k++) box('m:#aab1a9', 0.6, 0.018, 0.025, 0.1, 2.615 + k * 0.036, 0.077);
    }
    if (seed % 17 === 2) {
      box('p:#d0d1c6', 0.09, 0.15, 0.02, 0.68, 1.12);
      box('p:#8c928c', 0.05, 0.075, 0.012, 0.68, 1.16, 0.048);
    }
  }
}
