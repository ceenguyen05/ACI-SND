import type { Vector3 } from 'three';
import type { Team } from '../../config/rules';
import type { Agent } from '../entities/Agent';
import type { SimContext } from '../SimContext';
import type { SiteId } from '../world/MapTypes';
import type { BuyItem } from './Economy';

export type Phase = 'freeze' | 'live' | 'planted' | 'over' | 'matchOver';

export interface BombState {
  state: 'none' | 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  carrierId: number | null;
  pos: Vector3;
  vel: Vector3;
  site: SiteId | null;
  plantedAt: number;
  plantedBy: number | null;
  defuserId: number | null;
  nextBeep: number;
  /** Last time a defender saw the dropped/planted bomb. */
  spottedByCT: number;
}

export interface DroppedItem {
  id: number;
  weapon: import('../entities/Agent').WeaponInstance;
  pos: Vector3;
  vel: Vector3;
  droppedBy: number;
  droppedAt: number;
  yaw: number;
}

/** What bots are allowed to know about the match. */
export interface MatchQuery extends SimContext {
  readonly phase: Phase;
  readonly bomb: BombState;
  readonly round: number;
  readonly liveStart: number;
  readonly phaseEnd: number;
  readonly items: DroppedItem[];
  readonly lossStreak: Record<Team, number>;
  los(observer: Agent, target: Agent): boolean;
  isPistolRound(): boolean;
  tryBuy(agent: Agent, item: BuyItem): boolean;
  timeLeft(): number;
}
