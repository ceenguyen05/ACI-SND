import type { AgentCommand } from '../sim/entities/Agent';
import { emptyCommand } from '../sim/entities/Agent';
import { UTILITY_ORDER } from '../config/utilities';
import { GADGET_ORDER } from '../config/gadgets';
import { WEAPONS } from '../config/weapons';
import { ATTACHMENTS } from '../config/attachments';
import { GEAR } from '../config/utilities';
import type { BuyItem } from '../sim/mode/Economy';
import type { MatchLength, Team } from '../config/rules';
import type { MatchConfig } from '../sim/mode/Match';
import type { MatchSnapshot, WireEvent } from './snapshot';
import type { ZombiesConfig } from '../sim/zombies/ZombiesMatch';
import type { ZDifficulty, ZLength, ArmoryId } from '../config/zombies';
import type { Award, Career } from '../progression/career';

export const PROTOCOL_VERSION = 2;
export const QUEUE_WAIT_MS = 180_000;
export interface RoomOptions { teamSize: number; length: MatchLength; mode?: 'snd' | 'zombies'; playlist?: 'casual' | 'ranked'; zDifficulty?: ZDifficulty; zLength?: ZLength }
export const roomCapacity = (o: RoomOptions) => o.teamSize * (o.mode === 'zombies' ? 1 : 2);
export interface LobbyPlayer { id: string; name: string; team: Team; level?: number; rank?: string }
export interface LobbyState {
  code: string;
  visibility: 'public' | 'private';
  ownerId: string;
  options: RoomOptions;
  players: LobbyPlayer[];
  startsAt: number;
  serverNow: number;
  ranked?: boolean;
  ratingWindow?: number;
}
export interface MatchStart {
  config: Omit<MatchConfig, 'map'>;
  playerId: number;
  snapshot: MatchSnapshot;
  mode?: 'snd' | 'zombies';
  zombiesConfig?: Omit<ZombiesConfig, 'layout'>;
  ranked?: boolean;
  matchId?: string;
}
export type ClientMessage =
  | { type: 'queue'; name: string; options: RoomOptions }
  | { type: 'create'; name: string; options: RoomOptions; visibility: 'public' | 'private' }
  | { type: 'join'; name: string; code: string }
  | { type: 'leave' | 'start' }
  | { type: 'input'; seq: number; command: AgentCommand }
  | { type: 'buy'; item: BuyItem }
  | { type: 'autoBuy' | 'rebuy' }
  | { type: 'armory'; item: ArmoryId }
  | { type: 'ping'; sentAt: number };
export type ServerMessage =
  | { type: 'welcome'; id: string; version: number; accountId?: string; token?: string; career?: Career }
  | { type: 'career'; career: Career; awards: Award[]; rankDelta?: number; ranked?: boolean }
  | { type: 'lobby'; lobby: LobbyState }
  | { type: 'left' }
  | { type: 'started'; match: MatchStart }
  | { type: 'snapshot'; snapshot: MatchSnapshot; ack: number; events: WireEvent[] }
  | { type: 'error'; message: string }
  | { type: 'pong'; sentAt: number };

export function roomOptions(value: unknown): RoomOptions | null {
  const o = value as Partial<RoomOptions> | null;
  if (!o || !Number.isInteger(o.teamSize) || o.teamSize! < 1 || o.teamSize! > 5 || !['quick', 'short', 'standard'].includes(o.length ?? '')) return null;
  if (o.mode !== undefined && !['snd', 'zombies'].includes(o.mode)) return null;
  if (o.playlist !== undefined && !['casual', 'ranked'].includes(o.playlist)) return null;
  if (o.zDifficulty !== undefined && !['casual', 'normal', 'hardened', 'nightmare'].includes(o.zDifficulty)) return null;
  if (o.zLength !== undefined && !['short', 'long', 'endless'].includes(o.zLength)) return null;
  if (o.mode === 'zombies' && o.playlist === 'ranked') return null;
  return { teamSize: o.teamSize!, length: o.length!, mode: o.mode ?? 'snd', playlist: o.playlist ?? 'casual', zDifficulty: o.zDifficulty ?? 'normal', zLength: o.zLength ?? 'short' };
}
export const playerName = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16) || 'Player' : 'Player';

/** Copy only known fields. Clients never send position, health, damage or elapsed time. */
export function sanitizeCommand(value: unknown): AgentCommand | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>, c = emptyCommand();
  for (const k of ['forward', 'right', 'lean', 'yaw', 'pitch', 'camCycle'] as const) {
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k])) return null;
    c[k] = k === 'yaw' ? Math.atan2(Math.sin(v[k]), Math.cos(v[k])) :
      k === 'camCycle' ? Math.sign(v[k]) : // a feed-list step: -1, 0 or 1, never a fractional index
      Math.max(k === 'pitch' ? -1.55334 : -1, Math.min(k === 'pitch' ? 1.55334 : 1, v[k]));
  }
  for (const k of Object.keys(c) as (keyof AgentCommand)[]) {
    if (typeof c[k] === 'boolean') (c as unknown as Record<string, unknown>)[k] = v[k] === true;
  }
  c.select = ['primary', 'secondary', 'melee', 'grenade', 'bomb', 'gadget'].includes(String(v.select)) ? v.select as AgentCommand['select'] : null;
  c.selectGrenade = UTILITY_ORDER.includes(v.selectGrenade as never) ? v.selectGrenade as AgentCommand['selectGrenade'] : null;
  c.selectGadget = GADGET_ORDER.includes(v.selectGadget as never) ? v.selectGadget as AgentCommand['selectGadget'] : null;
  return c;
}

/** Keep held actions alive between packets without repeating one-shot actions. */
export function heldCommand(c: AgentCommand): AgentCommand {
  return { ...emptyCommand(), forward: c.forward, right: c.right, yaw: c.yaw, pitch: c.pitch,
    crouch: c.crouch, prone: c.prone, walk: c.walk, lean: c.lean, fire: c.fire, alt: c.alt, use: c.use, jump: c.jump };
}

export function validBuyItem(v: unknown): v is BuyItem {
  if (!v || typeof v !== 'object') return false;
  const i = v as Record<string, unknown>;
  if (typeof i.id !== 'string') return false;
  const owns = (o: object, key: string) => Object.hasOwn(o, key);
  switch (i.kind) {
    case 'weapon': return owns(WEAPONS, i.id) && i.id !== 'knife' && !WEAPONS[i.id as keyof typeof WEAPONS].zombiesOnly;
    case 'utility': return UTILITY_ORDER.includes(i.id as never);
    case 'gadget': return GADGET_ORDER.includes(i.id as never);
    case 'gear': return owns(GEAR, i.id);
    case 'attachment': return owns(ATTACHMENTS, i.id) && typeof i.weapon === 'string' && owns(WEAPONS, i.weapon);
    default: return false;
  }
}
