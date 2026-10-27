import type { Gait, PerkId, ZombieKind } from '../../config/zombies';

export type ZombieMode = 'rise' | 'chase' | 'attack' | 'fuse' | 'spit' | 'scream' | 'roar' | 'charge' | 'dazed' | 'slam';

/** Per-zombie state (Agent.zombie). Zombies are pooled Agents on the T team. */
export interface ZombieState {
  kind: ZombieKind;
  gait: Gait;
  /** Base move speed in m/s (before stun / enrage). */
  speed: number;
  /** Pool slot in use: alive, or a corpse still on the floor. */
  active: boolean;
  mode: ZombieMode;
  modeAt: number;
  /** When the current timed action resolves (attack hit, fuse, spit, scream, charge end…). */
  modeUntil: number;
  targetId: number | null;
  /** A swipe commits to this target for its whole windup. */
  attackTargetId: number | null;
  nextAttack: number;
  /** Swipe arm for the animation (1 / -1). */
  arm: number;
  nextSpecial: number;
  enragedUntil: number;
  slowUntil: number;
  /** Armored zombies: helmet and plate health. */
  helmet: number; vest: number; helmetMax: number; vestMax: number;
  charge: { x: number; z: number; hit: number[] } | null;
  nextVoice: number;
  /** Stuck detection. */
  checkAt: number; checkX: number; checkZ: number; stuckFor: number;
  /** Killed by a headshot (the view pops the head). */
  headless: boolean;
  /** The slot can be reused once the corpse has sunk away. */
  freeAt: number;
  /** Following a lure beacon. */
  lured: boolean;
  /** Spawn generation: lets the view restart the rise animation when a slot is reused. */
  gen: number;
  /** Boss / special flag shown on the HUD. */
  boss: boolean;
}

export interface ZPlayerStats {
  kills: number; headshots: number; downs: number; revives: number; earned: number; spent: number;
  doors: number; boxPulls: number; perks: number;
}

/** Per-human state in Zombies (Agent.zp). Points live in Agent.money. */
export interface ZPlayerState {
  perks: PerkId[];
  downed: boolean;
  downedAt: number;
  bleedUntil: number;
  /** Self-revive (Second Wind solo / kit) stands you up at this time; 0 = none pending. */
  selfReviveAt: number;
  revive: { byId: number; progress: number } | null;
  /** Bled out — spectating until the next wave. */
  dead: boolean;
  selfRevives: number;
  reviveKit: boolean;
  lastHurt: number;
  /** Brief recovery window after a revive or a wave respawn. */
  protectedUntil: number;
  shockReadyAt: number;
  wasReloading: boolean;
  /** Last interaction press (purchases fire on the press edge). */
  usePrev: boolean;
  color: string;
  stats: ZPlayerStats;
}

export const emptyZStats = (): ZPlayerStats => ({ kills: 0, headshots: 0, downs: 0, revives: 0, earned: 0, spent: 0, doors: 0, boxPulls: 0, perks: 0 });
