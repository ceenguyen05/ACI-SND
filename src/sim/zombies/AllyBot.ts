import { Vector3 } from 'three';
import { DIFFICULTY, type BotDifficulty, type DifficultyDef } from '../../config/difficulty';
import type { WeaponId } from '../../config/weapons';
import { PERKS, PERK_LIMIT, ARMORY, FORGE_PRICE, type ArmoryId, type PerkId } from '../../config/zombies';
import { DEG, angleDiff, clamp, wrapAngle, yawTo } from '../../core/math';
import { emptyCommand, type Agent, type AgentCommand, type WeaponInstance } from '../entities/Agent';
import type { NavPoint } from '../ai/NavGrid';
import type { ZombiesMatch } from './ZombiesMatch';

/** Rough usefulness of each gun against zombies (bots upgrade toward the top). */
const SCORE: Partial<Record<WeaponId, number>> = {
  p30: 1, judge: 2, viper: 2.2, breacher: 3, vespa: 3.2, hornet: 3.4, kestrel: 3, mako: 3.8, galeforce: 4, tempest: 4.2, talon: 4.3,
  marshal: 4.5, reaper: 4.6, longbow: 3.4, hammer: 3.6, thumper: 4, sentinel: 5, ravager: 5.2, bulwark: 5.5, anvil: 5.6, disruptor: 7,
};
const PERK_PRIORITY: Record<PerkId, number> = { ironGut: 10, secondWind: 8, rapidFire: 7, quickHands: 6, deadEye: 4, shockCharge: 3.5, marathon: 3, blastShield: 2 };

export const weaponScore = (w: WeaponInstance | null) => (w ? (SCORE[w.def.id] ?? 2) * ((w.def.tier ?? 0) > 0 ? 2 : 1) : 0);

interface Goal { kind: 'perk' | 'wall' | 'ammo' | 'armory' | 'forge' | 'forgeTake' | 'box' | 'boxTake' | 'powerUp' | 'gate' | 'power'; x: number; z: number; ref: number; armory?: ArmoryId; until: number }

const tmp = new Vector3(), tmp2 = new Vector3();

/**
 * Bot teammate for Zombies: shoots the nearest threat with the same aim model as the
 * Search & Destroy bots, backs away from zombies, revives downed teammates first,
 * picks up power-ups, follows the player, and spends its points on perks, wall weapons,
 * armor and the Prototype Forge between fights.
 */
export class AllyBot {
  private diff: DifficultyDef;
  private yaw = 0; private pitch = 0;
  private target: Agent | null = null;
  private reactionAt = 0;
  private errYaw = 0; private errPitch = 0;
  private aimHead = false;
  private semi = false;
  private burstPause = 0;
  private path: NavPoint[] | null = null;
  private pathIdx = 0;
  private goalX = NaN; private goalZ = NaN;
  private repathAt = 0;
  private stuckAt = 0; private stuckPos = new Vector3(); private unstickUntil = 0; private unstickDir = 1;
  private goal: Goal | null = null;
  private nextShop = 0;
  private skip = new Map<string, number>();
  private throwStage = 0; private throwUntil = 0; private throwAt: Vector3 | null = null; private nextFrag = 0;
  private slot: number;

  constructor(readonly agent: Agent, private m: ZombiesMatch, difficulty: BotDifficulty) {
    this.diff = DIFFICULTY[difficulty];
    this.slot = m.humans.length;
  }

  reset() {
    this.yaw = this.agent.yaw; this.pitch = 0; this.target = null; this.path = null; this.goal = null; this.throwStage = 0;
  }

