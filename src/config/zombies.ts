import type { BotDifficulty } from './difficulty';
import type { WeaponId } from './weapons';

/**
 * Zombies mode tuning. Wave count / health / spawn-delay / speed formulas follow the classic
 * Call of Duty Black Ops 2 zombies scripts (_zm.gsc); prices and points follow CoD where a
 * canonical number exists. Bots count as 0.6 of a player when sizing waves.
 */

export type ZombieKind = 'walker' | 'runner' | 'crawler' | 'brute' | 'bloater' | 'bomber' | 'spitter' | 'armored' | 'shrieker' | 'tank';
export type Gait = 'walk' | 'run' | 'sprint';

export interface ZombieKindDef {
  id: ZombieKind;
  name: string;
  blurb: string;
  counter: string;
  /** Health = wave health × hp. */
  hp: number;
  /** Damage per swipe on Normal. */
  damage: number;
  reach: number;
  windup: number;
  cooldown: number;
  /** Always this gait; otherwise rolled from the wave (walk → run → sprint). */
  gait?: Gait;
  /** Speed range override (m/s). Crawlers: crawling speed. */
  speed?: [number, number];
  scaleW: number;
  scaleH: number;
  crawl?: boolean;
  /** Extra points on top of the normal kill reward. */
  bonus: number;
  /** First wave it can appear on Normal (0 = never in normal waves). */
  firstWave: number;
  weight: number;
  /** Most of this kind alive at once. */
  maxAlive: number;
  /** Eye glow colour (also the HUD tint for the kind). */
  eye: string;
}

export const ZOMBIES: Record<ZombieKind, ZombieKindDef> = {
  walker: { id: 'walker', name: 'Shambler', blurb: 'ACI staff who never clocked out. Slow at first — they speed up every wave.', counter: 'Aim for the head. Knife them on the first waves.',
    hp: 1, damage: 50, reach: 1.35, windup: 0.38, cooldown: 1.15, scaleW: 1, scaleH: 1, bonus: 0, firstWave: 1, weight: 100, maxAlive: 99, eye: '#ffb030' },
  runner: { id: 'runner', name: 'Sprinter', blurb: 'Lean and frantic. Always sprints, but goes down quicker.', counter: 'Don\'t let them flank you — shotguns and SMGs.',
    hp: 0.75, damage: 40, reach: 1.3, windup: 0.3, cooldown: 1.0, gait: 'sprint', speed: [5.1, 5.6], scaleW: 0.95, scaleH: 0.98, bonus: 10, firstWave: 3, weight: 22, maxAlive: 8, eye: '#ff3a2a' },
  crawler: { id: 'crawler', name: 'Crawler', blurb: 'Drags itself along the floor — small, low and easy to miss.', counter: 'Look down. Explosives and shotguns.',
    hp: 0.6, damage: 35, reach: 1.05, windup: 0.32, cooldown: 0.9, speed: [2.6, 3.3], scaleW: 1, scaleH: 1, crawl: true, bonus: 10, firstWave: 4, weight: 12, maxAlive: 6, eye: '#ffd040' },
  brute: { id: 'brute', name: 'Brute', blurb: 'A hulking line worker. Soaks bullets and hits twice as hard.', counter: 'Back up and keep shooting. Headshots.',
    hp: 2.6, damage: 75, reach: 1.6, windup: 0.55, cooldown: 1.5, gait: 'run', speed: [3.0, 3.4], scaleW: 1.22, scaleH: 1.12, bonus: 40, firstWave: 6, weight: 7, maxAlive: 3, eye: '#ff7a20' },
  bloater: { id: 'bloater', name: 'Bloater', blurb: 'Swollen with toxic gas. Bursts into a choking cloud when it dies.', counter: 'Kill it at range — never in a corridor you need.',
    hp: 1.9, damage: 40, reach: 1.4, windup: 0.45, cooldown: 1.4, gait: 'walk', speed: [1.5, 1.8], scaleW: 1.35, scaleH: 1.02, bonus: 30, firstWave: 5, weight: 7, maxAlive: 3, eye: '#7dff4a' },
  bomber: { id: 'bomber', name: 'Bomber', blurb: 'Strapped with gas canisters. Beeps, charges, explodes — and wrecks wire and barricades.', counter: 'Shoot it early, ideally inside a crowd of zombies.',
    hp: 0.85, damage: 85, reach: 2.4, windup: 0.9, cooldown: 1, gait: 'run', speed: [3.9, 4.4], scaleW: 1.02, scaleH: 1, bonus: 30, firstWave: 6, weight: 6, maxAlive: 3, eye: '#ff5a10' },
  spitter: { id: 'spitter', name: 'Spitter', blurb: 'Keeps its distance and lobs acid that burns the floor.', counter: 'Close the gap or break line of sight. Don\'t stand in the acid.',
    hp: 1.2, damage: 35, reach: 1.35, windup: 0.35, cooldown: 1.1, gait: 'run', speed: [3.0, 3.4], scaleW: 0.95, scaleH: 1.05, bonus: 40, firstWave: 8, weight: 6, maxAlive: 2, eye: '#9dff2a' },
  armored: { id: 'armored', name: 'Firefighter', blurb: 'Fire gear, riot helmet and plates. Immune to fire until the armour comes off.', counter: 'Shoot the helmet off, then headshot. Explosives strip plates fast.',
    hp: 1.3, damage: 60, reach: 1.4, windup: 0.4, cooldown: 1.2, scaleW: 1.08, scaleH: 1.02, bonus: 50, firstWave: 12, weight: 8, maxAlive: 4, eye: '#a8d8ff' },
  shrieker: { id: 'shrieker', name: 'Shrieker', blurb: 'Its scream enrages nearby zombies, rattles you, and calls more of them in.', counter: 'Priority target — kill it before it screams again.',
    hp: 1.3, damage: 40, reach: 1.35, windup: 0.35, cooldown: 1.1, gait: 'run', speed: [3.3, 3.7], scaleW: 0.95, scaleH: 1.06, bonus: 40, firstWave: 10, weight: 4, maxAlive: 1, eye: '#c46aff' },
  tank: { id: 'tank', name: 'Juggernaut', blurb: 'Boss. Charges in a straight line and slams the ground. Dazed after hitting a wall.', counter: 'Sidestep the charge — it takes double damage while dazed.',
    hp: 8, damage: 70, reach: 2.3, windup: 0.7, cooldown: 1.6, gait: 'walk', speed: [2.3, 2.5], scaleW: 1.65, scaleH: 1.25, bonus: 500, firstWave: 0, weight: 0, maxAlive: 2, eye: '#ff2020' },
};
export const ZOMBIE_ORDER: ZombieKind[] = ['walker', 'runner', 'crawler', 'brute', 'bloater', 'bomber', 'spitter', 'armored', 'shrieker', 'tank'];

