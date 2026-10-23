import type { Team } from './rules';

/**
 * Gadgets: Siege / Operation-One style intel and trap devices that live in their own
 * inventory slot (key 6), separate from grenades.
 */
export type GadgetId = 'drone' | 'stickyCam' | 'flockCam' | 'mine' | 'wire' | 'shield' | 'emp' | 'stim' | 'c4' | 'barricade' | 'steelBarricade' | 'ammoBox' | 'heartbeat';

/** How the gadget is deployed with left mouse. */
export type DeployMode = 'throw' | 'place' | 'hold';

export interface GadgetDef {
  id: GadgetId;
  name: string;
  short: string;
  team: Team | 'both';
  price: number;
  max: number;
  deploy: DeployMode;
  /** Electronic devices are destroyed / jammed by EMP. */
  electronic: boolean;
  health: number;
  blurb: string;
}

export const GADGETS: Record<GadgetId, GadgetDef> = {
  drone: { id: 'drone', name: 'Recon Drone', short: 'Drone', team: 'both', price: 300, max: 1, deploy: 'throw', electronic: true, health: 30,
    blurb: 'Deploy and drive a two-wheeled scout. WASD drive, Space hop, Left mouse pings enemies for your team.' },
  stickyCam: { id: 'stickyCam', name: 'Sticky Cam', short: 'Sticky Cam', team: 'both', price: 250, max: 2, deploy: 'throw', electronic: true, health: 10,
    blurb: 'Throwable camera that sticks to any wall, ceiling or floor. Watch and ping through it with the camera key.' },
  flockCam: { id: 'flockCam', name: 'Flock Cam', short: 'Flock Cam', team: 'CT', price: 400, max: 1, deploy: 'place', electronic: true, health: 25,
    blurb: 'Solar-powered auto-scan camera. Automatically spots attackers crossing its 100° view and alerts your team.' },
  mine: { id: 'mine', name: 'Trip Mine', short: 'Trip Mine', team: 'T', price: 500, max: 2, deploy: 'place', electronic: true, health: 10,
    blurb: 'Laser claymore. Detonates when a defender crosses the beam. Place it near the bomb to punish defusers.' },
  wire: { id: 'wire', name: 'Barbed Wire', short: 'Wire', team: 'CT', price: 250, max: 2, deploy: 'place', electronic: false, health: 40,
    blurb: 'Coil of razor wire. Slows anyone crossing it to a crawl and rattles loudly. Explosives and knives cut it.' },
  shield: { id: 'shield', name: 'Deployable Shield', short: 'Shield', team: 'CT', price: 700, max: 1, deploy: 'place', electronic: false, health: 500,
    blurb: 'Waist-high bulletproof barrier. Crouch behind it to hold an angle. Breaks under sustained fire or explosives.' },
  emp: { id: 'emp', name: 'EMP Grenade', short: 'EMP', team: 'T', price: 350, max: 1, deploy: 'throw', electronic: false, health: 1,
    blurb: 'Pulse through walls (9m) that destroys enemy cameras, drones and mines and scrambles enemy radar for 5s.' },
  stim: { id: 'stim', name: 'Stim Pistol', short: 'Stim', team: 'both', price: 400, max: 3, deploy: 'throw', electronic: false, health: 1,
    blurb: 'Fires a healing dart (drops over distance): teammates +60 HP over 5s. Press H to inject yourself: +15 HP over 5s. 1 + 2 darts. Repeat heals on one target are weaker. Darts also wreck barricades and enemy gadgets.' },
  c4: { id: 'c4', name: 'C4 Charge', short: 'C4', team: 'both', price: 500, max: 2, deploy: 'throw', electronic: true, health: 20,
    blurb: 'Sticky remote explosive. Throw it, then press Z to detonate all your charges. Blows open barricades.' },
  barricade: { id: 'barricade', name: 'Wooden Barricade', short: 'Barricade', team: 'both', price: 200, max: 2, deploy: 'place', electronic: false, health: 120,
    blurb: 'Boards up the doorway you look at. Blocks movement and sight; bullets splinter through. 3 melee hits, explosives or a crowbar remove it.' },
  steelBarricade: { id: 'steelBarricade', name: 'Steel Barricade', short: 'Steel', team: 'CT', price: 600, max: 1, deploy: 'place', electronic: false, health: 1500,
    blurb: 'Reinforced steel plate for a doorway. Bulletproof – only explosives or a crowbar (4s) get through.' },
  ammoBox: { id: 'ammoBox', name: 'Ammo Box', short: 'Ammo', team: 'both', price: 350, max: 1, deploy: 'place', electronic: false, health: 60,
    blurb: 'Teammates press F at the box to refill reserve ammo once per round (+1 stim dart).' },
  heartbeat: { id: 'heartbeat', name: 'Heartbeat Sensor', short: 'Heartbeat', team: 'both', price: 350, max: 1, deploy: 'hold', electronic: true, health: 1,
    blurb: 'Hand-held tablet: while you hold it, it sweeps every 1.25s and shows enemies within 24m in front of you, through walls. Its beep can be heard nearby.' },
};

/** Barricade-class devices sit in doorways and are pried off with a crowbar. */
export const BARRICADES: GadgetId[] = ['barricade', 'steelBarricade'];

export const GADGET_ORDER: GadgetId[] = ['stim', 'heartbeat', 'drone', 'stickyCam', 'flockCam', 'c4', 'mine', 'emp', 'barricade', 'steelBarricade', 'wire', 'shield', 'ammoBox'];
/** A fresh, empty gadget inventory. */
export const emptyGadgets = (): Record<GadgetId, number> =>
  Object.fromEntries(GADGET_ORDER.map((k) => [k, 0])) as Record<GadgetId, number>;
/** Distinct gadget items one player can carry (stim darts count as one item). */
export const MAX_GADGETS = 4;

export const GADGET_TUNING = {
  droneSpeed: 4.6,
  droneHop: 3.6,
  droneRadius: 0.18,
  droneHeight: 0.16,
  droneEye: 0.14,
  scanFov: 100,          // degrees, flock / bot cams
  flockRange: 20,
  camRange: 40,
  autoRevealTime: 1.4,
  pingRevealTime: 4,
  pingCone: 22,          // degrees
  mineArm: 1.5,
  mineLaser: 2.6,
  mineDelay: 0.35,
  mineRadius: 5.5,
  mineDamage: 140,
  wireHalfW: 1.3,
  wireHalfD: 0.55,
  wireSlow: 0.4,
  empRadius: 9,
  empFuse: 1.4,
  empScramble: 5,
  stickThrowSpeed: 14,
  c4Radius: 5.2,
  c4Damage: 150,
  stimSpeed: 38,
  stimTeam: 60,
  stimSelf: 15,
  stimDuration: 5,
  stimReload: 1.1,
  droneThrowSpeed: 5,
};

/** Fixed building CCTV feeds available to Defenders every round (R6-style). */
export interface CctvDef { name: string; x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number }
