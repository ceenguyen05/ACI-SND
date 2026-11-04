import type { Team } from '../src/config/rules';
import type { RoomOptions } from '../src/net/protocol';
import { matchmakingWindow, type Career } from '../src/progression/career';
import { mapChoicesCompatible } from '../src/sim/maps/index';

/** Players with fewer completed online matches than this are matched together at first. */
export const NEWCOMER_MATCHES = 5;
/** After this long in a waiting room, newcomers and veterans may share it (still within the skill window). */
export const NEWCOMER_SEPARATION_MS = 90_000;

/** Rooms share a queue when mode, size and playlist agree, plus S&D length and a compatible map
 * choice ("random" fits any map), or Zombies difficulty/length. */
export function sameQueue(a: RoomOptions, b: RoomOptions) {
  return a.mode === b.mode && a.playlist === b.playlist && a.teamSize === b.teamSize &&
    (a.mode === 'zombies' ? a.zDifficulty === b.zDifficulty && a.zLength === b.zLength : a.length === b.length && mapChoicesCompatible(a.map, b.map));
}

/** Whether `player` fits every member of a room that has been waiting `waitMs`. Co-op Zombies has no skill rule. */
export function skillFits(options: RoomOptions, members: Career[], player: Career, waitMs: number) {
  if (options.mode === 'zombies') return true;
  const window = matchmakingWindow(waitMs), newcomer = player.matches < NEWCOMER_MATCHES;
  return members.every(m => Math.abs(m.rank.mmr - player.rank.mmr) <= window &&
    (waitMs >= NEWCOMER_SEPARATION_MS || (m.matches < NEWCOMER_MATCHES) === newcomer));
}

/** Greedy skill balance for public teams: strongest first, to the weaker side, sizes kept equal. */
export function balanceTeams<P extends { team: Team }>(players: P[], mmr: (p: P) => number, teamSize: number) {
  const count = { T: 0, CT: 0 }, rating = { T: 0, CT: 0 };
  for (const p of [...players].sort((a, b) => mmr(b) - mmr(a))) {
    const team: Team = count.T >= teamSize ? 'CT' : count.CT >= teamSize ? 'T' :
      count.T < count.CT ? 'T' : count.CT < count.T ? 'CT' : rating.T <= rating.CT ? 'T' : 'CT';
    p.team = team; count[team]++; rating[team] += mmr(p);
  }
}
