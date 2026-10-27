import { Color, Fog, Group, Mesh, MeshBasicMaterial, CircleGeometry, RingGeometry, PlaneGeometry, SphereGeometry, AdditiveBlending, Vector3 } from 'three';
import type { GameRenderer } from './Renderer';
import type { MatchView } from './MatchView';
import type { Agent } from '../sim/entities/Agent';
import type { ZombiesMatch, GateState } from '../sim/zombies/ZombiesMatch';
import { layoutPlacements } from '../sim/zombies/ZombiesMatch';
import { cellRectWorld } from '../sim/maps/aciHqZombies';
import { weaponModel } from './WeaponModels';
import { releaseModel } from './Geometry';
import {
  armoryModel, batchZombiesModel, debrisModel, forgeModel, heliModel, lzModel, mysteryBoxModel, perkMachineModel, powerModel, powerUpModel, radioModel,
  shutterModel, teddyModel, tintModel, wallBuyModel,
} from './ZombiesModels';
import { BOX_POOL, BOX_TUNING, PERK_ORDER, POWERUPS, POWERUP_TUNING, ZOMBIE_TUNING, type PowerUpId } from '../config/zombies';
import { sfx } from '../audio/Sfx';
import { announcer } from '../audio/Announcer';
import { clamp, damp } from '../core/math';
import type { WeaponId } from '../config/weapons';

const tmpC = new Color();

/**
 * Presents the Zombies-only world: security shutters, boarded doorways, wall weapons, perk
 * machines, the Mystery Box, the Prototype Forge, power, armory, power-ups, gas / acid
 * hazards and the exfil helicopter — plus the zombie audio and lighting mood (the building
 * is dark until the power comes on; frenzy waves turn the air red).
 */
export class ZombiesView {
  private root = new Group();
  private gates: { st: GateState; g: Group; h: number }[] = [];
  private boxes: Group[] = [];
  private boxShowIds: WeaponId[] = BOX_POOL.map(([id]) => id);
  private shown = new Map<string, Group>();
  private teddy = teddyModel();
  private forge: Group;
  private power: Group;
  private radio: Group;
  private perks: { perk: (typeof PERK_ORDER)[number]; g: Group }[] = [];
  private powerUps = new Map<number, Group>();
  private acid = new Map<number, Mesh>();
  private spits = new Map<number, Mesh>();
  private warnings = new Map<number, { root: Group; ring: Mesh<RingGeometry, MeshBasicMaterial>; lane: Mesh<PlaneGeometry, MeshBasicMaterial> }>();
  private lz: Group;
  private heli: Group;
  private heliT = 0;
  private rotorT = 0;
  private gasT = 0;
  private unsub: (() => void)[] = [];
  private exposure = 0.72;
  private fogColor = new Color();
  private baseFog: { color: Color; near: number; far: number } | null = null;
  private baseExposure: number;
  private boxMoveFrom = -1;

