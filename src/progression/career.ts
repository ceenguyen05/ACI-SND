export const XP = { kill: 100, headshot: 25, assist: 50, plant: 250, defuse: 300, roundWin: 75,
  match: 400, win: 600, zombieKill: 20, wave: 100, revive: 150, exfil: 800, daily: 250, dailyAll: 500 } as const;
export type XpAction = keyof Pick<typeof XP, 'kill' | 'headshot' | 'assist' | 'plant' | 'defuse' | 'roundWin' | 'zombieKill' | 'wave' | 'revive' | 'exfil'>;
export const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Champion'] as const;
export const RANKED_LEVEL = 5;
export const PLACEMENTS = 5;
/** Match ids kept for duplicate-result protection (bounded so saved careers stay small). */
const RECENT_MATCHES = 32;
const DAY = 86_400_000;
export interface SkillRank { mmr: number; uncertainty: number; points: number; games: number; placements: number; shields: number; peak: number; abandons: number }
export interface Career {
  version: 1; xp: number; matches: number; wins: number; kills: number; objectives: number;
  streak: number; bestStreak: number; lastDay: number | null;
  daily: { day: number; kills: number; objectives: number; matches: number; claimed: string[] };
  rank: SkillRank; recentMatches: string[];
}
export interface Award { label: string; xp: number }
export function newCareer(): Career {
  return { version: 1, xp: 0, matches: 0, wins: 0, kills: 0, objectives: 0, streak: 0, bestStreak: 0, lastDay: null,
    daily: { day: -1, kills: 0, objectives: 0, matches: 0, claimed: [] },
    rank: { mmr: 1200, uncertainty: 350, points: 0, games: 0, placements: 0, shields: 0, peak: 0, abandons: 0 }, recentMatches: [] };
}
const integer = (v: unknown, max = 1e9) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
export function restoreCareer(value: unknown): Career {
  const out = newCareer();
  if (!value || typeof value !== 'object') return out;
  const v = value as Partial<Career>;
  for (const k of ['xp', 'matches', 'wins', 'kills', 'objectives', 'streak', 'bestStreak'] as const) out[k] = integer(v[k]);
  out.lastDay = typeof v.lastDay === 'number' ? integer(v.lastDay) : null;
  if (v.daily) out.daily = { day: Number.isInteger(v.daily.day) ? v.daily.day : -1, kills: integer(v.daily.kills), objectives: integer(v.daily.objectives), matches: integer(v.daily.matches),
    claimed: Array.isArray(v.daily.claimed) ? v.daily.claimed.filter(x => typeof x === 'string').slice(0, 4) : [] };
  if (v.rank) out.rank = { ...out.rank, mmr: Math.max(100, Math.min(3000, integer(v.rank.mmr))), uncertainty: Math.max(60, Math.min(350, integer(v.rank.uncertainty))),
    points: integer(v.rank.points, 2400), games: integer(v.rank.games), placements: integer(v.rank.placements, PLACEMENTS), shields: integer(v.rank.shields, 1), peak: integer(v.rank.peak, 2400), abandons: integer(v.rank.abandons) };
  out.recentMatches = Array.isArray(v.recentMatches) ? v.recentMatches.filter(x => typeof x === 'string').slice(-RECENT_MATCHES) : [];
  return out;
}
/** A smooth lifetime XP curve. No equipment/stat advantages are locked behind levels. */
export function levelAt(xp: number) {
  const total = integer(xp), level = Math.min(1000, 1 + Math.floor((Math.sqrt(1 + total / 250) - 1) / 2));
  const floor = 1000 * (level - 1) * level;
  const next = 1000 * level * (level + 1);
  return { level, current: total - floor, needed: next - floor, progress: Math.max(0, Math.min(1, (total - floor) / (next - floor))) };
}
export function rankLabel(r: SkillRank) {
  if (r.placements < PLACEMENTS) return `Unranked · ${r.placements}/${PLACEMENTS} placements`;
  const tier = Math.min(7, Math.floor(r.points / 300)), division = Math.floor((r.points % 300) / 100);
  return tier === 7 ? 'Champion' : `${TIERS[tier]} ${['I', 'II', 'III'][division]}`;
}
function today(c: Career, now: number) {
  const day = Math.floor(now / DAY);
  // A backwards clock cannot reopen yesterday's challenges or streak bonus.
  if (day > c.daily.day) c.daily = { day, kills: 0, objectives: 0, matches: 0, claimed: [] };
  return day;
}
function add(c: Career, awards: Award[], label: string, amount: number) { const xp = integer(amount); if (xp) { c.xp += xp; awards.push({ label, xp }); } }
function dailyAwards(c: Career, awards: Award[]) {
  for (const [key, target] of [['kills', 10], ['objectives', 2], ['matches', 2]] as const) {
    if (c.daily[key] >= target && !c.daily.claimed.includes(key)) { c.daily.claimed.push(key); add(c, awards, `Daily: ${key}`, XP.daily); }
  }
  if (c.daily.claimed.length === 3 && !c.daily.claimed.includes('all')) { c.daily.claimed.push('all'); add(c, awards, 'All daily challenges', XP.dailyAll); }
}
export function awardAction(c: Career, action: XpAction, now: number, multiplier = 1): Award[] {
  const awards: Award[] = []; today(c, now);
  add(c, awards, action, XP[action] * multiplier);
  if (action === 'kill' || action === 'zombieKill') { c.kills++; c.daily.kills++; }
  if (['plant', 'defuse', 'revive', 'wave'].includes(action)) { c.objectives++; c.daily.objectives++; }
  dailyAwards(c, awards); return awards;
}
export interface Completion { id: string; won: boolean; qualified: boolean; multiplier?: number }
export function completeMatch(c: Career, result: Completion, now: number): Award[] {
  if (c.recentMatches.includes(result.id)) return [];
  c.recentMatches.push(result.id); c.recentMatches = c.recentMatches.slice(-RECENT_MATCHES);
  if (!result.qualified) return [];
  const awards: Award[] = [], day = today(c, now), mul = result.multiplier ?? 1;
  c.matches++; c.daily.matches++; if (result.won) c.wins++;
  add(c, awards, 'Match completed', XP.match * mul);
  if (result.won) add(c, awards, 'Victory', XP.win * mul);
  if (c.lastDay === null || day > c.lastDay) {
    c.streak = c.lastDay === day - 1 ? c.streak + 1 : 1;
    c.lastDay = day; c.bestStreak = Math.max(c.bestStreak, c.streak);
    add(c, awards, `Daily play streak: ${c.streak}`, 200 + 50 * Math.min(c.streak - 1, 6));
  }
  dailyAwards(c, awards); return awards;
}
export const expectedWin = (own: number, other: number) => 1 / (1 + 10 ** ((other - own) / 400));
export function updateRank(rank: SkillRank, result: { score: 0 | .5 | 1; ownMmr: number; opponentMmr: number; margin: number; abandon?: boolean }) {
  const before = rank.points, expected = expectedWin(result.ownMmr, result.opponentMmr);
  const score = result.abandon ? 0 : result.score;
  const k = rank.games < PLACEMENTS ? 72 : 24 + 24 * (rank.uncertainty / 350);
  rank.mmr = Math.round(Math.max(100, Math.min(3000, rank.mmr + k * (score - expected))));
  rank.uncertainty = Math.max(60, Math.round(rank.uncertainty * .94)); rank.games++;
  if (result.abandon) rank.abandons++;
  if (rank.placements < PLACEMENTS) {
    rank.placements++;
    if (rank.placements === PLACEMENTS) rank.points = Math.max(0, Math.min(1200, Math.round((rank.mmr - 600) / .8 / 100) * 100 + 50));
    rank.peak = Math.max(rank.peak, rank.points); return rank.points - before;
  }
  if (score === .5) return 0;
  const convergence = Math.max(-12, Math.min(12, (rank.mmr - (600 + rank.points * .8)) / 60));
  const margin = Math.min(3, Math.abs(result.margin) * 3);
  const change = score === 1 ? Math.round(Math.max(10, Math.min(40, 22 + convergence + (1 - expected) * 4 + margin)))
    : -Math.round(Math.max(10, Math.min(40, 22 - convergence + expected * 4 + margin + (result.abandon ? 8 : 0))));
  const floor = Math.floor(before / 100) * 100;
  if (change < 0 && before + change < floor) {
    if (before > floor) rank.points = floor;
    else if (floor % 300 === 0 && rank.shields > 0 && !result.abandon) { rank.points = floor; rank.shields--; }
    else rank.points = Math.max(0, floor - 30);
  } else rank.points = Math.min(2400, Math.max(0, before + change));
  if (rank.points > before && Math.floor(rank.points / 100) > Math.floor(before / 100)) rank.points = Math.min(2400, Math.max(rank.points, Math.floor(rank.points / 100) * 100 + 10));
  if (Math.min(7, Math.floor(rank.points / 300)) > Math.min(7, Math.floor(rank.peak / 300))) rank.shields = 1;
  rank.peak = Math.max(rank.peak, rank.points); return rank.points - before;
}
/** Expand slowly, but never bridge very large skill gaps just to fill a room. */
export const matchmakingWindow = (waitMs: number) => Math.min(450, 150 + Math.floor(Math.max(0, waitMs) / 30_000) * 50);
