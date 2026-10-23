import { Vector3 } from 'three';
import type { Team } from '../../config/rules';
import type { AgentLook } from '../../config/cosmetics';
import { MOVE } from '../../config/movement';
import { type WeaponDef, type WeaponId } from '../../config/weapons';
import { deriveDef, type AttachmentId, type Loadout } from '../../config/attachments';
import { UTILITY_ORDER, emptyGrenades, type UtilityId } from '../../config/utilities';
import { GADGET_ORDER, emptyGadgets, type GadgetId } from '../../config/gadgets';
import { createMotorState, eyeOf, heightOf, type MotorState } from '../physics/CharacterMotor';
import type { StreakId } from '../mode/Killstreaks';
import { dirFromAngles } from '../../core/math';

export type ActiveSlot = 'primary' | 'secondary' | 'melee' | 'grenade' | 'bomb' | 'gadget';
export type HitGroup = 'head' | 'chest' | 'stomach' | 'legs';

/** A gun in someone's hands or on the floor. `def` already includes its attachments. */
export interface WeaponInstance { def: WeaponDef; mag: number; reserve: number; att?: Loadout }

export function makeWeapon(id: WeaponId, att?: Loadout): WeaponInstance {
  const def = deriveDef(id, att);
  return { def, mag: def.mag, reserve: def.reserve, att: att ? { ...att } : undefined };
}

/** Swap the attachments on an existing gun (keeps ammo, capped to the new magazine). */
export function refitWeapon(w: WeaponInstance, att: Loadout, refill: boolean) {
  const def = deriveDef(w.def.id, att);
  w.def = def;
  w.att = { ...att };
  w.mag = refill ? def.mag : Math.min(w.mag, def.mag);
  w.reserve = Math.max(w.reserve, refill ? def.reserve : 0);
}

/** Attachments a player has bought for one gun, and which of them are fitted. */
export interface GunsmithState { owned: AttachmentId[]; equipped: Loadout }

export interface AgentCommand {
  forward: number;
  right: number;
  jump: boolean;
  crouch: boolean;
  prone: boolean;
  slide: boolean;
  walk: boolean;
  lean: number;            // -1 left, 0, 1 right
  yaw: number;
  pitch: number;
  fire: boolean;
  alt: boolean;
  reload: boolean;
  use: boolean;
  drop: boolean;
  select: ActiveSlot | null;
  selectGrenade: UtilityId | null;
  cycleGrenade: boolean;
  lastWeapon: boolean;
  selectGadget: GadgetId | null;
  cycleGadget: boolean;
  /** Toggle camera / drone feeds. */
  cams: boolean;
  /** -1 / +1 to switch feed while viewing cameras. */
  camCycle: number;
  /** Quick knife stab without switching weapons. */
  quickMelee: boolean;
  /** Inject yourself with the stim pistol. */
  stimSelf: boolean;
  /** Use the oldest earned killstreak. */
  killstreak: boolean;
  /** Detonate all your placed C4. */
  detonate: boolean;
  /** Mark the spot / enemy under the crosshair for your team. */
  ping: boolean;
  /** Toggle the weapon light. */
  light: boolean;
}

export const emptyCommand = (): AgentCommand => ({
  forward: 0, right: 0, jump: false, crouch: false, prone: false, slide: false, walk: false, lean: 0, yaw: 0, pitch: 0,
  fire: false, alt: false, reload: false, use: false, drop: false, select: null, selectGrenade: null, cycleGrenade: false, lastWeapon: false,
  selectGadget: null, cycleGadget: false, cams: false, camCycle: 0, quickMelee: false, stimSelf: false, killstreak: false, detonate: false, ping: false, light: false,
});

export interface AgentStats { kills: number; deaths: number; assists: number; damage: number; headshots: number; mvps: number; score: number; roundKills: number }

export interface WeaponRuntime {
  nextAttack: number;
  reloadUntil: number;
  drawUntil: number;
  recoilIdx: number;
  lastShot: number;
  fireInacc: number;
  scope: number;          // 0 = unscoped, 1..n zoom level
  rescopeAt: number;      // sniper auto re-zoom after bolt
  rescopeLevel: number;
  ads: boolean;           // aim-down-sights (non-scoped weapons)
  triggerLatched: boolean;
  altLatched: boolean;
  throwPrimed: 0 | 1 | 2 | 3; // grenade: 0 none, 1 overhand, 2 underhand, 3 both
  throwReadyAt: number;
  /** Quick melee: weapon is lowered until meleeUntil; next swing allowed at meleeReadyAt. */
  meleeUntil: number;
  meleeReadyAt: number;
  pendingSwitchBack: number;
  /** Rounds still to fire in the current burst (burst weapons). */
  burstLeft: number;
}

