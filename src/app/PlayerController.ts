import { DEG, clamp, wrapAngle } from '../core/math';
import { emptyCommand, type Agent, type AgentCommand, type ActiveSlot } from '../sim/entities/Agent';
import type { Input } from './Input';
import type { Settings } from './Profile';
import type { UtilityId } from '../config/utilities';
import { MOVE } from '../config/movement';

/**
 * Turns raw input into AgentCommands for the local player. Mouse look is applied every render
 * frame for responsiveness; one-shot actions are latched until the next simulation tick consumes them.
 */
export class PlayerController {
  yaw = 0;
  pitch = 0;
  lastDX = 0;
  lastDY = 0;
  private leanState = 0;
  private adsState = false;
  private pendingSelect: ActiveSlot | null = null;
  private pendingGrenade: UtilityId | null = null;
  private pendingReload = false;
  private pendingDrop = false;
  private pendingLast = false;
  private pendingJump = false;
  private pendingSlide = false;
  private crouchHeldFor = 0;
  /** Toggle-crouch mode state: crouched / prone by a tap or hold, until changed. */
  private crouchToggled = false;
  private proneLatched = false;
  private crouchWasDown = false;
  private standRequest = false;
  private pendingFire = false;
  private pendingCycle = false;
  private pendingGadgetCycle = false;
  private pendingCams = false;
  private pendingCamCycle = 0;
  private pendingMelee = false;
  private pendingStim = false;
  private pendingStreak = false;
  private pendingDetonate = false;
  private pendingPing = false;
  private pendingLight = false;
  /** Set by the session: weapon inspect pressed this frame (presentation only). */
  inspectPressed = false;
  /** Extra sensitivity scale from the session (stun grenades make aiming sluggish). */
  sensMul = 1;
  /** Optional aim-assist hook (set by the session). */
  assist: ((yaw: number, pitch: number, dt: number, active: boolean) => { sens: number; yaw: number; pitch: number } | null) | null = null;

  constructor(private input: Input, private settings: Settings) {}

  setSettings(s: Settings) { this.settings = s; }

  syncFrom(agent: Agent) {
    this.yaw = agent.yaw; this.pitch = agent.pitch; this.leanState = 0; this.adsState = false; this.crouchHeldFor = 0; this.pendingSlide = false;
    this.crouchToggled = false; this.proneLatched = false; this.crouchWasDown = false; this.standRequest = false;
  }

  /** Toggle-crouch mode: is the player currently crouched / prone by toggle? (HUD hint text) */
  get stanceLatched() { return { crouch: this.crouchToggled, prone: this.proneLatched }; }