  think(dt: number): AgentCommand {
    const a = this.agent, m = this.m;
    const cmd = emptyCommand();
    if (!a.alive) { cmd.yaw = this.yaw; cmd.pitch = this.pitch; return cmd; }
    const zp = a.zp!;
    this.perceive();

    if (zp.downed) {
      // last stand: shoot what you can, crawl toward help
      if (this.target) this.engage(cmd, dt, false);
      const mate = m.standing().reduce<Agent | null>((b, h) => (!b || h.pos.distanceTo(a.pos) < b.pos.distanceTo(a.pos) ? h : b), null);
      if (mate && !this.target) { this.lookAt(mate.pos.x, mate.pos.y + 1, mate.pos.z, dt, 4); this.moveDirect(cmd, mate.pos.x, mate.pos.z); }
      return this.finish(cmd);
    }

    if (this.throwStage) { this.runThrow(cmd, dt); return this.finish(cmd); }

    // 1) get away from a lit bomber, gas and acid
    const danger = this.danger();
    // 2) revive
    const downed = m.humans.filter((h) => h !== a && h.alive && h.zp!.downed && (!h.zp!.revive || h.zp!.revive.byId === a.id))
      .sort((p, q) => p.pos.distanceTo(a.pos) - q.pos.distanceTo(a.pos))[0];
    const close = this.nearestZombie();
    if (downed && !danger) {
      const d = Math.hypot(downed.pos.x - a.pos.x, downed.pos.z - a.pos.z);
      const swarmed = close && close.d < 1.6 && a.health < a.maxHealth * 0.45;
      if (!swarmed) {
        if (d < 1.15 && m.interactionFor(a)?.kind === 'revive') {
          cmd.use = true;
          this.lookAt(downed.pos.x, downed.pos.y + 0.3, downed.pos.z, dt, 6);
          return this.finish(cmd);
        }
        if (this.target && this.target.pos.distanceTo(a.pos) < 4) this.engage(cmd, dt, false);
        this.moveTo(cmd, downed.pos.x, downed.pos.z, dt, 0.9);
        return this.finish(cmd);
      }
    }
    // Extraction is an order: fire while moving to the LZ, then defend it. Do not
    // abandon the helicopter to shop, chase a power-up or follow a distant player.
    if (m.exfil.phase === 'called' || m.exfil.phase === 'holding') {
      this.goal = null;
      if (this.target) this.engage(cmd, dt, false);
      if (danger) this.flee(cmd, danger);
      else if (Math.hypot(a.pos.x - m.layout.lz.x, a.pos.z - m.layout.lz.z) > 2.5) this.moveTo(cmd, m.layout.lz.x, m.layout.lz.z, dt, 1.5);
      this.maintain(cmd);
      return this.finish(cmd);
    }
    // 3) fight
    if (this.target) {
      this.engage(cmd, dt, true);
      this.considerFrag(cmd);
      if (danger) this.flee(cmd, danger);
      return this.finish(cmd);
    }
    if (danger) { this.flee(cmd, danger); this.maintain(cmd); return this.finish(cmd); }
    // 4) power-ups, shopping, following
    const pu = m.powerUps.find((p) => p.pos.distanceTo(a.pos) < 14);
    if (pu && (!close || close.d > 5)) { this.moveTo(cmd, pu.pos.x, pu.pos.z, dt, 0.4); this.maintain(cmd); return this.finish(cmd); }
    if (!close || close.d > 12 || m.wavePhase === 'intermission') {
      if (this.shop(cmd, dt)) return this.finish(cmd);
    } else this.goal = null;
    this.follow(cmd, dt);
    this.maintain(cmd);
    return this.finish(cmd);
  }

  private finish(cmd: AgentCommand) {
    cmd.yaw = this.yaw;
    cmd.pitch = clamp(this.pitch, -1.5, 1.5);
    return cmd;
  }

  // ------------------------------------------------------------------ perception
  private nearestZombie(): { z: Agent; d: number } | null {
    let best: Agent | null = null, bd = Infinity;
    for (const z of this.m.zombiePool) {
      if (!z.alive) continue;
      const d = Math.hypot(z.pos.x - this.agent.pos.x, z.pos.z - this.agent.pos.z);
      if (d < bd) { bd = d; best = z; }
    }
    return best ? { z: best, d: bd } : null;
  }

