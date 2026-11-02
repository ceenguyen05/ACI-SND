export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface DifficultyDef {
  label: string;
  reaction: number;        // seconds before first shot after spotting
  aimSpeed: number;        // aim smoothing rate (1/s)
  aimError: number;        // initial aim error radius in degrees
  errorDecay: number;      // how fast error closes (1/s)
  sprayControl: number;    // 0..1 fraction of recoil compensated
  fov: number;             // degrees
  counterStrafe: boolean;  // stops before shooting
  headRatio: number;       // probability of aiming at the head
  utilityUse: number;      // 0..1
  trackingDelay: number;   // seconds between observed target positions
  steadyError: number;     // persistent angular drift, degrees (never decays to perfect aim)
  triggerInterval: number; // minimum spacing of semi-auto trigger pulls
  burstDuration: number;   // longest continuous automatic burst
  burstPause: number;      // recovery between bursts
}

export const DIFFICULTY: Record<BotDifficulty, DifficultyDef> = {
  easy: { label: 'Easy', reaction: 0.95, aimSpeed: 3.4, aimError: 8, errorDecay: 0.65, sprayControl: 0.06, fov: 100, counterStrafe: false, headRatio: 0.04, utilityUse: 0.2,
    trackingDelay: 0.28, steadyError: 1.8, triggerInterval: 0.32, burstDuration: 0.38, burstPause: 0.5 },
  normal: { label: 'Normal', reaction: 0.62, aimSpeed: 5.5, aimError: 5.5, errorDecay: 1.1, sprayControl: 0.3, fov: 110, counterStrafe: false, headRatio: 0.14, utilityUse: 0.5,
    trackingDelay: 0.22, steadyError: 1.1, triggerInterval: 0.24, burstDuration: 0.5, burstPause: 0.38 },
  hard: { label: 'Hard', reaction: 0.4, aimSpeed: 8, aimError: 3.6, errorDecay: 1.8, sprayControl: 0.58, fov: 120, counterStrafe: true, headRatio: 0.28, utilityUse: 0.75,
    trackingDelay: 0.16, steadyError: 0.65, triggerInterval: 0.18, burstDuration: 0.65, burstPause: 0.28 },
  expert: { label: 'Expert', reaction: 0.28, aimSpeed: 11, aimError: 2.3, errorDecay: 2.7, sprayControl: 0.76, fov: 125, counterStrafe: true, headRatio: 0.42, utilityUse: 0.9,
    trackingDelay: 0.12, steadyError: 0.38, triggerInterval: 0.14, burstDuration: 0.8, burstPause: 0.2 },
};
