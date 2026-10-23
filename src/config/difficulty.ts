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
}

export const DIFFICULTY: Record<BotDifficulty, DifficultyDef> = {
  easy: { label: 'Easy', reaction: 0.75, aimSpeed: 4, aimError: 7, errorDecay: 0.8, sprayControl: 0.1, fov: 100, counterStrafe: false, headRatio: 0.1, utilityUse: 0.2 },
  normal: { label: 'Normal', reaction: 0.45, aimSpeed: 7, aimError: 4.5, errorDecay: 1.5, sprayControl: 0.45, fov: 115, counterStrafe: false, headRatio: 0.3, utilityUse: 0.5 },
  hard: { label: 'Hard', reaction: 0.28, aimSpeed: 11, aimError: 2.8, errorDecay: 2.5, sprayControl: 0.75, fov: 125, counterStrafe: true, headRatio: 0.5, utilityUse: 0.75 },
  expert: { label: 'Expert', reaction: 0.18, aimSpeed: 16, aimError: 1.6, errorDecay: 4, sprayControl: 0.92, fov: 135, counterStrafe: true, headRatio: 0.7, utilityUse: 0.9 },
};