  private perceive() {
    const a = this.agent, m = this.m, now = m.time;
    const list = m.zombiePool.filter((z) => z.alive && z.pos.distanceTo(a.pos) < 42)
      .map((z) => {
        const d = z.pos.distanceTo(a.pos), zs = z.zombie!;
        // threats first: a lit bomber, anything mauling a teammate, then the closest
        let s = d;
        if (zs.kind === 'bomber') s -= 8;
        if (zs.kind === 'shrieker' || zs.kind === 'spitter') s -= 4;
        if (zs.mode === 'attack' || zs.mode === 'fuse') s -= 5;
        return { z, s };
      })
      .sort((p, q) => p.s - q.s)
      .slice(0, 6);
    let pick: Agent | null = null;
    for (const { z } of list) if (m.los(a, z)) { pick = z; break; }
    if (pick && pick !== this.target) {
      this.target = pick;
      const off = Math.abs(angleDiff(this.yaw, yawTo(pick.pos.x - a.pos.x, pick.pos.z - a.pos.z))) / DEG;
      this.reactionAt = now + this.diff.reaction * (off > 60 ? 1.3 : 0.8) * (0.7 + m.rng.next() * 0.5);
      const err = this.diff.aimError * (0.6 + m.rng.next() * 0.8), ang = m.rng.next() * Math.PI * 2;
      this.errYaw = Math.cos(ang) * err; this.errPitch = Math.sin(ang) * err * 0.6;
      this.aimHead = m.rng.next() < this.diff.headRatio + 0.15;
    }
    if (!pick) this.target = null;
  }

  private danger(): Vector3 | null {
    const a = this.agent, m = this.m;
    for (const z of m.zombiePool) if (z.alive && z.zombie!.mode === 'fuse' && z.pos.distanceTo(a.pos) < 7) return z.pos;
    for (const g of [...m.gas, ...m.acid]) if (Math.hypot(g.pos.x - a.pos.x, g.pos.z - a.pos.z) < g.radius + 0.6) return g.pos;
    return null;
  }

  private flee(cmd: AgentCommand, from: Vector3) {
    const a = this.agent;
    let dx = a.pos.x - from.x, dz = a.pos.z - from.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const d = this.walkableDir(dx, dz);
    this.moveDirect(cmd, a.pos.x + d.x * 3, a.pos.z + d.z * 3);
  }

  // ------------------------------------------------------------------ combat
  private engage(cmd: AgentCommand, dt: number, canMove: boolean) {
    const a = this.agent, e = this.target!, m = this.m, now = m.time;
    const eye = a.eyePos(tmp);
    const aim = e.aimPoint(this.aimHead && e.zombie!.kind !== 'crawler', tmp2);
    const tx = aim.x + e.vel.x * 0.08, tz = aim.z + e.vel.z * 0.08;
    const dx = tx - eye.x, dy = aim.y - eye.y, dz = tz - eye.z;
    const horiz = Math.hypot(dx, dz), dist = Math.hypot(horiz, dy);
    const wantYaw = yawTo(dx, dz), wantPitch = Math.atan2(dy, horiz);
    const decay = Math.exp(-this.diff.errorDecay * dt);
    this.errYaw *= decay; this.errPitch *= decay;
    const comp = this.diff.sprayControl;
    this.aimTowards(wantYaw + this.errYaw * DEG - a.aimPunchYaw * DEG * comp, wantPitch + this.errPitch * DEG - a.aimPunchPitch * DEG * comp, this.diff.aimSpeed * 1.2, dt);

    // weapon choice
    let w = a.activeWeapon();
    const usable = (x: WeaponInstance | null) => !!x && x.def.class !== 'knife' && (x.mag > 0 || x.reserve > 0);
    const zp = a.zp!;
    if (!zp.downed) {
      const best = [a.primary, a.secondary].filter(usable).sort((p, q) => weaponScore(q) - weaponScore(p))[0] ?? null;
      const launcherClose = (x: WeaponInstance | null) => !!x?.def.projectile && x.def.id !== 'disruptor' && dist < 7;
      if (a.active === 'grenade' || a.active === 'gadget' || !usable(w) || launcherClose(w)) {
        const alt = [a.primary, a.secondary].filter((x) => usable(x) && !launcherClose(x))[0];
        if (alt) cmd.select = alt === a.primary ? 'primary' : 'secondary';
        else if (a.active !== 'melee') cmd.select = 'melee';
        w = null;
      } else if (best && best !== w && (w?.mag ?? 0) > 0 && dist > 6) {
        cmd.select = best === a.primary ? 'primary' : 'secondary';
      }
    }
    if (w && w.mag === 0 && w.reserve > 0) cmd.reload = true;

    const errAngle = Math.hypot(angleDiff(this.yaw + a.aimPunchYaw * DEG * comp, wantYaw), (this.pitch + a.aimPunchPitch * DEG * comp) - wantPitch);
    const tol = Math.atan2(this.aimHead ? 0.2 : 0.35, dist) + 0.01;
    const ready = now >= this.reactionAt && errAngle < tol * (now - a.wpn.lastShot < 0.25 ? 2.6 : 1.4);
    if (a.active === 'melee') cmd.fire = dist < 1.8;
    else if (w && ready) {
      if (!w.def.auto) { this.semi = !this.semi; cmd.fire = this.semi; }
      else if (dist > 24 && w.def.class !== 'smg' && w.def.class !== 'lmg') {
        cmd.fire = now >= this.burstPause;
        if (now - a.wpn.lastShot < 0.02 && m.rng.chance(0.25)) this.burstPause = now + 0.25;
      } else cmd.fire = true;
    }
    if (!zp.downed && dist < 1.5 && now >= a.wpn.meleeReadyAt && (!w || w.mag === 0 || a.wpn.reloadUntil > now || m.rng.chance(0.05))) { cmd.quickMelee = true; cmd.fire = false; }
    if (!canMove) return;

    // movement: kite backwards out of reach, stay near the squad
    const near = this.nearestZombie();
    if (near && near.d < 4.2) {
      let ax = 0, az = 0;
      for (const z of m.zombiePool) {
        if (!z.alive) continue;
        const ox = a.pos.x - z.pos.x, oz = a.pos.z - z.pos.z, d = Math.hypot(ox, oz);
        if (d < 6 && d > 0.01) { ax += (ox / d) * (6 - d); az += (oz / d) * (6 - d); }
      }
      const l = Math.hypot(ax, az) || 1;
      const dir = this.walkableDir(ax / l, az / l);
      this.moveDirect(cmd, a.pos.x + dir.x * 2.5, a.pos.z + dir.z * 2.5);
    } else {
      const leader = this.leader();
      if (leader && leader.pos.distanceTo(a.pos) > 9) this.moveTo(cmd, leader.pos.x, leader.pos.z, dt, 5, false);
      else if (dist > 4 && w && now - a.wpn.lastShot < 0.3) {
        // stop to shoot accurately
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        const vf = a.vel.x * fx + a.vel.z * fz, vr = a.vel.x * rx + a.vel.z * rz;
        cmd.forward = Math.abs(vf) > 0.6 ? -Math.sign(vf) : 0;
        cmd.right = Math.abs(vr) > 0.6 ? -Math.sign(vr) : 0;
      }
    }
  }

