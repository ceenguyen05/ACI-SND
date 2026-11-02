import { Vector3 } from 'three';
import { DEG, angleDiff, clamp } from '../core/math';
import { shotAngles } from '../sim/combat/Ballistics';
import type { Agent } from '../sim/entities/Agent';
import type { Match } from '../sim/mode/Match';
import type { AimAssist as Level } from './Profile';

/**
 * Mouse aim assist for the local player (never bots), like console shooters. Everything is
 * measured from where the next bullet goes (view plus recoil punch), the same point the
 * crosshair shows:
 *  - friction: sensitivity eases down while your shots would land on / near a visible enemy;
 *  - magnetism: a gentle, rate-capped pull toward the nearest point of their body column (waist
 *    to head), so it never drags you off a headshot onto the chest;
 *  - tracking: while you're aiming or moving, the view follows part of the target's motion
 *    across your screen (theirs and your own strafing), so strafe duels stay on target.
 * Pull and tracking are mostly applied while you're actively aiming; magnified scopes slow the
 * pull so it doesn't swing the zoomed view. Smoke, walls, flashes and spectating disable it.
 */
const TUNING: Record<Exclude<Level, 'off'>, { reach: number; maxCone: number; friction: number; pull: number; cap: number; track: number }> = {
  //        reach (m at target) | widest cone | min sens | pull (1/s) | max pull (deg/s) | share of target motion followed
  low:    { reach: 0.7, maxCone: 5 * DEG, friction: 0.72, pull: 1.6, cap: 7 * DEG, track: 0.25 },
  medium: { reach: 1.0, maxCone: 7 * DEG, friction: 0.56, pull: 2.8, cap: 12 * DEG, track: 0.4 },
  high:   { reach: 1.3, maxCone: 9 * DEG, friction: 0.42, pull: 4.2, cap: 18 * DEG, track: 0.55 },
};

const eye = new Vector3();
const lo = new Vector3();
const hi = new Vector3();
const visiblePoint = new Vector3();

export function makeAimAssist(match: Match, level: () => Level) {
  /** The target followed last frame and its direction then (for tracking). */
  let last: { id: number; yaw: number; pitch: number } | null = null;
  return (yaw: number, pitch: number, dt: number, active: boolean, zoom = 1) => {
    const lv = level();
    const me = match.player;
    if (lv === 'off' || !me || !me.alive || match.time < me.flashUntil - 0.3) { last = null; return null; }
    dt = clamp(dt, 0, 0.05);
    const t = TUNING[lv];
    me.eyePos(eye);
    const shot = shotAngles(me, yaw, pitch);
    const cosP = Math.cos(shot.pitch);
    // direction of a point as (yaw, pitch) offsets from the shot, yaw scaled to true angle
    const offset = (p: Vector3) => {
      const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      return { y: angleDiff(shot.yaw, Math.atan2(-dx, -dz)) * cosP, p: Math.asin(clamp(dy / d, -1, 1)) - shot.pitch, d };
    };
    let best = Infinity, bestYaw = 0, bestPitch = 0, target: Agent | null = null, centre = { y: 0, p: 0 };
    for (const e of match.agents) {
      if (!e.alive || e.team === me.team) continue;
      // body column: waist to the middle of the head (leaning and prone poses included)
      e.aimPoint(false, lo); lo.y -= e.height * 0.2 * (1 - e.motor.prone);
      e.eyePos(hi);
      const A = offset(lo), B = offset(hi);
      const dist = (A.d + B.d) / 2;
      if (dist > 60 || dist < 0.6) continue;
      // nearest point of the column to the shot direction (small-angle screen space)
      const sy = B.y - A.y, sp = B.p - A.p, len2 = sy * sy + sp * sp;
      const k = len2 > 1e-9 ? clamp(-(A.y * sy + A.p * sp) / len2, 0, 1) : 0;
      const ey = A.y + sy * k, ep = A.p + sp * k;
      const err = Math.hypot(ey, ep);
      const cone = clamp(Math.atan2(t.reach, dist), 1.2 * DEG, t.maxCone);
      if (err > cone || err / cone >= best) continue;
      if (!match.los(me, e)) continue;
      visiblePoint.copy(lo).lerp(hi, k);
      if (match.world.collision.segmentBlocked(eye, visiblePoint) || match.utility.smokeBlocks(eye, visiblePoint)) continue;
      best = err / cone; bestYaw = ey / cosP; bestPitch = ep; target = e;
      centre = { y: (A.y + B.y) / 2 / cosP + shot.yaw, p: (A.p + B.p) / 2 + shot.pitch };
    }
    if (!target) { last = null; return null; }
    const near = 1 - best; // 1 = on the body column, 0 = edge of the cone
    const sens = 1 - (1 - t.friction) * Math.min(1, near * 1.4);
    // pull is proportional to the error, capped, and mostly applied while you're aiming
    const rate = Math.min(t.pull * (active ? 1 : 0.3) * dt, 1);
    const cap = (t.cap * dt) / Math.max(1, zoom);
    let py = clamp(bestYaw * rate, -cap, cap);
    let pp = clamp(bestPitch * rate * 0.6, -cap, cap); // vertical pull is weaker so recoil stays yours
    // tracking: follow part of how far the target moved across the view since last frame
    // (sim positions update per tick, so this is a per-frame displacement, not a velocity)
    if (last && last.id === target.id && active) {
      const my = angleDiff(last.yaw, centre.y), mp = centre.p - last.pitch;
      if (Math.abs(my) < 10 * DEG && Math.abs(mp) < 10 * DEG) {
        py += my * t.track * near;
        pp += mp * t.track * near * 0.5;
      }
    }
    last = { id: target.id, yaw: centre.y, pitch: centre.p };
    // Tracking shares the pull budget, including through a scope and at low frame rates.
    return { sens, yaw: clamp(py, -cap, cap), pitch: clamp(pp, -cap, cap) };
  };
}