  constructor(private r: GameRenderer, private m: ZombiesMatch, private mv: MatchView, private viewer: () => Agent | null) {
    r.scene.add(this.root);
    this.baseExposure = r.renderer.toneMappingExposure;
    if (r.scene.fog instanceof Fog) this.baseFog = { color: r.scene.fog.color.clone(), near: r.scene.fog.near, far: r.scene.fog.far };
    const map = m.layout.map;
    const light = (x: number, y: number, z: number) => (r.baked ? r.baked.probe(x, y, z, new Color()) : new Color(1, 1, 1));
    const place = (g: Group, x: number, z: number, yaw: number, y = 0) => { g.position.set(x, y, z); g.rotation.y = yaw; tintModel(g, light(x, y + 1.2, z)); batchZombiesModel(g); this.root.add(g); };

    // gates (rolling shutters) and boarded doorways
    const span = (cells: [number, number, number, number]) => {
      const rw = cellRectWorld(map, cells);
      const w = rw.x1 - rw.x0, d = rw.z1 - rw.z0;
      // a passage running east–west has its shutter spanning north–south
      const ewPassage = w === d ? map.grid[cells[1]]?.[cells[0] - 1] !== '#' : d > w;
      return { cx: (rw.x0 + rw.x1) / 2, cz: (rw.z0 + rw.z1) / 2, width: ewPassage ? d : w, yaw: ewPassage ? Math.PI / 2 : 0 };
    };
    for (const st of m.gates) {
      const s = span(st.def.cells);
      const g = shutterModel(s.width, st.lintel, st.def.name, st.def.price);
      place(g, s.cx, s.cz, s.yaw);
      this.gates.push({ st, g, h: st.lintel });
    }
    m.layout.blocked.forEach((c, i) => { const s = span(c); place(debrisModel(s.width, i + 3), s.cx, s.cz, s.yaw); });

    const pl = layoutPlacements(m.layout);
    for (const w of pl.wallBuys) place(wallBuyModel(w.weapon, w.price), w.x, w.z, w.yaw, 1.45);
    for (const p of pl.perks) { const g = perkMachineModel(p.perk); place(g, p.x, p.z, p.yaw); this.perks.push({ perk: p.perk, g }); }
    pl.boxes.forEach((b) => { const g = mysteryBoxModel(); place(g, b.x, b.z, b.yaw); this.boxes.push(g); });
    this.forge = forgeModel(); place(this.forge, pl.forge.x, pl.forge.z, pl.forge.yaw);
    this.power = powerModel(); place(this.power, pl.power.x, pl.power.z, pl.power.yaw);
    place(armoryModel(), pl.armory.x, pl.armory.z, pl.armory.yaw);
    const rd = m.layout.radio;
    this.radio = radioModel(); place(this.radio, rd.x, rd.z, rd.yaw, rd.y);
    this.lz = lzModel(ZOMBIE_TUNING.exfilRadius); this.lz.position.set(m.layout.lz.x, 0, m.layout.lz.z); this.lz.visible = false; this.root.add(this.lz);
    this.heli = heliModel(); this.heli.visible = false; this.root.add(this.heli);
    this.teddy.visible = false; this.root.add(this.teddy);
    this.wire();
  }

  private isViewer(id: number) { return this.viewer()?.id === id || this.m.player?.id === id; }
  private listener() { return this.r.camera.position; }
  private near(p: Vector3, d: number) { return p.distanceTo(this.listener()) < d; }