  private considerFrag(cmd: AgentCommand) {
    const a = this.agent, m = this.m, now = m.time;
    if (a.grenades.frag <= 0 || now < this.nextFrag || this.target?.pos.distanceTo(a.pos) === undefined) return;
    if (m.rng.next() > 0.05) return;
    // a cluster of 3+ zombies 7–20 m away
    for (const z of m.zombiePool) {
      if (!z.alive) continue;
      const d = z.pos.distanceTo(a.pos);
      if (d < 7 || d > 20) continue;
      const n = m.zombiePool.filter((o) => o.alive && o.pos.distanceTo(z.pos) < 3.5).length;
      if (n >= 3 && m.los(a, z)) {
        this.throwAt = z.pos.clone().addScaledVector(z.vel, 1.2);
        this.throwStage = 1; this.throwUntil = now + 0.6; this.nextFrag = now + 9;
        cmd.selectGrenade = 'frag';
        return;
      }
    }
  }

  private runThrow(cmd: AgentCommand, dt: number) {
    const a = this.agent, now = this.m.time, t = this.throwAt!;
    const eye = a.eyePos(tmp);
    const dx = t.x - eye.x, dz = t.z - eye.z, R = Math.max(1, Math.hypot(dx, dz)), h = t.y - eye.y;
    const v = 17, g = 10.3;
    const disc = v ** 4 - g * (g * R * R + 2 * h * v * v);
    let launch = disc < 0 ? Math.PI / 4 : Math.atan((v * v - Math.sqrt(disc)) / (g * R));
    launch = clamp(launch / DEG, -30, 60);
    const pitchDeg = launch >= 10 ? (launch - 10) * 9 / 8 : (launch - 10) * 0.9;
    const yaw = yawTo(dx, dz);
    if (a.grenades.frag <= 0 && this.throwStage < 3) { this.throwStage = 0; return; }
    if (this.throwStage === 1) {
      if (a.active !== 'grenade' || a.activeGrenade !== 'frag') cmd.selectGrenade = 'frag';
      this.aimTowards(yaw, pitchDeg * DEG, 10, dt);
      if (now >= this.throwUntil && now >= a.wpn.drawUntil && a.active === 'grenade') { this.throwStage = 2; this.throwUntil = now + 0.12; }
    } else if (this.throwStage === 2) {
      this.aimTowards(yaw, pitchDeg * DEG, 10, dt);
      cmd.fire = true;
      if (now >= this.throwUntil) { this.throwStage = 3; this.throwUntil = now + 0.5; }
    } else if (now >= this.throwUntil) { this.throwStage = 0; }
    if (now > this.throwUntil + 3) this.throwStage = 0;
  }

