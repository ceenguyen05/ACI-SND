import type { Vector3 } from 'three';
import type { SoundProfile } from '../config/weapons';

type Pos = Vector3 | null;

interface GunVoice { body: number; q: number; thump: number; dur: number; gain: number; click: number }
const GUN: Record<SoundProfile, GunVoice> = {
  pistol: { body: 1500, q: 0.9, thump: 0.5, dur: 0.16, gain: 0.8, click: 0.6 },
  heavyPistol: { body: 800, q: 0.8, thump: 1.0, dur: 0.3, gain: 1.0, click: 0.7 },
  suppressed: { body: 2600, q: 1.5, thump: 0.1, dur: 0.08, gain: 0.35, click: 0.3 },
  smg: { body: 1300, q: 0.9, thump: 0.5, dur: 0.12, gain: 0.7, click: 0.6 },
  rifle: { body: 1000, q: 0.8, thump: 0.8, dur: 0.2, gain: 0.9, click: 0.8 },
  heavyRifle: { body: 750, q: 0.7, thump: 1.0, dur: 0.24, gain: 1.0, click: 0.9 },
  sniper: { body: 450, q: 0.6, thump: 1.4, dur: 0.5, gain: 1.15, click: 1.0 },
  shotgun: { body: 380, q: 0.6, thump: 1.3, dur: 0.35, gain: 1.1, click: 0.8 },
  knife: { body: 3000, q: 1, thump: 0, dur: 0.1, gain: 0.3, click: 0 },
  launcher: { body: 260, q: 0.6, thump: 1.6, dur: 0.3, gain: 1.0, click: 0.5 },
  rocket: { body: 180, q: 0.5, thump: 1.8, dur: 0.9, gain: 1.2, click: 0.6 },
};