/** Speed ranges (m/s) for rolled gaits. The player runs 6.35 m/s with a knife, ~5.4 with a rifle. */
export const GAIT_SPEED: Record<Gait, [number, number]> = { walk: [1.25, 1.65], run: [3.1, 3.7], sprint: [4.7, 5.3] };

export type ZDifficulty = 'casual' | 'normal' | 'hardened' | 'nightmare';
export interface ZDifficultyDef {
  label: string;
  blurb: string;
  hp: number;
  damage: number;
  /** BO2 speed rule: speed = rate × wave; 8 on Normal. */
  speedRate: number;
  count: number;
  /** Special zombies show up this many waves later (+) or earlier (−). */
  specialShift: number;
  bleedOut: number;
  startPoints: number;
  /** Zombie health stops growing after this wave. */
  hpCapWave: number;
  dropChance: number;
  allies: BotDifficulty;
}
export const ZDIFF: Record<ZDifficulty, ZDifficultyDef> = {
  casual: { label: 'Casual', blurb: 'Weaker, slower zombies, more starting points and a long bleed-out.', hp: 0.7, damage: 0.7, speedRate: 6, count: 0.8, specialShift: 2, bleedOut: 60, startPoints: 750, hpCapWave: 20, dropChance: 0.03, allies: 'hard' },
  normal: { label: 'Normal', blurb: 'Classic round-based zombies.', hp: 1, damage: 1, speedRate: 8, count: 1, specialShift: 0, bleedOut: 45, startPoints: 500, hpCapWave: 999, dropChance: 0.02, allies: 'hard' },
  hardened: { label: 'Hardened', blurb: 'Tougher, faster hordes. Specials arrive a wave early.', hp: 1.2, damage: 1.2, speedRate: 9, count: 1.15, specialShift: -1, bleedOut: 35, startPoints: 500, hpCapWave: 999, dropChance: 0.02, allies: 'normal' },
  nightmare: { label: 'Nightmare', blurb: 'Sprinters from wave 4, brutal damage, short bleed-out.', hp: 1.45, damage: 1.4, speedRate: 11, count: 1.3, specialShift: -2, bleedOut: 25, startPoints: 500, hpCapWave: 999, dropChance: 0.015, allies: 'normal' },
};

