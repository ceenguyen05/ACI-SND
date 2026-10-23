import type { HitGroup } from '../entities/Agent';

export const HIT_MULT: Record<HitGroup, number> = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };

/** CS units: range modifier applies per 500 units ≈ 12.7 m. */
const RANGE_UNIT = 12.7;

export interface DamageResult { health: number; armor: number }

/**
 * CS:GO-style damage: base × range falloff × hitgroup multiplier, then armor absorbs part
 * of it if the hitgroup is protected (chest/stomach by vest, head by helmet).
 */
export function computeDamage(base: number, armorPen: number, rangeMod: number, distance: number,
  group: HitGroup, armor: number, helmet: boolean): DamageResult {
  const dmg = base * Math.pow(rangeMod, distance / RANGE_UNIT) * HIT_MULT[group];
  const protectedGroup = group === 'chest' || group === 'stomach' || (group === 'head' && helmet);
  if (armor <= 0 || !protectedGroup) return { health: Math.floor(dmg), armor: 0 };
  let healthDmg = dmg * armorPen;
  let armorDmg = (dmg - healthDmg) * 0.5;
  if (armorDmg > armor) { armorDmg = armor; healthDmg = dmg - armorDmg * 2; }
  return { health: Math.floor(healthDmg), armor: Math.floor(armorDmg) };
}

/** Explosion damage (frag / bomb): armor halves health damage. */
export function explosionDamage(raw: number, armor: number): DamageResult {
  if (armor <= 0) return { health: Math.floor(raw), armor: 0 };
  let healthDmg = raw * 0.5;
  let armorDmg = raw * 0.5;
  if (armorDmg > armor) { armorDmg = armor; healthDmg = raw - armor; }
  return { health: Math.floor(healthDmg), armor: Math.floor(armorDmg) };
}