export interface Hitbox { group: HitGroup; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

let NEXT_ID = 1;

export class Agent {
  readonly id = NEXT_ID++;
  name: string;
  team: Team;
  isBot: boolean;
  look: Record<Team, AgentLook>;
  motor: MotorState;
  yaw = 0;
  pitch = 0;
  lean = 0;
  health = 100;
  armor = 0;
  helmet = false;
  hasKit = false;
  alive = true;
  money = 800;
  /** Simulation time of death (for spectator cam / ragdoll). */
  deathTime = -1;
  deathDir = new Vector3();
  /** Id of whoever killed this agent (-1 = world / self). */
  killedBy = -1;

  primary: WeaponInstance | null = null;
  secondary: WeaponInstance | null = null;
  knife: WeaponInstance = makeWeapon('knife');
  grenades: Record<UtilityId, number> = emptyGrenades();
  /** Stun grenade: until when, and how strong (0..1). */
  stunUntil = 0;
  stunStrength = 0;
  /** Heartbeat sensor: last sweep (world positions of enemies seen) and next sweep time. */
  heartbeat: { at: number; blips: { id: number; x: number; z: number }[] } | null = null;
  heartbeatNext = 0;
  /** Team ping cooldown. */
  pingReadyAt = 0;
  /** Gunsmith: attachments bought per gun. Kept through deaths; reset at halftime. */
  loadouts: Partial<Record<WeaponId, GunsmithState>> = {};
  /** Items bought this round, and last round (for Rebuy). */
  roundBuys: import('../mode/Economy').BuyItem[] = [];
  lastBuys: import('../mode/Economy').BuyItem[] = [];
  /** Weapon light switched on (needs a Tactical Light on the held gun). */
  lightOn = false;
  /** Dazzled by an enemy's weapon light until / how strongly. */
  dazzleUntil = 0;
  dazzleStrength = 0;
  activeGrenade: UtilityId | null = null;
  gadgets: Record<GadgetId, number> = emptyGadgets();
  activeGadget: GadgetId | null = null;
  /** Device id of the camera / drone this agent is currently operating. */
  operating: number | null = null;
  radarScrambledUntil = 0;
  /** Active heal-over-time effects (stims). */
  heals: { rate: number; until: number }[] = [];
  healAcc = 0;
  /** Times this agent was stimmed recently (diminishing returns). */
  stimHistory: number[] = [];
  stimReadyAt = 0;
  hasCrowbar = false;
  pryProgress = 0;
  /** Kills this life (killstreak counter) and earned-but-unused killstreaks. */
  streakKills = 0;
  streaks: StreakId[] = [];
  hasBomb = false;
  active: ActiveSlot = 'secondary';
  lastActive: ActiveSlot = 'melee';
  wpn: WeaponRuntime = {
    nextAttack: 0, reloadUntil: 0, drawUntil: 0, recoilIdx: 0, lastShot: -10, fireInacc: 0, scope: 0, rescopeAt: 0, rescopeLevel: 0,
    ads: false, triggerLatched: false, altLatched: false, throwPrimed: 0, throwReadyAt: 0, meleeUntil: 0, meleeReadyAt: 0, pendingSwitchBack: 0, burstLeft: 0,
  };

  cmd: AgentCommand = emptyCommand();
  stats: AgentStats = { kills: 0, deaths: 0, assists: 0, damage: 0, headshots: 0, mvps: 0, score: 0, roundKills: 0 };
  /** Damage dealt to this agent this round, by attacker id (assists). */
  damageTaken = new Map<number, number>();
  flashedBy = new Map<number, number>();

  flashUntil = 0;
  flashDuration = 0;
  flashStrength = 0;
  lastHurtTime = -10;
  lastHurtFrom = new Vector3();
  spottedUntil = 0;     // visible to enemy radar until
  revealedUntil = 0;    // recon pulse reveal
  footstepDist = 0;
  plantProgress = 0;
  defuseProgress = 0;
  isPlanting = false;
  isDefusing = false;
  aimPunchYaw = 0;
  aimPunchPitch = 0;
  /** View / aim kick from taking damage (degrees), decays quickly. */
  flinchPitch = 0;
  flinchYaw = 0;
  /** Tagging slow-down after being hit (CS "tagging"). */
  tagUntil = 0;

