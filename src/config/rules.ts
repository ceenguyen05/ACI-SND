export type Team = 'T' | 'CT';
export const otherTeam = (t: Team): Team => (t === 'T' ? 'CT' : 'T');
export const TEAM_NAMES: Record<Team, string> = { T: 'Attackers', CT: 'Defenders' };
export const TEAM_SHORT: Record<Team, string> = { T: 'ATK', CT: 'DEF' };

export type MatchLength = 'quick' | 'short' | 'standard';
export const MATCH_LENGTHS: Record<MatchLength, { label: string; roundsToWin: number; halfLength: number }> = {
  quick: { label: 'Quick (first to 5)', roundsToWin: 5, halfLength: 4 },
  short: { label: 'Short (first to 9, MR8)', roundsToWin: 9, halfLength: 8 },
  standard: { label: 'Competitive (first to 13, MR12)', roundsToWin: 13, halfLength: 12 },
};

export interface MatchRules {
  roundsToWin: number;
  halfLength: number;
  teamSize: number;
  freezeTime: number;
  buyTime: number;
  roundTime: number;
  bombTimer: number;
  plantTime: number;
  defuseTime: number;
  defuseTimeKit: number;
  roundEndDelay: number;
  startMoney: number;
  maxMoney: number;
  friendlyFire: boolean;
  /** Call-of-Duty-style killstreak rewards. */
  killstreaks: boolean;
}

/** CS2 competitive defaults. */
export const DEFAULT_RULES: MatchRules = {
  roundsToWin: 13,
  halfLength: 12,
  teamSize: 5,
  freezeTime: 15,
  buyTime: 20,
  roundTime: 115,
  bombTimer: 40,
  plantTime: 3.2,
  defuseTime: 10,
  defuseTimeKit: 5,
  roundEndDelay: 6,
  startMoney: 800,
  maxMoney: 16000,
  friendlyFire: false,
  killstreaks: true,
};
