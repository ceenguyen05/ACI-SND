import { AdditiveBlending, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, PointLight, Scene, Sprite, SpriteMaterial, Vector2, Vector3,
  type Object3D, type WebGLRenderer } from 'three';
import type { AgentLook } from '../config/cosmetics';
import { clamp, damp, wrapAngle } from '../core/math';
import { CharacterModel } from './CharacterModel';
import { flareSprite } from './Textures';

/**
 * HUD paper doll, after Minecraft Bedrock's paper doll and the Java "Paper Doll" mod: a small live
 * model of your own character in the top-right corner that copies what you do (shooting with
 * muzzle flash, reloading, throwing, melee, crouch, prone, slides, jumps, leans, planting).
 *
 * - 'action': appears while you do something other than plain walking, tucks away shortly after.
 * - 'always': stays up whenever you are alive in first person.
 */
export type PaperDollMode = 'off' | 'action' | 'always';

/** Doll box at 100% size in CSS pixels, and its gap from the top-right corner of the screen. */
export const PAPER_DOLL_BOX = { w: 150, h: 186, top: 10, right: 12 } as const;
export const paperDollSize = (scale = 1) => ({ w: Math.round(PAPER_DOLL_BOX.w * scale), h: Math.round(PAPER_DOLL_BOX.h * scale) });

/** "When acting": seconds the doll stays after the last action before sliding away. */
export const DOLL_LINGER = 2;
/** Seconds to slide in or out of the corner. */
const SLIDE_TIME = 0.18;
/** Three-quarter view, facing into the screen (the gun points toward the middle of the screen). */
const FACING = Math.PI - 0.62;
/** Prone and slides turn side-on so the body stretches across the box instead of toward the camera. */
const LOW_FACING = Math.PI / 2 + 0.5;

export interface PaperDollPose {
  /** Agent shown; switching to someone else (spectating) resets the transient motion. */
  id: number;
  look: AgentLook;
  /** Held item key, as for CharacterModel.setHeld. */
  held: string;
  speed: number; maxSpeed: number;
  /** Velocity in the agent's local frame. */
  forward: number; right: number;
  crouch: number; prone: number; slide: number;
  onGround: boolean;
  /** Height of the feet above the floor below (jumps and drops). */
  lift: number;
  /** View yaw: turning makes the doll swing with you. */
  yaw: number;
  pitch: number;
  /** Aim relative to the prone body. */
  aimYaw: number;
  lean: number;
  /** Reload progress, 0 when not reloading. */
  reload: number;
  planting: boolean; ads: boolean; mantling: boolean;
}

/** Whether the pose counts as an action for "When acting" (combat and movement tech, not plain walking). */
export function dollActing(p: PaperDollPose, sinceShot: number, sinceSwing: number, sinceHit: number): boolean {
  return sinceShot < 0.25 || sinceSwing < 0.6 || sinceHit < 0.4 || p.reload > 0 || p.planting || p.ads || p.mantling
    || p.crouch > 0.3 || p.prone > 0.02 || p.slide > 0.02 || !p.onGround || Math.abs(p.lean) > 0.2;
}

/** Show / hide timing. `shown` is how far the doll has slid into the corner (0 hidden … 1 in place). */
export class DollPresence {
  shown = 0;
  private sinceAction = Infinity;

  update(dt: number, mode: PaperDollMode, available: boolean, acting: boolean): number {
    this.sinceAction = acting ? 0 : this.sinceAction + dt;
    const want = available && (mode === 'always' || (mode === 'action' && this.sinceAction < DOLL_LINGER));
    this.shown = clamp(this.shown + (want ? dt : -dt) / SLIDE_TIME, 0, 1);
    return this.shown;
  }

  /** Something just happened (shot, throw, weapon swap): counts as an action now. */
  poke() { this.sinceAction = 0; }

  reset() { this.shown = 0; this.sinceAction = Infinity; }
}