  constructor(name: string, team: Team, isBot: boolean, look: Record<Team, AgentLook>) {
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.look = look;
    this.motor = createMotorState(0, 0, 0);
  }

  get pos() { return this.motor.pos; }
  get vel() { return this.motor.vel; }
  get height() { return heightOf(this.motor.duck, this.motor.prone, this.motor.slidePose); }
  get eyeHeight() { return eyeOf(this.motor.duck, this.motor.prone, this.motor.slidePose); }
  get speed2D() { return Math.hypot(this.motor.vel.x, this.motor.vel.z); }
  get crouched() { return this.motor.duck > 0.5; }
  get prone() { return this.motor.prone > 0.5; }
  get sliding() { return this.motor.slideTime > 0; }

  activeWeapon(): WeaponInstance | null {
    switch (this.active) {
      case 'primary': return this.primary;
      case 'secondary': return this.secondary;
      case 'melee': return this.knife;
      default: return null;
    }
  }

  /** Max run speed with the currently held item. */
  maxSpeed(): number {
    const w = this.activeWeapon();
    let s = w ? w.def.moveSpeed : 6.1; // grenades/bomb ≈ 245u
    if (w?.def.scope && this.wpn.scope > 0) s = w.def.scope.scopedSpeed;
    if (this.wpn.ads) s *= w?.def.ads?.move ?? 0.8;
    return s;
  }

  /** Fitted attachments for a gun this player owns attachments for. */
  loadoutOf(id: WeaponId): Loadout | undefined { return this.loadouts[id]?.equipped; }

  /** Glare from an enemy's weapon light (0..1). */
  dazzleAt(now: number): number { return now < this.dazzleUntil ? this.dazzleStrength : 0; }

  /** How stunned we are right now (0..1); fades out over the last 1.2 s. */
  stunAt(now: number): number {
    if (now >= this.stunUntil) return 0;
    return this.stunStrength * Math.min(1, (this.stunUntil - now) / 1.2);
  }

  totalGrenades() { return UTILITY_ORDER.reduce((n, k) => n + this.grenades[k], 0); }
  totalGadgets() { return GADGET_ORDER.reduce((n, k) => n + this.gadgets[k], 0); }

  /** Lateral lean offset in meters (positive = right). */
  leanOffset(): number { return this.lean * MOVE.leanOffset * (1 - this.motor.prone) * (1 - this.motor.slidePose); }

  eyePos(out = new Vector3()): Vector3 {
    const off = this.leanOffset();
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const forward = MOVE.proneEyeForward * this.motor.prone;
    return out.set(this.pos.x + rx * off - Math.sin(this.motor.bodyYaw) * forward,
      this.pos.y + this.eyeHeight - Math.abs(off) * 0.06 / MOVE.leanOffset,
      this.pos.z + rz * off - Math.cos(this.motor.bodyYaw) * forward);
  }

  viewDir(out = new Vector3()): Vector3 { return dirFromAngles(this.yaw, this.pitch, out); }

  centerPos(out = new Vector3()): Vector3 { return out.set(this.pos.x, this.pos.y + this.height * 0.6, this.pos.z); }

  /** A visible point inside the current damage volume, used by bots and aim assist. */
  aimPoint(head: boolean, out = new Vector3()): Vector3 {
    if (head) { this.eyePos(out); out.y += 0.02; return out; }
    const prone = this.motor.prone, forward = 0.28 * prone, lean = this.leanOffset() * 0.55;
    return out.set(this.pos.x + Math.cos(this.yaw) * lean - Math.sin(this.motor.bodyYaw) * forward,
      this.pos.y + this.height * 0.66 * (1 - prone) + 0.295 * prone,
      this.pos.z - Math.sin(this.yaw) * lean - Math.cos(this.motor.bodyYaw) * forward);
  }

