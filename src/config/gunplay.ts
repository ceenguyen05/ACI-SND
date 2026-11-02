/** Small, fixed world-space tolerances: they never grow into a long-range aim cone. */
export const GUNPLAY = {
  bodyTolerance: 0.055,
  headTolerance: 0.022,
  playerSpread: 0.82,
  playerAdsSpread: 0.72,
} as const;
