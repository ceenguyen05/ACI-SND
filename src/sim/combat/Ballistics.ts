import { Vector3 } from 'three';
import { MOVE } from '../../config/movement';
import type { WeaponDef } from '../../config/weapons';
import { DEG, clamp, dirFromAngles } from '../../core/math';
import type { Agent, HitGroup, Hitbox } from '../entities/Agent';
import { rayBox, type Box, type SurfaceKind } from '../physics/CollisionWorld';
import type { SimContext } from '../SimContext';
import { computeDamage } from './damage';
import type { Device } from '../gadget/GadgetManager';

export interface TraceResult {
  t: number;
  point: Vector3;
  normal: Vector3 | null;
  surface: SurfaceKind | null;
  agent: Agent | null;
  group: HitGroup | null;
  /** Gadget hit (cameras, drones, mines, or a shield's collider). */
  device: Device | null;
  /** World box that stopped the trace (for penetration). */
  box: Box | null;
}

/** How hard each surface is to shoot through (metres of "wood equivalent" per metre). */
const RESIST: Partial<Record<SurfaceKind, number>> = { wood: 0.6, fabric: 0.12, glass: 0.2, metal: 2.4, vehicle: 2 };
/** Penetration power by weapon class (metres of wood). */
const POWER: Record<WeaponDef['class'], number> = { knife: 0, pistol: 0.32, smg: 0.38, shotgun: 0.15, rifle: 0.9, lmg: 1, sniper: 1.5, launcher: 0 };

/** Distance a ray travels inside an AABB starting from a point on / inside it. */
function exitDistance(p: Vector3, d: Vector3, b: Box): number {
  let t = Infinity;
  for (const [o, dd, lo, hi] of [[p.x, d.x, b.minX, b.maxX], [p.y, d.y, b.minY, b.maxY], [p.z, d.z, b.minZ, b.maxZ]]) {
    if (Math.abs(dd) < 1e-9) continue;
    t = Math.min(t, Math.max((lo - o) / dd, (hi - o) / dd));
  }
  return Math.max(0, t);
}

const hbTmp: Hitbox[] = [];

/** Hitscan trace against the world and every living agent except `ignore`. */
export function traceBullet(ctx: SimContext, ignore: Agent | null, origin: Vector3, dir: Vector3, range: number): TraceResult {
  const wh = ctx.world.collision.raycast(origin, dir, range);
  let bestT = wh ? wh.t : range;
  let agent: Agent | null = null, group: HitGroup | null = null;
  for (const a of ctx.agents) {
    if (a === ignore || !a.alive) continue;
    const p = a.pos;
    const radius = 0.75 + a.motor.prone * 0.35;
    const body = { minX: p.x - radius, maxX: p.x + radius, minZ: p.z - radius, maxZ: p.z + radius, minY: p.y - 0.05, maxY: p.y + a.height + 0.3 };
    const inside = origin.x > body.minX && origin.x < body.maxX && origin.z > body.minZ && origin.z < body.maxZ && origin.y > body.minY && origin.y < body.maxY;
    if (!inside && !rayBox(origin, dir, body, bestT)) continue; // (a ray starting inside the broad box must still be tested)
    for (const hb of a.hitboxes(hbTmp)) {
      const r = rayBox(origin, dir, hb, bestT);
      if (r && r.t < bestT) { bestT = r.t; agent = a; group = hb.group; }
    }
  }
  const dev = ctx.gadgets.raycast(origin, dir, bestT);
  if (dev && dev.t < bestT) {
    const point = origin.clone().addScaledVector(dir, dev.t);
    return { t: dev.t, point, normal: dir.clone().negate(), surface: 'metal', agent: null, group: null, device: dev.device, box: null };
  }
  const point = origin.clone().addScaledVector(dir, bestT);
  if (agent) return { t: bestT, point, normal: null, surface: null, agent, group, device: null, box: null };
  const shield = wh && wh.box.device !== undefined ? ctx.gadgets.get(wh.box.device) : null;
  return { t: bestT, point, normal: wh ? wh.normal : null, surface: wh ? wh.box.surface : null, agent: null, group: null, device: shield, box: wh ? wh.box : null };
}

