import { Vector3 } from 'three';
import { UTILITY_ORDER, type UtilityId } from '../../config/utilities';
import { GADGET_ORDER, GADGET_TUNING, type GadgetId } from '../../config/gadgets';
import { UTILITY_TUNING } from '../../config/utilities';
import type { ActiveSlot, Agent, AgentCommand } from '../entities/Agent';
import type { SimContext } from '../SimContext';
import { fireGun, inaccuracy, knifeAttack } from './Ballistics';
import { healWithStim } from './Ordnance';
import { punchAt } from './recoil';

/** Switch the held item. Returns false if the slot is empty. */
export function equip(ctx: SimContext, a: Agent, slot: ActiveSlot, grenade: UtilityId | null = null, gadget: GadgetId | null = null): boolean {
  if (slot === 'primary' && !a.primary) return false;
  if (slot === 'secondary' && !a.secondary) return false;
  if (slot === 'bomb' && !a.hasBomb) return false;
  if (slot === 'grenade') {
    const g = grenade && a.grenades[grenade] > 0 ? grenade : UTILITY_ORDER.find((k) => a.grenades[k] > 0) ?? null;
    if (!g) return false;
    if (a.active === 'grenade' && a.activeGrenade === g) return true;
    grenade = g;
  } else if (slot === 'gadget') {
    const g = gadget && a.gadgets[gadget] > 0 ? gadget : GADGET_ORDER.find((k) => a.gadgets[k] > 0) ?? null;
    if (!g) return false;
    if (a.active === 'gadget' && a.activeGadget === g) return true;
    gadget = g;
  } else if (slot === a.active) return true;
  if (a.active !== slot) a.lastActive = a.active;
  a.active = slot;
  a.activeGrenade = slot === 'grenade' ? grenade : null;
  a.activeGadget = slot === 'gadget' ? gadget : null;
  const w = a.activeWeapon();
  const draw = w ? Math.min(w.def.drawTime, 1.0) : 0.45;
  Object.assign(a.wpn, { drawUntil: ctx.time + draw, reloadUntil: 0, scope: 0, rescopeAt: 0, ads: false, throwPrimed: 0, pendingSwitchBack: 0, triggerLatched: true, burstLeft: 0,
    recoilIdx: 0, fireInacc: 0, lastShot: -10 });
  a.aimPunchPitch = a.aimPunchYaw = 0;
  a.isPlanting = false;
  ctx.events.emit('draw', { agentId: a.id, weaponId: w ? w.def.id : slot === 'grenade' ? grenade! : slot === 'gadget' ? gadget! : 'bomb' });
  return true;
}

/** Pick the best weapon to hold when the current item disappears. */
export function equipBest(ctx: SimContext, a: Agent) {
  if (!equip(ctx, a, 'primary') && !equip(ctx, a, 'secondary')) equip(ctx, a, 'melee');
}

function cycleGadget(ctx: SimContext, a: Agent) {
  const avail = GADGET_ORDER.filter((k) => a.gadgets[k] > 0);
  if (!avail.length) return;
  if (a.active !== 'gadget' || !a.activeGadget) { equip(ctx, a, 'gadget', null, avail[0]); return; }
  const i = avail.indexOf(a.activeGadget);
  equip(ctx, a, 'gadget', null, avail[(i + 1) % avail.length]);
}

function cycleGrenade(ctx: SimContext, a: Agent) {
  const avail = UTILITY_ORDER.filter((k) => a.grenades[k] > 0);
  if (!avail.length) return;
  if (a.active !== 'grenade' || !a.activeGrenade) { equip(ctx, a, 'grenade', avail[0]); return; }
  const i = avail.indexOf(a.activeGrenade);
  equip(ctx, a, 'grenade', avail[(i + 1) % avail.length]);
}

