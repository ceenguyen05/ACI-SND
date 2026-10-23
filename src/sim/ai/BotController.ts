import { Vector3 } from 'three';
import { DIFFICULTY, type BotDifficulty, type DifficultyDef } from '../../config/difficulty';
import type { UtilityId } from '../../config/utilities';
import type { GadgetId } from '../../config/gadgets';
import type { Device } from '../gadget/GadgetManager';
import { DEG, angleDiff, clamp, dirFromAngles, wrapAngle, yawTo } from '../../core/math';
import { emptyCommand, type Agent, type AgentCommand } from '../entities/Agent';
import type { MatchQuery } from '../mode/types';
import type { NoiseKind } from '../SimContext';
import { rectCenter } from '../../core/math';
import { botBuy } from './BotBuy';
import type { NavPoint } from './NavGrid';
import type { BotOrder, TeamCoach } from './TeamCoach';

interface ThrowTask { kind: UtilityId | GadgetId | 'stimAlly'; gadget?: boolean; x: number; y: number; z: number; stage: 0 | 1 | 2 | 3; until: number; targetId?: number; lookX?: number; lookZ?: number }

const tmp = new Vector3(), tmp2 = new Vector3();

/** Drives one bot agent by producing an AgentCommand every tick (same interface as the human player). */
export class BotController {
  readonly agent: Agent;
  private m: MatchQuery;
  private coach: () => TeamCoach;
  private diff: DifficultyDef;
  order: BotOrder = { kind: 'idle' };

  // navigation
  private path: NavPoint[] | null = null;
  private pathIdx = 0;
  private goalX = NaN; private goalZ = NaN;
  private repathAt = 0;
  private stuckAt = 0;
  private stuckPos = new Vector3();
  private stuckCount = 0;
  private unstickUntil = 0;
  private unstickDir = 1;

  // aim / combat
  private yaw = 0; private pitch = 0;
  private target: Agent | null = null;
  private reactionAt = 0;
  private errYaw = 0; private errPitch = 0;
  private aimHead = false;
  private lastSeen: { pos: Vector3; time: number; id: number } | null = null;
  private heard: { pos: Vector3; time: number; count: number } | null = null;
  private strafeSign = 1; private strafeUntil = 0;
  private burstLeft = 0; private burstPauseUntil = 0;
  private crouchSpray = false;
  private standAndShoot = true;
  private semiToggle = false;
  private scopeToggleAt = 0;

  // misc
  private tasks: ThrowTask[] = [];
  private bought = false;
  private buyAt = 0;
  private holdArrivedAt = -1;
  /** Holding a long angle from the floor (defender anchors). */
  private holdProne = false;
  private nextSlideAt = 0;
  private sweepPhase = 0;
  private nextFragAt = 0;
  private nextFireAt = 0;
  private deviceTarget: Device | null = null;
  private droneSent = false;

  constructor(agent: Agent, m: MatchQuery, difficulty: BotDifficulty, coach: () => TeamCoach) {
    this.agent = agent; this.m = m; this.coach = coach;
    this.diff = DIFFICULTY[difficulty];
  }

  setDifficulty(d: BotDifficulty) { this.diff = DIFFICULTY[d]; }

  resetRound() {
    this.holdProne = false;
    this.nextSlideAt = 0;
    this.yaw = this.agent.yaw; this.pitch = 0;
    this.target = null; this.lastSeen = null; this.heard = null;
    this.path = null; this.goalX = NaN; this.tasks = [];
    this.bought = false; this.buyAt = this.m.time + 0.4 + this.m.rng.next() * 2.5;
    this.order = { kind: 'idle' };
    this.holdArrivedAt = -1; this.stuckCount = 0;
    this.deviceTarget = null; this.droneSent = false;
    this.sweepPhase = this.m.rng.next() * 10;
  }

  setOrder(o: BotOrder) { this.order = o; this.holdArrivedAt = -1; this.path = null; this.goalX = NaN; this.holdProne = false; }

  hasVisibleEnemy() { return !!this.target; }

  onHear(pos: Vector3, kind: NoiseKind) {
    const now = this.m.time;
    if (this.heard && now - this.heard.time < 2) { this.heard.pos.copy(pos); this.heard.time = now; this.heard.count++; }
    else this.heard = { pos: pos.clone(), time: now, count: 1 };
    void kind;
  }

  /** A teammate pinged a spot / enemy: treat it like a loud noise there. */
  onTeamPing(pos: Vector3) {
    if (this.target) return;
    this.heard = { pos: pos.clone(), time: this.m.time, count: 3 };
  }

  onDamaged(attacker: Agent | null) {
    if (!attacker || attacker.team === this.agent.team) return;
    if (!this.target && this.m.los(this.agent, attacker)) {
      this.acquire(attacker, 0.5);
    } else if (!this.target) {
      this.heard = { pos: attacker.eyePos(new Vector3()), time: this.m.time, count: 3 };
    }
  }

  // ===================================================================================
  think(dt: number): AgentCommand {
    const a = this.agent, m = this.m, now = m.time;
    const cmd = emptyCommand();
    if (!a.alive) { cmd.yaw = this.yaw; cmd.pitch = this.pitch; return cmd; }

    if (m.phase === 'freeze') {
      if (!this.bought && now >= this.buyAt) { botBuy(m, a); this.bought = true; }
      if (this.bought && a.primary && a.active !== 'primary') cmd.select = 'primary';
      this.idleLook(dt, 0.3);
      cmd.yaw = this.yaw; cmd.pitch = this.pitch;
      return cmd;
    }

    this.perceive(now);
    this.perceiveDevices();
    const blind = a.flashUntil > now && a.flashStrength > 0.35;

    if (this.target && !blind) {
      this.tasks = [];
      this.engage(cmd, dt);
    } else if (blind) {
      // flashed: wobble aim, back off, spray if the enemy was just seen
      this.yaw += Math.sin(now * 7 + a.id) * dt * 1.5;
      cmd.forward = -0.6;
      cmd.right = Math.sin(now * 3) > 0 ? 1 : -1;
      if (this.lastSeen && now - this.lastSeen.time < 0.8) cmd.fire = (Math.floor(now * 10) % 2) === 0;
    } else if (this.deviceTarget && this.order.kind !== 'plant' && this.order.kind !== 'defuse') {
      this.shootDevice(cmd, dt);
    } else if (this.tasks.length) {
      this.runTask(cmd, dt);
    } else {
      this.followOrder(cmd, dt);
      this.maintainWeapon(cmd);
      this.considerUtility();
    }
    this.useKit(cmd);

    cmd.yaw = this.yaw;
    cmd.pitch = clamp(this.pitch, -1.5, 1.5);
    return cmd;
  }