  private wire() {
    const ev = this.m.events, fx = this.r.effects;
    const on = <K extends Parameters<typeof ev.on>[0]>(k: K, fn: Parameters<typeof ev.on<K>>[1]) => this.unsub.push(ev.on(k, fn));
    on('zSpawn', (e) => {
      if (!this.near(e.pos, 45)) return;
      fx.puff({ pos: e.pos.clone().setY(e.pos.y + 0.1), count: e.kind === 'tank' ? 40 : 18, speed: 2.4, life: [0.6, 1.6], size: [0.3, 1.4], color: '#5a5048', alpha: 0.6, drag: 2, up: 1.4 });
      fx.puff({ pos: e.pos.clone().setY(e.pos.y + 0.1), count: 10, speed: 4, life: [0.4, 1.0], size: [0.05, 0.12], color: '#3a3430', alpha: 0.95, gravity: 9, up: 3 });
      if (this.near(e.pos, 26)) sfx.zombieRise(e.pos.clone());
    });
    on('zVoice', (e) => {
      if (!this.near(e.pos, e.kind === 'roar' || e.kind === 'scream' ? 70 : 28)) return;
      const at = e.pos.clone().setY(e.pos.y + 1.5);
      if (e.kind === 'scream' || e.kind === 'shriek') sfx.zombieScream(at);
      else if (e.kind === 'roar') { sfx.zombieRoar(at); this.mv.shakeAt(e.pos, 0.35, 25); }
      else sfx.zombieVoice(at, e.zombie, e.kind === 'groan' || e.kind === 'growl' || e.kind === 'death' || e.kind === 'spit' || e.kind === 'fuse' ? e.kind : 'growl');
    });
    on('zSwipe', (e) => {
      const z = this.m.getAgent(e.id);
      if (z && this.near(z.pos, 25)) sfx.zombieSwipe(z.pos.clone().setY(z.pos.y + 1.2), e.hit);
    });
    on('zBlast', (e) => {
      switch (e.kind) {
        case 'shock':
          fx.pulseRing(e.pos, '#40e8ff', e.radius);
          fx.glow({ pos: e.pos.clone().setY(e.pos.y + 1), count: 40, speed: e.radius * 2.4, life: [0.1, 0.35], size: [0.3, 0.05], color: '#80f0ff' });
          fx.lightFlash(e.pos.clone().setY(e.pos.y + 1), 0x60e0ff, 60, 0.25, e.radius * 3);
          sfx.shockZap(e.pos.clone());
          break;
        case 'slam':
          fx.pulseRing(e.pos, '#ffb080', e.radius * 1.4);
          fx.puff({ pos: e.pos.clone().setY(e.pos.y + 0.1), count: 30, speed: 5, life: [0.6, 1.4], size: [0.4, 1.8], color: '#6a6058', alpha: 0.6, drag: 2.4, up: 0.8 });
          sfx.blast(e.pos.clone(), 3);
          this.mv.shakeAt(e.pos, 0.7, 18);
          break;
        case 'bomber':
          fx.pulseRing(e.pos, '#ff7020', e.radius * 1.6);
          fx.puff({ pos: e.pos.clone(), count: 24, speed: 4, life: [1.2, 2.6], size: [0.8, 2.6], color: '#6a4a2a', alpha: 0.55, drag: 2, up: 1.2 });
          break;
        case 'lure':
          fx.pulseRing(e.pos, '#ff60c0', e.radius * 1.4);
          break;
        case 'nuke':
          fx.lightFlash(this.listener().clone().setY(this.listener().y + 4), 0xfff0d0, 400, 0.8, 120);
          sfx.nukeFlash();
          break;
      }
    });
    on('zHazard', (e) => {
      if (e.kind === 'gas') {
        fx.puff({ pos: e.pos.clone().setY(e.pos.y + 0.8), count: 30, speed: 3, life: [1.2, 2.6], size: [0.8, 2.8], color: '#6ab040', alpha: 0.45, drag: 1.6, up: 0.6 });
        if (this.near(e.pos, 30)) sfx.gasBurst(e.pos.clone());
      } else if (e.kind === 'acid') {
        fx.glow({ pos: e.pos.clone().setY(e.pos.y + 0.1), count: 16, speed: 2.4, life: [0.2, 0.6], size: [0.12, 0.03], color: '#9dff2a', gravity: 6, up: 1.6 });
        if (this.near(e.pos, 25)) sfx.acidSizzle(e.pos.clone());
      }
    });
    on('zDoor', (e) => {
      fx.puff({ pos: e.pos.clone().setY(1.2), count: 26, speed: 1.6, life: [0.8, 2.0], size: [0.4, 1.6], color: '#8a8478', alpha: 0.45, drag: 1.8, up: 0.4 });
      sfx.doorOpen(e.pos.clone().setY(1.6));
      if (this.isViewer(e.byId)) sfx.purchase();
    });
    on('zPower', () => { sfx.powerOn(); announcer.say('Power is on. Perks and the forge are online.', true); });
    on('zPerk', (e) => { if (e.gained && this.isViewer(e.agentId)) sfx.perkJingle(PERK_ORDER.indexOf(e.perk)); });
    on('zBuy', (e) => { if (this.isViewer(e.agentId) && e.kind !== 'door') sfx.purchase(); });
    on('zDenied', (e) => { if (this.isViewer(e.agentId)) sfx.denied(); });
    on('zBox', (e) => {
      const pos = this.m.box.pos.clone().setY(1);
      if (e.state === 'spin') sfx.boxSpin(pos, BOX_TUNING.spin);
      else if (e.state === 'ready') sfx.boxReady(pos);
      else if (e.state === 'teddy') { sfx.boxTeddy(pos); if (this.isViewer(e.byId)) announcer.say('Bye bye!'); this.boxMoveFrom = e.spot; }
      else if (e.state === 'moved') { this.boxMoveFrom = -1; announcer.say('The Mystery Box has moved'); }
    });
    on('zForge', (e) => { if (e.state === 'start') sfx.forgeWork(this.m.forge.pos.clone().setY(1.3)); else if (e.state === 'ready') sfx.boxReady(this.m.forge.pos.clone().setY(1.3)); });
    on('zPowerUp', (e) => {
      if (e.state === 'drop') sfx.powerUpDrop(e.pos.clone());
      else if (e.state === 'grab') {
        sfx.powerUpGrab();
        announcer.say(POWERUPS[e.kind].name, true);
        fx.glow({ pos: e.pos.clone(), count: 30, speed: 4, life: [0.2, 0.6], size: [0.25, 0.05], color: POWERUPS[e.kind].color });
      } else if (e.state === 'end') sfx.powerUpEnd();
    });
    on('zDowned', (e) => { if (this.isViewer(e.agentId)) sfx.downed(); });
    on('zRevived', (e) => { if (this.isViewer(e.agentId)) sfx.revived(); });
    on('zBleedOut', (e) => { if (this.isViewer(e.agentId)) sfx.setMuffle(false); });
    on('zRespawn', (e) => { if (this.isViewer(e.agentId)) sfx.setMuffle(false); });
    on('zWave', (e) => {
      if (e.state === 'start') {
        sfx.waveStart(e.kind);
        announcer.say(e.kind === 'frenzy' ? `Wave ${e.wave}. Frenzy!` : e.kind === 'boss' ? `Wave ${e.wave}. Juggernaut incoming.` : `Wave ${e.wave}`, true);
      } else sfx.waveEnd();
    });
    on('zArmor', (e) => {
      const z = this.m.getAgent(e.id);
      if (!z) return;
      const p = e.part === 'helmet' ? z.eyePos(new Vector3()) : z.centerPos(new Vector3());
      fx.glow({ pos: p, count: 18, speed: 5, life: [0.1, 0.4], size: [0.08, 0.02], color: '#ffd080', gravity: 9 });
      fx.puff({ pos: p, count: 6, speed: 2.5, life: [0.6, 1.2], size: [0.06, 0.14], color: '#4c5056', alpha: 1, gravity: 9 });
      sfx.barricadeBreak(p, true);
    });
    on('zExfil', (e) => {
      if (e.state === 'available') announcer.say('Exfil is available. Use the radio at the reception desk.');
      else if (e.state === 'called') { sfx.radio(); announcer.say('Exfil inbound. Get to the landing zone in the loading yard!', true); }
      else if (e.state === 'holding') announcer.say('Hold the landing zone until the chopper arrives!', true);
      else if (e.state === 'failed') announcer.say('Exfil failed.', true);
    });
    on('zGameOver', (e) => announcer.say(e.won ? 'Exfil successful. You made it out.' : 'Game over.', true));
    on('kill', (e) => {
      const z = this.m.getAgent(e.victimId)?.zombie;
      if (!z || !z.headless) return;
      const head = this.m.getAgent(e.victimId)!.eyePos(new Vector3());
      fx.blood(head, new Vector3(0, 1, 0), true);
      fx.puff({ pos: head, count: 12, speed: 3.5, life: [0.3, 0.8], size: [0.05, 0.16], color: '#6a0c0c', alpha: 0.95, gravity: 9, up: 2 });
    });
  }