/** Per-tick weapon state machine for one agent. Bomb planting is handled by the mode. */
export function updateWeapon(ctx: SimContext, a: Agent, cmd: AgentCommand, dt: number): void {
  const now = ctx.time;
  const wpn = a.wpn;

  // ---- selection ------------------------------------------------------------------
  if (cmd.select) {
    if (cmd.select === 'grenade') { if (a.active === 'grenade') cycleGrenade(ctx, a); else equip(ctx, a, 'grenade', cmd.selectGrenade); }
    else equip(ctx, a, cmd.select);
  } else if (cmd.selectGrenade) equip(ctx, a, 'grenade', cmd.selectGrenade);
  else if (cmd.cycleGrenade) cycleGrenade(ctx, a);
  if (cmd.selectGadget) equip(ctx, a, 'gadget', null, cmd.selectGadget);
  else if (cmd.cycleGadget) cycleGadget(ctx, a);
  if (cmd.lastWeapon) equip(ctx, a, a.lastActive) || equipBest(ctx, a);

  // ---- drop ------------------------------------------------------------------------
  if (cmd.drop && (a.active === 'primary' || a.active === 'secondary')) {
    const w = a.activeWeapon()!;
    if (a.active === 'primary') a.primary = null; else a.secondary = null;
    ctx.dropWeapon(a, w, true);
    equipBest(ctx, a);
  }

  const w = a.activeWeapon();
  const frozen = ctx.isFrozen();
  // Defusing occupies both hands. Releasing Use lets the weapon respond immediately.
  if (a.isDefusing && cmd.use) {
    wpn.ads = false; wpn.scope = 0; wpn.throwPrimed = 0;
    wpn.triggerLatched = cmd.fire;
    return;
  }

  // ---- actions that work whatever you're holding ------------------------------------------
  if (cmd.detonate && !frozen) ctx.gadgets.detonateC4(a);
  if (cmd.light) a.lightOn = !a.lightOn;
  if (a.lightOn && !w?.def.mods?.light) a.lightOn = false;
  if (cmd.stimSelf && !frozen && a.gadgets.stim > 0 && now >= a.stimReadyAt && now >= wpn.meleeUntil && a.health < 100) {
    a.gadgets.stim--;
    a.stimReadyAt = now + 0.9;
    healWithStim(ctx, a, a, true);
  }
  if (cmd.quickMelee && !frozen && now >= wpn.meleeReadyAt && !a.isPlanting && !a.isDefusing) {
    // Quick melee (R6 / CoD style): lower the gun, stab, bring it back up.
    wpn.meleeUntil = now + 0.42;
    wpn.meleeReadyAt = now + 0.78;
    wpn.reloadUntil = 0; wpn.ads = false; wpn.scope = 0; wpn.rescopeAt = 0; wpn.throwPrimed = 0; wpn.burstLeft = 0;
    const hit = knifeAttack(ctx, a, false, true);
    ctx.events.emit('quickMelee', { agentId: a.id, hit });
  }
  if (now < wpn.meleeUntil) { wpn.triggerLatched = true; return; }

  // ---- grenades ------------------------------------------------------------------------
  if (a.active === 'grenade') {
    const kind = a.activeGrenade;
    a.aimPunchPitch = a.aimPunchYaw = 0;
    if (!kind || a.grenades[kind] <= 0) {
      if (wpn.pendingSwitchBack === 0 || now >= wpn.pendingSwitchBack) {
        if (!equip(ctx, a, 'grenade')) equip(ctx, a, a.lastActive === 'grenade' ? 'melee' : a.lastActive) || equipBest(ctx, a);
      }
      return;
    }
    if (now < wpn.drawUntil || frozen) return;
    const mask = ((cmd.fire ? 1 : 0) | (cmd.alt ? 2 : 0)) as 0 | 1 | 2 | 3;
    if (mask) wpn.throwPrimed = mask;
    else if (wpn.throwPrimed) {
      const strength = wpn.throwPrimed === 1 ? 1 : wpn.throwPrimed === 2 ? 0.45 : 0.72;
      if (kind === 'tknife') ctx.ordnance.throwKnife(a, strength);
      else ctx.utility.throwGrenade(a, kind, strength);
      a.grenades[kind]--;
      wpn.throwPrimed = 0;
      wpn.pendingSwitchBack = now + 0.45;
      if (a.grenades[kind] <= 0) a.activeGrenade = null;
    }
    return;
  }
  // ---- gadgets ------------------------------------------------------------------------
  if (a.active === 'gadget') {
    const kind = a.activeGadget;
    a.aimPunchPitch = a.aimPunchYaw = 0;
    if (!kind || a.gadgets[kind] <= 0) {
      if (wpn.pendingSwitchBack === 0 || now >= wpn.pendingSwitchBack) {
        if (!equip(ctx, a, 'gadget')) equip(ctx, a, a.lastActive === 'gadget' ? 'melee' : a.lastActive) || equipBest(ctx, a);
      }
      return;
    }
    if (now < wpn.drawUntil || frozen) return;
    if (kind === 'heartbeat') { heartbeatSweep(ctx, a); return; }
    if (kind === 'stim') {
      // Stim pistol: one dart chambered, auto-reloads from the reserve.
      if (cmd.fire && !wpn.triggerLatched && now >= a.stimReadyAt) {
        wpn.triggerLatched = true;
        ctx.ordnance.fireStim(a);
        a.gadgets.stim--;
        a.stimReadyAt = now + GADGET_TUNING.stimReload;
        ctx.events.emit('gadgetDeploy', { agentId: a.id, kind: 'stim', pos: a.eyePos(new Vector3()) });
        if (a.gadgets.stim <= 0) { wpn.pendingSwitchBack = now + 0.5; a.activeGadget = null; }
      }
      if (!cmd.fire) wpn.triggerLatched = false;
      return;
    }
    if (cmd.fire && !wpn.triggerLatched) {
      wpn.triggerLatched = true;
      if (ctx.gadgets.deploy(a, kind)) {
        a.gadgets[kind]--;
        wpn.pendingSwitchBack = now + 0.45;
        if (a.gadgets[kind] <= 0) a.activeGadget = null;
      } else ctx.events.emit('dryFire', { agentId: a.id });
    }
    if (!cmd.fire) wpn.triggerLatched = false;
    return;
  }
  if (!w) return; // bomb slot

  // ---- recoil & inaccuracy recovery ---------------------------------------------------
  const def = w.def;
  wpn.fireInacc *= Math.exp(-dt * 3 / Math.max(0.05, def.spread.recovery));
  const cycle = 60 / def.rpm;
  if (now - wpn.lastShot > cycle + 0.03) wpn.recoilIdx = Math.max(0, wpn.recoilIdx - dt * (5 + wpn.recoilIdx * 3.5));
  const braced = def.mods?.bipod && a.crouched && a.speed2D < 0.6 ? 0.6 : 1;
  const punch = punchAt(def, wpn.recoilIdx);
  a.aimPunchPitch = punch.pitch * braced;
  a.aimPunchYaw = punch.yaw * braced;

  if (def.class === 'knife') {
    if (frozen || now < wpn.drawUntil) return;
    if (cmd.alt && now >= wpn.nextAttack) { wpn.nextAttack = now + 1.0; knifeAttack(ctx, a, true); }
    else if (cmd.fire && now >= wpn.nextAttack) { wpn.nextAttack = now + 0.5; knifeAttack(ctx, a, false); }
    return;
  }

  // ---- reload ---------------------------------------------------------------------------
  if (wpn.reloadUntil > 0 && now >= wpn.reloadUntil) {
    const take = Math.min(def.mag - w.mag, w.reserve);
    w.mag += take; w.reserve -= take;
    wpn.reloadUntil = 0;
    wpn.recoilIdx = 0;
    wpn.fireInacc = 0;
    a.aimPunchPitch = a.aimPunchYaw = 0;
  }
  const reloading = wpn.reloadUntil > now;
  const wantReload = cmd.reload || (cmd.fire && w.mag === 0 && !wpn.triggerLatched);
  if (wantReload && !reloading && w.mag < def.mag && w.reserve > 0 && now >= wpn.drawUntil) {
    wpn.reloadUntil = now + def.reloadTime;
    wpn.burstLeft = 0;
    wpn.scope = 0; wpn.rescopeAt = 0; wpn.ads = false;
    ctx.events.emit('reload', { agentId: a.id, weaponId: def.id });
    ctx.noise(a.pos, 8, a, 'reload');
    return;
  }

  // ---- scope / aim-down-sights -------------------------------------------------------------
  const altPressed = cmd.alt && !wpn.altLatched;
  wpn.altLatched = cmd.alt;
  if (def.scope) {
    if (wpn.rescopeAt > 0 && now >= wpn.rescopeAt) { wpn.scope = wpn.rescopeLevel || 1; wpn.rescopeAt = 0; }
    if (altPressed && !reloading && now >= wpn.drawUntil) {
      wpn.scope = (wpn.scope + 1) % (def.scope.zooms.length + 1);
      wpn.rescopeAt = 0;
      ctx.events.emit('scope', { agentId: a.id, level: wpn.scope });
    }
  } else {
    wpn.ads = cmd.alt && !reloading && now >= wpn.drawUntil;
  }

  // ---- fire ------------------------------------------------------------------------------------
  // A burst, once started, finishes even if the trigger is released (Famas / M16 style).
  const bursting = !!def.burst && wpn.burstLeft > 0;
  if (!cmd.fire) { wpn.triggerLatched = false; if (!bursting) return; }
  if (frozen || reloading || now < wpn.drawUntil || now < wpn.nextAttack) return;
  if (!def.auto && wpn.triggerLatched && !bursting) return;
  if (a.motor.mantle) return; // hands are busy climbing
  if (w.mag <= 0) {
    if (!wpn.triggerLatched) ctx.events.emit('dryFire', { agentId: a.id });
    wpn.triggerLatched = true;
    wpn.burstLeft = 0;
    return;
  }
  w.mag--;
  if (cmd.fire) wpn.triggerLatched = true;
  if (def.burst) {
    if (!bursting) wpn.burstLeft = def.burst.count;
    wpn.burstLeft--;
    // inside the burst: fast cadence; after the last round: the slower trigger cadence
    wpn.nextAttack = now + (wpn.burstLeft > 0 ? 60 / def.burst.rpm : cycle);
  } else {
    // Carry the sub-tick remainder during a continuous burst. Scheduling from "now"
    // rounds every shot up to a tick and made a 600 RPM rifle run at ~549 RPM.
    const continuous = def.auto && now - wpn.lastShot <= cycle + dt + 1e-6;
    wpn.nextAttack = (continuous ? Math.max(now - dt, wpn.nextAttack) : now) + cycle;
  }
  if (def.projectile) {
    ctx.ordnance.fireLauncher(a, def.id, inaccuracy(def, a));
    const eye = a.eyePos(new Vector3());
    ctx.events.emit('shot', { agentId: a.id, weaponId: def.id, sound: def.sound, origin: eye, end: eye.clone().add(a.viewDir(new Vector3()).multiplyScalar(2)), tracer: false, pellet: false });
    ctx.noise(eye, 45, a, 'gunshot');
  } else fireGun(ctx, a, def);
  wpn.recoilIdx += 1;
  const firedPunch = punchAt(def, wpn.recoilIdx);
  a.aimPunchPitch = firedPunch.pitch * braced;
  a.aimPunchYaw = firedPunch.yaw * braced;
  wpn.lastShot = now;
  wpn.fireInacc += def.spread.perShot;
  if (def.scope && wpn.scope > 0 && !def.scope.stay) {
    const lvl = wpn.scope;
    wpn.scope = 0;
    wpn.rescopeAt = w.mag > 0 ? now + cycle : 0;
    wpn.rescopeLevel = lvl;
  }
}

/**
 * Heartbeat sensor (held): every sweep, record enemies within range in front of you, through
 * walls. The tablet's beep is audible to anyone close by.
 */
function heartbeatSweep(ctx: SimContext, a: Agent) {
  const now = ctx.time;
  if (now < a.heartbeatNext) return;
  a.heartbeatNext = now + UTILITY_TUNING.heartbeatInterval;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  const blips: { id: number; x: number; z: number }[] = [];
  for (const e of ctx.agents) {
    if (!e.alive || e.team === a.team) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > UTILITY_TUNING.heartbeatRange || Math.abs(e.pos.y - a.pos.y) > 4) continue;
    if (d > 1 && (dx * fx + dz * fz) / d < Math.cos(75 * Math.PI / 180)) continue; // 150° frontal sweep
    blips.push({ id: e.id, x: e.pos.x, z: e.pos.z });
  }
  a.heartbeat = { at: now, blips };
  ctx.events.emit('heartbeatScan', { agentId: a.id, count: blips.length });
  ctx.noise(a.pos, 7, a, 'reload');
}