  /** Axis-aligned hitboxes approximating head / chest / stomach / legs, shifted by lean. */
  hitboxes(out: Hitbox[] = []): Hitbox[] {
    out.length = 0;
    const p = this.pos, h = this.height;
    const off = this.leanOffset();
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const eye = this.eyeHeight;
    const box = (group: HitGroup, cx: number, cz: number, y0: number, y1: number, half: number) =>
      out.push({ group, minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half, minY: p.y + y0, maxY: p.y + y1 });
    // head follows the eye (lean)
    box('head', p.x + rx * off, p.z + rz * off, eye - 0.13, eye + 0.15, 0.13);
    box('chest', p.x + rx * off * 0.55, p.z + rz * off * 0.55, h * 0.56, eye - 0.13, 0.22);
    box('stomach', p.x + rx * off * 0.25, p.z + rz * off * 0.25, h * 0.42, h * 0.56, 0.2);
    box('legs', p.x, p.z, 0, h * 0.42, 0.18);
    if (this.motor.prone > 0) {
      const t = this.motor.prone, yaw = this.motor.bodyYaw;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      // Separate low, lengthwise volumes follow the same body rotation as collision
      // and animation. Standing above a prone target must never hit an invisible head.
      const volumes = [
        [MOVE.proneEyeForward, 0.28, 0.56, 0.13, 0.14],
        [0.28, 0.17, 0.42, 0.23, 0.24],
        [-0.08, 0.12, 0.34, 0.20, 0.18],
        [-0.52, 0.05, 0.27, 0.20, 0.41],
      ];
      for (let i = 0; i < out.length; i++) {
        const [fwd, y0, y1, width, length] = volumes[i], b = out[i];
        const x = p.x - sin * fwd, z = p.z - cos * fwd;
        const ex = Math.abs(cos) * width + Math.abs(sin) * length;
        const ez = Math.abs(sin) * width + Math.abs(cos) * length;
        b.minX += (x - ex - b.minX) * t; b.maxX += (x + ex - b.maxX) * t;
        b.minZ += (z - ez - b.minZ) * t; b.maxZ += (z + ez - b.maxZ) * t;
        b.minY += (p.y + y0 - b.minY) * t; b.maxY += (p.y + y1 - b.maxY) * t;
      }
    }
    return out;
  }

  resetForRound(keepGear: boolean, defaultPistol: WeaponId) {
    this.alive = true;
    this.health = 100;
    this.deathTime = -1;
    if (!keepGear) {
      this.primary = null;
      this.secondary = makeWeapon(defaultPistol, this.loadoutOf(defaultPistol));
      this.grenades = emptyGrenades();
      this.gadgets = emptyGadgets();
      this.armor = 0;
      this.helmet = false;
      this.hasKit = false;
      this.hasCrowbar = false;
    } else {
      // refill ammo like CS (weapons keep their state; we top up reserve for simplicity)
      for (const w of [this.primary, this.secondary]) if (w) w.reserve = Math.max(w.reserve, w.def.reserve);
    }
    if (this.team === 'T') this.hasKit = false;
    this.hasBomb = false;
    this.active = this.primary ? 'primary' : 'secondary';
    this.lastActive = 'melee';
    this.activeGrenade = null;
    this.activeGadget = null;
    this.operating = null;
    this.radarScrambledUntil = 0;
    this.heals = []; this.healAcc = 0; this.stimHistory = []; this.stimReadyAt = 0; this.pryProgress = 0;
    Object.assign(this.wpn, { nextAttack: 0, reloadUntil: 0, drawUntil: 0, recoilIdx: 0, lastShot: -10, fireInacc: 0, scope: 0, rescopeAt: 0, rescopeLevel: 0,
      ads: false, triggerLatched: false, altLatched: false, throwPrimed: 0, throwReadyAt: 0, pendingSwitchBack: 0, burstLeft: 0 });
    this.damageTaken.clear();
    this.flashedBy.clear();
    this.flashUntil = 0; this.flashStrength = 0;
    this.stunUntil = 0; this.stunStrength = 0; this.heartbeat = null; this.heartbeatNext = 0;
    this.lightOn = false; this.dazzleUntil = 0;
    this.spottedUntil = 0; this.revealedUntil = 0;
    this.plantProgress = 0; this.defuseProgress = 0; this.isPlanting = false; this.isDefusing = false;
    this.aimPunchPitch = 0; this.aimPunchYaw = 0;
    this.flinchPitch = 0; this.flinchYaw = 0;
    this.lean = 0;
    this.stats.roundKills = 0;
    this.motor.vel.set(0, 0, 0);
    this.motor.duck = 0;
    this.motor.prone = 0; this.motor.bodyYaw = this.yaw;
    this.motor.slideTime = 0; this.motor.slidePose = 0; this.motor.slideCooldown = 0; this.motor.slideHeld = false;
    this.motor.wantsDuck = false; this.motor.stamina = 0; this.motor.onGround = true;
    this.motor.groundY = this.pos.y;
    this.motor.jumpHeld = false;
    this.motor.jumpBuffer = 0;
    this.motor.landingImpact = 0;
    this.motor.landTime = 1;
    this.motor.airTime = 0;
    this.motor.mantle = null;
    this.motor.coyote = 0;
    this.footstepDist = 0;
    this.tagUntil = 0;
    this.cmd = emptyCommand();
  }
}
