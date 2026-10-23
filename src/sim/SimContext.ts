import type { Vector3 } from 'three';
import type { EventBus } from '../core/EventBus';
import type { Random } from '../core/Random';
import type { MatchRules } from '../config/rules';
import type { Agent, HitGroup, WeaponInstance } from './entities/Agent';
import type { SimEvents } from './events';
import type { World } from './world/World';
import type { DamageResult } from './combat/damage';
import type { UtilityManager } from './utility/UtilityManager';
import type { GadgetManager } from './gadget/GadgetManager';
import type { OrdnanceManager } from './combat/Ordnance';

export interface DamageFlags { wallbang?: boolean }

export type NoiseKind = 'footstep' | 'gunshot' | 'explosion' | 'reload' | 'land' | 'bomb' | 'decoy';

/** The slice of Match that subsystems (weapons, utilities, bots) depend on. */
export interface SimContext {
  readonly time: number;
  readonly world: World;
  readonly rng: Random;
  readonly events: EventBus<SimEvents>;
  readonly agents: Agent[];
  readonly rules: MatchRules;
  readonly utility: UtilityManager;
  readonly gadgets: GadgetManager;
  readonly ordnance: OrdnanceManager;
  applyDamage(victim: Agent, attacker: Agent | null, dmg: DamageResult, group: HitGroup, source: string, point: Vector3, dir: Vector3, flags?: DamageFlags): void;
  noise(pos: Vector3, radius: number, source: Agent | null, kind: NoiseKind): void;
  dropWeapon(agent: Agent, w: WeaponInstance, toss: boolean): void;
  isFrozen(): boolean;
}
