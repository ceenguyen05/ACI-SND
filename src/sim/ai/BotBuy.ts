import type { Agent } from '../entities/Agent';
import type { MatchQuery } from '../mode/types';
import type { BuyItem } from '../mode/Economy';
import type { WeaponId } from '../../config/weapons';
import type { UtilityId } from '../../config/utilities';
import type { GadgetId } from '../../config/gadgets';
import { fits, type AttachmentId } from '../../config/attachments';
import type { WeaponClass } from '../../config/weapons';

/** Simple CS-style bot economy: full buy, force buy, or eco. */
export function botBuy(m: MatchQuery, a: Agent): void {
  const T = a.team === 'T';
  const buy = (item: BuyItem) => m.tryBuy(a, item);
  const rifle: WeaponId = T ? 'ravager' : 'sentinel';
  const cheapRifle: WeaponId = T ? 'galeforce' : 'tempest';
  const smg: WeaponId = T ? 'vespa' : 'hornet';
  const fullBuyThreshold = T ? 3700 : 4200;
  const teamLosing = m.lossStreak[a.team] >= 2;

  if (m.isPistolRound()) {
    const r = m.rng.next();
    if (r < 0.45) buy({ kind: 'gear', id: 'kevlar' });
    else if (r < 0.7) { buy({ kind: 'weapon', id: 'p30' }); buy({ kind: 'utility', id: 'flash' }); }
    else { buy({ kind: 'utility', id: 'smoke' }); buy({ kind: 'utility', id: 'flash' }); }
    if (!T && a.money >= 400 && m.rng.chance(0.4)) buy({ kind: 'gear', id: 'kit' });
    if (a.money >= 250 && m.rng.chance(0.3)) buy({ kind: 'gadget', id: T ? 'stickyCam' : 'wire' });
    return;
  }

  if (!a.primary) {
    const heavy = m.rng.next();
    if (a.money >= 6200 && heavy < 0.16) buy({ kind: 'weapon', id: 'longbow' });
    else if (a.money >= 6600 && heavy < 0.24) buy({ kind: 'weapon', id: m.rng.chance(0.5) ? 'bulwark' : 'anvil' });
    else if (a.money >= 6400 && heavy < 0.3) buy({ kind: 'weapon', id: m.rng.chance(0.5) ? 'thumper' : 'hammer' });
    else if (a.money >= fullBuyThreshold) buy({ kind: 'weapon', id: m.rng.chance(0.15) ? 'talon' : m.rng.chance(0.08) ? 'marshal' : rifle });
    else if (a.money >= 2600 && (teamLosing || m.rng.chance(0.35))) {
      buy({ kind: 'weapon', id: m.rng.chance(0.5) ? cheapRifle : m.rng.chance(0.6) ? smg : 'mako' });
    } else if (a.money >= 1900 && m.rng.chance(0.3)) buy({ kind: 'weapon', id: m.rng.chance(0.5) ? 'kestrel' : m.rng.chance(0.5) ? 'breacher' : 'reaper' });
    else if (a.money >= 1500 && m.rng.chance(0.25)) buy({ kind: 'weapon', id: 'judge' });
  }
  const hasGun = !!a.primary;
  if (hasGun || a.money >= 1000) {
    if (a.money >= 1000) buy({ kind: 'gear', id: 'helmet' });
    else buy({ kind: 'gear', id: 'kevlar' });
  }
  if (hasGun) {
    const wishes: UtilityId[] = m.rng.shuffle(['smoke', 'flash', 'frag', 'fire', 'flash', 'pulse', 'decoy', 'stun']);
    for (const u of wishes) {
      if (a.money < 300 && u !== 'decoy') continue;
      if (a.totalGrenades() >= 3) break;
      buy({ kind: 'utility', id: u });
    }
    if (!T && a.money >= 400) buy({ kind: 'gear', id: 'kit' });
    if (a.money >= 2500 && m.rng.chance(0.35)) buy({ kind: 'gear', id: 'plate' });
    if (a.money >= 1200 && m.rng.chance(0.3)) buy({ kind: 'gadget', id: 'stim' });
    if (T && a.money >= 600 && m.rng.chance(0.25)) buy({ kind: 'gear', id: 'crowbar' });
  }
  // Gunsmith: well-off bots kit out their main gun (attachments stay for the half)
  const gun = a.primary;
  if (gun && a.money >= 2600) {
    const prefs: Partial<Record<WeaponClass, AttachmentId[]>> = {
      rifle: ['vgrip', 'reddot', 'brake', 'extmag', 'tacstock'], smg: ['laser1mw', 'vgrip', 'extmag', 'reddot'],
      lmg: ['bipod', 'fastmag', 'reddot', 'vgrip'], sniper: ['bipod', 'fastmag', 'tacstock'], shotgun: ['choke', 'laser1mw', 'vgrip'],
    };
    for (const id of prefs[gun.def.class] ?? []) {
      if (a.money < 2200) break;
      if (!fits(gun.def.id, id) || a.loadouts[gun.def.id]?.owned.includes(id)) continue;
      if (m.rng.chance(0.4)) buy({ kind: 'attachment', weapon: gun.def.id, id });
    }
  }
  // gadgets: each bot picks one or two that suit its side
  if (hasGun || a.money >= 1800) {
    const wish: GadgetId[] = m.rng.shuffle(T ? ['drone', 'emp', 'mine', 'stickyCam', 'drone'] : ['flockCam', 'wire', 'shield', 'stickyCam', 'wire', 'barricade', 'steelBarricade']);
    let n = 0;
    for (const g of wish) {
      if (n >= 2 || a.money < 900) break;
      if (m.rng.chance(0.55) && buy({ kind: 'gadget', id: g })) n++;
    }
  }
}