  private maintain(cmd: AgentCommand) {
    const a = this.agent;
    if (cmd.select) return;
    if (a.active === 'melee' || a.active === 'grenade' || a.active === 'gadget') {
      if (a.primary) cmd.select = 'primary'; else if (a.secondary) cmd.select = 'secondary';
      return;
    }
    const best = [a.primary, a.secondary].filter((x) => x && (x.mag > 0 || x.reserve > 0)).sort((p, q) => weaponScore(q) - weaponScore(p))[0];
    if (best && best !== a.activeWeapon()) { cmd.select = best === a.primary ? 'primary' : 'secondary'; return; }
    const w = a.activeWeapon();
    if (w && w.def.class !== 'knife' && w.mag < w.def.mag * 0.5 && w.reserve > 0) cmd.reload = true;
  }

  // ------------------------------------------------------------------ squad / shopping
  private leader(): Agent | null {
    const m = this.m;
    const p = m.player;
    if (p && p.alive && !p.zp!.downed && p !== this.agent) return p;
    return m.standing().find((h) => h !== this.agent && !h.isBot) ?? m.standing().find((h) => h !== this.agent) ?? null;
  }

  private follow(cmd: AgentCommand, dt: number) {
    const a = this.agent, L = this.leader();
    if (!L) { this.idleLook(dt); return; }
    const ang = L.yaw + Math.PI + (this.slot - 2) * 0.75;
    const fx = L.pos.x - Math.sin(ang) * 3.6, fz = L.pos.z - Math.cos(ang) * 3.6;
    const spot = this.m.world.nav.isWalkableAt(fx, fz) ? { x: fx, z: fz } : { x: L.pos.x, z: L.pos.z };
    const d = Math.hypot(spot.x - a.pos.x, spot.z - a.pos.z);
    if (d > 2.2) this.moveTo(cmd, spot.x, spot.z, dt, 1.6);
    else {
      // cover the direction the leader isn't looking
      const watch = L.yaw + Math.PI * (this.slot % 2 ? 0.6 : -0.6);
      this.aimTowards(watch + Math.sin(this.m.time * 0.5 + this.slot) * 0.4, 0, 3, dt);
    }
  }