  /** Killstreaks, stims and other once-in-a-while actions. */
  private useKit(cmd: AgentCommand) {
    const a = this.agent, m = this.m, now = m.time;
    if (a.streaks.length && !this.target && m.rng.next() < 0.02) cmd.killstreak = true;
    if (a.gadgets.stim > 0 && a.health < 60 && now >= a.stimReadyAt && !a.heals.length && m.rng.next() < (this.target ? 0.008 : 0.04)) cmd.stimSelf = true;
    if (!this.target && !this.tasks.length && a.gadgets.stim > 1 && m.rng.next() < 0.03) {
      const ally = m.agents.find((o) => o !== a && o.alive && o.team === a.team && o.health < 55 && !o.heals.length
        && o.pos.distanceTo(a.pos) < 14 && o.pos.distanceTo(a.pos) > 1.5 && m.los(a, o));
      if (ally) this.tasks.push({ kind: 'stimAlly', gadget: true, x: 0, y: 0, z: 0, stage: 0, until: now + 3, targetId: ally.id });
    }
  }

  // ---------------------------------------------------------------- perception
  private perceive(now: number) {
    const a = this.agent;
    const eye = a.eyePos(tmp);
    let best: Agent | null = null, bestScore = Infinity;
    for (const e of this.m.agents) {
      if (!e.alive || e.team === a.team) continue;
      const c = tmp2.set(e.pos.x, e.pos.y + e.height * 0.7, e.pos.z);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      const yawOff = Math.abs(angleDiff(this.yaw, yawTo(dx, dz))) / DEG;
      const pitchOff = Math.abs(Math.atan2(dy, Math.hypot(dx, dz)) - this.pitch) / DEG;
      const tracking = this.target === e || (this.lastSeen?.id === e.id && now - this.lastSeen.time < 1.5);
      const fovHalf = this.diff.fov / 2;
      if (!tracking && (yawOff > fovHalf || pitchOff > 50)) continue;
      // very distant enemies in the periphery are harder to notice
      if (!tracking && dist > 45 && yawOff > fovHalf * 0.5) continue;
      // line of sight last: it's the expensive test (raycasts + smoke)
      if (!this.m.los(a, e)) continue;
      const score = dist + yawOff * 0.25;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) {
      if (best !== this.target) this.acquire(best, 1);
      this.lastSeen = { pos: best.pos.clone(), time: now, id: best.id };
    } else if (this.target && (!this.lastSeen || now - this.lastSeen.time > 0.3)) {
      this.target = null;
    }
    // recon pulse / radar intel → treat as heard
    if (!this.target) {
      for (const e of this.m.agents) {
        if (e.alive && e.team !== a.team && e.revealedUntil > now) {
          if (!this.heard || now - this.heard.time > 1) this.heard = { pos: e.pos.clone(), time: now, count: 1 };
        }
      }
    }
  }