/** Renders the doll in its own scene, into a scissored corner of the main canvas (no extra WebGL context). */
export class PaperDoll {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(24, PAPER_DOLL_BOX.w / PAPER_DOLL_BOX.h, 0.1, 40);
  readonly presence = new DollPresence();
  mode: PaperDollMode = 'off';
  /** Size multiplier from the settings (1 = PAPER_DOLL_BOX). */
  scale = 1;
  private model: CharacterModel | null = null;
  private flash: Sprite | null = null;
  private flashLight = new PointLight(0xffb468, 0, 2.5, 2);
  private flashSize = 0.24;
  private flashT = 0;
  private muzzleNode: Object3D | null = null;
  private modelHeld = '';
  private lastHeld = '';
  private agentId = -1;
  /** Doll clock (seconds), independent of the match clock so effects finish while paused. */
  private t = 0;
  private shotAt = -99; private swingAt = -99; private hitAt = -99;
  private firing = 0;
  private turn = 0;
  private prevYaw: number | null = null;
  /** Smoothed "how low" (prone / slide) for the camera framing. */
  private low = 0;
  private tmp = new Vector3();
  private canvasSize = new Vector2();

  constructor() {
    this.scene.add(new HemisphereLight(0xe8eef5, 0x4a4338, 1.5));
    const key = new DirectionalLight(0xfff0dc, 2.4);
    key.position.set(-2.5, 3.5, 4);
    const rim = new DirectionalLight(0xb8d0ff, 1.8);
    rim.position.set(2.5, 2.5, -3.5);
    this.scene.add(key, rim, this.flashLight);
    this.frame(0);
  }

  /** The shown agent fired (non-pellet shot): recoil kick + muzzle flash. */
  onShot() {
    this.shotAt = this.t;
    this.firing = 1;
    this.flashT = 0.05;
  }
  /** Grenade / gadget throw, quick melee or knife attack: arm swing. */
  onSwing() { this.swingAt = this.t; }
  /** The shown agent took a hit: flinch. */
  onHit() { this.hitAt = this.t; }

  /** Per render frame. `pose` null = nothing to show (dead, killcam, camera feed, free cam). */
  update(dt: number, pose: PaperDollPose | null) {
    this.t += dt;
    if (this.mode === 'off') { this.presence.reset(); return; }
    if (pose && pose.id !== this.agentId) {
      this.agentId = pose.id;
      this.prevYaw = null; this.turn = 0; this.firing = 0; this.flashT = 0;
      this.shotAt = this.swingAt = this.hitAt = -99;
      this.lastHeld = pose.held;
    }
    if (pose && pose.held !== this.lastHeld) { this.lastHeld = pose.held; this.presence.poke(); }
    const acting = !!pose && dollActing(pose, this.t - this.shotAt, this.t - this.swingAt, this.t - this.hitAt);
    const shown = this.presence.update(dt, this.mode, !!pose, acting);
    this.firing = damp(this.firing, 0, 18, dt);
    if (!pose || shown <= 0) { this.prevYaw = null; this.flashT = 0; this.flashLight.intensity = 0; return; }

    const model = this.ensureModel(pose.look);
    model.setLook(pose.look);
    if (pose.held !== this.modelHeld) { this.modelHeld = pose.held; model.setHeld(pose.held); this.findMuzzle(); }
    model.update({
      speed: pose.speed, maxSpeed: pose.maxSpeed, forward: pose.forward, right: pose.right,
      crouch: pose.crouch, prone: pose.prone, slide: pose.slide, onGround: pose.onGround,
      pitch: pose.pitch, aimYaw: pose.aimYaw, lean: pose.lean, reload: pose.reload, planting: pose.planting,
      firing: this.firing, hitT: this.t - this.hitAt, throwT: this.t - this.swingAt,
      dead: false, deathT: 0, dt,
    });
    // Turning swings the doll with you (clamped, springs back when you stop).
    const turnRate = this.prevYaw === null || dt <= 0 ? 0 : wrapAngle(pose.yaw - this.prevYaw) / dt;
    this.prevYaw = pose.yaw;
    this.turn = damp(this.turn, clamp(turnRate * 0.07, -0.45, 0.45), 9, dt);
    this.low = damp(this.low, Math.max(pose.prone, pose.slide * 0.6), 7, dt);
    model.root.rotation.y = FACING + (LOW_FACING - FACING) * this.low + this.turn;
    model.root.position.y = Math.min(0.25, pose.lift * 0.5);
    this.frame(this.low);
    this.updateFlash(dt);
  }