  /** Per render frame: mouse look + latch one-shot actions. `zoom` = current FOV divisor (1 unscoped). */
  frame(agent: Agent | null, zoom: number, dt = 1 / 60) {
    const { dx, dy, wheel } = this.input.consumeMouse();
    this.lastDX = dx; this.lastDY = dy;
    if (!agent || !agent.alive) return;
    const s = this.settings;
    const zs = zoom > 1 ? s.zoomSensitivity / zoom : 1;
    const inp0 = this.input, b = s.bindings;
    const active = dx !== 0 || dy !== 0 || inp0.isDown(b.left) || inp0.isDown(b.right) || inp0.isDown(b.forward) || inp0.isDown(b.back);
    const as = agent.operating === null && this.assist ? this.assist(this.yaw, this.pitch, dt, active) : null;
    const k = s.sensitivity * 0.022 * DEG * zs * (as ? as.sens : 1) * this.sensMul;
    this.yaw = wrapAngle(this.yaw - dx * k + (as ? as.yaw : 0));
    this.pitch = clamp(this.pitch - dy * k * (s.invertY ? -1 : 1) + (as ? as.pitch : 0), -89 * DEG, 89 * DEG);

    const inp = this.input;
    const crouchDown = inp.action('crouch');
    if (s.crouchMode === 'toggle') {
      // CoD: tap toggles crouch, holding drops to prone (stays prone), tap from prone → crouch
      if (crouchDown) {
        this.crouchHeldFor += Math.min(dt, 0.1);
        if (!this.proneLatched && this.crouchHeldFor >= MOVE.proneHoldTime * 0.75) { this.proneLatched = true; this.crouchToggled = true; }
      } else if (this.crouchWasDown) {
        const wasTap = this.crouchHeldFor < MOVE.proneHoldTime * 0.75;
        if (wasTap) {
          if (this.proneLatched) { this.proneLatched = false; this.crouchToggled = true; }
          else this.crouchToggled = !this.crouchToggled;
        }
        this.crouchHeldFor = 0;
      }
      // Space from prone or a toggled crouch stands you up instead of jumping
      if (inp.actionPressed('jump') && (this.proneLatched || this.crouchToggled)) {
        const fromProne = this.proneLatched;
        this.proneLatched = false; this.crouchToggled = false;
        if (fromProne) this.standRequest = true;
      }
    } else {
      // CS hold-to-crouch: keep holding while still to go prone. Moving, firing or aiming
      // restarts the timer, so crouch-walking and crouch-spraying never drop you prone.
      const busy = inp.action('forward') || inp.action('back') || inp.action('left') || inp.action('right') || inp.isDown('Mouse0') || inp.isDown('Mouse2');
      if (!crouchDown) this.crouchHeldFor = 0;
      else if (busy && !agent.prone) this.crouchHeldFor = 0;
      else this.crouchHeldFor += Math.min(dt, 0.1);
    }
    this.crouchWasDown = crouchDown;
    if (inp.gameFocus && inp.wasPressed('Mouse0')) this.pendingFire = true;
    if (inp.actionPressed('primary')) this.pendingSelect = 'primary';
    if (inp.actionPressed('secondary')) this.pendingSelect = 'secondary';
    if (inp.actionPressed('melee')) this.pendingSelect = 'melee';
    if (inp.actionPressed('bomb')) this.pendingSelect = 'bomb';
    if (inp.actionPressed('grenade')) this.pendingCycle = true;
    if (inp.actionPressed('gadget')) this.pendingGadgetCycle = true;
    if (inp.actionPressed('cams')) this.pendingCams = true;
    if (inp.actionPressed('reload')) this.pendingReload = true;
    if (inp.actionPressed('drop')) this.pendingDrop = true;
    if (inp.actionPressed('lastWeapon')) this.pendingLast = true;
    if (inp.actionPressed('jump') && !this.standRequest) this.pendingJump = true;
    this.standRequest = false;
    if (inp.actionPressed('slide')) this.pendingSlide = true;
    if (inp.actionPressed('quickMelee')) this.pendingMelee = true;
    if (inp.actionPressed('stimSelf')) this.pendingStim = true;
    if (inp.actionPressed('killstreak')) this.pendingStreak = true;
    if (inp.actionPressed('detonate')) this.pendingDetonate = true;
    if (inp.actionPressed('ping')) this.pendingPing = true;
    if (inp.actionPressed('light')) this.pendingLight = true;
    if (inp.actionPressed('inspect')) this.inspectPressed = true;
    if (agent.operating !== null) {
      // while watching feeds: Q/E or the wheel switch cameras
      if (inp.actionPressed('leanLeft') || wheel < 0) this.pendingCamCycle = -1;
      if (inp.actionPressed('leanRight') || wheel > 0) this.pendingCamCycle = 1;
      return;
    }
    if (wheel !== 0) this.pendingSelect = this.cycleSlot(agent, wheel > 0 ? 1 : -1);
    if (s.leanToggle) {
      if (inp.actionPressed('leanLeft')) this.leanState = this.leanState === -1 ? 0 : -1;
      if (inp.actionPressed('leanRight')) this.leanState = this.leanState === 1 ? 0 : 1;
    }
    if (s.adsToggle && inp.wasPressed('Mouse2')) this.adsState = !this.adsState;
    if (agent.active !== 'primary' && agent.active !== 'secondary') this.adsState = false;
  }