  // ---------------------------------------------------------------------------- per frame
  frame(dt: number) {
    const m = this.m, now = m.time, fx = this.r.effects;
    // gates roll up when bought
    for (const gate of this.gates) {
      const panel = gate.g.getObjectByName('panel')!;
      if (!gate.st.open) { panel.visible = true; panel.position.y = 0; panel.scale.y = 1; continue; }
      const k = clamp((now - gate.st.openedAt) / 1.1, 0, 1), e = k * k * (3 - 2 * k);
      panel.scale.y = Math.max(0.001, 1 - e);
      panel.position.y = gate.h * e * 0.92;
      panel.visible = k < 1;
    }
    // power: perk machines light up, the lever drops, the building brightens
    for (const p of this.perks) {
      const lit = m.power || p.perk === 'secondWind';
      const panel = p.g.getObjectByName('panel') as Mesh;
      const target = lit ? 1 : 0.16;
      const mat = panel.material as MeshBasicMaterial;
      mat.color.setScalar(damp(mat.color.r, target, 3, dt));
      p.g.getObjectByName('crown')!.visible = lit;
      p.g.getObjectByName('pool')!.visible = lit;
    }
    const lever = this.power.getObjectByName('lever')!;
    lever.rotation.x = damp(lever.rotation.x, m.power ? -0.7 : 0.7, 6, dt);
    this.power.getObjectByName('ledOn')!.visible = m.power;
    this.power.getObjectByName('ledOff')!.visible = !m.power;
    this.mood(dt);
    this.frameBox(dt, now);
    this.frameForge(dt, now);
    // exfil radio
    const avail = m.exfil.phase === 'available';
    (this.radio.getObjectByName('led') as Mesh).visible = avail ? Math.floor(now * 3) % 2 === 0 : Math.floor(now * 0.7) % 2 === 0;
    ((this.radio.getObjectByName('beacon') as Mesh).material as MeshBasicMaterial).opacity = avail ? 0.12 + 0.05 * Math.sin(now * 4) : 0;
    this.framePowerUps(now);
    // gas clouds
    this.gasT -= dt;
    if (this.gasT <= 0) {
      this.gasT = 1 / 30;
      for (const g of m.gas) {
        const life = clamp((g.until - now) / 2, 0, 1);
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * g.radius * 0.8;
        fx.puff({ pos: new Vector3(g.pos.x + Math.cos(a) * rr, g.pos.y + 0.3 + Math.random() * 0.8, g.pos.z + Math.sin(a) * rr), count: 1, speed: 0.4, life: [1.6, 2.8], size: [1.0, 2.4], color: '#6ab040', alpha: 0.32 * life, drag: 1.2, up: 0.2 });
      }
      for (const s of m.spits) fx.glow({ pos: s.pos.clone(), count: 1, speed: 0.4, life: [0.15, 0.35], size: [0.18, 0.04], color: '#9dff2a' });
    }
    this.frameHazards(dt, now);
    this.frameWarnings(now);
    this.frameExfil(dt, now);
  }

