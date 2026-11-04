import type { MapDef } from '../world/MapTypes';
import { ACI_HQ } from './aciHq';
import { ACI_B2 } from './aciB2';

/**
 * Search & Destroy map pool. Zombies always plays on ACI HQ (its layout is built on that map).
 * Every id here must have a baked lightmap in public/lightmaps/<id>.json (`npm run bake`).
 */
export const SND_MAPS = { aci_hq: ACI_HQ, aci_b2: ACI_B2 } as const satisfies Record<string, MapDef>;
export type SndMapId = keyof typeof SND_MAPS;
/** What a player picks: a specific map, or let the game choose. */
export type SndMapChoice = SndMapId | 'random';

export const SND_MAP_IDS = Object.keys(SND_MAPS) as SndMapId[];
export const DEFAULT_SND_MAP: SndMapId = 'aci_hq';

export const MAP_CHOICES: { value: SndMapChoice; label: string; blurb: string }[] = [
  { value: 'aci_hq', label: 'ACI HQ', blurb: 'Offices and a radar plant: cubicle fights at B, long factory sightlines at A.' },
  { value: 'aci_b2', label: 'ACI Building 2', blurb: 'Engineering offices: the café at B, the prototype lab at A, a parking-lot attack.' },
  { value: 'random', label: 'Randomize', blurb: 'The game picks one of the maps for you.' },
];

export const isSndMapId = (v: unknown): v is SndMapId => typeof v === 'string' && Object.hasOwn(SND_MAPS, v);
export const isMapChoice = (v: unknown): v is SndMapChoice => v === 'random' || isSndMapId(v);

/** Map for an id; unknown or missing ids (older clients / profiles) fall back to ACI HQ. */
export function sndMap(id: unknown): MapDef { return SND_MAPS[isSndMapId(id) ? id : DEFAULT_SND_MAP]; }

/** Resolve a choice to a concrete map. `roll(n)` returns an integer in [0, n). */
export function resolveMapChoice(choice: unknown, roll: (n: number) => number = (n) => Math.floor(Math.random() * n)): SndMapId {
  if (isSndMapId(choice)) return choice;
  return SND_MAP_IDS[Math.min(SND_MAP_IDS.length - 1, Math.max(0, roll(SND_MAP_IDS.length)))];
}

/** Two players' choices are compatible when one of them is "random" or they agree. */
export const mapChoicesCompatible = (a: SndMapChoice | undefined, b: SndMapChoice | undefined) =>
  (a ?? 'random') === 'random' || (b ?? 'random') === 'random' || a === b;

/** The narrower of two compatible choices ("random" yields to a specific map). */
export const narrowMapChoice = (a: SndMapChoice | undefined, b: SndMapChoice | undefined): SndMapChoice =>
  (a ?? 'random') === 'random' ? (b ?? 'random') : a!;

export const mapLabel = (choice: SndMapChoice | undefined) => MAP_CHOICES.find((c) => c.value === (choice ?? 'random'))?.label ?? 'ACI HQ';