/** Current total inaccuracy (radians) for an agent firing `def`. */
export function inaccuracy(def: WeaponDef, a: Agent): number {
  const s = def.spread;
  let v = a.crouched ? s.crouch : s.stand;
  // A settled prone stance is steadier; crawling, dropping down and sliding cost accuracy.
  v *= 1 - a.motor.prone * 0.2;
  v += s.move * (a.motor.slidePose * 0.8 + Math.sin(a.motor.prone * Math.PI) * 0.5);
  v += s.move * a.motor.prone * clamp(a.speed2D / (def.moveSpeed * MOVE.proneMult), 0, 1) * 0.3;
  const max = def.moveSpeed;
  const moveFrac = clamp((a.speed2D - max * 0.34) / (max * 0.66), 0, 1);
  v += s.move * moveFrac;
  if (!a.motor.onGround) v += s.air;
  else if (a.motor.landTime < MOVE.landingRecovery) {
    const impact = clamp((a.motor.landingImpact - 2) / 6, 0, 1);
    v += s.air * 0.22 * impact * (1 - a.motor.landTime / MOVE.landingRecovery);
  }
  v += a.wpn.fireInacc;
  if (def.scope && a.wpn.scope === 0) v += def.scope.unscopedPenalty;
  if (a.wpn.ads) v *= def.ads?.spread ?? 0.75;
  // a bipod braces the gun while crouched and still
  if (def.mods?.bipod && a.crouched && a.speed2D < 0.6) v *= 0.6;
  return (s.base + v) / 1000;
}

const fwd = new Vector3(), right = new Vector3(), up = new Vector3(), dir = new Vector3();

/** Fire one trigger pull of a gun: handles pellets, spread, recoil punch, damage, events. */
export function fireGun(ctx: SimContext, shooter: Agent, def: WeaponDef): void {
  const eye = shooter.eyePos(new Vector3());
  const yaw = shooter.yaw + (shooter.aimPunchYaw + shooter.flinchYaw) * DEG;
  const pitch = shooter.pitch + (shooter.aimPunchPitch + shooter.flinchPitch) * DEG;
  dirFromAngles(yaw, pitch, fwd);
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  up.crossVectors(right, fwd).normalize();
  const inacc = inaccuracy(def, shooter);
  const pellets = def.pellets ?? 1;
  const muzzle = eye.clone().addScaledVector(fwd, 0.5).addScaledVector(right, 0.12).addScaledVector(up, -0.1);
  for (let i = 0; i < pellets; i++) {
    let ox = 0, oy = 0;
    const a1 = ctx.rng.next() * Math.PI * 2, r1 = ctx.rng.next() * inacc;
    ox += Math.cos(a1) * r1; oy += Math.sin(a1) * r1;
    if (pellets > 1) {
      const a2 = ctx.rng.next() * Math.PI * 2, r2 = Math.sqrt(ctx.rng.next()) * def.spread.base / 1000;
      ox += Math.cos(a2) * r2; oy += Math.sin(a2) * r2;
    }
    dir.copy(fwd).addScaledVector(right, Math.tan(ox)).addScaledVector(up, Math.tan(oy)).normalize();
    // Trace, penetrating thin / soft cover (wood crates, cubicle partitions, light metal).
    let from = eye, travelled = 0, scale = 1, pens = 0;
    let end = eye;
    for (;;) {
      const res = traceBullet(ctx, shooter, from, dir, def.range - travelled);
      end = res.point;
      if (res.agent && res.group) {
        const v = res.agent;
        const dmg = computeDamage(def.damage, def.armorPen, def.rangeMod, travelled + res.t, res.group, v.armor, v.helmet);
        dmg.health = Math.floor(dmg.health * scale); dmg.armor = Math.floor(dmg.armor * scale);
        ctx.applyDamage(v, shooter, dmg, res.group, def.id, res.point, dir.clone(), { wallbang: pens > 0 });
        break;
      }
      if (!res.normal || !res.surface || travelled + res.t >= def.range) break;
      if (res.device) ctx.gadgets.damage(res.device, def.damage * scale, shooter);
      ctx.events.emit('impact', { point: res.point, normal: res.normal, surface: res.surface });
      const resist = RESIST[res.surface];
      const soft = !res.device || res.device.kind === 'barricade';
      if (!res.box || !soft || resist === undefined || pens >= 2) break;
      const thick = exitDistance(res.point, dir, res.box);
      const cost = (thick * resist) / Math.max(0.01, POWER[def.class] * (def.mods?.penMul ?? 1));
      if (cost >= 1) break;
      scale *= (1 - 0.65 * cost) * 0.85;
      if (scale < 0.12) break;
      const exit = res.point.clone().addScaledVector(dir, thick + 0.01);
      if (ctx.world.collision.overlaps(exit.x - 0.005, exit.y - 0.005, exit.z - 0.005, exit.x + 0.005, exit.y + 0.005, exit.z + 0.005)) break; // stacked cover
      ctx.events.emit('impact', { point: exit.clone(), normal: dir.clone(), surface: res.surface });
      travelled += res.t + thick;
      from = exit;
      pens++;
    }
    ctx.events.emit('shot', {
      agentId: shooter.id, weaponId: def.id, sound: def.sound, origin: muzzle, end,
      tracer: def.sound === 'suppressed' ? false : pellets > 1 ? i < 3 : true, pellet: i > 0,
    });
  }
  const quiet = def.sound === 'suppressed';
  ctx.noise(eye, quiet ? 14 : 48, shooter, 'gunshot');
  // CoD-style: unsuppressed fire shows up on the enemy radar for a moment
  if (!quiet) shooter.spottedUntil = Math.max(shooter.spottedUntil, ctx.time + 0.9);
}