  private mood(dt: number) {
    const m = this.m, rr = this.r;
    const frenzy = m.wavePhase === 'active' && m.waveKindNow === 'frenzy';
    this.exposure = damp(this.exposure, m.power ? this.baseExposure : this.baseExposure * 0.72, 1.6, dt);
    rr.renderer.toneMappingExposure = this.exposure;
    const fog = rr.scene.fog;
    if (fog instanceof Fog && this.baseFog) {
      tmpC.set(frenzy ? '#4a1410' : m.power ? this.baseFog.color.getStyle() : '#3a4248');
      this.fogColor.lerp(tmpC, 1 - Math.exp(-dt * 1.5));
      fog.color.copy(this.fogColor);
      fog.near = damp(fog.near, frenzy ? 12 : m.power ? this.baseFog.near : 30, 1.2, dt);
      fog.far = damp(fog.far, frenzy ? 70 : m.power ? this.baseFog.far : 140, 1.2, dt);
    }
  }

  private weaponShow(id: WeaponId, forged = false, display: 'box' | 'forge' = 'box'): Group {
    // Simultaneous rolls and upgrades must not reparent the same Object3D between machines.
    const key = `${display}:${id}${forged ? ':f' : ''}`;
    let g = this.shown.get(key);
    if (!g) {
      g = weaponModel(id, forged ? 'forged' : undefined);
      g.rotation.set(0, Math.PI / 2, 0);
      this.shown.set(key, g);
    }
    // The forge temporarily hides a cached model while it is inside the machine.
    // Reset it before every presentation so it can appear in subsequent box rolls.
    g.visible = true;
    g.rotation.set(0, Math.PI / 2, 0);
    return g;
  }

