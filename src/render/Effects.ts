import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Line,
  LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry, PointLight, Points, Quaternion,
  RingGeometry, ShaderMaterial, Vector3, type Blending, type Camera, type Scene, type Texture,
} from 'three';
import { Random } from '../core/Random';
import { bloodSplat, bulletHole, flareSprite, softSprite } from './Textures';

// ============================================================================ particles
interface EmitOpts {
  pos: Vector3; count: number; speed: number; spread?: number; dir?: Vector3; life: [number, number];
  size: [number, number]; color: string; alpha?: number; gravity?: number; drag?: number; up?: number;
}

/** CPU particle system rendered as one Points draw call with a soft sprite. */
class ParticleSystem {
  readonly points: Points;
  private max: number;
  private pos: Float32Array; private rgba: Float32Array; private size: Float32Array;
  private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private grav: Float32Array; private drag: Float32Array; private a0: Float32Array;
  private cursor = 0;
  private geo: BufferGeometry;
  readonly material: ShaderMaterial;
  private rng = new Random(77);

  constructor(max: number, map: Texture, blending: Blending) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.rgba = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('rgba', new BufferAttribute(this.rgba, 4).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('size', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    this.material = new ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;
        void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = vC.a * t.a; if (a < 0.004) discard; gl_FragColor = vec4(vC.rgb * t.rgb, a); }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new Points(this.geo, this.material);
    this.points.frustumCulled = false;
  }

  emit(o: EmitOpts) {
    const c = new Color(o.color);
    const r = this.rng;
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      let vx = r.range(-1, 1), vy = r.range(-1, 1), vz = r.range(-1, 1);
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      if (o.dir) {
        const s = o.spread ?? 0.4;
        vx = o.dir.x + vx * s; vy = o.dir.y + vy * s; vz = o.dir.z + vz * s;
      }
      const sp = o.speed * r.range(0.4, 1);
      this.pos.set([o.pos.x, o.pos.y, o.pos.z], i * 3);
      this.vel.set([vx * sp, vy * sp + (o.up ?? 0), vz * sp], i * 3);
      this.life[i] = this.maxLife[i] = r.range(o.life[0], o.life[1]);
      this.s0[i] = o.size[0] * r.range(0.7, 1.3); this.s1[i] = o.size[1] * r.range(0.7, 1.3);
      this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0;
      const a = o.alpha ?? 1;
      this.a0[i] = a;
      this.rgba.set([c.r, c.g, c.b, a], i * 4);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.rgba[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.rgba[i * 4 + 3] = this.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.3);
    }
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('rgba') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('size') as BufferAttribute).needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// ============================================================================ effects manager
interface Tracer { line: Line; start: Vector3; end: Vector3; t: number; len: number }
interface SmokeFx { id: number; mesh: InstancedMesh; offsets: Vector3[]; angles: number[]; scales: number[]; mat: MeshBasicMaterial }
interface FireFx { id: number; mesh: InstancedMesh; offsets: Vector3[]; phase: number[]; light: PointLight | null }
interface Ring { mesh: Mesh; t: number; dur: number; maxR: number }
interface Flash { light: PointLight; t: number; dur: number; intensity: number }

const SMOKE_N = 46, FIRE_N = 26;
const _m = new Matrix4(), _q = new Quaternion(), _q2 = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _z = new Vector3(0, 0, 1);

export class Effects {
  readonly group = new Group();
  private sparks: ParticleSystem;
  private dust: ParticleSystem;
  private tracers: Tracer[] = [];
  private decals: Mesh[] = [];
  private decalIdx = 0;
  private bloods: Mesh[] = [];
  private bloodIdx = 0;
  private smokes = new Map<number, SmokeFx>();
  private fires = new Map<number, FireFx>();
  private rings: Ring[] = [];
  private lightPool: PointLight[] = [];
  private flashes: Flash[] = [];
  private rng = new Random(5);
  private smokeTex = softSprite();
  private flameTex = flareSprite();