/** Knife attack (slash or stab) using a short multi-ray cone. Returns true if it hit someone. */
export function knifeAttack(ctx: SimContext, a: Agent, stab: boolean, quick = false): boolean {
  const eye = a.eyePos(new Vector3());
  const base = a.viewDir(new Vector3());
  let best: { victim: Agent; group: HitGroup; t: number; point: Vector3 } | null = null;
  for (const [dy, dp] of [[0, 0], [8, 0], [-8, 0], [0, -6], [0, 6]]) {
    const d = dirFromAngles(a.yaw + dy * DEG, a.pitch + dp * DEG, new Vector3());
    const res = traceBullet(ctx, a, eye, d, 1.6);
    if (res.agent && res.group && (!best || res.t < best.t)) best = { victim: res.agent, group: res.group, t: res.t, point: res.point };
  }
  if (!best) {
    const dev = ctx.gadgets.raycast(eye, base, 1.8, true);
    if (dev) {
      ctx.gadgets.damage(dev.device, stab ? 65 : 45, a, 'melee');
      if (!quick) ctx.events.emit('knife', { agentId: a.id, hit: true, stab });
      return true;
    }
    const res = traceBullet(ctx, a, eye, base, 1.7);
    if (res.device) {
      // melee is how you hack through a wooden barricade (3 hits; crowbars hit harder)
      ctx.gadgets.damage(res.device, 45 * (a.hasCrowbar ? 3 : 1), a, 'melee');
      if (res.normal && res.surface) ctx.events.emit('impact', { point: res.point, normal: res.normal, surface: res.surface });
      if (!quick) ctx.events.emit('knife', { agentId: a.id, hit: true, stab });
      return true;
    }
    if (res.normal && res.surface) ctx.events.emit('impact', { point: res.point, normal: res.normal, surface: res.surface });
    if (quick) return false;
    ctx.events.emit('knife', { agentId: a.id, hit: !!res.normal, stab });
    return false;
  }
  const v = best.victim;
  // Backstab: attacker roughly behind the victim.
  const vf = v.viewDir(new Vector3()).setY(0).normalize();
  const toAttacker = new Vector3(a.pos.x - v.pos.x, 0, a.pos.z - v.pos.z).normalize();
  const back = vf.dot(toAttacker) < -0.35;
  const raw = quick ? (back ? 165 : 55) : stab ? (back ? 180 : 65) : (back ? 90 : 40);
  const armored = v.armor > 0;
  const health = armored ? Math.floor(raw * 0.85) : raw;
  const armor = armored ? Math.floor(raw * 0.075) : 0;
  ctx.applyDamage(v, a, { health, armor }, best.group === 'head' ? 'chest' : best.group, 'knife', best.point, base.clone());
  if (!quick) ctx.events.emit('knife', { agentId: a.id, hit: true, stab });
  return true;
}