  private frameBox(dt: number, now: number) {
    const b = this.m.box;
    this.boxes.forEach((g, i) => {
      const active = i === b.spot || i === this.boxMoveFrom;
      const crate = g.getObjectByName('crate')!, tarp = g.getObjectByName('tarp')!, beam = g.getObjectByName('beam')!;
      const lid = g.getObjectByName('lid')!, inner = g.getObjectByName('inner') as Mesh, show = g.getObjectByName('show') as Group;
      crate.visible = active; tarp.visible = !active; beam.visible = active && (b.state === 'idle' || b.state === 'spinning' || b.state === 'ready');
      show.clear();
      if (!active) return;
      const moving = b.state === 'moving' && i === this.boxMoveFrom;
      crate.position.y = moving ? Math.pow(clamp((now - (b.until - BOX_TUNING.moveTime)) / BOX_TUNING.moveTime, 0, 1), 2) * 9 : 0;
      crate.rotation.y = moving ? (now * 3) % (Math.PI * 2) : 0;
      const open = b.state === 'spinning' || b.state === 'ready' || b.state === 'teddy';
      lid.rotation.x = damp(lid.rotation.x, open ? -1.25 : 0, 8, dt);
      (inner.material as MeshBasicMaterial).opacity = damp((inner.material as MeshBasicMaterial).opacity, open ? 0.75 : 0, 6, dt);
      if (b.state === 'spinning') {
        const t = (now - b.startedAt) / BOX_TUNING.spin;
        const rate = 14 * (1 - t * 0.75);
        const idx = Math.floor((now - b.startedAt) * rate) % this.boxShowIds.length;
        const w = this.weaponShow(this.boxShowIds[(idx * 7) % this.boxShowIds.length]);
        w.position.set(0, Math.min(1, t * 3) * 0.35, 0);
        show.add(w);
      } else if (b.state === 'ready' && b.weapon) {
        const w = this.weaponShow(b.weapon);
        const sink = clamp((b.until - now) / 3, 0, 1);
        w.position.set(0, 0.35 * sink + Math.sin(now * 2) * 0.03, 0);
        w.rotation.y = Math.PI / 2 + Math.sin(now * 0.8) * 0.3;
        show.add(w);
      }
      const teddyOn = b.state === 'teddy' && i === b.spot;
      this.teddy.visible = teddyOn;
      if (teddyOn) { this.teddy.position.copy(g.position).setY(0.95 + Math.sin(now * 3) * 0.05); this.teddy.rotation.y = g.rotation.y + Math.PI; }
    });
    if (b.state !== 'teddy') this.teddy.visible = false;
  }

  private frameForge(dt: number, now: number) {
    const f = this.m.forge;
    const core = this.forge.getObjectByName('core')!, show = this.forge.getObjectByName('show') as Group;
    const working = f.state === 'working';
    core.rotation.z += dt * (working ? 21 : this.m.power ? 2.4 : 0.3);
    core.rotation.y += dt * (working ? 12 : 0.6);
    const heart = this.forge.getObjectByName('heart') as Mesh;
    heart.scale.setScalar(this.m.power ? 1 + Math.sin(now * (working ? 18 : 3)) * (working ? 0.25 : 0.08) : 0.5);
    core.visible = true;
    show.clear();
    if (f.weapon && f.state !== 'idle') {
      const w = this.weaponShow(f.weapon, f.state === 'ready', 'forge');
      const k = working ? clamp((now - f.startedAt) / 1.2, 0, 1) : 1;
      w.position.set(0, f.state === 'ready' ? 0.35 + Math.sin(now * 2) * 0.04 : 0.2 * (1 - k), working ? 0.5 * k : 0);
      w.visible = !(working && k >= 1);
      show.add(w);
    }
  }