/**
 * Procedural sound effects (WebAudio). No audio files: every sound is synthesized from noise
 * and oscillators, with HRTF positional panning for world sounds.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private world!: GainNode;
  private ui!: GainNode;
  private muffle!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private ringOsc: OscillatorNode | null = null;
  private volumes = { master: 0.8, sfx: 1, ui: 0.7 };

  /** Must be called from a user gesture. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
      this.world = this.ctx.createGain();
      this.ui = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.world.connect(this.muffle).connect(this.master);
      this.ui.connect(this.master);
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, sfx: number, ui: number) { this.volumes = { master, sfx, ui }; this.applyVolumes(); }
  private applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.world.gain.value = this.volumes.sfx;
    this.ui.gain.value = this.volumes.ui;
  }

  setListener(pos: Vector3, fwd: Vector3) {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    if (l.positionX) {
      const t = c.currentTime;
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    }
  }

  // ---------------------------------------------------------------- primitives
  private out(at: Pos, bus?: GainNode): AudioNode {
    const c = this.ctx!;
    if (!at) return bus ?? this.world;
    const p = c.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 2.5; p.rolloffFactor = 1.1; p.maxDistance = 120;
    p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z;
    p.connect(bus ?? this.world);
    return p;
  }

  private noiseHit(o: { at: Pos; dur: number; type: BiquadFilterType; freq: number; freqEnd?: number; q?: number; gain: number; attack?: number; delay?: number; bus?: GainNode }) {
    const c = this.ctx; if (!c || !(o.gain > 0.002)) return;
    const t = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = o.type; f.frequency.setValueAtTime(o.freq, t); f.Q.value = o.q ?? 1;
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.out(o.at, o.bus));
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  private tone(o: { at: Pos; type: OscillatorType; freq: number; freqEnd?: number; dur: number; gain: number; delay?: number; bus?: GainNode; attack?: number }) {
    const c = this.ctx; if (!c || !(o.gain > 0.002)) return;
    const t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.freqEnd), t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.out(o.at, o.bus));
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  // ---------------------------------------------------------------- weapons
  gunshot(profile: SoundProfile, at: Pos, distance = 0) {
    if (!this.ctx) return;
    const v = GUN[profile];
    const far = Math.min(1, distance / 60);
    const lp = 16000 * (1 - far * 0.85);
    this.noiseHit({ at, dur: 0.02, type: 'highpass', freq: 2500, gain: 0.5 * v.click * (1 - far), attack: 0.0005 });
    this.noiseHit({ at, dur: v.dur, type: 'bandpass', freq: v.body * (1 - far * 0.4), q: v.q, gain: 1.4 * v.gain, attack: 0.001 });
    this.noiseHit({ at, dur: v.dur * 2.6, type: 'lowpass', freq: Math.min(lp, 2200), freqEnd: 300, gain: 0.35 * v.gain, attack: 0.004 });
    if (v.thump > 0) this.tone({ at, type: 'sine', freq: 140, freqEnd: 45, dur: 0.12 + v.thump * 0.05, gain: 0.7 * v.thump * (1 - far * 0.5) });
    // A short mechanical layer separates the action from the report.
    this.noiseHit({ at, dur: 0.035, type: 'bandpass', freq: 3400, q: 3.5, gain: 0.11 * (1 - far), delay: profile === 'shotgun' ? 0.28 : 0.045 });
    if (profile === 'sniper' || profile === 'shotgun') this.noiseHit({ at, dur: 0.085, type: 'highpass', freq: 1700, gain: 0.15 * (1 - far), delay: 0.36 });
  }

  dryFire() { this.tone({ at: null, type: 'square', freq: 1800, freqEnd: 900, dur: 0.03, gain: 0.15 }); }

  reload(at: Pos, duration = 2.5) {
    this.noiseHit({ at, dur: 0.12, type: 'highpass', freq: 1100, gain: 0.12, delay: duration * 0.08 });
    this.noiseHit({ at, dur: 0.05, type: 'bandpass', freq: 2500, q: 4, gain: 0.3, delay: duration * 0.16 });
    this.noiseHit({ at, dur: 0.06, type: 'bandpass', freq: 1800, q: 3, gain: 0.4, delay: duration * 0.67 });
    this.noiseHit({ at, dur: 0.05, type: 'bandpass', freq: 3200, q: 5, gain: 0.35, delay: duration * 0.85 });
  }

  draw(at: Pos) { this.noiseHit({ at, dur: 0.08, type: 'bandpass', freq: 3000, q: 2, gain: 0.25 }); }

  knife(at: Pos, hit: boolean) {
    this.noiseHit({ at, dur: 0.16, type: 'bandpass', freq: 4000, freqEnd: 1500, q: 1.5, gain: 0.25 });
    if (hit) this.noiseHit({ at, dur: 0.08, type: 'lowpass', freq: 900, gain: 0.6, delay: 0.05 });
  }

  /** Feedback when the local player hits someone (CS-style audible hit). */
  hitConfirm(head: boolean, helmet: boolean) {
    if (head && helmet) this.tone({ at: null, type: 'triangle', freq: 3200, freqEnd: 2600, dur: 0.18, gain: 0.25, bus: this.ui });
    else if (head) this.noiseHit({ at: null, dur: 0.08, type: 'bandpass', freq: 1800, q: 2, gain: 0.6, bus: this.ui });
    else this.noiseHit({ at: null, dur: 0.05, type: 'lowpass', freq: 700, gain: 0.5, bus: this.ui });
  }

  /** Crisp confirmation when the local player gets a kill (brighter for headshots). */
  killConfirm(headshot: boolean) {
    this.tone({ at: null, type: 'sine', freq: headshot ? 1480 : 1180, dur: 0.09, gain: 0.22, bus: this.ui });
    this.tone({ at: null, type: 'sine', freq: headshot ? 2220 : 1580, dur: 0.16, gain: 0.18, delay: 0.06, bus: this.ui });
    if (headshot) this.noiseHit({ at: null, dur: 0.05, type: 'highpass', freq: 5000, gain: 0.25, bus: this.ui });
  }
  /** Low heartbeat-style thump when you die. */
  death() {
    this.tone({ at: null, type: 'sine', freq: 90, freqEnd: 40, dur: 0.5, gain: 0.6, bus: this.ui });
    this.noiseHit({ at: null, dur: 0.6, type: 'lowpass', freq: 400, freqEnd: 80, gain: 0.5, bus: this.ui });
  }

  hurt() { this.noiseHit({ at: null, dur: 0.12, type: 'lowpass', freq: 500, gain: 0.7 }); }

  footstep(surface: string, at: Pos, loud = 1) {
    const s: Record<string, [BiquadFilterType, number, number]> = {
      carpet: ['lowpass', 500, 0.35], carpetSite: ['lowpass', 500, 0.35], confCarpet: ['lowpass', 450, 0.3],
      marble: ['bandpass', 2400, 0.55], tile: ['bandpass', 2000, 0.5], checker: ['bandpass', 2200, 0.5],
      serverFloor: ['bandpass', 1400, 0.6], lino: ['bandpass', 1600, 0.45],
      concrete: ['bandpass', 1100, 0.55], concreteSite: ['bandpass', 1100, 0.55], warehouse: ['bandpass', 1200, 0.55],
      asphalt: ['bandpass', 800, 0.5], asphaltSpawn: ['bandpass', 800, 0.5],
    };
    const [type, freq, gain] = s[surface] ?? ['bandpass', 1000, 0.5];
    this.noiseHit({ at, dur: 0.07, type, freq: freq * (0.85 + Math.random() * 0.3), q: 1.2, gain: gain * loud });
    this.noiseHit({ at, dur: 0.05, type: 'lowpass', freq: 250, gain: 0.4 * loud, delay: 0.01 });
  }

  land(at: Pos) { this.noiseHit({ at, dur: 0.12, type: 'lowpass', freq: 400, gain: 0.6 }); }
  /** Dropping to / getting up from prone: cloth and gear rustle, a soft body thud going down. */
  prone(at: Pos, down: boolean) {
    this.noiseHit({ at, dur: down ? 0.3 : 0.22, type: 'bandpass', freq: down ? 900 : 1200, freqEnd: down ? 400 : 700, q: 0.8, gain: 0.22 });
    if (down) this.noiseHit({ at, dur: 0.14, type: 'lowpass', freq: 220, gain: 0.35, delay: 0.18 });
  }
  slide(at: Pos) {
    this.noiseHit({ at, dur: 0.42, type: 'bandpass', freq: 1300, freqEnd: 380, q: 0.6, gain: 0.38 });
    this.noiseHit({ at, dur: 0.12, type: 'lowpass', freq: 280, gain: 0.3 });
  }

  // ---------------------------------------------------------------- utility
  throwSound(at: Pos) { this.noiseHit({ at, dur: 0.2, type: 'bandpass', freq: 1200, freqEnd: 600, q: 1, gain: 0.3 }); }
  bounce(at: Pos) { this.tone({ at, type: 'triangle', freq: 900 + Math.random() * 400, dur: 0.06, gain: 0.2 }); }

  explosion(at: Pos, big = false) {
    const k = big ? 1.6 : 1;
    this.noiseHit({ at, dur: 1.4 * k, type: 'lowpass', freq: 1800, freqEnd: 120, gain: 1.8, attack: 0.002 });
    this.tone({ at, type: 'sine', freq: 90, freqEnd: 30, dur: 0.8 * k, gain: 1.4 });
    this.noiseHit({ at, dur: 0.06, type: 'highpass', freq: 1500, gain: 0.9 });
  }

  flashPop(at: Pos) {
    this.noiseHit({ at, dur: 0.5, type: 'highpass', freq: 1200, gain: 1.4, attack: 0.001 });
    this.tone({ at, type: 'sine', freq: 200, freqEnd: 60, dur: 0.3, gain: 0.8 });
  }

  smokePop(at: Pos) {
    this.noiseHit({ at, dur: 0.1, type: 'bandpass', freq: 600, gain: 0.6 });
    this.noiseHit({ at, dur: 3.5, type: 'highpass', freq: 3000, gain: 0.25, attack: 0.2 });
  }

  fireIgnite(at: Pos) {
    this.noiseHit({ at, dur: 0.15, type: 'highpass', freq: 3000, gain: 0.6 });
    this.noiseHit({ at, dur: 2.5, type: 'bandpass', freq: 700, q: 0.5, gain: 0.5, attack: 0.1 });
  }
  fireCrackle(at: Pos) { this.noiseHit({ at, dur: 0.04, type: 'highpass', freq: 2500, gain: 0.25 }); }
  fireOut(at: Pos) { this.noiseHit({ at, dur: 0.8, type: 'highpass', freq: 4000, freqEnd: 1500, gain: 0.4 }); }

  pulse(at: Pos) {
    this.tone({ at, type: 'sine', freq: 1400, freqEnd: 900, dur: 0.35, gain: 0.35 });
    this.tone({ at, type: 'sine', freq: 2100, freqEnd: 1300, dur: 0.25, gain: 0.2, delay: 0.05 });
  }

  /** Flash-bang tinnitus + muffling for the local player. */
  tinnitus(strength: number, duration: number) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(400 + (1 - strength) * 3000, t);
    this.muffle.frequency.exponentialRampToValueAtTime(20000, t + duration);
    if (this.ringOsc) { try { this.ringOsc.stop(); } catch { /* already stopped */ } }
    const osc = c.createOscillator();
    osc.frequency.value = 3600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.12 * strength), t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + duration + 0.1);
    this.ringOsc = osc;
  }

  // ---------------------------------------------------------------- gadgets
  gadgetDeploy(at: Pos) {
    this.noiseHit({ at, dur: 0.08, type: 'lowpass', freq: 600, gain: 0.5 });
    this.tone({ at, type: 'square', freq: 1600, dur: 0.05, gain: 0.08, delay: 0.08 });
  }
  ping() {
    this.tone({ at: null, type: 'sine', freq: 1760, dur: 0.08, gain: 0.2, bus: this.ui });
    this.tone({ at: null, type: 'sine', freq: 2640, dur: 0.12, gain: 0.15, delay: 0.07, bus: this.ui });
  }
  camSwitch() { this.noiseHit({ at: null, dur: 0.12, type: 'highpass', freq: 3000, gain: 0.25, bus: this.ui }); }
  deviceDestroyed(at: Pos) {
    this.noiseHit({ at, dur: 0.15, type: 'highpass', freq: 2500, gain: 0.5 });
    this.tone({ at, type: 'sawtooth', freq: 900, freqEnd: 120, dur: 0.25, gain: 0.15 });
  }
  emp(at: Pos) {
    this.tone({ at, type: 'sawtooth', freq: 120, freqEnd: 2400, dur: 0.35, gain: 0.35 });
    this.noiseHit({ at, dur: 0.6, type: 'bandpass', freq: 4000, q: 2, gain: 0.5 });
  }
  mineArmed(at: Pos) { this.tone({ at, type: 'sine', freq: 2400, dur: 0.06, gain: 0.15 }); this.tone({ at, type: 'sine', freq: 2400, dur: 0.06, gain: 0.15, delay: 0.12 }); }
  mineTrip(at: Pos) { this.tone({ at, type: 'square', freq: 3000, dur: 0.25, gain: 0.25 }); }
  wireRattle(at: Pos) {
    for (let i = 0; i < 4; i++) this.noiseHit({ at, dur: 0.04, type: 'bandpass', freq: 3500 + Math.random() * 2000, q: 6, gain: 0.35, delay: i * 0.05 });
  }
  droneHum(at: Pos) { this.tone({ at, type: 'sawtooth', freq: 180 + Math.random() * 20, dur: 0.12, gain: 0.04 }); }

  // ---------------------------------------------------------------- bomb / round
  // ---------------------------------------------------------------- arsenal + killstreaks
  /** Blast scaled by radius: rockets / C4 / hunter drones / cruise missiles. */
  blast(at: Pos, radius: number) {
    const big = radius >= 7;
    this.explosion(at, big);
    this.tone({ at, type: 'sine', freq: 70, freqEnd: 24, dur: 0.9 + radius * 0.05, gain: 0.9 });
    this.noiseHit({ at, dur: 0.6, type: 'highpass', freq: 3000, freqEnd: 800, gain: 0.25, delay: 0.12 }); // debris rattle
  }
  rocketLoop(at: Pos) { this.noiseHit({ at, dur: 0.18, type: 'bandpass', freq: 700, q: 0.8, gain: 0.35 }); }
  stimShot(at: Pos) {
    this.noiseHit({ at, dur: 0.09, type: 'bandpass', freq: 2600, q: 3, gain: 0.35 });
    this.tone({ at, type: 'sine', freq: 520, freqEnd: 260, dur: 0.12, gain: 0.12 });
  }
  stimInject(at: Pos) {
    this.noiseHit({ at, dur: 0.35, type: 'highpass', freq: 5000, freqEnd: 2500, gain: 0.22 });
    this.tone({ at, type: 'sine', freq: 660, dur: 0.12, gain: 0.12, delay: 0.1 });
    this.tone({ at, type: 'sine', freq: 990, dur: 0.18, gain: 0.1, delay: 0.2 });
  }
  meleeSwing(at: Pos, hit: boolean) {
    this.noiseHit({ at, dur: 0.18, type: 'bandpass', freq: 2200, freqEnd: 700, q: 1.2, gain: 0.32 });
    if (hit) this.noiseHit({ at, dur: 0.09, type: 'lowpass', freq: 800, gain: 0.7, delay: 0.09 });
  }
  pry(at: Pos) { this.noiseHit({ at, dur: 0.25, type: 'bandpass', freq: 480 + Math.random() * 200, q: 6, gain: 0.3 }); }
  barricadeBreak(at: Pos, metal: boolean) {
    this.noiseHit({ at, dur: 0.5, type: metal ? 'bandpass' : 'lowpass', freq: metal ? 1800 : 900, freqEnd: 200, q: metal ? 3 : 1, gain: 0.8 });
    this.noiseHit({ at, dur: 0.15, type: 'highpass', freq: 2500, gain: 0.3, delay: 0.08 });
  }
  resupply() {
    for (let i = 0; i < 3; i++) this.noiseHit({ at: null, dur: 0.05, type: 'bandpass', freq: 2600 + i * 400, q: 4, gain: 0.3, delay: i * 0.09 });
  }
  /** UI fanfare when a killstreak is earned. */
  streakEarned() {
    [880, 1175, 1480].forEach((f, i) => this.tone({ at: null, type: 'triangle', freq: f, dur: 0.14, gain: 0.16, delay: i * 0.08, bus: this.ui }));
  }
  /** Radio blip when a streak is called in (friendly or enemy). */
  streakCalled(friendly: boolean) {
    this.noiseHit({ at: null, dur: 0.12, type: 'bandpass', freq: 1800, q: 2, gain: 0.25, bus: this.ui });
    this.tone({ at: null, type: 'square', freq: friendly ? 1320 : 440, dur: 0.1, gain: 0.07, delay: 0.14, bus: this.ui });
    this.tone({ at: null, type: 'square', freq: friendly ? 1760 : 330, dur: 0.14, gain: 0.07, delay: 0.26, bus: this.ui });
  }
  uavPing() { this.tone({ at: null, type: 'sine', freq: 1900, freqEnd: 1500, dur: 0.18, gain: 0.05, bus: this.ui }); }
  missileWind() { this.noiseHit({ at: null, dur: 0.3, type: 'bandpass', freq: 500, q: 0.7, gain: 0.25 }); }
  c4Arm(at: Pos) { this.tone({ at, type: 'square', freq: 2800, dur: 0.04, gain: 0.12 }); }

  // ---------------------------------------------------------------- tactical gear + moments
  stunBang(at: Pos) {
    this.noiseHit({ at, dur: 0.5, type: 'lowpass', freq: 2400, freqEnd: 200, gain: 1.3, attack: 0.001 });
    this.tone({ at, type: 'sine', freq: 95, freqEnd: 40, dur: 0.4, gain: 0.7 });
  }
  /** Local player stunned: a muffled wobbling hum. */
  stunned(strength: number, duration: number) {
    this.tone({ at: null, type: 'sine', freq: 180, freqEnd: 120, dur: Math.max(0.6, duration), gain: 0.06 + 0.1 * strength, bus: this.ui, attack: 0.05 });
    this.tone({ at: null, type: 'sine', freq: 187, freqEnd: 125, dur: Math.max(0.6, duration), gain: 0.05 + 0.08 * strength, bus: this.ui, attack: 0.05 });
  }
  mantle(at: Pos) {
    this.noiseHit({ at, dur: 0.12, type: 'bandpass', freq: 900, q: 1.5, gain: 0.35 });
    this.noiseHit({ at, dur: 0.2, type: 'lowpass', freq: 500, gain: 0.35, delay: 0.16 });
  }
  knifeThrow(at: Pos) { this.noiseHit({ at, dur: 0.22, type: 'bandpass', freq: 3200, freqEnd: 1200, q: 2, gain: 0.3 }); }
  knifePickup() { this.tone({ at: null, type: 'triangle', freq: 2600, dur: 0.06, gain: 0.12, bus: this.ui }); this.tone({ at: null, type: 'triangle', freq: 3400, dur: 0.08, gain: 0.1, delay: 0.05, bus: this.ui }); }
  heartbeatBeep(found: boolean) {
    this.tone({ at: null, type: 'sine', freq: 1450, dur: 0.07, gain: 0.07, bus: this.ui });
    if (found) this.tone({ at: null, type: 'sine', freq: 980, dur: 0.12, gain: 0.08, delay: 0.09, bus: this.ui });
  }
  pingSound(enemy: boolean) {
    this.tone({ at: null, type: 'sine', freq: enemy ? 1320 : 990, dur: 0.08, gain: 0.14, bus: this.ui });
    this.tone({ at: null, type: 'sine', freq: enemy ? 1760 : 1320, dur: 0.12, gain: 0.12, delay: 0.07, bus: this.ui });
  }
  /** Multi-kill / clutch stinger: more notes for bigger moments. */
  stinger(level: number) {
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, Math.min(6, level + 1));
    notes.forEach((f, i) => this.tone({ at: null, type: 'triangle', freq: f, dur: 0.16, gain: 0.13, delay: i * 0.07, bus: this.ui }));
  }
  /** Low-health heartbeat thump. */
  lowHealth() {
    this.tone({ at: null, type: 'sine', freq: 62, freqEnd: 45, dur: 0.14, gain: 0.32, bus: this.ui });
    this.tone({ at: null, type: 'sine', freq: 58, freqEnd: 42, dur: 0.16, gain: 0.26, delay: 0.2, bus: this.ui });
  }
  killcamWhoosh() {
    this.noiseHit({ at: null, dur: 0.6, type: 'bandpass', freq: 400, freqEnd: 2400, q: 0.8, gain: 0.35, bus: this.ui });
  }

  bombBeep(at: Pos) { this.tone({ at, type: 'sine', freq: 2200, dur: 0.09, gain: 0.5 }); }
  plantKey() { this.tone({ at: null, type: 'square', freq: 1200 + Math.random() * 800, dur: 0.05, gain: 0.08 }); }
  defuseTick(at: Pos) { this.noiseHit({ at, dur: 0.04, type: 'bandpass', freq: 3500, q: 6, gain: 0.3 }); }
  bombPlanted() {
    this.tone({ at: null, type: 'square', freq: 880, dur: 0.12, gain: 0.12, bus: this.ui });
    this.tone({ at: null, type: 'square', freq: 660, dur: 0.2, gain: 0.12, delay: 0.15, bus: this.ui });
  }

  roundStart() {
    this.tone({ at: null, type: 'triangle', freq: 523, dur: 0.15, gain: 0.25, bus: this.ui });
    this.tone({ at: null, type: 'triangle', freq: 784, dur: 0.3, gain: 0.25, delay: 0.15, bus: this.ui });
  }
  roundEnd(win: boolean) {
    const notes = win ? [523, 659, 784, 1047] : [440, 392, 349, 262];
    notes.forEach((f, i) => this.tone({ at: null, type: 'triangle', freq: f, dur: 0.35, gain: 0.22, delay: i * 0.14, bus: this.ui }));
  }
  ui_click() { this.tone({ at: null, type: 'sine', freq: 1200, freqEnd: 800, dur: 0.05, gain: 0.15, bus: this.ui }); }
  ui_hover() { this.tone({ at: null, type: 'sine', freq: 1800, dur: 0.02, gain: 0.05, bus: this.ui }); }
  buy() {
    this.noiseHit({ at: null, dur: 0.05, type: 'bandpass', freq: 3000, q: 4, gain: 0.3, bus: this.ui });
    this.tone({ at: null, type: 'sine', freq: 1500, dur: 0.08, gain: 0.12, delay: 0.04, bus: this.ui });
  }
  denied() { this.tone({ at: null, type: 'square', freq: 220, dur: 0.12, gain: 0.08, bus: this.ui }); }
}

export const sfx = new Sfx();
