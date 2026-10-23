export const ECONOMY = {
  winElimination: 3250,
  winTime: 3250,
  winBomb: 3500,
  winDefuse: 3500,
  /** Loss bonus by consecutive-loss count (1-based, capped at last entry). */
  lossBonus: [1400, 1900, 2400, 2900, 3400],
  plantBonusTeamOnLoss: 800,
  plantReward: 300,
  defuseReward: 300,
  killDefault: 300,
  killGrenade: 300,
  killKnife: 1500,
  teamKillPenalty: -300,
} as const;