  private shop(cmd: AgentCommand, dt: number): boolean {
    const a = this.agent, m = this.m, now = m.time;
    if (this.goal && (now > this.goal.until || !this.goalValid(this.goal))) { this.skip.set(this.goalKey(this.goal), now + 15); this.goal = null; }
    if (!this.goal && now >= this.nextShop) { this.goal = this.pickGoal(); this.nextShop = now + 1.5; }
    const g = this.goal;
    if (!g) return false;
    const d = Math.hypot(g.x - a.pos.x, g.z - a.pos.z);
    if (d > 1.15) { this.moveTo(cmd, g.x, g.z, dt, 0.9); return true; }
    // arrived: face the machine and use it
    const target = this.goalTarget(g);
    this.lookAt(target.x, 1.3, target.z, dt, 8);
    if (g.kind === 'armory') { m.buyArmory(a, g.armory!); this.goal = null; return true; }
    if ((g.kind === 'wall' || g.kind === 'box' || g.kind === 'boxTake') && a.primary && a.secondary) {
      // make sure we're holding the worse gun so the new one replaces it
      const worse = weaponScore(a.primary) >= weaponScore(a.secondary) ? 'secondary' : 'primary';
      if (a.active !== worse) { cmd.select = worse; return true; }
    }
    if (g.kind === 'forge') {
      const best = weaponScore(a.primary) >= weaponScore(a.secondary) ? 'primary' : 'secondary';
      if (a.active !== best) { cmd.select = best; return true; }
    }
    if (now < a.wpn.drawUntil) return true;
    const it = m.interactionFor(a);
    const kinds: Record<Goal['kind'], string> = { perk: 'perk', wall: 'wallBuy', ammo: 'ammo', armory: 'armory', forge: 'forge', forgeTake: 'forgeTake', box: 'box', boxTake: 'boxTake', powerUp: '', gate: 'gate', power: 'power' };
    if (it && it.kind === kinds[g.kind] && it.ok) {
      m.interact(a, it);
      if (g.kind === 'box') { this.goal = { ...g, kind: 'boxTake', until: now + 9 }; return true; }
      if (g.kind === 'forge') { this.goal = { ...g, kind: 'forgeTake', until: now + 12 }; return true; }
      this.goal = null;
    } else if (g.kind === 'boxTake' || g.kind === 'forgeTake') {
      // wait for the spin / the forge
    } else {
      this.skip.set(this.goalKey(g), now + 20);
      this.goal = null;
    }
    return true;
  }

  private goalKey(g: Goal) { return `${g.kind}:${g.ref}:${g.armory ?? ''}`; }
  private goalTarget(g: Goal) {
    const m = this.m;
    switch (g.kind) {
      case 'perk': return m.perkMachines[g.ref].pos;
      case 'wall': case 'ammo': return m.wallBuys[g.ref].pos;
      case 'box': case 'boxTake': return m.box.pos;
      case 'forge': case 'forgeTake': return m.forge.pos;
      case 'gate': return m.gates[g.ref].center;
      case 'power': return { x: m.powerPos.x, z: m.powerPos.z };
      default: return { x: m.armoryPos.x, z: m.armoryPos.z };
    }
  }

  private goalValid(g: Goal): boolean {
    const m = this.m, a = this.agent;
    switch (g.kind) {
      case 'boxTake': return m.box.userId === a.id && (m.box.state === 'spinning' || m.box.state === 'ready');
      case 'forgeTake': return m.forge.ownerId === a.id && (m.forge.state === 'working' || m.forge.state === 'ready');
      case 'box': return m.box.state === 'idle';
      case 'forge': return m.forge.state === 'idle';
      case 'gate': return !m.gates[g.ref].open;
      case 'power': return !m.power;
      default: return true;
    }
  }

  /** Stand-in-front point of a machine. */
  private front(p: { x: number; z: number; yaw: number } | { pos: Vector3; yaw: number }, dist: number) {
    const x = 'pos' in p ? p.pos.x : p.x, z = 'pos' in p ? p.pos.z : p.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    return { x: x + fx * dist, z: z + fz * dist };
  }

  private reachable(x: number, z: number) {
    const zone = this.m.zoneAt(x, z);
    return !zone || this.m.zoneOpen[zone];
  }