  constructor() {
    this.sparks = new ParticleSystem(600, flareSprite(), AdditiveBlending);
    this.dust = new ParticleSystem(900, softSprite(), NormalBlending);
    this.group.add(this.sparks.points, this.dust.points);
    const tracerMat = new LineBasicMaterial({ color: '#ffd890', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 48; i++) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(6), 3).setUsage(DynamicDrawUsage));
      const line = new Line(g, tracerMat);
      line.visible = false; line.frustumCulled = false;
      this.group.add(line);
      this.tracers.push({ line, start: new Vector3(), end: new Vector3(), t: 1, len: 0 });
    }
    const holeMat = new MeshBasicMaterial({ map: bulletHole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const holeGeo = new PlaneGeometry(0.11, 0.11);
    for (let i = 0; i < 160; i++) {
      const m = new Mesh(holeGeo, holeMat);
      m.visible = false;
      this.group.add(m);
      this.decals.push(m);
    }
    const bloodMat = new MeshBasicMaterial({ map: bloodSplat(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 });
    const bloodGeo = new PlaneGeometry(1, 1);
    for (let i = 0; i < 48; i++) {
      const m = new Mesh(bloodGeo, bloodMat);
      m.visible = false;
      this.group.add(m);
      this.bloods.push(m);
    }
    // fixed light pool: light count never changes → no shader recompiles
    for (let i = 0; i < 4; i++) {
      const l = new PointLight(0xffb060, 0, 14, 1.8);
      this.group.add(l);
      this.lightPool.push(l);
    }
  }

  private takeLight(): PointLight {
    // pick the dimmest light (fires keep theirs while burning)
    const used = new Set([...this.fires.values()].map((f) => f.light));
    const free = this.lightPool.filter((l) => !used.has(l));
    const l = (free.length ? free : this.lightPool).reduce((a, b) => (a.intensity <= b.intensity ? a : b));
    this.flashes = this.flashes.filter((f) => f.light !== l);
    return l;
  }

  lightFlash(pos: Vector3, color: number, intensity: number, dur: number, dist = 14) {
    const l = this.takeLight();
    l.position.copy(pos); l.color.setHex(color); l.distance = dist; l.intensity = intensity;
    this.flashes.push({ light: l, t: 0, dur, intensity });
  }

  tracer(start: Vector3, end: Vector3) {
    const tr = this.tracers.find((t) => t.t >= 1) ?? this.tracers[0];
    tr.start.copy(start); tr.end.copy(end); tr.t = 0; tr.len = start.distanceTo(end);
    tr.line.visible = true;
  }

  impact(point: Vector3, normal: Vector3, surface: string) {
    const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    d.position.copy(point).addScaledVector(normal, 0.005);
    d.lookAt(_p.copy(point).add(normal));
    d.rotateZ(this.rng.next() * 6.28);
    d.visible = true;
    const soft = surface === 'fabric' || surface === 'wood';
    this.dust.emit({ pos: point, count: soft ? 4 : 6, speed: 1.5, dir: normal, spread: 0.6, life: [0.3, 0.7], size: [0.08, 0.35], color: surface === 'wood' ? '#a07848' : '#9a968e', alpha: 0.6, gravity: 2, drag: 3 });
    if (!soft) this.sparks.emit({ pos: point, count: 5, speed: 6, dir: normal, spread: 0.9, life: [0.08, 0.25], size: [0.05, 0.02], color: '#ffc870', gravity: 9 });
  }

  blood(point: Vector3, dir: Vector3, head: boolean) {
    this.dust.emit({ pos: point, count: head ? 14 : 8, speed: head ? 3 : 2, dir, spread: 0.7, life: [0.25, 0.6], size: [0.06, 0.25], color: '#8a0e0e', alpha: 0.9, gravity: 6, drag: 2 });
  }

  /** Blood sprayed onto the surface behind a hit (`dir` = bullet direction). */
  bloodDecal(point: Vector3, normal: Vector3, dir: Vector3, size: number) {
    const d = this.bloods[this.bloodIdx]; this.bloodIdx = (this.bloodIdx + 1) % this.bloods.length;
    d.position.copy(point).addScaledVector(normal, 0.006);
    d.lookAt(_p.copy(point).add(normal));
    // smear along the bullet's direction projected onto the surface
    const t = dir.clone().addScaledVector(normal, -dir.dot(normal));
    if (t.lengthSq() > 1e-4) {
      t.normalize();
      const right = new Vector3(1, 0, 0).applyQuaternion(d.quaternion), up = new Vector3(0, 1, 0).applyQuaternion(d.quaternion);
      d.rotateZ(Math.atan2(t.dot(up), t.dot(right)));
    } else d.rotateZ(this.rng.next() * 6.28);
    d.scale.setScalar(size);
    d.visible = true;
  }

  /** Concussion blast: white-blue flash, a shock ring and a puff of dust. */
  stunBlast(pos: Vector3) {
    this.sparks.emit({ pos, count: 26, speed: 9, life: [0.05, 0.18], size: [0.9, 0.2], color: '#dfe8ff' });
    this.dust.emit({ pos, count: 18, speed: 4, life: [0.5, 1.2], size: [0.4, 1.6], color: '#8a8c90', alpha: 0.5, drag: 2.5, up: 0.6 });
    this.lightFlash(pos.clone().setY(pos.y + 0.4), 0xc8d8ff, 70, 0.18, 14);
    this.pulseRing(pos, '#d0e0ff', 7);
  }

  muzzle(pos: Vector3) {
    this.lightFlash(pos, 0xffc070, 6, 0.06, 8);
  }

  explosion(pos: Vector3) {
    this.sparks.emit({ pos, count: 60, speed: 14, life: [0.2, 0.6], size: [0.4, 0.1], color: '#ffb040', gravity: 6, up: 2 });
    this.dust.emit({ pos, count: 40, speed: 5, life: [0.8, 2.0], size: [0.6, 2.6], color: '#4a4440', alpha: 0.7, drag: 2, up: 1.5 });
    this.lightFlash(pos.clone().setY(pos.y + 0.5), 0xffa040, 80, 0.35, 18);
  }

  /** Explosion scaled by blast radius (rockets, C4, killstreaks). */
  blast(pos: Vector3, radius: number) {
    const k = Math.max(0.6, radius / 4.5);
    this.sparks.emit({ pos, count: Math.round(50 * k), speed: 12 * Math.sqrt(k), life: [0.2, 0.7], size: [0.5 * k, 0.1], color: '#ffb040', gravity: 6, up: 2 });
    this.sparks.emit({ pos, count: Math.round(20 * k), speed: 4 * k, life: [0.1, 0.3], size: [1.6 * k, 0.4], color: '#ffe0a0' });
    this.dust.emit({ pos, count: Math.round(36 * k), speed: 4.5 * Math.sqrt(k), life: [1.0, 2.6], size: [0.8 * k, 3.2 * k], color: '#3e3a36', alpha: 0.75, drag: 2, up: 1.4 });
    this.dust.emit({ pos, count: Math.round(14 * k), speed: 9 * Math.sqrt(k), life: [0.4, 1.2], size: [0.1, 0.25], color: '#2a2622', alpha: 0.9, gravity: 9, up: 3 });
    this.lightFlash(pos.clone().setY(pos.y + 0.6), 0xffa040, 90 * k, 0.4, 14 + radius * 2);
  }

  /** Smoke + embers left behind a rocket each frame. */
  rocketTrail(pos: Vector3) {
    this.dust.emit({ pos, count: 2, speed: 0.4, life: [0.6, 1.4], size: [0.15, 0.9], color: '#bdb8b0', alpha: 0.45, drag: 1.5, up: 0.3 });
    this.sparks.emit({ pos, count: 1, speed: 1.5, life: [0.05, 0.15], size: [0.25, 0.05], color: '#ffb050' });
  }

  /** Green motes rising off someone being stimmed. */
  heal(pos: Vector3) {
    this.sparks.emit({ pos, count: 14, speed: 0.8, life: [0.4, 1.0], size: [0.07, 0.02], color: '#50ff90', gravity: -1.2, up: 0.6 });
  }

  /** Splinters from boards being hacked / pried. */
  splinters(pos: Vector3, metal: boolean) {
    if (metal) this.sparks.emit({ pos, count: 10, speed: 5, life: [0.1, 0.3], size: [0.06, 0.02], color: '#ffd080', gravity: 9 });
    else this.dust.emit({ pos, count: 10, speed: 3, life: [0.4, 1.0], size: [0.04, 0.12], color: '#a07848', alpha: 0.95, gravity: 9, drag: 1 });
  }

  flashbang(pos: Vector3) {
    this.sparks.emit({ pos, count: 30, speed: 8, life: [0.05, 0.2], size: [1.2, 0.2], color: '#ffffff' });
    this.lightFlash(pos, 0xffffff, 140, 0.25, 22);
  }

  pulseRing(pos: Vector3, color = '#30d0ff', maxR = 12) {
    const mesh = new Mesh(new RingGeometry(0.9, 1, 48), new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: DoubleSide, blending: AdditiveBlending, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos).setY(pos.y + 0.1);
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, dur: 0.9, maxR });
  }

  sync(smokes: { id: number; pos: Vector3; radius: number }[], fires: { id: number; pos: Vector3; radius: number }[]) {
    // smokes
    const alive = new Set(smokes.map((s) => s.id));
    for (const [id, fx] of this.smokes) if (!alive.has(id)) { this.group.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mat.dispose(); fx.mesh.dispose(); this.smokes.delete(id); }
    for (const s of smokes) {
      let fx = this.smokes.get(s.id);
      if (!fx) {
        const mat = new MeshBasicMaterial({ map: this.smokeTex, color: '#b9bdbf', transparent: true, depthWrite: false, opacity: 1 });
        const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, SMOKE_N);
        mesh.frustumCulled = false;
        const offsets: Vector3[] = [], angles: number[] = [], scales: number[] = [];
        for (let i = 0; i < SMOKE_N; i++) {
          const v = new Vector3(this.rng.range(-1, 1), this.rng.range(-0.55, 0.8), this.rng.range(-1, 1));
          if (v.length() > 1) v.normalize();
          offsets.push(v); angles.push(this.rng.range(0, 6.28)); scales.push(this.rng.range(2.2, 3.6));
          mesh.setColorAt(i, new Color().setScalar(this.rng.range(0.75, 1.05)));
        }
        this.group.add(mesh);
        fx = { id: s.id, mesh, offsets, angles, scales, mat };
        this.smokes.set(s.id, fx);
      }
      (fx.mesh.userData as { center: Vector3; radius: number }).center = s.pos;
      (fx.mesh.userData as { center: Vector3; radius: number }).radius = s.radius;
    }
    // fires
    const fireAlive = new Set(fires.map((f) => f.id));
    for (const [id, fx] of this.fires) if (!fireAlive.has(id)) {
      this.group.remove(fx.mesh); fx.mesh.geometry.dispose(); (fx.mesh.material as MeshBasicMaterial).dispose(); fx.mesh.dispose();
      if (fx.light) fx.light.intensity = 0;
      this.fires.delete(id);
    }
    for (const f of fires) {
      let fx = this.fires.get(f.id);
      if (!fx) {
        const mat = new MeshBasicMaterial({ map: this.flameTex, color: '#ff9a40', transparent: true, depthWrite: false, blending: AdditiveBlending });
        const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, FIRE_N);
        mesh.frustumCulled = false;
        const offsets: Vector3[] = [], phase: number[] = [];
        for (let i = 0; i < FIRE_N; i++) {
          const a = this.rng.range(0, 6.28), r = Math.sqrt(this.rng.next());
          offsets.push(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); phase.push(this.rng.range(0, 6.28));
        }
        this.group.add(mesh);
        const light = this.takeLight();
        light.color.setHex(0xff8030); light.distance = 10; light.position.copy(f.pos).setY(f.pos.y + 0.8);
        fx = { id: f.id, mesh, offsets, phase, light };
        this.fires.set(f.id, fx);
      }
      fx.mesh.userData.center = f.pos; fx.mesh.userData.radius = f.radius;
    }
  }

  update(dt: number, camera: Camera, viewportH: number, fovDeg: number, time: number) {
    const scale = viewportH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.sparks.material.uniforms.scale.value = scale;
    this.dust.material.uniforms.scale.value = scale;
    this.sparks.update(dt);
    this.dust.update(dt);
    for (const tr of this.tracers) {
      if (tr.t >= 1) { tr.line.visible = false; continue; }
      const speed = 380;
      tr.t = Math.min(1, tr.t + (dt * speed) / Math.max(1, tr.len));
      const head = Math.min(1, tr.t + 3 / Math.max(1, tr.len));
      const a = _p.copy(tr.start).lerp(tr.end, tr.t);
      const arr = (tr.line.geometry.getAttribute('position') as BufferAttribute);
      arr.setXYZ(0, a.x, a.y, a.z);
      const b = a.copy(tr.start).lerp(tr.end, head);
      arr.setXYZ(1, b.x, b.y, b.z);
      arr.needsUpdate = true;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = Math.max(0, 1 - f.t / f.dur);
      f.light.intensity = f.intensity * k * k;
      if (f.t >= f.dur) { f.light.intensity = 0; this.flashes.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      r.mesh.scale.setScalar(0.5 + k * r.maxR);
      (r.mesh.material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) { this.group.remove(r.mesh); r.mesh.geometry.dispose(); (r.mesh.material as MeshBasicMaterial).dispose(); this.rings.splice(i, 1); }
    }
    // billboard smoke puffs
    camera.getWorldQuaternion(_q);
    for (const fx of this.smokes.values()) {
      const { center, radius } = fx.mesh.userData as { center: Vector3; radius: number };
      if (!center) continue;
      const k = radius / 4.6;
      for (let i = 0; i < SMOKE_N; i++) {
        const o = fx.offsets[i];
        const drift = Math.sin(time * 0.3 + i) * 0.15;
        _p.set(center.x + o.x * radius * 0.85 + drift, Math.max(0.3, center.y + o.y * radius * 0.6), center.z + o.z * radius * 0.85 - drift);
        _q2.setFromAxisAngle(_z, fx.angles[i] + time * 0.05 * ((i % 2) * 2 - 1));
        _s.setScalar(fx.scales[i] * Math.max(0.2, k) * 1.5);
        _m.compose(_p, _q.clone().multiply(_q2), _s);
        fx.mesh.setMatrixAt(i, _m);
      }
      fx.mesh.instanceMatrix.needsUpdate = true;
      if (fx.mesh.instanceColor) fx.mesh.instanceColor.needsUpdate = true;
    }
    for (const fx of this.fires.values()) {
      const { center, radius } = fx.mesh.userData as { center: Vector3; radius: number };
      if (!center) continue;
      for (let i = 0; i < FIRE_N; i++) {
        const o = fx.offsets[i];
        const fl = 0.7 + 0.3 * Math.sin(time * 12 + fx.phase[i]) + 0.15 * Math.sin(time * 23 + i);
        const h = (0.6 + 0.6 * fl) * (1 - o.length() * 0.4);
        _p.set(center.x + o.x * radius, center.y + h * 0.45, center.z + o.z * radius);
        _s.set(h * 0.9, h * 1.4, 1);
        _m.compose(_p, _q, _s);
        fx.mesh.setMatrixAt(i, _m);
      }
      fx.mesh.instanceMatrix.needsUpdate = true;
      if (fx.light) fx.light.intensity = 9 + Math.sin(time * 17) * 2 + Math.sin(time * 31) * 1.5;
      if (Math.random() < dt * 20) {
        const o = fx.offsets[Math.floor(Math.random() * FIRE_N)];
        this.sparks.emit({ pos: _p.set(center.x + o.x * radius, center.y + 0.3, center.z + o.z * radius).clone(), count: 1, speed: 0.5, life: [0.4, 0.9], size: [0.07, 0.02], color: '#ffa040', up: 2.5 });
        if (Math.random() < 0.3) this.dust.emit({ pos: _p.clone().setY(center.y + 1.2), count: 1, speed: 0.3, life: [1, 2], size: [0.5, 2], color: '#2a2622', alpha: 0.35, up: 1.2 });
      }
    }
  }

  /** How deep the camera is inside a smoke cloud (0..1) – drives the full-screen smoke overlay. */
  smokeDensityAt(p: Vector3): number {
    let d = 0;
    for (const fx of this.smokes.values()) {
      const { center, radius } = fx.mesh.userData as { center: Vector3; radius: number };
      if (!center || radius < 0.5) continue;
      const dist = p.distanceTo(center);
      d = Math.max(d, Math.min(1, (radius * 1.05 - dist) / (radius * 0.45)));
    }
    return Math.max(0, d);
  }

  clear(scene?: Scene) {
    void scene;
    this.sparks.clear(); this.dust.clear();
    for (const d of this.decals) d.visible = false;
    for (const d of this.bloods) d.visible = false;
    for (const t of this.tracers) { t.t = 1; t.line.visible = false; }
    this.sync([], []);
    for (const ring of this.rings) { this.group.remove(ring.mesh); ring.mesh.geometry.dispose(); (ring.mesh.material as MeshBasicMaterial).dispose(); }
    this.rings = [];
    for (const flash of this.flashes) flash.light.intensity = 0;
    this.flashes = [];
  }
}