export type ZLength = 'short' | 'long' | 'endless';
export const ZLENGTHS: Record<ZLength, { label: string; blurb: string; exfilFrom: number | null }> = {
  short: { label: 'Short — exfil from wave 10', blurb: 'Call the exfil radio from wave 10 and escape to win.', exfilFrom: 10 },
  long: { label: 'Long — exfil from wave 20', blurb: 'Hold out until wave 20 before the exfil radio unlocks.', exfilFrom: 20 },
  endless: { label: 'Endless', blurb: 'No way out. How long can you last?', exfilFrom: null },
};

export const ZOMBIE_TUNING = {
  maxAlive: 24,
  firstWaveDelay: 7,
  intermission: 10,
  /** Players regain health this long after the last hit… */
  regenDelay: 3.5,
  /** …at this rate (HP / s). */
  regenRate: 45,
  reviveTime: 3,
  reviveTimeFast: 1.5,
  /** Solo self-revive (Second Wind or a kit) stands you back up after this long. */
  selfReviveTime: 5,
  reviveRange: 1.6,
  revivedHealth: 0.5,
  reviveProtection: 2.5,
  downPenalty: 0.05,
  bleedPenalty: 0.1,
  /** Damage multipliers for player weapons against zombies (CS damage scale → zombie health scale). */
  gunMult: 2,
  meleeMult: 3,
  explosiveMult: 1.6,
  fireMult: 2.5,
  /** Players stuck to zombies: radius of a zombie's body for push-out. */
  bodyRadius: 0.38,
  gasRadius: 4.2, gasDuration: 9, gasDps: 9,
  acidRadius: 2.2, acidDuration: 6, acidDps: 12, spitSpeed: 15,
  bomberRadius: 4.6, bomberZombieDamage: 600,
  screamRadius: 14, screamStunRadius: 11, screamBuff: 1.35, screamBuffTime: 7, screamExtra: 2,
  chargeSpeed: 9.5, chargeTime: 1.7, dazedTime: 1.6, slamRadius: 3.8,
  exfilReach: 75, exfilHold: 60, exfilRadius: 7.5,
} as const;

/** CoD points (BO2 _zm_score): 10 per hit, 50 / 60 / 100 / 130 per kill (limb / body / head / melee). */
export const POINTS = {
  hit: 10, limb: 50, body: 60, head: 100, melee: 130, explosive: 50, nuke: 400, revive: 50,
  /** Team pot paid to every standing player when a wave is cleared (Killing Floor style). */
  waveBonus: (wave: number) => Math.min(1000, 100 + 25 * wave),
};

// ---------------------------------------------------------------------------------- waves
export function zombieHealth(wave: number, d: ZDifficultyDef): number {
  const w = Math.max(1, Math.min(wave, d.hpCapWave));
  const base = w <= 9 ? 150 + 100 * (w - 1) : 950 * Math.pow(1.1, w - 9);
  return Math.round(base * d.hp);
}

/** Zombies in a normal wave (BO2 formula; bots count as 0.6 of a player). */
export function waveCount(wave: number, players: number, d: ZDifficultyDef): number {
  let mult = Math.max(1, wave / 5);
  if (wave >= 10) mult *= wave * 0.15;
  const extra = players <= 1 ? 0.5 * 6 * mult : 0.6 * (players - 1) * 6 * mult;
  let total = 24 + Math.floor(extra);
  if (wave <= 5) total = Math.floor(total * [0.25, 0.3, 0.5, 0.7, 0.9][wave - 1]);
  return Math.max(4, Math.round(total * d.count));
}

/** Seconds between spawns (BO2: 2 s × 0.95 per wave, floored). */
export const spawnDelay = (wave: number) => Math.max(0.12, 2 * Math.pow(0.95, wave - 1));

export type WaveKind = 'normal' | 'frenzy' | 'boss';
/** Frenzy (hellhound-style) waves: 6, 11, 16… Boss waves: 10, 15, 20… */
export function waveKind(wave: number): WaveKind {
  if (wave >= 10 && wave % 5 === 0) return 'boss';
  if (wave >= 6 && (wave - 6) % 5 === 0) return 'frenzy';
  return 'normal';
}
export function frenzyCount(wave: number, players: number, d: ZDifficultyDef) {
  return Math.round((6 + Math.min(4, (wave - 6) / 2.5)) * (1 + 0.6 * (players - 1)) * d.count);
}

/** BO2 gait roll: speed = rate × wave, roll in [speed, speed + 34]: ≤35 walk, ≤70 run, else sprint. */
export function rollGait(wave: number, d: ZDifficultyDef, r: number): Gait {
  if (wave <= 1) return 'walk';
  const v = d.speedRate * wave + r * 35;
  return v <= 35 ? 'walk' : v <= 70 ? 'run' : 'sprint';
}