  /** Draw into the top-right corner of the current frame (after the world and view model). */
  render(r: WebGLRenderer) {
    const shown = this.presence.shown;
    if (this.mode === 'off' || shown <= 0 || !this.model) return;
    const { w, h } = paperDollSize(this.scale);
    r.getSize(this.canvasSize);
    const ease = 1 - (1 - shown) ** 3;
    const x = Math.round(this.canvasSize.x - w - PAPER_DOLL_BOX.right + (1 - ease) * (w + PAPER_DOLL_BOX.right));
    const y = Math.round(this.canvasSize.y - h - PAPER_DOLL_BOX.top);
    r.setScissorTest(true);
    r.setScissor(x, y, w, h);
    r.setViewport(x, y, w, h);
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.canvasSize.x, this.canvasSize.y);
  }

  /** Hide at once (leaving a match). */
  reset() {
    this.presence.reset();
    this.prevYaw = null; this.flashT = 0; this.firing = 0; this.agentId = -1;
    this.flashLight.intensity = 0;
  }

  private ensureModel(look: AgentLook): CharacterModel {
    if (!this.model) {
      this.model = new CharacterModel(look);
      this.model.root.rotation.y = FACING;
      this.flash = new Sprite(new SpriteMaterial({ map: flareSprite(), color: new Color('#ffd890'), blending: AdditiveBlending, depthWrite: false, transparent: true }));
      this.flash.visible = false;
      this.scene.add(this.model.root, this.flash);
    }
    return this.model;
  }

  /** Feet stay near the bottom of the box; prone and slides pull the camera back and up to fit the body. */
  private frame(low: number) {
    const x = -0.12 - 0.08 * low, y = 0.98 - 0.6 * low;
    this.camera.position.set(x, y + 0.5 + 1.2 * low, 5.2 + 1.5 * low);
    this.camera.lookAt(x, y, 0);
  }

  private findMuzzle() {
    let node: Object3D | null = null;
    this.model?.root.traverse((o) => { if (!node && o.userData.muzzle) node = o; });
    this.muzzleNode = node;
    const data = (node as Object3D | null)?.userData ?? {};
    const id = this.modelHeld.split(':')[1] ?? '';
    this.flashSize = data.suppressed ? 0.07 : data.smallFlash ? 0.13 : id === 'hammer' || id === 'thumper' ? 0.42 : 0.24;
    if (this.flash) (this.flash.material as SpriteMaterial).color.set(id === 'disruptor' ? '#9aff6a' : '#ffd890');
  }

  private updateFlash(dt: number) {
    const flash = this.flash, node = this.muzzleNode;
    const on = this.flashT > 0 && !!flash && !!node;
    this.flashT = Math.max(0, this.flashT - dt);
    if (flash) flash.visible = on;
    this.flashLight.intensity = on ? 2.2 * this.flashSize / 0.24 : 0;
    if (!on) return;
    this.model!.root.updateMatrixWorld(true);
    const m = node!.userData.muzzle as { x: number; y: number; z: number };
    node!.localToWorld(this.tmp.set(m.x, m.y, m.z - 0.03));
    flash!.position.copy(this.tmp);
    flash!.scale.setScalar(this.flashSize * (0.75 + Math.random() * 0.5));
    (flash!.material as SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    this.flashLight.position.copy(this.tmp);
  }
}
