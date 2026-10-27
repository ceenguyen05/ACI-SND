import { WEAPONS, type WeaponDef, type WeaponId } from '../../config/weapons';
import type { PerkId } from '../../config/zombies';
import type { WeaponInstance } from '../entities/Agent';

/** Names of Prototype-Forged weapons (CoD Pack-a-Punch style). */
const FORGED_NAMES: Partial<Record<WeaponId, string>> = {
  p30: 'P-30 Hellfire', judge: 'Judge Dredd .50', viper: 'Viper Venom', vespa: 'Vespa Swarm', hornet: 'Hornet Nest',
  mako: 'Mako Megalodon', breacher: 'Breacher Doorbuster', reaper: 'Grim Reaper', galeforce: 'Galeforce Hurricane',
  tempest: 'Tempest Typhoon', ravager: 'Ravager Annihilator', sentinel: 'Sentinel Guardian', talon: 'Talon Raptor',
  kestrel: 'Kestrel Falcon', marshal: 'Marshal Law', longbow: 'Longbow Ballista', bulwark: 'Bulwark Fortress',
  anvil: 'Anvil Forgeheart', thumper: 'Thumper Thunderclap', hammer: 'Hammer of Dawn', disruptor: 'Disruptor X-2 Annihilator',
};

const base = new Map<string, WeaponDef>();
const perked = new Map<string, WeaponDef>();

/** Zombies stats for a gun: deeper reserves; tier 1 = Prototype Forge upgrade. */
export function zombieDef(id: WeaponId, tier = 0): WeaponDef {
  const key = `${id}:${tier}`;
  let d = base.get(key);
  if (d) return d;
  const w = WEAPONS[id];
  const launcher = !!w.projectile;
  d = { ...w, spread: { ...w.spread }, tier };
  d.reserve = launcher ? (id === 'disruptor' ? w.reserve : w.reserve * 3) : Math.min(w.mag * 8, Math.max(w.reserve * 2, w.mag * 6));
  if (tier >= 1) {
    d.name = FORGED_NAMES[id] ?? `${w.name} MK-II`;
    d.damage = w.damage * 2;
    d.mag = launcher && w.mag === 1 ? 3 : Math.ceil(w.mag * 1.5);
    d.reserve = d.reserve * 2;
    d.rpm = w.rpm * 1.1;
    d.reloadTime = w.reloadTime * 0.85;
    if (w.projectile) d.projectile = { ...w.projectile, damage: w.projectile.damage * 1.9, radius: w.projectile.radius * 1.25 };
  }
  base.set(key, d);
  return d;
}

/** Apply the owner's perks (Quick Hands, Rapid Fire, Dead Eye) on top of the zombies stats. */
export function perkDef(def: WeaponDef, perks: readonly PerkId[]): WeaponDef {
  const qh = perks.includes('quickHands'), rf = perks.includes('rapidFire'), de = perks.includes('deadEye');
  if (!qh && !rf && !de) return def;
  const key = `${def.id}:${def.tier ?? 0}:${qh ? 1 : 0}${rf ? 1 : 0}${de ? 1 : 0}`;
  let d = perked.get(key);
  if (d) return d;
  d = { ...def, spread: { ...def.spread } };
  if (qh) { d.reloadTime = def.reloadTime * 0.5; d.drawTime = def.drawTime * 0.5; }
  if (rf) {
    d.rpm = def.rpm * 1.33; d.damage = def.damage * 1.2;
    if (def.burst) d.burst = { ...def.burst, rpm: def.burst.rpm * 1.33 };
    if (def.projectile) d.projectile = { ...def.projectile, damage: def.projectile.damage * 1.2 };
  }
  if (de) for (const k of ['base', 'stand', 'crouch', 'move', 'air', 'perShot'] as const) d.spread[k] = def.spread[k] * 0.65;
  perked.set(key, d);
  return d;
}

export function zWeapon(id: WeaponId, tier: number, perks: readonly PerkId[]): WeaponInstance {
  const def = perkDef(zombieDef(id, tier), perks);
  return { def, mag: def.mag, reserve: def.reserve };
}

/** Re-derive a held gun's stats after the owner's perks changed (ammo is kept). */
export function refreshWeapon(w: WeaponInstance, perks: readonly PerkId[]) {
  w.def = perkDef(zombieDef(w.def.id, w.def.tier ?? 0), perks);
  w.mag = Math.min(w.mag, w.def.mag);
  w.reserve = Math.min(w.reserve, w.def.reserve);
}

/** The forge-upgraded name, for UI previews. */
export const forgedName = (id: WeaponId) => FORGED_NAMES[id] ?? `${WEAPONS[id].name} MK-II`;