  private pickGoal(): Goal | null {
    const a = this.agent, m = this.m, now = m.time, zp = a.zp!;
    const money = a.money;
    const maxDist = m.wavePhase === 'intermission' ? 60 : 26;
    const opts: { g: Goal; pri: number }[] = [];
    const ok = (g: Goal) => !((this.skip.get(this.goalKey(g)) ?? 0) > now) && Math.hypot(g.x - a.pos.x, g.z - a.pos.z) < maxDist && this.reachable(g.x, g.z);
    const push = (g: Goal, pri: number) => { if (ok(g)) opts.push({ g, pri: pri - Math.hypot(g.x - a.pos.x, g.z - a.pos.z) * 0.04 }); };
    // perks
    if (zp.perks.length < PERK_LIMIT) {
      m.perkMachines.forEach((p, i) => {
        const def = PERKS[p.perk];
        if (zp.perks.includes(p.perk) || (def.needsPower && !m.power)) return;
        if (p.perk === 'secondWind' && m.humans.length === 1) return;
        const price = m.perkPrice(p.perk);
        if (money < price + 250) return;
        const f = this.front(p, 1.0);
        push({ kind: 'perk', x: f.x, z: f.z, ref: i, until: now + 25 }, PERK_PRIORITY[p.perk]);
      });
    }
    // better wall weapon / ammo
    const cur = Math.max(weaponScore(a.primary), weaponScore(a.secondary));
    const worst = a.primary && a.secondary ? Math.min(weaponScore(a.primary), weaponScore(a.secondary)) : 0;
    m.wallBuys.forEach((w, i) => {
      const own = [a.primary, a.secondary].find((x) => x?.def.id === w.weapon);
      const f = this.front({ x: w.pos.x, z: w.pos.z, yaw: w.yaw }, 0.9);
      if (own) {
        if (own.reserve < own.def.reserve * 0.3 && money >= Math.ceil(w.price / 20) * 10 + 100) push({ kind: 'ammo', x: f.x, z: f.z, ref: i, until: now + 20 }, 8.5);
        return;
      }
      const s = SCORE[w.weapon] ?? 2;
      if (money >= w.price + 150 && s > worst + 0.6 && s > cur * 0.75) push({ kind: 'wall', x: f.x, z: f.z, ref: i, until: now + 25 }, 7 + (s - worst));
    });
    // armour & lethals at the armory
    const af = this.front(m.armoryPos, 1.0);
    if (a.armor <= 0 && money >= 1300) push({ kind: 'armory', armory: 'kevlar', x: af.x, z: af.z, ref: 0, until: now + 25 }, 6);
    else if (a.armor < 100 && money >= 900) push({ kind: 'armory', armory: 'plate', x: af.x, z: af.z, ref: 0, until: now + 25 }, 4);
    if (a.grenades.frag < 2 && money >= 900) push({ kind: 'armory', armory: 'frag', x: af.x, z: af.z, ref: 1, until: now + 25 }, 2.5);
    if (m.humans.length > 1 && !zp.reviveKit && money >= ARMORY.selfRevive.price + 3000) push({ kind: 'armory', armory: 'selfRevive', x: af.x, z: af.z, ref: 2, until: now + 25 }, 2);
    // forge your best gun
    const best = weaponScore(a.primary) >= weaponScore(a.secondary) ? a.primary : a.secondary;
    if (m.power && m.forge.state === 'idle' && best && (best.def.tier ?? 0) === 0 && money >= FORGE_PRICE + 300 && (SCORE[best.def.id] ?? 0) >= 3.5) {
      const f = this.front(m.forge, 1.2);
      push({ kind: 'forge', x: f.x, z: f.z, ref: 0, until: now + 30 }, 6.5);
    }
    // gamble on the box when the guns are poor
    if (m.box.state === 'idle' && money >= 2600 && cur < 4.2 && m.wave >= 3) {
      const f = this.front(m.box, 1.1);
      push({ kind: 'box', x: f.x, z: f.z, ref: 0, until: now + 25 }, 3);
    }
    // an all-bot squad ("Watch bots") explores on its own: power first, then new areas
    // with a human in the squad, the power is theirs to find first — bots help out from wave 6
    if (!m.power && (!m.player || m.wave >= 6)) { const f = this.front(m.powerPos, 1.0); push({ kind: 'power', x: f.x, z: f.z, ref: 0, until: now + 40 }, 9); }
    if (!m.player) {
      if (m.wave >= 2) m.gates.forEach((gt, i) => {
        if (gt.open || money < gt.def.price + 400 || !(m.zoneOpen[gt.def.zones[0]] || m.zoneOpen[gt.def.zones[1]])) return;
        const side = m.zoneOpen[gt.def.zones[0]] ? gt.def.zones[0] : gt.def.zones[1];
        // stand on the open side of the shutter
        const c = gt.center, r = gt.rect;
        const opts2 = [{ x: c.x, z: r.z0 - 0.9 }, { x: c.x, z: r.z1 + 0.9 }, { x: r.x0 - 0.9, z: c.z }, { x: r.x1 + 0.9, z: c.z }];
        const spot = opts2.find((p) => m.zoneAt(p.x, p.z) === side && m.world.nav.isWalkableAt(p.x, p.z));
        if (spot) push({ kind: 'gate', x: spot.x, z: spot.z, ref: i, until: now + 40 }, 4.5);
      });
    }
    if (!opts.length) return null;
    opts.sort((p, q) => q.pri - p.pri);
    return opts[0].g;
  }