  private cycleSlot(a: Agent, dir: number): ActiveSlot | null {
    const order: ActiveSlot[] = ['primary', 'secondary', 'melee', 'grenade', 'gadget', 'bomb'];
    const has = (s: ActiveSlot) => s === 'melee' || (s === 'primary' && !!a.primary) || (s === 'secondary' && !!a.secondary) ||
      (s === 'grenade' && a.totalGrenades() > 0) || (s === 'gadget' && a.totalGadgets() > 0) || (s === 'bomb' && a.hasBomb);
    let i = order.indexOf(a.active);
    for (let n = 0; n < order.length; n++) {
      i = (i + dir + order.length) % order.length;
      if (has(order[i])) return order[i];
    }
    return null;
  }

  selectGrenade(kind: UtilityId) { this.pendingGrenade = kind; }

  /** Per simulation tick. */
  command(agent: Agent | null): AgentCommand {
    const cmd = emptyCommand();
    cmd.yaw = this.yaw; cmd.pitch = this.pitch;
    if (!agent || !agent.alive) return cmd;
    const inp = this.input, s = this.settings;
    cmd.forward = (inp.action('forward') ? 1 : 0) - (inp.action('back') ? 1 : 0);
    cmd.right = (inp.action('right') ? 1 : 0) - (inp.action('left') ? 1 : 0);
    cmd.jump = this.pendingJump || inp.action('jump');
    if (s.crouchMode === 'toggle') {
      cmd.crouch = this.crouchToggled || this.proneLatched || inp.action('crouch');
      cmd.prone = this.proneLatched;
    } else {
      cmd.crouch = inp.action('crouch');
      cmd.prone = cmd.crouch && (this.crouchHeldFor >= MOVE.proneHoldTime || (agent.prone && this.crouchHeldFor > 0));
    }
    cmd.slide = this.pendingSlide;
    cmd.walk = inp.action('walk');
    cmd.use = inp.action('use');
    cmd.lean = agent.operating !== null ? 0 : s.leanToggle ? this.leanState : (inp.action('leanRight') ? 1 : 0) - (inp.action('leanLeft') ? 1 : 0);
    cmd.fire = inp.gameFocus && (this.pendingFire || inp.isDown('Mouse0'));
    const isGun = (agent.active === 'primary' || agent.active === 'secondary') && !agent.activeWeapon()?.def.scope;
    cmd.alt = isGun && s.adsToggle ? this.adsState : inp.gameFocus && inp.isDown('Mouse2');
    cmd.select = this.pendingSelect;
    cmd.selectGrenade = this.pendingGrenade;
    cmd.cycleGrenade = this.pendingCycle && !this.pendingSelect;
    if (this.pendingCycle && agent.active !== 'grenade') { cmd.select = 'grenade'; cmd.cycleGrenade = false; }
    if (this.pendingGadgetCycle) { if (agent.active === 'gadget') cmd.cycleGadget = true; else cmd.select = 'gadget'; }
    cmd.cams = this.pendingCams;
    cmd.camCycle = this.pendingCamCycle;
    cmd.reload = this.pendingReload;
    cmd.drop = this.pendingDrop;
    cmd.lastWeapon = this.pendingLast;
    cmd.quickMelee = this.pendingMelee; cmd.stimSelf = this.pendingStim;
    cmd.killstreak = this.pendingStreak; cmd.detonate = this.pendingDetonate;
    cmd.ping = this.pendingPing;
    cmd.light = this.pendingLight;
    this.pendingLight = false;
    this.pendingMelee = this.pendingStim = this.pendingStreak = this.pendingDetonate = this.pendingPing = false;
    this.pendingSelect = null; this.pendingGrenade = null; this.pendingReload = false; this.pendingDrop = false;
    this.pendingLast = false; this.pendingJump = false; this.pendingCycle = false;
    this.pendingFire = false;
    this.pendingSlide = false;
    this.pendingGadgetCycle = false; this.pendingCams = false; this.pendingCamCycle = 0;
    return cmd;
  }
}