  /** Spot enemy cameras / drones / mines in view so we can shoot them. */
  private perceiveDevices() {
    const a = this.agent, m = this.m;
    if (this.deviceTarget && (!this.deviceTarget.alive || this.target)) this.deviceTarget = null;
    if (this.target || this.deviceTarget || m.rng.next() > 0.15) return;
    const eye = a.eyePos(new Vector3());
    for (const d of m.gadgets.devices) {
      if (!d.alive || d.team === a.team || d.kind === 'shield' || d.kind === 'wire' || d.kind === 'missile' || d.kind === 'steelBarricade' || d.kind === 'ammoBox') continue;
      if (d.kind === 'barricade' && d.pos.distanceTo(a.pos) > 7) continue;
      const b = m.gadgets.hitBox(d);
      const c = tmp2.set((b.minX + b.maxX) / 2, d.kind === 'flockCam' ? d.pos.y : (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      const dist = eye.distanceTo(c);
      if (dist > 22) continue;
      const off = Math.abs(angleDiff(this.yaw, yawTo(c.x - eye.x, c.z - eye.z))) / DEG;
      if (off > this.diff.fov / 2) continue;
      const dir = c.clone().sub(eye).normalize();
      const hit = m.world.collision.raycast(eye, dir, dist);
      if (hit && hit.t < dist - 0.3) continue;
      this.deviceTarget = d;
      this.reactionAt = m.time + this.diff.reaction * 1.5;
      return;
    }
  }

  private shootDevice(cmd: AgentCommand, dt: number) {
    const a = this.agent, d = this.deviceTarget!, now = this.m.time;
    const b = this.m.gadgets.hitBox(d);
    const cy = d.kind === 'flockCam' ? d.pos.y : (b.minY + b.maxY) / 2;
    this.lookAt((b.minX + b.maxX) / 2, cy, (b.minZ + b.maxZ) / 2, dt, this.diff.aimSpeed);
    if (d.kind === 'barricade') {
      const near = Math.hypot(d.pos.x - a.pos.x, d.pos.z - a.pos.z) < 1.5;
      if (!near) this.moveDirect(cmd, d.pos.x, d.pos.z);
      else if (now >= a.wpn.meleeReadyAt) cmd.quickMelee = true;
      if (now - this.reactionAt > 8) this.deviceTarget = null;
      return;
    }
    const w = a.activeWeapon();
    if (!w || w.def.class === 'knife' || a.active === 'grenade' || a.active === 'gadget' || a.active === 'bomb') {
      cmd.select = a.primary ? 'primary' : 'secondary';
      return;
    }
    if (w.mag === 0) { cmd.reload = true; return; }
    const eye = a.eyePos(new Vector3());
    const want = yawTo((b.minX + b.maxX) / 2 - eye.x, (b.minZ + b.maxZ) / 2 - eye.z);
    if (now >= this.reactionAt && Math.abs(angleDiff(this.yaw, want)) < 0.04) {
      this.semiToggle = !this.semiToggle;
      cmd.fire = w.def.auto ? true : this.semiToggle;
    }
    if (now - this.reactionAt > 4) this.deviceTarget = null; // give up eventually
  }

  private acquire(e: Agent, reactionMult: number) {
    const a = this.agent, now = this.m.time, rng = this.m.rng;
    this.target = e;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
    const off = Math.abs(angleDiff(this.yaw, yawTo(dx, dz))) / DEG;
    // holding a pre-aimed angle reacts faster and more precisely; running-and-gunning is slower
    const holding = a.speed2D < 0.8 && off < 25;
    const running = a.speed2D > 3;
    const angleMult = off > 40 ? 1.3 : 1;
    const stateMult = holding ? 0.55 : running ? 1.25 : 1;
    this.reactionAt = now + this.diff.reaction * reactionMult * (0.75 + rng.next() * 0.5) * angleMult * stateMult;
    const err = this.diff.aimError * (0.6 + rng.next() * 0.8) * (holding ? 0.6 : running ? 1.2 : 1);
    const ang = rng.next() * Math.PI * 2;
    this.errYaw = Math.cos(ang) * err;
    this.errPitch = Math.sin(ang) * err * 0.6;
    this.aimHead = rng.next() < this.diff.headRatio;
    this.burstLeft = 0;
    this.crouchSpray = rng.next() < 0.35;
    const anchoring = (this.order.kind === 'hold' || this.order.kind === 'guard') && this.holdArrivedAt >= 0;
    this.standAndShoot = anchoring || rng.next() < (this.diff.counterStrafe ? 0.95 : 0.65);
    if (anchoring) this.crouchSpray = rng.next() < 0.6;
  }

  // ---------------------------------------------------------------- combat
  private engage(cmd: AgentCommand, dt: number) {
    const a = this.agent, e = this.target!, m = this.m, now = m.time;
    const eye = a.eyePos(tmp);
    const aim = e.aimPoint(this.aimHead, tmp2);
    const lead = 0.06;
    const tx = aim.x + e.vel.x * lead, tz = aim.z + e.vel.z * lead;
    const dx = tx - eye.x, dy = aim.y - eye.y, dz = tz - eye.z;
    const horiz = Math.hypot(dx, dz);
    const dist = Math.hypot(horiz, dy);
    const wantYaw = yawTo(dx, dz);
    const wantPitch = Math.atan2(dy, horiz);

    const decay = Math.exp(-this.diff.errorDecay * dt);
    this.errYaw *= decay; this.errPitch *= decay;
    const comp = this.diff.sprayControl;
    const aimYaw = wantYaw + this.errYaw * DEG - a.aimPunchYaw * DEG * comp;
    const aimPitch = wantPitch + this.errPitch * DEG - a.aimPunchPitch * DEG * comp;
    this.aimTowards(aimYaw, aimPitch, this.diff.aimSpeed, dt);

    // weapon readiness
    let w = a.activeWeapon();
    const usable = (x: typeof w) => !!x && x.def.class !== 'knife' && (x.mag > 0 || x.reserve > 0);
    if (a.active === 'grenade' || a.active === 'bomb' || !usable(w)) {
      if (usable(a.primary)) cmd.select = 'primary';
      else if (usable(a.secondary)) cmd.select = 'secondary';
      else if (a.active !== 'melee') cmd.select = 'melee';
      w = null;
    }
    if (w && w.mag === 0) {
      if (a.active === 'primary' && a.secondary && a.secondary.mag > 0 && dist < 18) cmd.select = 'secondary';
      else cmd.reload = true;
    }
    // launchers are suicide up close: swap to the pistol
    if (w?.def.projectile && dist < 7 && usable(a.secondary)) { cmd.select = 'secondary'; w = null; }

    // aim error check (without spray compensation)
    const errAngle = Math.hypot(angleDiff(this.yaw + a.aimPunchYaw * DEG * comp, wantYaw), (this.pitch + a.aimPunchPitch * DEG * comp) - wantPitch);
    const spraying = now - a.wpn.lastShot < 0.25;
    const tolerance = Math.atan2(this.aimHead ? 0.18 : 0.3, dist) + 0.004;
    const ready = now >= this.reactionAt && errAngle < tolerance * (spraying ? 2.6 : 1.2);

    const def = w?.def;
    const isKnife = a.active === 'melee';
    let fire = false;
    if (isKnife) {
      fire = dist < 1.8;
    } else if (def && ready) {
      if (def.scope) {
        if (a.wpn.scope === 0 && dist > 5 && now >= this.scopeToggleAt && now >= a.wpn.drawUntil) { cmd.alt = true; this.scopeToggleAt = now + 0.4; }
        fire = a.wpn.scope > 0 || dist <= 5;
        if (a.speed2D > 1.2) fire = false;
      } else if (!def.auto) {
        this.semiToggle = !this.semiToggle;
        fire = this.semiToggle;
      } else if (dist > 26 && def.class !== 'smg') {
        // tap / burst at range
        if (now < this.burstPauseUntil) fire = false;
        else {
          if (this.burstLeft <= 0) this.burstLeft = dist > 40 ? 1 : this.m.rng.int(2, 4);
          fire = true;
          if (now - a.wpn.lastShot < 0.02) {
            this.burstLeft--;
            if (this.burstLeft <= 0) this.burstPauseUntil = now + (dist > 40 ? 0.45 : 0.32);
          }
        }
      } else fire = true;
    }
    cmd.fire = fire;
    // point blank: bash them with a quick melee (more often when the gun is empty or reloading)
    if (!isKnife && dist < 1.5 && now >= a.wpn.meleeReadyAt && this.m.rng.next() < (w && w.mag > 0 && a.wpn.reloadUntil <= now ? 0.04 : 0.3)) {
      cmd.quickMelee = true; cmd.fire = false;
    }

    // a prone anchor keeps shooting from the floor at range, but gets up if pushed up close
    if (this.holdProne) {
      if (dist < 8 || this.order.kind !== 'hold') this.holdProne = false;
      else { cmd.crouch = true; cmd.prone = true; cmd.forward = 0; cmd.right = 0; return; }
    }

    // movement
    if (isKnife) {
      this.moveDirect(cmd, e.pos.x, e.pos.z);
    } else {
      const stopToShoot = (this.standAndShoot || def?.scope) && ready && dist > 3.5;
      if (stopToShoot) {
        // counter-strafe: tap the opposite direction to kill momentum, like a human CS player
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        const vf = a.vel.x * fx + a.vel.z * fz, vr = a.vel.x * rx + a.vel.z * rz;
        cmd.forward = Math.abs(vf) > 0.6 ? -Math.sign(vf) : 0;
        cmd.right = Math.abs(vr) > 0.6 ? -Math.sign(vr) : 0;
        if (a.speed2D > a.maxSpeed() * 0.4 && !def?.scope) cmd.fire = cmd.fire && dist < 8;
      } else {
        if (now > this.strafeUntil) { this.strafeSign = this.m.rng.chance(0.5) ? 1 : -1; this.strafeUntil = now + 0.3 + this.m.rng.next() * 0.6; }
        cmd.right = this.strafeSign;
        if (dist > 25) cmd.forward = 0; else if (dist < 4) cmd.forward = -0.5;
      }
      if (spraying && dist > 14 && this.crouchSpray && def?.class === 'rifle') cmd.crouch = true;
      // planting / defusing bots under fire keep going if close to done
      if (a.isDefusing && a.defuseProgress > 0.7) { cmd.use = true; cmd.fire = false; cmd.right = 0; }
    }
  }

  // ---------------------------------------------------------------- orders
  private followOrder(cmd: AgentCommand, dt: number) {
    const a = this.agent, m = this.m, now = m.time;
    const o = this.order;
    const bomb = m.bomb;
    const heardRecently = this.heard && now - this.heard.time < 3 ? this.heard : null;

    // bomb about to blow: get out unless we can still finish a defuse
    if (bomb.state === 'planted') {
      const left = bomb.plantedAt + m.rules.bombTimer - now;
      const d = Math.hypot(bomb.pos.x - a.pos.x, bomb.pos.z - a.pos.z);
      const need = (a.hasKit ? m.rules.defuseTimeKit : m.rules.defuseTime) * (1 - (a.isDefusing ? a.defuseProgress : 0));
      const cantDefuse = a.team === 'CT' && left < need + (a.isDefusing ? 0 : d / 5.5 + 0.3);
      if (d < 34 && ((a.team === 'T' && left < 7) || cantDefuse)) {
        const home = m.world.map.spawns[a.team][0];
        this.moveTo(cmd, home.x, home.z, dt, { tolerance: 2 });
        return;
      }
    }
    // investigate a fresh last-seen position if no pressing order
    const pressing = o.kind === 'plant' || o.kind === 'defuse' || o.kind === 'getBomb';
    if (!pressing && this.lastSeen && now - this.lastSeen.time < 3.5 && (o.kind === 'hold' || o.kind === 'guard')) {
      this.lookAt(this.lastSeen.pos.x, a.pos.y + 1.5, this.lastSeen.pos.z, dt, 6);
      cmd.crouch = this.m.rng.next() < 0.02 ? !cmd.crouch : cmd.crouch;
      return;
    }

    switch (o.kind) {
      case 'idle': this.idleLook(dt, 1); break;
      case 'route': {
        const coach = this.coach();
        if (!this.droneSent && a.gadgets.drone > 0) {
          this.droneSent = true;
          const c = rectCenter(m.world.map.sites[o.site]);
          if (m.gadgets.deploy(a, 'drone', { x: c.x, z: c.z })) a.gadgets.drone--;
        }
        const next = o.idx < o.via.length ? o.via[o.idx] : [o.finalX, o.finalZ];
        if (!o.executed && o.stageIdx >= 0 && o.idx === o.stageIdx + 1) {
          if (o.lurk || now < coach.executeAt) {
            // hold at the staging point looking toward the site
            const [sx, sz] = o.via[o.stageIdx];
            if (this.moveTo(cmd, sx, sz, dt, { walk: true, tolerance: 1.6 })) {
              this.lookAt(next[0], a.pos.y + 1.5, next[1], dt, 4, true);
            }
            if (o.lurk && m.timeLeft() < 25) { o.lurk = false; o.finalX = rectCenter(m.world.map.sites[coach.site]).x; o.finalZ = rectCenter(m.world.map.sites[coach.site]).z; o.idx = o.via.length; o.site = coach.site; }
            break;
          }
          o.executed = true;
          this.planExecuteUtility(o.site, next[0], next[1]);
          if (this.tasks.length) break;
        }
        if (o.idx < o.via.length) {
          const walk = o.idx >= o.stageIdx && heardRecently !== null;
          if (this.moveTo(cmd, next[0], next[1], dt, { walk, tolerance: 1.6 })) o.idx++;
        } else if (this.moveTo(cmd, o.finalX, o.finalZ, dt, { tolerance: 1.2 })) {
          if (a.hasBomb) {
            const spots = m.world.map.plantSpots[o.site];
            const s = spots.reduce((b, p) => (Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < Math.hypot(b.x - a.pos.x, b.z - a.pos.z) ? p : b));
            this.setOrder({ kind: 'plant', site: o.site, x: s.x, z: s.z });
          } else {
            this.setOrder({ kind: 'guard', spot: m.rng.pick(m.world.map.ai.postPlant[o.site]) });
          }
        }
        break;
      }
      case 'plant': {
        if (!a.hasBomb) {
          if (bomb.state === 'planted' && a.gadgets.mine > 0) {
            // lay the laser across the bomb so a defuser trips it
            const side = m.rng.chance(0.5) ? 1 : -1;
            const yaw = a.yaw + side * Math.PI / 2;
            const p = new Vector3(bomb.pos.x + Math.sin(yaw) * 1.3, bomb.pos.y, bomb.pos.z + Math.cos(yaw) * 1.3);
            if (m.gadgets.placeAt(a, 'mine', p, yaw)) a.gadgets.mine--;
          }
          this.setOrder({ kind: 'guard', spot: m.rng.pick(m.world.map.ai.postPlant[o.site]) });
          break;
        }
        const inSite = m.world.siteAt(a.pos.x, a.pos.z) !== null;
        if (!inSite || Math.hypot(o.x - a.pos.x, o.z - a.pos.z) > 1.2) { if (!this.moveTo(cmd, o.x, o.z, dt, { tolerance: 0.8 })) break; }
        if (a.active !== 'bomb') cmd.select = 'bomb';
        else if (now >= a.wpn.drawUntil) cmd.fire = true;
        this.aimTowards(this.yaw, -0.9, 6, dt);
        break;
      }
      case 'guard':
      case 'hold': {
        const s = o.spot;
        if (this.moveTo(cmd, s.x, s.z, dt, { tolerance: 0.7, walk: o.kind === 'guard' && heardRecently !== null })) {
          if (this.holdArrivedAt < 0) {
            this.holdArrivedAt = now;
            // a long sightline is worth holding from the floor (smaller target, steadier aim)
            const sight = Math.hypot(s.lookX - s.x, s.lookZ - s.z);
            this.holdProne = o.kind === 'hold' && sight > 16 && m.rng.chance(0.3);
            if (o.kind === 'hold') this.placeHoldGadgets(s.x, s.z, s.lookX, s.lookZ);
            if (o.kind === 'hold' && a.grenades.pulse > 0 && m.rng.next() < this.diff.utilityUse * 0.6) {
              const d = Math.hypot(s.lookX - s.x, s.lookZ - s.z);
              const k = Math.min(1, 12 / d);
              this.tasks.push({ kind: 'pulse', x: s.x + (s.lookX - s.x) * k, y: 0, z: s.z + (s.lookZ - s.z) * k, stage: 0, until: 0 });
            }
          }
          let lx = s.lookX, lz = s.lookZ;
          if (this.holdProne) { cmd.crouch = true; cmd.prone = true; }
          if (o.kind === 'guard' && bomb.state === 'planted') { lx = bomb.pos.x; lz = bomb.pos.z; }
          if (heardRecently) { lx = heardRecently.pos.x; lz = heardRecently.pos.z; }
          const sweep = heardRecently ? 0 : Math.sin(now * 0.6 + this.sweepPhase) * 0.25;
          const base = yawTo(lx - a.pos.x, lz - a.pos.z);
          this.aimTowards(base + sweep, Math.atan2(1.4 - a.eyeHeight, Math.max(4, Math.hypot(lx - a.pos.x, lz - a.pos.z))), 4, dt);
          if (o.kind === 'guard' && bomb.state === 'planted' && bomb.defuserId !== null) cmd.crouch = false;
        }
        break;
      }
      case 'retake': {
        const planted = bomb.state === 'planted';
        const tx = planted ? bomb.pos.x : o.x, tz = planted ? bomb.pos.z : o.z;
        const d = Math.hypot(tx - a.pos.x, tz - a.pos.z);
        if (planted && !this.coach().retakeGo && d < 17) {
          // wait for teammates, holding an angle toward the bomb
          this.lookAt(tx, bomb.pos.y + 1.2, tz, dt, 5);
          break;
        }
        if (this.moveTo(cmd, tx, tz, dt, { tolerance: 3, walk: planted && d < 14 })) this.idleLook(dt, 2);
        break;
      }
      case 'defuse': {
        if (bomb.state !== 'planted') { this.setOrder({ kind: 'idle' }); break; }
        const d = Math.hypot(bomb.pos.x - a.pos.x, bomb.pos.z - a.pos.z);
        if (d > 1.0) { this.moveTo(cmd, bomb.pos.x, bomb.pos.z, dt, { tolerance: 0.6 }); break; }
        cmd.use = true;
        cmd.crouch = this.diff.counterStrafe;
        this.lookAt(bomb.pos.x, bomb.pos.y, bomb.pos.z, dt, 6);
        break;
      }
      case 'getBomb': {
        if (bomb.state !== 'dropped') { this.setOrder({ kind: 'idle' }); break; }
        this.moveTo(cmd, bomb.pos.x, bomb.pos.z, dt, { tolerance: 0.3 });
        break;
      }
      case 'hunt': {
        if (this.moveTo(cmd, o.x, o.z, dt, { tolerance: 2, walk: true })) {
          const c = rectCenter(m.world.map.sites[m.rng.chance(0.5) ? 'A' : 'B']);
          this.setOrder({ kind: 'hunt', x: c.x, z: c.z });
        }
        break;
      }
    }
  }

  /** Path-follow toward (x,z). Returns true when within tolerance. */
  private moveTo(cmd: AgentCommand, x: number, z: number, dt: number, opts: { walk?: boolean; tolerance?: number } = {}): boolean {
    const a = this.agent, m = this.m, now = m.time;
    const tol = opts.tolerance ?? 0.8;
    const d = Math.hypot(x - a.pos.x, z - a.pos.z);
    if (d <= tol) { this.path = null; return true; }
    if (!this.path || Math.hypot(x - this.goalX, z - this.goalZ) > 1 || now >= this.repathAt) {
      this.path = m.world.nav.findPath(a.pos.x, a.pos.z, x, z);
      this.pathIdx = 0; this.goalX = x; this.goalZ = z;
      this.repathAt = now + 4 + m.rng.next() * 2;
      if (!this.path) { this.moveDirect(cmd, x, z); return false; }
    }
    // advance waypoint
    while (this.pathIdx < this.path.length - 1) {
      const p = this.path[this.pathIdx];
      if (Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < 0.55) this.pathIdx++; else break;
    }
    const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
    if (m.utility.inFire(wp.x, wp.z) && this.order.kind !== 'defuse' && this.order.kind !== 'plant') {
      this.idleLook(dt, 1);
      return false; // wait for fire to burn out
    }
    this.moveDirect(cmd, wp.x, wp.z);
    if (opts.walk) cmd.walk = true;
    // the odd slide when sprinting down a long straight (pure movement flavour – no speed gain)
    else if (now >= this.nextSlideAt && a.speed2D > 5 && Math.hypot(wp.x - a.pos.x, wp.z - a.pos.z) > 6 && d > 10 && m.rng.chance(0.002)) {
      cmd.slide = true;
      this.nextSlideAt = now + 14 + m.rng.next() * 14;
    }

    // look: toward heard noise, else along path
    const heard = this.heard && now - this.heard.time < 2 ? this.heard : null;
    if (heard && Math.hypot(heard.pos.x - a.pos.x, heard.pos.z - a.pos.z) < 30) this.lookAt(heard.pos.x, heard.pos.y + 0.5, heard.pos.z, dt, 5);
    else {
      const ahead = this.path[Math.min(this.pathIdx + 1, this.path.length - 1)];
      const lx = (wp.x + ahead.x) / 2, lz = (wp.z + ahead.z) / 2;
      if (Math.hypot(lx - a.pos.x, lz - a.pos.z) > 0.8) this.aimTowards(yawTo(lx - a.pos.x, lz - a.pos.z), 0, 4.5, dt);
    }

    // stuck detection
    if (now >= this.stuckAt) {
      if (this.stuckPos.distanceTo(a.pos) < 0.35) {
        this.stuckCount++;
        this.unstickUntil = now + 0.5;
        this.unstickDir = this.m.rng.chance(0.5) ? 1 : -1;
        this.path = null;
        if (this.stuckCount > 6) { this.stuckCount = 0; }
      } else this.stuckCount = Math.max(0, this.stuckCount - 1);
      this.stuckPos.copy(a.pos);
      this.stuckAt = now + 0.8;
    }
    if (now < this.unstickUntil) { cmd.right = this.unstickDir; cmd.jump = this.stuckCount > 2; }
    return false;
  }

  /** Set forward/right toward a world point relative to the current yaw, with teammate separation. */
  private moveDirect(cmd: AgentCommand, x: number, z: number) {
    const a = this.agent;
    let dx = x - a.pos.x, dz = z - a.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    for (const o of this.m.agents) {
      if (o === a || !o.alive) continue;
      const ox = a.pos.x - o.pos.x, oz = a.pos.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      if (d < 1.0 && d > 0.01) { dx += (ox / d) * (1 - d) * 1.5; dz += (oz / d) * (1 - d) * 1.5; }
    }
    const l2 = Math.hypot(dx, dz) || 1;
    dx /= l2; dz /= l2;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cmd.forward = dx * fx + dz * fz;
    cmd.right = dx * rx + dz * rz;
  }

  private aimTowards(yaw: number, pitch: number, speed: number, dt: number) {
    speed *= 1 - 0.65 * this.agent.stunAt(this.m.time); // stun grenade: sluggish aim
    speed *= 1 - 0.5 * this.agent.dazzleAt(this.m.time); // blinded by a weapon light
    const k = 1 - Math.exp(-speed * dt);
    const maxTurn = 12 * dt; // rad/s cap
    const dy = clamp(angleDiff(this.yaw, yaw) * k, -maxTurn, maxTurn);
    this.yaw = wrapAngle(this.yaw + dy);
    this.pitch += clamp((pitch - this.pitch) * k, -maxTurn, maxTurn);
  }

  private lookAt(x: number, y: number, z: number, dt: number, speed: number, flat = false) {
    const eye = this.agent.eyePos(tmp);
    const dx = x - eye.x, dz = z - eye.z;
    const pitch = flat ? 0 : Math.atan2(y - eye.y, Math.max(0.5, Math.hypot(dx, dz)));
    this.aimTowards(yawTo(dx, dz), pitch, speed, dt);
  }

  private idleLook(dt: number, amount: number) {
    const t = this.m.time;
    this.yaw = wrapAngle(this.yaw + Math.sin(t * 0.7 + this.sweepPhase) * dt * 0.4 * amount);
    this.pitch += (0 - this.pitch) * Math.min(1, dt * 2);
  }

  private maintainWeapon(cmd: AgentCommand) {
    const a = this.agent;
    if (cmd.select || this.order.kind === 'plant') return;
    if (a.active === 'melee' || a.active === 'grenade' || a.active === 'bomb' || a.active === 'gadget') {
      if (a.primary) cmd.select = 'primary'; else if (a.secondary) cmd.select = 'secondary';
      return;
    }
    if (a.active === 'secondary' && a.primary && (a.primary.mag > 0 || a.primary.reserve > 0)) { cmd.select = 'primary'; return; }
    const w = a.activeWeapon();
    if (w && w.def.class !== 'knife' && w.mag < w.def.mag * 0.4 && w.reserve > 0 && (!this.heard || this.m.time - this.heard.time > 1.5)) cmd.reload = true;
  }

  // ---------------------------------------------------------------- utility
  /** Defenders set up gadgets when they reach their hold spot. */
  private placeHoldGadgets(x: number, z: number, lx: number, lz: number) {
    const a = this.agent, m = this.m;
    const yaw = yawTo(lx - x, lz - z);
    const d = Math.hypot(lx - x, lz - z);
    if (a.gadgets.shield > 0 && m.rng.chance(0.8)) {
      const p = new Vector3(x - Math.sin(yaw) * 1.1, a.pos.y, z - Math.cos(yaw) * 1.1);
      if (m.gadgets.placeAt(a, 'shield', p, yaw)) a.gadgets.shield--;
    }
    if (a.gadgets.flockCam > 0) {
      const p = new Vector3(x + Math.cos(yaw) * 0.8, a.pos.y, z - Math.sin(yaw) * 0.8);
      if (m.gadgets.placeAt(a, 'flockCam', p, yaw)) a.gadgets.flockCam--;
    }
    if (a.gadgets.wire > 0 && d > 5) {
      const k = Math.min(0.55, 9 / d);
      const p = new Vector3(x + (lx - x) * k, a.pos.y, z + (lz - z) * k);
      if (m.world.nav.isWalkableAt(p.x, p.z) && m.gadgets.placeAt(a, 'wire', p, yaw)) a.gadgets.wire--;
    }
    for (const kind of ['steelBarricade', 'barricade'] as const) {
      if (a.gadgets[kind] <= 0) continue;
      const fx = (lx - x) / Math.max(1, d), fz = (lz - z) / Math.max(1, d);
      const door = m.gadgets.doorFrames()
        .filter((f) => { const ox = f.cx - x, oz = f.cz - z, r = Math.hypot(ox, oz); return r > 2.5 && r < 13 && (ox * fx + oz * fz) / r > 0.35; })
        .sort((p1, p2) => Math.hypot(p1.cx - x, p1.cz - z) - Math.hypot(p2.cx - x, p2.cz - z))[0];
      if (!door) continue;
      // stand on our side of the doorway, facing it
      const sx = door.alongX ? door.cx : door.cx + Math.sign(x - door.cx || 1) * 1.4;
      const sz = door.alongX ? door.cz + Math.sign(z - door.cz || 1) * 1.4 : door.cz;
      this.tasks.push({ kind, gadget: true, x: sx, y: 1.2, z: sz, stage: 0, until: m.time + 12, lookX: door.cx, lookZ: door.cz });
      break;
    }
    if (a.gadgets.stickyCam > 0 && m.rng.chance(0.6)) {
      const k = Math.min(1, 10 / Math.max(1, d));
      this.tasks.push({ kind: 'stickyCam', gadget: true, x: x + (lx - x) * k, y: 2, z: z + (lz - z) * k, stage: 0, until: 0 });
    }
  }

  private planExecuteUtility(site: 'A' | 'B', entryX: number, entryZ: number) {
    const a = this.agent, m = this.m;
    if (m.rng.next() > this.diff.utilityUse) return;
    const holds = m.world.map.ai.holds.filter((h) => h.zone === site);
    if (a.grenades.smoke > 0 && holds.length) {
      const h = m.rng.pick(holds);
      this.tasks.push({ kind: 'smoke', x: (h.x + entryX) / 2, y: 0, z: (h.z + entryZ) / 2, stage: 0, until: 0 });
    }
    if (a.grenades.flash > 0) {
      const c = rectCenter(m.world.map.sites[site]);
      this.tasks.push({ kind: 'flash', x: (c.x + entryX) / 2, y: 2.4, z: (c.z + entryZ) / 2, stage: 0, until: 0 });
    }
    if (a.grenades.stun > 0) {
      const c = rectCenter(m.world.map.sites[site]);
      this.tasks.push({ kind: 'stun', x: (c.x * 2 + entryX) / 3, y: 0, z: (c.z * 2 + entryZ) / 3, stage: 0, until: 0 });
    }
    if (a.grenades.pulse > 0 && m.rng.chance(0.5)) {
      const c = rectCenter(m.world.map.sites[site]);
      this.tasks.push({ kind: 'pulse', x: c.x, y: 0, z: c.z, stage: 0, until: 0 });
    }
    const c = rectCenter(m.world.map.sites[site]);
    if (a.gadgets.emp > 0) this.tasks.unshift({ kind: 'emp', gadget: true, x: (c.x + entryX) / 2, y: 0, z: (c.z + entryZ) / 2, stage: 0, until: 0 });
    if (a.gadgets.stickyCam > 0) this.tasks.push({ kind: 'stickyCam', gadget: true, x: c.x, y: 1, z: c.z, stage: 0, until: 0 });
  }

  private considerUtility() {
    const a = this.agent, m = this.m, now = m.time;
    if (this.tasks.length || m.rng.next() > 0.08) return;
    // frag at a recent last-known position
    if (a.grenades.frag > 0 && this.lastSeen && now - this.lastSeen.time < 3 && now >= this.nextFragAt) {
      const d = this.lastSeen.pos.distanceTo(a.pos);
      if (d > 6 && d < 24 && m.rng.next() < this.diff.utilityUse) {
        this.tasks.push({ kind: 'frag', x: this.lastSeen.pos.x, y: this.lastSeen.pos.y, z: this.lastSeen.pos.z, stage: 0, until: 0 });
        this.nextFragAt = now + 8;
        return;
      }
    }
    // attackers: molly the defuser; defenders: molly a pushing choke
    if (a.grenades.fire > 0 && now >= this.nextFireAt) {
      const bomb = m.bomb;
      if (a.team === 'T' && bomb.state === 'planted' && bomb.defuserId !== null && bomb.pos.distanceTo(a.pos) < 22) {
        this.tasks.push({ kind: 'fire', x: bomb.pos.x, y: bomb.pos.y, z: bomb.pos.z, stage: 0, until: 0 });
        this.nextFireAt = now + 5;
      }
    }
    // defenders: react to a push they can hear with whatever utility they carry
    if (a.team === 'CT' && this.heard && this.heard.count >= 3 && now - this.heard.time < 1.5 && now >= this.nextFireAt && m.bomb.state !== 'planted') {
      const d = this.heard.pos.distanceTo(a.pos);
      const kind = (['fire', 'stun', 'frag', 'smoke', 'flash'] as const).find((k) => a.grenades[k] > 0);
      if (kind && d > 7 && d < 24 && m.rng.next() < this.diff.utilityUse) {
        this.tasks.push({ kind, x: this.heard.pos.x, y: this.heard.pos.y + (kind === 'flash' ? 2 : 0), z: this.heard.pos.z, stage: 0, until: 0 });
        this.nextFireAt = now + 6;
      }
    }
  }

  private runTask(cmd: AgentCommand, dt: number) {
    const a = this.agent, now = this.m.time;
    const t = this.tasks[0];
    if (t.kind === 'stimAlly') { this.runStimTask(cmd, dt, t); return; }
    if (t.kind === 'barricade' || t.kind === 'steelBarricade') { this.runBarricadeTask(cmd, dt, t); return; }
    const have = t.gadget ? a.gadgets[t.kind as GadgetId] : a.grenades[t.kind as UtilityId];
    if (have <= 0 && !(a.active === 'grenade' && a.wpn.throwPrimed) && t.stage < 3) { this.tasks.shift(); return; }
    const eye = a.eyePos(tmp);
    const dx = t.x - eye.x, dz = t.z - eye.z;
    const R = Math.max(1, Math.hypot(dx, dz));
    const h = t.y - eye.y;
    const v = t.gadget ? 14 : 17, g = t.gadget ? 9.8 : 10.3;
    const disc = v ** 4 - g * (g * R * R + 2 * h * v * v);
    let launch = disc < 0 ? Math.PI / 4 : Math.atan((v * v - Math.sqrt(disc)) / (g * R));
    launch = clamp(launch / DEG, -30, 60);
    // invert the +10° throw adjustment
    const pitchDeg = t.gadget ? launch - 4.6 : launch >= 10 ? (launch - 10) * 9 / 8 : (launch - 10) * 0.9;
    const yaw = yawTo(dx, dz);
    switch (t.stage) {
      case 0:
        if (t.gadget) {
          if (a.active === 'gadget' && a.activeGadget === t.kind) { t.stage = 1; t.until = now + 0.5; }
          else cmd.selectGadget = t.kind as GadgetId;
        } else if (a.active === 'grenade' && a.activeGrenade === t.kind) { t.stage = 1; t.until = now + 0.5; }
        else cmd.selectGrenade = t.kind as UtilityId;
        break;
      case 1:
        this.aimTowards(yaw, pitchDeg * DEG, 10, dt);
        if (now >= t.until && now >= a.wpn.drawUntil && Math.abs(angleDiff(this.yaw, yaw)) < 0.05) { t.stage = 2; t.until = now + 0.12; }
        break;
      case 2:
        this.aimTowards(yaw, pitchDeg * DEG, 10, dt);
        cmd.fire = true;
        if (now >= t.until) t.stage = 3;
        break;
      case 3:
        this.tasks.shift();
        break;
    }
  }

  /** Shoot a stim dart at a hurt teammate (leading for the dart's drop). */
  private runStimTask(cmd: AgentCommand, dt: number, t: ThrowTask) {
    const a = this.agent, m = this.m, now = m.time;
    const ally = m.agents.find((o) => o.id === t.targetId);
    if (!ally || !ally.alive || a.gadgets.stim <= 0 || now > t.until || t.stage >= 2) { this.tasks.shift(); return; }
    const eye = a.eyePos(tmp), c = ally.centerPos(tmp2);
    const flight = Math.hypot(c.x - eye.x, c.z - eye.z) / 38;
    c.x += ally.vel.x * flight; c.z += ally.vel.z * flight; // lead a moving teammate
    const horiz = Math.hypot(c.x - eye.x, c.z - eye.z);
    const drop = 0.5 * 9.8 * flight ** 2;
    const yaw = yawTo(c.x - eye.x, c.z - eye.z), pitch = Math.atan2(c.y + drop - eye.y, horiz) - 0.02;
    if (t.stage === 0) {
      if (a.active === 'gadget' && a.activeGadget === 'stim') t.stage = 1;
      else cmd.selectGadget = 'stim';
      return;
    }
    this.aimTowards(yaw, pitch, 9, dt);
    if (now >= a.wpn.drawUntil && now >= a.stimReadyAt && Math.abs(angleDiff(this.yaw, yaw)) < 0.012 && Math.abs(this.pitch - pitch) < 0.015 && a.speed2D < 1.5 && m.los(a, ally)) {
      cmd.fire = true; t.stage = 2;
    }
  }

  /** Walk up to a doorway and board it up. */
  private runBarricadeTask(cmd: AgentCommand, dt: number, t: ThrowTask) {
    const a = this.agent, now = this.m.time, kind = t.kind as 'barricade' | 'steelBarricade';
    if (a.gadgets[kind] <= 0 || now > t.until) { this.tasks.shift(); return; }
    if (t.stage === 0) { if (this.moveTo(cmd, t.x, t.z, dt, { tolerance: 0.5 })) t.stage = 1; return; }
    this.lookAt(t.lookX!, 1.2, t.lookZ!, dt, 8, true);
    if (t.stage === 1) {
      if (a.active === 'gadget' && a.activeGadget === kind) t.stage = 2;
      else cmd.selectGadget = kind;
      return;
    }
    const want = yawTo(t.lookX! - a.pos.x, t.lookZ! - a.pos.z);
    // (wait a tick after the draw so the trigger latch releases)
    if (t.stage === 2 && now >= a.wpn.drawUntil + 0.06 && Math.abs(angleDiff(this.yaw, want)) < 0.08) { cmd.fire = true; t.stage = 3; return; }
    if (t.stage === 3) this.tasks.shift();
  }
}

/** Utility: a unit forward vector for a bot's view (debug/tests). */
export function botForward(b: { agent: Agent }) { return dirFromAngles(b.agent.yaw, b.agent.pitch); }