// ---------------------------------------------------------------------------------- perks
export type PerkId = 'ironGut' | 'secondWind' | 'quickHands' | 'rapidFire' | 'marathon' | 'deadEye' | 'blastShield' | 'shockCharge';
export interface PerkDef { id: PerkId; name: string; price: number; soloPrice?: number; color: string; glyph: string; blurb: string; needsPower: boolean }
export const PERKS: Record<PerkId, PerkDef> = {
  ironGut: { id: 'ironGut', name: 'Iron Gut', price: 2500, color: '#e0402e', glyph: '✚', needsPower: true, blurb: 'Max health 100 → 250. Take five hits instead of two.' },
  secondWind: { id: 'secondWind', name: 'Second Wind', price: 1500, soloPrice: 500, color: '#3aa0ff', glyph: '♥', needsPower: false, blurb: 'Revive teammates twice as fast. Solo: get back up by yourself (3 times).' },
  quickHands: { id: 'quickHands', name: 'Quick Hands', price: 3000, color: '#48d27a', glyph: '↻', needsPower: true, blurb: 'Reload and swap weapons twice as fast.' },
  rapidFire: { id: 'rapidFire', name: 'Rapid Fire', price: 2000, color: '#f0c030', glyph: '»', needsPower: true, blurb: '+33% fire rate and +20% damage.' },
  marathon: { id: 'marathon', name: 'Marathon', price: 2000, color: '#ffa040', glyph: '➤', needsPower: true, blurb: 'Run 12% faster — outpace sprinters.' },
  deadEye: { id: 'deadEye', name: 'Dead Eye', price: 1500, color: '#a0a8b8', glyph: '◎', needsPower: true, blurb: '35% tighter spread and +25% headshot damage.' },
  blastShield: { id: 'blastShield', name: 'Blast Shield', price: 2000, color: '#a060ff', glyph: '✹', needsPower: true, blurb: 'Immune to your own explosives and falls; zombie blasts and gas hurt far less.' },
  shockCharge: { id: 'shockCharge', name: 'Shock Charge', price: 2000, color: '#40e8ff', glyph: 'ϟ', needsPower: true, blurb: 'Reloading releases an electric blast — the emptier the mag, the bigger it is.' },
};
export const PERK_ORDER: PerkId[] = ['ironGut', 'secondWind', 'quickHands', 'rapidFire', 'marathon', 'deadEye', 'blastShield', 'shockCharge'];
export const PERK_LIMIT = 4;
export const SOLO_SELF_REVIVES = 3;

// ---------------------------------------------------------------------------------- power-ups
export type PowerUpId = 'maxAmmo' | 'instaKill' | 'doublePoints' | 'nuke' | 'carpenter' | 'fireSale' | 'bonusPoints';
export interface PowerUpDef { id: PowerUpId; name: string; color: string; glyph: string; weight: number; duration: number; blurb: string }
export const POWERUPS: Record<PowerUpId, PowerUpDef> = {
  maxAmmo: { id: 'maxAmmo', name: 'Max Ammo', color: '#7dff6a', glyph: '▮▮', weight: 20, duration: 0, blurb: 'Every gun and lethal refilled for the whole team.' },
  instaKill: { id: 'instaKill', name: 'Insta-Kill', color: '#ff4a3a', glyph: '☠', weight: 18, duration: 30, blurb: 'Any hit kills for 30 seconds (bosses take heavy damage).' },
  doublePoints: { id: 'doublePoints', name: 'Double Points', color: '#ffd030', glyph: 'x2', weight: 22, duration: 30, blurb: 'All points doubled for 30 seconds.' },
  nuke: { id: 'nuke', name: 'Nuke', color: '#ff9030', glyph: '☢', weight: 9, duration: 0, blurb: 'Kills every zombie on the map. +400 points each.' },
  carpenter: { id: 'carpenter', name: 'Carpenter', color: '#c89058', glyph: '⚒', weight: 10, duration: 0, blurb: 'Repairs barricades and wire, +50 armor and +200 points each.' },
  fireSale: { id: 'fireSale', name: 'Fire Sale', color: '#ff6a2a', glyph: '$', weight: 8, duration: 30, blurb: 'The Mystery Box costs 10 for 30 seconds.' },
  bonusPoints: { id: 'bonusPoints', name: 'Bonus Points', color: '#50e0ff', glyph: '+', weight: 12, duration: 0, blurb: '+500 points for everyone.' },
};
export const POWERUP_ORDER: PowerUpId[] = ['maxAmmo', 'instaKill', 'doublePoints', 'nuke', 'carpenter', 'fireSale', 'bonusPoints'];
/** BO2 drop rule: 2% per kill, plus a forced drop each time the team passes a score threshold (×1.14 each time). Max 4 per wave. */
export const POWERUP_TUNING = { firstThreshold: 2000, thresholdMul: 1.14, maxPerWave: 4, life: 26, blinkAfter: 15, radius: 1.35 };

