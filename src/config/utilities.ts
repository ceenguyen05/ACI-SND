import type { Team } from './rules';

export type UtilityId = 'frag' | 'flash' | 'smoke' | 'fire' | 'decoy' | 'pulse' | 'stun' | 'tknife';
export type GearId = 'kevlar' | 'helmet' | 'kit' | 'plate' | 'crowbar';

export interface UtilityDef {
  id: UtilityId;
  name: string;
  nameByTeam?: Partial<Record<Team, string>>;
  price: number;
  priceByTeam?: Partial<Record<Team, number>>;
  max: number;
  /** Seconds after throw before detonation; null = detonates when it comes to rest / hits ground. */
  fuse: number | null;
  color: string;
  blurb: string;
}

export const UTILITIES: Record<UtilityId, UtilityDef> = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, max: 1, fuse: 1.6, color: '#7a8c4a',
    blurb: 'Explodes after 1.6s. Up to 98 damage, halved by armor.' },
  flash: { id: 'flash', name: 'Flashbang', price: 200, max: 2, fuse: 1.6, color: '#d8d8d8',
    blurb: 'Blinds anyone looking at it. Turn away to reduce the effect.' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, max: 1, fuse: null, color: '#6a9a7a',
    blurb: 'Deploys an 18s smoke screen. Extinguishes fire.' },
  fire: { id: 'fire', name: 'Firebomb', nameByTeam: { T: 'Molotov', CT: 'Incendiary' }, price: 400, priceByTeam: { CT: 600 },
    max: 1, fuse: 2.0, color: '#d06020', blurb: 'Creates a 7s fire zone that denies an area.' },
  decoy: { id: 'decoy', name: 'Decoy', price: 50, max: 1, fuse: null, color: '#8a8a60',
    blurb: 'Imitates your gunfire and shows up on enemy radar.' },
  pulse: { id: 'pulse', name: 'Recon Pulse', price: 250, max: 1, fuse: null, color: '#30c0e0',
    blurb: 'Gadget. Once it lands it pings every enemy within 12m through walls, 3 times.' },
  stun: { id: 'stun', name: 'Stun Grenade', price: 250, max: 1, fuse: 1.4, color: '#5a6a80',
    blurb: 'Concussion blast (7m): anyone caught moves and aims sluggishly for up to 3.8s. Works through glass, not walls.' },
  tknife: { id: 'tknife', name: 'Throwing Knife', price: 200, max: 1, fuse: null, color: '#9aa0a6',
    blurb: 'One-hit kill to the head or body (legs: 70). Flies fast and drops with distance. Walk over it to pick it back up.' },
};

export const UTILITY_ORDER: UtilityId[] = ['frag', 'flash', 'smoke', 'fire', 'stun', 'decoy', 'pulse', 'tknife'];
/** A fresh, empty grenade pouch. */
export const emptyGrenades = (): Record<UtilityId, number> =>
  Object.fromEntries(UTILITY_ORDER.map((k) => [k, 0])) as Record<UtilityId, number>;
export const MAX_GRENADES = 4;

export function utilityPrice(id: UtilityId, team: Team): number {
  const u = UTILITIES[id];
  return u.priceByTeam?.[team] ?? u.price;
}
export function utilityName(id: UtilityId, team: Team): string {
  const u = UTILITIES[id];
  return u.nameByTeam?.[team] ?? u.name;
}

export const GEAR: Record<GearId, { id: GearId; name: string; price: number; team: Team | 'both'; blurb: string }> = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650, team: 'both', blurb: '100 armor. Reduces body damage.' },
  helmet: { id: 'helmet', name: 'Kevlar + Helmet', price: 1000, team: 'both', blurb: 'Full armor. Helmet protects against headshots. $350 if you have a vest.' },
  kit: { id: 'kit', name: 'Defuse Kit', price: 400, team: 'CT', blurb: 'Halves defuse time to 5 seconds.' },
  plate: { id: 'plate', name: 'Armor Plate', price: 300, team: 'both', blurb: 'Bolt-in ceramic plate: +25 armor, stacks up to 150.' },
  crowbar: { id: 'crowbar', name: 'Crowbar', price: 150, team: 'both', blurb: 'Hold Use at a barricade to pry it off (wood 1s, steel 4s). Your quick-melee hits barricades 3× harder.' },
};

/** Tunables for utility simulation. */
export const UTILITY_TUNING = {
  throwSpeed: 17,
  underhandSpeed: 8,
  gravity: 9.8 * 1.05,
  restitution: 0.42,
  friction: 0.75,
  radius: 0.07,
  fragRadius: 8.5,
  fragDamage: 98,
  flashMaxDuration: 4.6,
  flashRange: 40,
  smokeRadius: 4.6,
  smokeDuration: 18,
  smokeBloom: 1.2,
  fireRadius: 3.2,
  fireDuration: 7,
  fireDps: 32,
  decoyDuration: 15,
  pulseRadius: 12,
  pulseCount: 3,
  pulseInterval: 1.6,
  pulseRevealTime: 2.0,
  stunRadius: 7,
  stunMaxDuration: 3.8,
  knifeSpeed: 27,
  knifeUnderhand: 15,
  knifeGravity: 7.5,
  heartbeatRange: 24,
  heartbeatInterval: 1.25,
};
