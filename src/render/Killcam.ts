import type { Team } from '../config/rules';
import type { SoundProfile } from '../config/weapons';
import type { Agent } from '../sim/entities/Agent';
import type { Match } from '../sim/mode/Match';

/**
 * Final killcam (Call of Duty S&D style). Every simulation tick we keep a compact snapshot of
 * every agent plus the visual events of that tick, for the last few seconds. When a round is
 * won by an elimination, the view replays the deciding kill from the killer's eyes.
 */
export interface AgentFrame {
  id: number; alive: boolean; team: Team;
  x: number; y: number; z: number; yaw: number; pitch: number; lean: number; duck: number; onGround: boolean;
  prone: number; slide: number; bodyYaw: number;
  speed: number; maxSpeed: number; fwd: number; right: number; vy: number;
  held: string; reload: number; planting: boolean;
  deathTime: number; deathYaw: number; deathVariant: number;
  ex: number; ey: number; ez: number;
  punchP: number; punchY: number; ads: boolean; scoped: boolean; zoom: number;
}

type V3 = [number, number, number];
export type ReplayEvent =
  | { k: 'shot'; agentId: number; sound: SoundProfile; o: V3; e: V3; tracer: boolean; pellet: boolean; kick: number }
  | { k: 'impact'; p: V3; n: V3; surface: string }
  | { k: 'hit'; victimId: number; attackerId: number; p: V3; d: V3; head: boolean; source: string }
  | { k: 'blast'; p: V3; radius: number }
  | { k: 'frag'; p: V3 }
  | { k: 'flash'; p: V3 }
  | { k: 'kill'; killerId: number; victimId: number; weapon: string; headshot: boolean }
  | { k: 'knife'; agentId: number; stab: boolean; hit: boolean }
  | { k: 'melee'; agentId: number; hit: boolean }
  | { k: 'throw'; agentId: number };

export interface Frame { t: number; agents: AgentFrame[]; events: ReplayEvent[] }

const KEEP = 7.5; // seconds of history

export class KillcamRecorder {
  frames: Frame[] = [];
  private pending: ReplayEvent[] = [];

  record(e: ReplayEvent) { this.pending.push(e); }
  clear() { this.frames = []; this.pending = []; }

  capture(m: Match, heldKey: (a: Agent) => string, zoom: (a: Agent) => number) {
    const now = m.time;
    const agents: AgentFrame[] = m.agents.map((a) => {
      const eye = a.eyePos();
      const w = a.activeWeapon();
      return {
        id: a.id, alive: a.alive, team: a.team,
        x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, lean: a.lean, duck: a.motor.duck, onGround: a.motor.onGround,
        prone: a.motor.prone, slide: a.motor.slidePose, bodyYaw: a.motor.bodyYaw,
        speed: a.speed2D, maxSpeed: a.maxSpeed(),
        fwd: -a.vel.x * Math.sin(a.yaw) - a.vel.z * Math.cos(a.yaw), right: a.vel.x * Math.cos(a.yaw) - a.vel.z * Math.sin(a.yaw), vy: a.vel.y,
        held: a.alive ? heldKey(a) : '',
        reload: a.wpn.reloadUntil > now && w ? 1 - (a.wpn.reloadUntil - now) / w.def.reloadTime : 0,
        planting: a.isPlanting || a.isDefusing,
        deathTime: a.deathTime, deathYaw: Math.atan2(a.deathDir.x, a.deathDir.z),
        deathVariant: a.killedBy >= 0 ? (a.id * 7 + Math.floor(a.deathTime * 13)) % 4 : 1,
        ex: eye.x, ey: eye.y, ez: eye.z,
        punchP: a.aimPunchPitch + a.flinchPitch, punchY: a.aimPunchYaw + a.flinchYaw,
        ads: a.wpn.ads, scoped: !!w?.def.scope && a.wpn.scope > 0, zoom: zoom(a),
      };
    });
    this.frames.push({ t: now, agents, events: this.pending });
    this.pending = [];
    while (this.frames.length && now - this.frames[0].t > KEEP) this.frames.shift();
  }

  /** The most recent kill in the buffer (frame index + event). */
  lastKill(): { idx: number; ev: Extract<ReplayEvent, { k: 'kill' }> } | null {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const ev = this.frames[i].events.find((e) => e.k === 'kill');
      if (ev && ev.k === 'kill') return { idx: i, ev };
    }
    return null;
  }
}

export interface KillcamInfo {
  killerId: number; victimId: number; killerName: string; victimName: string; killerTeam: Team;
  weapon: string; headshot: boolean; final: boolean;
  /** First person through the killer's eyes, or a chase camera on the victim (explosives, killstreaks). */
  firstPerson: boolean;
}

/** Plays a clip of recorded frames at real speed, slowing to 35% around the kill. */
export class KillcamPlayer {
  readonly frames: Frame[];
  readonly info: KillcamInfo;
  /** Replay clock in match time. */
  time: number;
  readonly start: number;
  readonly end: number;
  readonly killTime: number;
  private idx = 0;
  done = false;

  constructor(frames: Frame[], killIdx: number, info: KillcamInfo, before = 4.2, after = 1.4) {
    this.info = info;
    this.killTime = frames[killIdx].t;
    this.start = Math.max(frames[0].t, this.killTime - before);
    this.end = Math.min(frames[frames.length - 1].t, this.killTime + after);
    this.frames = frames.filter((f) => f.t >= this.start - 1e-6 && f.t <= this.end + 1e-6);
    this.time = this.start;
  }

  get progress() { return (this.time - this.start) / Math.max(0.01, this.end - this.start); }
  get slowMo() { return Math.abs(this.time - this.killTime) < 0.45; }

  /** Advance the replay; returns the events of every frame passed. */
  advance(dt: number): ReplayEvent[] {
    if (this.done) return [];
    this.time += dt * (this.slowMo ? 0.35 : 1);
    if (this.time >= this.end) { this.time = this.end; this.done = true; }
    const out: ReplayEvent[] = [];
    while (this.idx < this.frames.length && this.frames[this.idx].t <= this.time) out.push(...this.frames[this.idx++].events);
    return out;
  }

  /** Frames on either side of the replay clock and the blend between them. */
  sample(): { a: Frame; b: Frame; alpha: number } {
    const i = Math.max(0, Math.min(this.frames.length - 1, this.idx - 1));
    const a = this.frames[i], b = this.frames[Math.min(this.frames.length - 1, i + 1)];
    const span = b.t - a.t;
    return { a, b, alpha: span > 1e-6 ? Math.max(0, Math.min(1, (this.time - a.t) / span)) : 0 };
  }
}