// ---------------------------------------------------------------------------------- machines & shop
export const BOX_PRICE = 950;
export const FIRE_SALE_PRICE = 10;
export const FORGE_PRICE = 5000;
export const FORGED_AMMO_PRICE = 2500;
export const BOX_TUNING = { spin: 4.2, ready: 12, moveTime: 4 };
/** Box pool weights (wonder weapon is rare). Everything except the starting P-30. */
export const BOX_POOL: [WeaponId, number][] = [
  ['judge', 6], ['viper', 6], ['vespa', 7], ['hornet', 7], ['mako', 7], ['breacher', 6], ['reaper', 7],
  ['galeforce', 7], ['tempest', 7], ['ravager', 7], ['sentinel', 7], ['talon', 6], ['kestrel', 5], ['marshal', 6], ['longbow', 4],
  ['bulwark', 6], ['anvil', 6], ['thumper', 4], ['hammer', 3], ['disruptor', 3],
];
/** BO2 teddy-bear rule. Returns the chance the box moves on this pull (pull = 1-based, since the last move). */
export function teddyChance(pull: number, movedBefore: boolean): number {
  if (pull <= 3) return 0;
  if (!movedBefore) return pull >= 8 ? 1 : 0.15;
  return pull >= 13 ? 0.5 : pull >= 8 ? 0.3 : 0.15;
}

export const START_WEAPON: WeaponId = 'p30';
export const ammoPrice = (weaponPrice: number) => Math.ceil(weaponPrice / 2 / 10) * 10;

export type ArmoryId = 'frag' | 'stun' | 'molotov' | 'lure' | 'kevlar' | 'plate' | 'selfRevive' | 'stim' | 'mine' | 'wire' | 'barricade' | 'ammoBox';
export interface ArmoryDef { id: ArmoryId; name: string; price: number; cat: 'Lethal' | 'Defense' | 'Support'; blurb: string }
export const ARMORY: Record<ArmoryId, ArmoryDef> = {
  frag: { id: 'frag', name: 'Frag Grenades ×2', price: 250, cat: 'Lethal', blurb: 'Top up to 4 frags. You also get 2 free every wave.' },
  stun: { id: 'stun', name: 'Stun Grenade', price: 300, cat: 'Lethal', blurb: 'Slows every zombie in the blast for a few seconds.' },
  molotov: { id: 'molotov', name: 'Molotov', price: 500, cat: 'Lethal', blurb: 'A pool of fire zombies have to walk through.' },
  lure: { id: 'lure', name: 'Lure Beacon', price: 750, cat: 'Lethal', blurb: 'Plays a tune that pulls nearby zombies in, then explodes.' },
  mine: { id: 'mine', name: 'Trip Mines ×2', price: 1000, cat: 'Defense', blurb: 'Laser mines that blow up the first zombie through.' },
  wire: { id: 'wire', name: 'Barbed Wire', price: 500, cat: 'Defense', blurb: 'Zombies wading through it slow to a crawl. Bombers wreck it.' },
  barricade: { id: 'barricade', name: 'Wooden Barricade', price: 400, cat: 'Defense', blurb: 'Board up a doorway. Zombies have to tear it down.' },
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 1000, cat: 'Support', blurb: '100 armor. Armor soaks half of every hit.' },
  plate: { id: 'plate', name: 'Armor Plate', price: 500, cat: 'Support', blurb: '+50 armor, stacks up to 150.' },
  stim: { id: 'stim', name: 'Stim Pistol', price: 1000, cat: 'Support', blurb: 'Heal yourself (H) or shoot darts at teammates.' },
  ammoBox: { id: 'ammoBox', name: 'Ammo Crate', price: 1500, cat: 'Support', blurb: 'Place it for the team: everyone refills their ammo once.' },
  selfRevive: { id: 'selfRevive', name: 'Self-Revive Kit', price: 2500, cat: 'Support', blurb: 'Get back up on your own the next time you go down (max 1).' },
};
export const ARMORY_ORDER: ArmoryId[] = ['frag', 'stun', 'molotov', 'lure', 'mine', 'wire', 'barricade', 'kevlar', 'plate', 'stim', 'ammoBox', 'selfRevive'];
