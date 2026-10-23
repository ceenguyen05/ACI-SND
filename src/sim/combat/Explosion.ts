import { Vector3 } from 'three';
import type { Agent } from '../entities/Agent';
import type { SimContext } from '../SimContext';
import { explosionDamage } from './damage';

/**
 * Shared blast model for rockets, 40 mm shells, C4, hunter drones and the cruise missile.
 * Damage falls off with distance, needs line of sight (cover protects), armor halves it,
 * and gadgets / barricades in range take blast damage too.
 */
export function explode(ctx: SimContext, pos: Vector3, radius: number, damage: number, attacker: Agent | null, source: string, opts: { ignoreCeilings?: boolean } = {}) {
  ctx.events.emit('explosion', { pos: pos.clone(), radius, source });
  ctx.noise(pos, 70, attacker, 'explosion');
  const from = pos.clone();
  from.y = Math.max(from.y, 0.15);
  for (const a of ctx.agents) {
    if (!a.alive) continue;
    const c = a.centerPos(new Vector3());
    const d = c.distanceTo(from);
    if (d > radius) continue;
    if (blocked(ctx, from, c, opts.ignoreCeilings)) {
      // partial cover: feet / head may still be exposed
      const head = a.eyePos(new Vector3());
      if (blocked(ctx, from, head, opts.ignoreCeilings)) continue;
    }
    const raw = damage * Math.pow(1 - d / radius, 1.1);
    if (raw < 1) continue;
    ctx.applyDamage(a, attacker, explosionDamage(raw, a.armor), 'chest', source, c, c.clone().sub(from).normalize());
  }
  ctx.gadgets.explosion(from, radius, damage, attacker);
}

function blocked(ctx: SimContext, a: Vector3, b: Vector3, ignoreCeilings?: boolean): boolean {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 0.01) return false;
  dir.divideScalar(len);
  const hit = ctx.world.collision.raycast(a, dir, len - 0.05);
  if (!hit) return false;
  return !(ignoreCeilings && hit.box.surface === 'ceiling');
}
