import { DEFAULT_BINDINGS, type Action } from '../config/controls';
import { DEFAULT_CROSSHAIR, OUTFITS, type AgentLook, type CrosshairSettings } from '../config/cosmetics';
import type { BotDifficulty } from '../config/difficulty';
import type { MatchLength, Team } from '../config/rules';
import type { WeaponId } from '../config/weapons';

export type Quality = 'low' | 'medium' | 'high';
export type AimAssist = 'off' | 'low' | 'medium' | 'high';

export interface Settings {
  sensitivity: number;
  zoomSensitivity: number;
  invertY: boolean;
  fov: number;
  viewmodelFov: number;
  leftHanded: boolean;
  leanToggle: boolean;
  /**
   * Crouch key: 'hold' (CS: hold to crouch; keep holding while still to go prone) or
   * 'toggle' (CoD: tap to crouch / stand, hold to go prone, Space to stand up).
   */
  crouchMode: 'hold' | 'toggle';
  adsToggle: boolean;
  showFps: boolean;
  rotateRadar: boolean;
  radarZoom: number;
  masterVolume: number;
  sfxVolume: number;
  uiVolume: number;
  renderScale: number;
  quality: Quality;
  /** Mouse aim assist: slow-down + gentle pull near visible enemies. Never applies to bots. */
  aimAssist: AimAssist;
  /** Replay the round-winning kill (CoD-style final killcam). */
  killcam: boolean;
  /** Spoken round announcer (browser speech synthesis). */
  announcer: boolean;
  /** On-screen markers for bomb sites, the planted bomb and a dropped bomb. */
  objectiveMarkers: boolean;
  /** Short gameplay tips during the first rounds. */
  tips: boolean;
  bindings: Record<Action, string>;
  crosshair: CrosshairSettings;
}

export interface MatchPrefs {
  side: Team | 'auto';
  teamSize: number;
  difficulty: BotDifficulty;
  length: MatchLength;
  freezeTime: number;
  friendlyFire: boolean;
  killstreaks: boolean;
}

export interface Profile {
  name: string;
  looks: Record<Team, AgentLook>;
  finishes: Partial<Record<WeaponId, string>>;
  stats: { matches: number; wins: number; kills: number; deaths: number; mvps: number };
  match: MatchPrefs;
  settings: Settings;
}

const KEY = 'aci-snd-profile-v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.0, zoomSensitivity: 1.0, invertY: false, fov: 90, viewmodelFov: 60, leftHanded: false,
  leanToggle: false, crouchMode: 'hold', adsToggle: false, showFps: true, rotateRadar: true, radarZoom: 1,
  masterVolume: 0.7, sfxVolume: 1, uiVolume: 0.6, renderScale: 1, quality: 'medium', aimAssist: 'low', killcam: true, announcer: true, objectiveMarkers: true, tips: true,
  bindings: { ...DEFAULT_BINDINGS }, crosshair: { ...DEFAULT_CROSSHAIR },
};

export function defaultProfile(): Profile {
  return {
    name: 'Player',
    looks: {
      T: { ...OUTFITS.find((o) => o.team === 'T')!.look },
      CT: { ...OUTFITS.find((o) => o.team === 'CT')!.look },
    },
    finishes: {},
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, mvps: 0 },
    match: { side: 'auto', teamSize: 5, difficulty: 'normal', length: 'short', freezeTime: 10, friendlyFire: false, killstreaks: true },
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** localStorage-backed profile (per-browser). Every read/write is guarded. */
export function loadProfile(): Profile {
  const base = defaultProfile();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      ...base, ...p,
      looks: { T: { ...base.looks.T, ...p.looks?.T }, CT: { ...base.looks.CT, ...p.looks?.CT } },
      stats: { ...base.stats, ...p.stats },
      match: { ...base.match, ...p.match },
      settings: {
        ...base.settings, ...p.settings,
        // V became quick melee: older profiles had cameras on V, move them to T
        bindings: { ...base.settings.bindings, ...p.settings?.bindings, ...(p.settings?.bindings?.cams === 'KeyV' && !p.settings?.bindings?.quickMelee ? { cams: 'KeyT' } : {}) },
        crosshair: { ...base.settings.crosshair, ...p.settings?.crosshair },
      },
    };
  } catch {
    return base;
  }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
