import { WEAPONS, type WeaponClass, type WeaponId } from '../../config/weapons';

/**
 * Kill-feed silhouettes (CS-style) drawn as inline SVG in a 64×20 box, filled with currentColor.
 * One icon per weapon class plus utility / killstreak sources.
 */
type IconKind = WeaponClass | 'grenade' | 'fire' | 'explosion' | 'missile' | 'drone' | 'bomb' | 'tknife' | 'skull' | 'stim';

const PATHS: Record<IconKind, string> = {
  pistol: 'M14 4h26v6H24l-1 2h-3l-2 7h-7l3-9h-2zM24 10h4l-1 3h-3z',
  smg: 'M6 5h36v6H31l-1 3h-3l1-3h-4v8h-5v-8h-3l-2 5h-5l2-5H6zM42 7h12v2H42zM0 6h6v3H0z',
  shotgun: 'M2 6h12l4-1h44v3H22v2h14v3H22l-3 1h-5l-2 4H6l3-5H2z',
  rifle: 'M0 6l9-1h34v-1h4v2h17v2H46v3H37l-2 0 2 7h-5l-3-7h-4l-2 5h-5l2-5H9L0 10z',
  lmg: 'M0 6l9-1h36v-1h4v2h15v2H49v3H44v6H30v-6h-4l-2 5h-5l2-5H9L0 10zM50 9l4 9h-2l-4-8z',
  sniper: 'M0 6l9-2h30v-1h-2V1h16v2h-2v1h4v2h9v2H54v3H38l-2 7h-5l1-7h-6l-2 4h-5l2-4H9L0 10z',
  launcher: 'M2 6h44v6H2zM46 5l14 4-14 4zM14 12h4l-1 6h-4zM30 12h4l-1 5h-4zM0 7h2v4H0z',
  knife: 'M2 8h18l2-2h3v6h-3l-2-2H2zM25 7h22l12 3-12 3H25z',
  tknife: 'M20 8h10v4H20zM30 7h18l10 3-10 3H30zM2 6h12v1H2zM4 10h12v1H4zM2 14h12v1H2z',
  grenade: 'M28 6a8 8 0 1 0 0.01 0zM30 2h8v3h-8zM38 3l6 4-1 1-5-3z',
  fire: 'M32 1c4 5 8 8 8 13a8 8 0 0 1-16 0c0-4 3-6 3-10 2 2 3 4 3 6 2-3 2-6 2-9z',
  explosion: 'M32 0l3 6 7-3-2 7 8 2-7 4 4 6-8-2-3 7-3-7-8 2 4-6-7-4 8-2-2-7 7 3z',
  missile: 'M4 8h40l8-1 10 3-10 3-8-1H4zM4 5l8 3H4zM4 15l8-3H4z',
  drone: 'M22 8h20v5H22zM8 6h16v2H8zM40 6h16v2H40zM14 5h4v4h-4zM46 5h4v4h-4zM29 13h6v4h-6z',
  bomb: 'M18 5h28v12H18zM22 2h4v3h-4zM24 8h16v5H24z',
  skull: 'M32 1a10 9 0 0 0-10 9c0 3 2 5 3 6v3h14v-3c1-1 3-3 3-6A10 9 0 0 0 32 1zM27 9a2.5 2.5 0 1 0 .01 0zM37 9a2.5 2.5 0 1 0 .01 0z',
  stim: 'M10 8h30v4H10zM40 9h14v2H40zM4 7h6v6H4zM18 8h4v4h-4z',
};

function kindFor(source: string): IconKind {
  if (source === 'tknife') return 'tknife';
  if (source === 'stim') return 'stim';
  if (source in WEAPONS) return WEAPONS[source as WeaponId].class;
  switch (source) {
    case 'frag': case 'flash': case 'stun': case 'smoke': case 'decoy': return 'grenade';
    case 'fire': return 'fire';
    case 'missile': return 'missile';
    case 'hunter': return 'drone';
    case 'bomb': return 'bomb';
    case 'c4': case 'mine': case 'explosion': return 'explosion';
    default: return 'skull';
  }
}

/** Inline SVG markup for a damage source's kill-feed icon. */
export function weaponIcon(source: string): string {
  return `<svg class="wicon" viewBox="0 0 64 20" width="54" height="17" aria-hidden="true"><path fill="currentColor" d="${PATHS[kindFor(source)]}"/></svg>`;
}