  // ------------------------------------------------------------------ movement
  private walkableDir(dx: number, dz: number) {
    const nav = this.m.world.nav, a = this.agent;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
      const c = Math.cos(off), s = Math.sin(off);
      const x = dx * c - dz * s, z = dx * s + dz * c;
      if (nav.isWalkableAt(a.pos.x + x * 1.4, a.pos.z + z * 1.4) && nav.isWalkableAt(a.pos.x + x * 0.7, a.pos.z + z * 0.7)) return { x, z };
    }
    return { x: dx, z: dz };
  }

  private moveTo(cmd: AgentCommand, x: number, z: number, dt: number, tol = 0.8, look = true): boolean {
    const a = this.agent, m = this.m, now = m.time;
    if (Math.hypot(x - a.pos.x, z - a.pos.z) <= tol) { this.path = null; return true; }
    if (!this.path || Math.hypot(x - this.goalX, z - this.goalZ) > 1.5 || now >= this.repathAt) {
      this.path = m.world.nav.findPath(a.pos.x, a.pos.z, x, z);
      this.pathIdx = 0; this.goalX = x; this.goalZ = z;
      this.repathAt = now + 1.5 + m.rng.next();
      if (!this.path) { this.moveDirect(cmd, x, z); return false; }
    }
    while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - a.pos.x, this.path[this.pathIdx].z - a.pos.z) < 0.6) this.pathIdx++;
    const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
    this.moveDirect(cmd, wp.x, wp.z);
    if (look && !this.target) {
      const ahead = this.path[Math.min(this.pathIdx + 1, this.path.length - 1)];
      const lx = (wp.x + ahead.x) / 2, lz = (wp.z + ahead.z) / 2;
      if (Math.hypot(lx - a.pos.x, lz - a.pos.z) > 0.8) this.aimTowards(yawTo(lx - a.pos.x, lz - a.pos.z), 0, 5, dt);
    }
    if (now >= this.stuckAt) {
      if (this.stuckPos.distanceTo(a.pos) < 0.3) { this.unstickUntil = now + 0.5; this.unstickDir = m.rng.chance(0.5) ? 1 : -1; this.path = null; }
      this.stuckPos.copy(a.pos); this.stuckAt = now + 0.8;
    }
    if (now < this.unstickUntil) { cmd.right = this.unstickDir; cmd.jump = m.rng.chance(0.05); }
    return false;
  }

  private moveDirect(cmd: AgentCommand, x: number, z: number) {
    const a = this.agent;
    let dx = x - a.pos.x, dz = z - a.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    for (const o of this.m.humans) {
      if (o === a || !o.alive) continue;
      const ox = a.pos.x - o.pos.x, oz = a.pos.z - o.pos.z, d = Math.hypot(ox, oz);
      if (d < 1.1 && d > 0.01) { dx += (ox / d) * (1.1 - d) * 1.5; dz += (oz / d) * (1.1 - d) * 1.5; }
    }
    const l2 = Math.hypot(dx, dz) || 1;
    dx /= l2; dz /= l2;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cmd.forward = dx * fx + dz * fz;
    cmd.right = dx * rx + dz * rz;
  }

  private aimTowards(yaw: number, pitch: number, speed: number, dt: number) {
    speed *= 1 - 0.65 * this.agent.stunAt(this.m.time);
    const k = 1 - Math.exp(-speed * dt), maxTurn = 12 * dt;
    this.yaw = wrapAngle(this.yaw + clamp(angleDiff(this.yaw, yaw) * k, -maxTurn, maxTurn));
    this.pitch += clamp((pitch - this.pitch) * k, -maxTurn, maxTurn);
  }

  private lookAt(x: number, y: number, z: number, dt: number, speed: number) {
    const eye = this.agent.eyePos(tmp);
    this.aimTowards(yawTo(x - eye.x, z - eye.z), Math.atan2(y - eye.y, Math.max(0.5, Math.hypot(x - eye.x, z - eye.z))), speed, dt);
  }

  private idleLook(dt: number) {
    this.yaw = wrapAngle(this.yaw + Math.sin(this.m.time * 0.6 + this.slot) * dt * 0.4);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 2);
  }
}