  private framePowerUps(now: number) {
    const m = this.m;
    const live = new Set(m.powerUps.map((p) => p.id));
    for (const [id, g] of this.powerUps) if (!live.has(id)) { releaseModel(g); this.powerUps.delete(id); }
    for (const p of m.powerUps) {
      let g = this.powerUps.get(p.id);
      if (!g) { g = powerUpModel(p.kind as PowerUpId); this.root.add(g); this.powerUps.set(p.id, g); }
      const age = now - p.born;
      g.position.set(p.pos.x, p.pos.y + Math.sin(now * 2.4 + p.id) * 0.12, p.pos.z);
      g.rotation.y = now * 1.8 + p.id;
      const blink = age > POWERUP_TUNING.blinkAfter && Math.floor(now * (age > POWERUP_TUNING.life - 4 ? 8 : 4)) % 2 === 0;
      g.visible = !blink;
      const halo = g.getObjectByName('halo')!;
      halo.scale.setScalar(1 + Math.sin(now * 5) * 0.12);
    }
  }

  private frameHazards(dt: number, now: number) {
    const m = this.m;
    const live = new Set(m.acid.map((a) => a.id));
    for (const [id, mesh] of this.acid) if (!live.has(id)) { releaseModel(mesh); this.acid.delete(id); }
    for (const a of m.acid) {
      let mesh = this.acid.get(a.id);
      if (!mesh) {
        mesh = new Mesh(new CircleGeometry(a.radius, 36), new MeshBasicMaterial({ color: '#7aff30', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(a.pos.x, a.pos.y + 0.03, a.pos.z);
        this.root.add(mesh); this.acid.set(a.id, mesh);
      }
      const life = clamp((a.until - now) / 1.5, 0, 1), grow = clamp((now - a.start) / 0.3, 0.2, 1);
      mesh.scale.setScalar(grow);
      (mesh.material as MeshBasicMaterial).opacity = (0.34 + 0.08 * Math.sin(now * 6 + a.id)) * life;
      if (Math.random() < Math.min(1, dt * 9)) this.r.effects.glow({ pos: new Vector3(a.pos.x + (Math.random() - 0.5) * a.radius, a.pos.y + 0.05, a.pos.z + (Math.random() - 0.5) * a.radius), count: 1, speed: 0.6, life: [0.3, 0.7], size: [0.1, 0.02], color: '#b8ff50', gravity: -1, up: 0.5 });
    }
    const spits = new Set(m.spits.map((s) => s.id));
    for (const [id, mesh] of this.spits) if (!spits.has(id)) { releaseModel(mesh); this.spits.delete(id); }
    for (const s of m.spits) {
      let mesh = this.spits.get(s.id);
      if (!mesh) {
        mesh = new Mesh(new SphereGeometry(0.13, 12, 10), new MeshBasicMaterial({ color: '#a8ff40', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
        this.root.add(mesh); this.spits.set(s.id, mesh);
      }
      mesh.position.copy(s.pos);
    }
  }

  /** Grounded, depth-tested attack tells; pooled by enemy rather than rebuilt per frame. */
  private frameWarnings(now: number) {
    for (const entry of this.warnings.values()) entry.root.visible = false;
    for (const z of this.m.zombiePool) {
      const zs = z.zombie!;
      if (!z.alive || !['fuse', 'roar', 'charge', 'slam', 'scream'].includes(zs.mode)) continue;
      if (!this.near(z.pos, 45)) continue;
      let entry = this.warnings.get(z.id);
      if (!entry) {
        const root = new Group();
        const mat = new MeshBasicMaterial({ color: '#ff8030', transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false });
        const ring = new Mesh(new RingGeometry(0.94, 1, 48), mat);
        const lane = new Mesh(new PlaneGeometry(1.6, 1), mat.clone());
        ring.rotation.x = lane.rotation.x = -Math.PI / 2;
        root.add(ring, lane); this.root.add(root);
        entry = { root, ring, lane }; this.warnings.set(z.id, entry);
      }
      entry.root.visible = true;
      entry.root.position.set(z.pos.x, z.pos.y + 0.035, z.pos.z);
      const t = clamp((now - zs.modeAt) / Math.max(0.01, zs.modeUntil - zs.modeAt), 0, 1);
      const radius = zs.mode === 'fuse' ? ZOMBIE_TUNING.bomberRadius : zs.mode === 'slam' ? ZOMBIE_TUNING.slamRadius : 1.3;
      entry.ring.scale.setScalar(radius);
      const color = zs.mode === 'scream' ? '#c46aff' : zs.mode === 'roar' || zs.mode === 'charge' ? '#ff4930' : '#ffb060';
      entry.ring.material.color.set(color);
      entry.ring.material.opacity = 0.35 + 0.35 * t;
      const charging = zs.mode === 'roar' || zs.mode === 'charge';
      entry.lane.visible = charging;
      if (charging) {
        const dir = zs.charge;
        const target = this.m.getAgent(zs.targetId);
        const yaw = dir ? Math.atan2(-dir.x, -dir.z) : target ? Math.atan2(-(target.pos.x - z.pos.x), -(target.pos.z - z.pos.z)) : z.yaw;
        entry.root.rotation.y = yaw;
        const reach = Math.min(18, ZOMBIE_TUNING.chargeSpeed * ZOMBIE_TUNING.chargeTime);
        const blocked = this.m.world.collision.raycast(z.centerPos(new Vector3()), new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), reach);
        const length = Math.max(0.1, blocked ? blocked.t : reach);
        entry.lane.scale.y = length;
        entry.lane.position.z = -length / 2;
        entry.lane.material.color.set(color);
        entry.lane.material.opacity = 0.09 + t * 0.08;
      }
    }
  }

  private frameExfil(dt: number, now: number) {
    const ex = this.m.exfil, lz = this.m.layout.lz;
    const on = ex.phase === 'called' || ex.phase === 'holding' || ex.phase === 'extracted';
    this.lz.visible = on;
    if (on) {
      (this.lz.getObjectByName('ring') as Mesh).scale.setScalar(1 + Math.sin(now * 3) * 0.02);
      if (Math.random() < dt * 14) this.r.effects.puff({ pos: new Vector3(lz.x + 2.5, 0.3, lz.z - 2.5), count: 1, speed: 0.6, life: [2.5, 4.5], size: [0.5, 3.2], color: '#c83a28', alpha: 0.5, drag: 0.6, up: 2.2 });
    }
    // the chopper arrives over the last 14 s of the hold
    const arriving = ex.phase === 'holding' && ex.until - now < 14;
    const leaving = ex.phase === 'extracted';
    this.heli.visible = arriving || leaving;
    if (!this.heli.visible) { this.heliT = 0; return; }
    this.heliT = arriving ? clamp(1 - (ex.until - now - 2) / 12, 0, 1) : Math.max(0, this.heliT - dt * 0.15);
    const e = 1 - Math.pow(1 - this.heliT, 3);
    this.heli.position.set(lz.x + (1 - e) * 30, 4.2 + (1 - e) * 55, lz.z + (1 - e) * 60);
    this.heli.rotation.set(-0.12 * (1 - e), Math.PI * 0.85, 0);
    this.heli.getObjectByName('rotor')!.rotation.y += dt * 30;
    this.heli.getObjectByName('tail')!.rotation.x += dt * 40;
    this.rotorT -= dt;
    if (this.rotorT <= 0) { this.rotorT = 0.11; sfx.rotor(this.heli.position.clone()); }
    if (e > 0.85 && Math.random() < dt * 30) this.r.effects.puff({ pos: new Vector3(lz.x + (Math.random() - 0.5) * 12, 0.3, lz.z + (Math.random() - 0.5) * 12), count: 1, speed: 3, life: [0.6, 1.4], size: [0.4, 1.6], color: '#7a7268', alpha: 0.35, drag: 1.5 });
  }

  dispose() {
    for (const u of this.unsub) u();
    for (const g of this.shown.values()) releaseModel(g);
    releaseModel(this.root);
    this.r.renderer.toneMappingExposure = this.baseExposure;
    const fog = this.r.scene.fog;
    if (fog instanceof Fog && this.baseFog) { fog.color.copy(this.baseFog.color); fog.near = this.baseFog.near; fog.far = this.baseFog.far; }
    sfx.setMuffle(false);
  }
}
