import type { Team } from './rules';

export type Headgear = 'none' | 'cap' | 'beanie' | 'helmet' | 'balaclava' | 'headset' | 'bandana';
export type OutfitStyle = 'vest' | 'plain' | 'armored' | 'coat';

export interface AgentLook {
  outfit: string;
  primary: string;   // shirt / jacket
  secondary: string; // trousers
  accent: string;    // vest / straps / gloves
  skin: string;
  headgear: Headgear;
  style: OutfitStyle;
}

export interface OutfitDef { id: string; name: string; team: Team; desc: string; look: AgentLook }

export const OUTFITS: OutfitDef[] = [
  { id: 'nightshift', name: 'Night Shift Dockhand', team: 'T', desc: 'Knows every forklift lane in shipping.',
    look: { outfit: 'nightshift', primary: '#3b3f46', secondary: '#2a2c30', accent: '#f08a1c', skin: '#c99b7a', headgear: 'beanie', style: 'vest' } },
  { id: 'raider', name: 'Syndicate Raider', team: 'T', desc: 'Black-market muscle, red bandana.',
    look: { outfit: 'raider', primary: '#1d1d21', secondary: '#33302c', accent: '#b8282c', skin: '#8d5f45', headgear: 'bandana', style: 'plain' } },
  { id: 'saboteur', name: 'Field Saboteur', team: 'T', desc: 'Olive drab, chest rig, balaclava.',
    look: { outfit: 'saboteur', primary: '#5a5a3c', secondary: '#4a4232', accent: '#a08a5a', skin: '#e0b896', headgear: 'balaclava', style: 'armored' } },
  { id: 'security', name: 'ACI Security', team: 'CT', desc: 'Corporate security, radio headset.',
    look: { outfit: 'security', primary: '#1f2d4a', secondary: '#252a33', accent: '#c8ccd4', skin: '#d4a584', headgear: 'headset', style: 'plain' } },
  { id: 'swat', name: 'Metro Tactical', team: 'CT', desc: 'Heavy plate carrier and ballistic helmet.',
    look: { outfit: 'swat', primary: '#22262c', secondary: '#1b1e22', accent: '#3a6ec8', skin: '#a9775a', headgear: 'helmet', style: 'armored' } },
  { id: 'response', name: 'Rapid Response', team: 'CT', desc: 'Grey field jacket, teal markings.',
    look: { outfit: 'response', primary: '#555b62', secondary: '#33383e', accent: '#2ab0a0', skin: '#f0c8a8', headgear: 'cap', style: 'coat' } },
];

export const HEADGEAR_OPTIONS: { id: Headgear; name: string }[] = [
  { id: 'none', name: 'None' }, { id: 'cap', name: 'Cap' }, { id: 'beanie', name: 'Beanie' },
  { id: 'helmet', name: 'Ballistic Helmet' }, { id: 'balaclava', name: 'Balaclava' },
  { id: 'headset', name: 'Comms Headset' }, { id: 'bandana', name: 'Bandana' },
];
export const STYLE_OPTIONS: { id: OutfitStyle; name: string }[] = [
  { id: 'plain', name: 'Field Shirt' }, { id: 'vest', name: 'Hi-Vis Vest' }, { id: 'armored', name: 'Plate Carrier' }, { id: 'coat', name: 'Long Coat' },
];
export const SKIN_TONES = ['#f3d2b8', '#e0b896', '#c99b7a', '#a9775a', '#8d5f45', '#5e3d2b'];
export const PALETTE = [
  '#1d1d21', '#2a2c30', '#3b3f46', '#555b62', '#8a9099', '#c8ccd4', '#f2f2f2',
  '#1f2d4a', '#3a6ec8', '#2ab0a0', '#3c6e3c', '#5a5a3c', '#a08a5a', '#6b4a2c',
  '#b8282c', '#f08a1c', '#f0c020', '#8a3cc8', '#d04890',
];

export type FinishPattern = 'solid' | 'camo' | 'stripes' | 'gradient' | 'digital' | 'hex';
export interface FinishDef { id: string; name: string; rarity: 'Consumer' | 'Mil-Spec' | 'Restricted' | 'Classified' | 'Covert';
  base: string; accent: string; pattern: FinishPattern; metal: number }

export const FINISHES: FinishDef[] = [
  { id: 'factory', name: 'Factory Issue', rarity: 'Consumer', base: '#3a3d43', accent: '#55595f', pattern: 'solid', metal: 0.4 },
  { id: 'desert', name: 'Dune Runner', rarity: 'Consumer', base: '#b8a27a', accent: '#8a7350', pattern: 'camo', metal: 0.1 },
  { id: 'arctic', name: 'Arctic Shift', rarity: 'Mil-Spec', base: '#dfe6ec', accent: '#8ea2b4', pattern: 'digital', metal: 0.1 },
  { id: 'forest', name: 'Overgrowth', rarity: 'Mil-Spec', base: '#4b5a36', accent: '#26301c', pattern: 'camo', metal: 0.1 },
  { id: 'hazard', name: 'Hazard Line', rarity: 'Restricted', base: '#f0c020', accent: '#1d1d21', pattern: 'stripes', metal: 0.2 },
  { id: 'cobalt', name: 'Cobalt Fade', rarity: 'Restricted', base: '#1a3ea8', accent: '#20c0e0', pattern: 'gradient', metal: 0.6 },
  { id: 'redline', name: 'Assembly Red', rarity: 'Classified', base: '#191a1d', accent: '#c82830', pattern: 'stripes', metal: 0.3 },
  { id: 'hive', name: 'Circuit Hive', rarity: 'Classified', base: '#13161a', accent: '#30e0a0', pattern: 'hex', metal: 0.5 },
  { id: 'sunset', name: 'Shift Change', rarity: 'Covert', base: '#e05030', accent: '#8a3cc8', pattern: 'gradient', metal: 0.5 },
  { id: 'gold', name: 'Executive Gold', rarity: 'Covert', base: '#d4a838', accent: '#fff0b0', pattern: 'gradient', metal: 0.95 },
];

export const RARITY_COLORS: Record<FinishDef['rarity'], string> = {
  Consumer: '#b0c3d9', 'Mil-Spec': '#4b69ff', Restricted: '#8847ff', Classified: '#d32ce6', Covert: '#eb4b4b',
};

export interface CrosshairSettings {
  style: 'classic' | 'dot' | 'circle';
  color: string; size: number; gap: number; thickness: number;
  dot: boolean; outline: boolean; dynamic: boolean; alpha: number;
}
export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  style: 'classic', color: '#a4dfb7', size: 3, gap: 3, thickness: 1, dot: false, outline: true, dynamic: true, alpha: 1,
};
