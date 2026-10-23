import { ECONOMY } from '../../config/economy';
import type { Team } from '../../config/rules';
import { GEAR, MAX_GRENADES, UTILITIES, utilityPrice, type GearId, type UtilityId } from '../../config/utilities';
import { WEAPONS, availableTo, type WeaponId } from '../../config/weapons';
import { GADGETS, MAX_GADGETS, type GadgetId } from '../../config/gadgets';
import type { RoundEndReason } from '../events';
import { ATTACHMENTS, MAX_ATTACHMENTS, fits, type AttachmentId } from '../../config/attachments';

export type BuyItem =
  | { kind: 'weapon'; id: WeaponId }
  | { kind: 'utility'; id: UtilityId }
  | { kind: 'gadget'; id: GadgetId }
  | { kind: 'gear'; id: GearId }
  /** Gunsmith: buy (or, if owned, fit / remove) an attachment for a gun you're carrying. */
  | { kind: 'attachment'; weapon: WeaponId; id: AttachmentId };

export const itemKey = (i: BuyItem) => (i.kind === 'attachment' ? `attachment:${i.weapon}:${i.id}` : `${i.kind}:${i.id}`);

export function lossBonus(streak: number): number {
  if (streak <= 0) return ECONOMY.lossBonus[0];
  return ECONOMY.lossBonus[Math.min(streak, ECONOMY.lossBonus.length) - 1];
}

/** CS2: a win reduces the loss streak by one instead of resetting it; a loss increments it (max 5). */
export function nextLossStreak(prev: number, won: boolean): number {
  return won ? Math.max(0, prev - 1) : Math.min(ECONOMY.lossBonus.length, prev + 1);
}

export function winReward(reason: RoundEndReason): number {
  switch (reason) {
    case 'bomb': return ECONOMY.winBomb;
    case 'defuse': return ECONOMY.winDefuse;
    case 'time': return ECONOMY.winTime;
    default: return ECONOMY.winElimination;
  }
}

/** Kill reward by damage source id (weapon id or 'frag' / 'fire'). */
export function killReward(source: string): number {
  if (source === 'frag' || source === 'fire') return ECONOMY.killGrenade;
  if (source === 'knife') return ECONOMY.killKnife;
  const def = WEAPONS[source as WeaponId];
  return def ? def.killReward : ECONOMY.killDefault;
}

export interface Buyer {
  team: Team; money: number; armor: number; helmet: boolean; hasKit: boolean;
  grenades: Record<UtilityId, number>;
  gadgets?: Record<GadgetId, number>;
  hasCrowbar?: boolean;
  primary: { def: { id: WeaponId } } | null;
  secondary: { def: { id: WeaponId } } | null;
  loadouts?: Partial<Record<WeaponId, { owned: AttachmentId[]; equipped: Partial<Record<string, AttachmentId>> }>>;
}

/** Owned already? Then the "purchase" just fits or removes it (free). */
export function ownsAttachment(b: Pick<Buyer, 'loadouts'>, weapon: WeaponId, id: AttachmentId): boolean {
  return !!b.loadouts?.[weapon]?.owned.includes(id);
}

export function priceOf(item: BuyItem, b: Pick<Buyer, 'team' | 'armor' | 'helmet'>): number {
  switch (item.kind) {
    case 'weapon': return WEAPONS[item.id].price;
    case 'utility': return utilityPrice(item.id, b.team);
    case 'gadget': return GADGETS[item.id].price;
    case 'gear':
      if (item.id === 'helmet') return b.armor >= 100 && !b.helmet ? 350 : GEAR.helmet.price;
      return GEAR[item.id].price;
    case 'attachment':
      return ownsAttachment(b as Buyer, item.weapon, item.id) ? 0 : ATTACHMENTS[item.id].price;
  }
}

/** Validates a purchase (ignores buy-zone/time, which the mode checks). Returns a reason string or null if OK. */
export function purchaseBlocker(item: BuyItem, b: Buyer): string | null {
  const price = priceOf(item, b);
  switch (item.kind) {
    case 'weapon': {
      const def = WEAPONS[item.id];
      if (!availableTo(def, b.team) || def.slot === 'melee') return 'Not available for your team';
      const cur = def.slot === 'primary' ? b.primary : b.secondary;
      if (cur && cur.def.id === item.id) return 'Already owned';
      break;
    }
    case 'utility': {
      const u = UTILITIES[item.id];
      if (b.grenades[item.id] >= u.max) return 'Carrying maximum';
      const total = Object.values(b.grenades).reduce((s, n) => s + n, 0);
      if (total >= MAX_GRENADES) return 'Grenade slots full';
      break;
    }
    case 'gadget': {
      const g = GADGETS[item.id];
      if (!availableTo(g, b.team)) return 'Not available for your team';
      const owned = b.gadgets ?? ({} as Record<GadgetId, number>);
      if (item.id === 'stim' ? (owned.stim ?? 0) > 0 : (owned[item.id] ?? 0) >= g.max) return item.id === 'stim' ? 'Already owned' : 'Carrying maximum';
      const kinds = Object.entries(owned).filter(([, n]) => n > 0).length;
      if (!(owned[item.id] > 0) && kinds >= MAX_GADGETS) return 'Gadget slots full';
      break;
    }
    case 'gear': {
      if (item.id === 'kevlar' && b.armor >= 100) return 'Already have full armor';
      if (item.id === 'helmet' && b.armor >= 100 && b.helmet) return 'Already have armor + helmet';
      if (item.id === 'kit' && b.team !== 'CT') return 'Defenders only';
      if (item.id === 'kit' && b.hasKit) return 'Already have a kit';
      if (item.id === 'plate' && b.armor >= 150) return 'Armor is maxed';
      if (item.id === 'crowbar' && b.hasCrowbar) return 'Already have a crowbar';
      break;
    }
  }
  if (item.kind === 'attachment') {
    if (!fits(item.weapon, item.id)) return "Doesn't fit this gun";
    if (b.primary?.def.id !== item.weapon && b.secondary?.def.id !== item.weapon) return 'Buy the gun first';
    const lo = b.loadouts?.[item.weapon];
    const eq = lo?.equipped ?? {};
    const slot = ATTACHMENTS[item.id].slot;
    const fitted = eq[slot] === item.id;
    const count = Object.values(eq).filter(Boolean).length;
    if (!fitted && !eq[slot] && count >= MAX_ATTACHMENTS) return `${MAX_ATTACHMENTS} attachments max – remove one first`;
  }
  if (b.money < price) return 'Not enough money';
  return null;
}
