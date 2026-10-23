import { Vector3 } from 'three';
import { DEG, angleDiff, clamp } from '../core/math';
import type { Match } from '../sim/mode/Match';
import type { AimAssist as Level } from './Profile';

/**
 * Mouse aim assist for the local player (never bots). Two parts, like console shooters:
 *  - friction: sensitivity eases down while the crosshair sits over / near a visible enemy;
 *  - magnetism: a gentle, rate-capped pull toward the enemy's upper chest while you're
 *    actively aiming or strafing (much weaker when you hold still).
 * Smoke, walls, flashes and spectating disable it.
 */
const TUNING: Record<Exclude<Level, 'off'>, { reach: number; maxCone: number; friction: number; pull: number; cap: number }> = {
  //        reach (m at target) | widest cone | min sens | pull (1/s) | max pull (deg/s)
  low:    { reach: 0.7, maxCone: 5 * DEG, friction: 0.72, pull: 1.6, cap: 7 * DEG },
  medium: { reach: 1.0, maxCone: 7 * DEG, friction: 0.56, pull: 2.8, cap: 12 * DEG },
  high:   { reach: 1.3, maxCone: 9 * DEG, friction: 0.42, pull: 4.2, cap: 18 * DEG },
};

const eye = new Vector3();
const aim = new Vector3();

export function makeAimAssist(match: Match, level: () => Level) {
  return (yaw: number, pitch: number, dt: number, active: boolean) => {
    const lv = level();
    const me = match.player;
    if (lv === 'off' || !me || !me.alive || match.time < me.flashUntil - 0.3) return null;
    const t = TUNING[lv];
    me.eyePos(eye);
    let best = Infinity, bestYaw = 0, bestPitch = 0, bestCone = 1;
    for (const e of match.agents) {
      if (!e.alive || e.team === me.team) continue;
      // aim at the upper chest: forgiving but not a free headshot
      if (e.motor.prone > 0) e.aimPoint(false, aim);
      else aim.set(e.pos.x, e.pos.y + e.eyeHeight - 0.32, e.pos.z);
      const dx = aim.x - eye.x, dy = aim.y - eye.y, dz = aim.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 60 || dist < 0.6) continue;
      const ty = Math.atan2(-dx, -dz), tp = Math.asin(clamp(dy / dist, -1, 1));
      const ey = angleDiff(yaw, ty), ep = tp - pitch;
      const err = Math.hypot(ey * Math.cos(pitch), ep);
      const cone = clamp(Math.atan2(t.reach, dist), 1.2 * DEG, t.maxCone);
      if (err > cone || err / cone >= best) continue;
      if (!match.los(me, e)) continue;
      best = err / cone; bestYaw = ey; bestPitch = ep; bestCone = cone;
    }
    if (best === Infinity) return null;
    const near = 1 - best; // 1 = dead centre, 0 = edge of the cone
    const sens = 1 - (1 - t.friction) * Math.min(1, near * 1.4);
    // pull is proportional to the error, capped, and mostly applied while you're aiming
    const rate = Math.min(t.pull * (active ? 1 : 0.3) * dt, 1);
    const cap = t.cap * dt * (bestCone > 0 ? 1 : 0);
    const py = clamp(bestYaw * rate, -cap, cap);
    const pp = clamp(bestPitch * rate * 0.6, -cap, cap); // vertical pull is weaker so recoil stays yours
    return { sens, yaw: py, pitch: pp };
  };
}
