import { CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector2, Vector3, type Material, type Object3D } from 'three';
import { batchModel, bevelBox, releaseModel } from './Geometry';
import { contactShadow, surfaceDetail, TEX } from './Textures';
import { garment, legPose } from './HumanoidGeometry';
import { damp } from '../core/math';
import type { AgentLook } from '../config/cosmetics';
import type { WeaponId } from '../config/weapons';
import type { UtilityId } from '../config/utilities';
import { bombModel, grenadeModel, weaponModel } from './WeaponModels';
import { deviceModel } from './GadgetModels';
import type { GadgetId } from '../config/gadgets';

const mats = new Map<string, Material>();
function m(color: string, rough = 0.85): Material {
  const key = color + rough;
  let x = mats.get(key);
  if (!x) {
    const cloth = rough >= 0.8 ? TEX.cloth() : null;
    mats.set(key, (x = new MeshStandardMaterial({ color: new Color(color), roughness: rough,
      map: cloth?.tex ?? null, normalMap: cloth ? surfaceDetail(cloth).normal : null })));
  }
  return x;
}

function bx(parent: Object3D, mat: Material, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(bevelBox(w, h, d, Math.min(w, h, d) * 0.25), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

const sphere = new SphereGeometry(1, 16, 12);
const capsule = new CapsuleGeometry(1, 2, 4, 12);
const torsoGeometry = new LatheGeometry([
  [0, 0.08], [0.145, 0.08], [0.175, 0.13], [0.18, 0.26], [0.205, 0.42],
  [0.222, 0.5], [0.205, 0.55], [0.12, 0.61], [0.065, 0.62], [0, 0.62],
].map(([r, y]) => new Vector2(r, y)), 20);
function chest(parent: Object3D, material: Material, vest = false) {
  const mesh = new Mesh(torsoGeometry, material);
  mesh.scale.set(vest ? 1.035 : 1, vest ? 0.96 : 1, vest ? 0.68 : 0.63);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
}
function limbBetween(parent: Object3D, material: Material, from: Vector3, to: Vector3, radius: number) {
  const delta = to.clone().sub(from);
  const mesh = new Mesh(garment(delta.length(), radius, radius * 0.92, true), material);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), delta.normalize());
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
}
function organic(parent: Object3D, material: Material, w: number, h: number, d: number, x: number, y: number, z: number, limb = false, alongZ = false) {
  const mesh = new Mesh(limb ? capsule : sphere, material);
  if (limb && alongZ) { mesh.scale.set(w / 2, d / 4, h / 2); mesh.rotation.x = Math.PI / 2; }
  else mesh.scale.set(w / 2, h / (limb ? 4 : 2), d / 2);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}

export interface CharacterPose {
  speed: number;       // horizontal m/s
  maxSpeed: number;
  crouch: number;      // 0..1
  prone?: number;
  slide?: number;
  aimYaw?: number;     // aim relative to the clearance-limited prone body
  pitch: number;       // radians
  lean: number;        // -1..1
  onGround: boolean;
  dead: boolean;
  deathT: number;      // seconds since death
  firing: number;      // 0..1 recoil kick
  planting: boolean;
  forward?: number;   // velocity in the agent's local frame
  right?: number;
  reload?: number;    // reload progress, 0 when inactive
  /** 0 = fall back, 1 = crumple forward, 2/3 = twist to the side. */
  deathVariant?: number;
  /** Seconds since the last time this character was hit (flinch). */
  hitT?: number;
  /** Seconds since a grenade / gadget throw (arm swing). */
  throwT?: number;
  dt: number;
}

/**
 * Procedural humanoid with rounded clothing, articulated limbs and tactical equipment:
 * walk cycle, crouch, aim pitch, lean, firing kick, plant/defuse and death fall.
 */
export class CharacterModel {
  readonly root = new Group();
  private hips = new Group();
  private torso = new Group();
  private head = new Group();
  private armR = new Group();
  private armL = new Group();
  private legL = new Group(); private legR = new Group();
  private shinL = new Group(); private shinR = new Group();
  private footL = new Group(); private footR = new Group();
  private hand = new Group();
  private held: Group | null = null;
  private heldKey = '';
  private phase = Math.random() * 6;
  private lookKey = '';
  private move = 0;
  private idle = Math.random() * 6;
  /** Per-model material copies so baked-probe light can tint each character individually. */
  private own = new Map<Material, MeshStandardMaterial>();
  private tint = new Color(1, 1, 1);

  constructor(look: AgentLook) {
    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    this.hips.add(this.torso, this.legL, this.legR);
    this.torso.add(this.head, this.armR, this.armL);
    // shadow blob
    const blob = new Mesh(new CircleGeometry(0.55, 24), new MeshBasicMaterial({ map: contactShadow(), color: 0x000000, transparent: true, opacity: 0.48, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; blob.name = 'blob';
    this.root.add(blob);
    this.setLook(look);
  }

  setLook(look: AgentLook) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    for (const g of [this.torso, this.head, this.armR, this.armL, this.legL, this.legR, this.shinL, this.shinR, this.footL, this.footR]) {
      for (const c of [...g.children]) if ((c as Mesh).isMesh) {
        if (c.userData.batched) (c as Mesh).geometry.dispose();
        g.remove(c);
      }
    }
    const shirt = m(look.primary), pants = m(look.secondary), accent = m(look.accent), skin = m(look.skin, 0.7);
    const boots = m('#1a1a1a'), gloves = m('#222326');

    // legs (pivot at hip)
    for (const [leg, shin, foot, sx] of [[this.legL, this.shinL, this.footL, -1], [this.legR, this.shinR, this.footR, 1]] as const) {
      leg.position.set(sx * 0.13, 0, 0);
      const thigh = new Mesh(garment(0.43, 0.113, 0.12), pants);
      thigh.castShadow = thigh.receiveShadow = true; leg.add(thigh);
      bx(leg, m('#3e443e'), 0.13, 0.15, 0.055, 0, -0.39, -0.09);
      bx(leg, m('#252b29'), 0.1, 0.11, 0.018, 0, -0.39, -0.121);
      bx(leg, pants, 0.055, 0.16, 0.13, sx * 0.105, -0.21, 0); // cargo pocket
      bx(leg, pants, 0.061, 0.035, 0.145, sx * 0.109, -0.145, 0);
      shin.position.set(0, -0.43, 0);
      leg.add(shin);
      const calf = new Mesh(garment(0.43, 0.086, 0.092), pants);
      calf.castShadow = calf.receiveShadow = true; shin.add(calf);
      foot.position.y = -0.43; shin.add(foot);
      organic(foot, boots, 0.17, 0.15, 0.28, 0, -0.015, -0.055);
      bx(foot, boots, 0.175, 0.033, 0.29, 0, -0.073, -0.055);
      bx(foot, boots, 0.13, 0.15, 0.13, 0, 0.045, 0.012);
      for (let k = 0; k < 4; k++) bx(foot, m('#52564c'), 0.09, 0.009, 0.014, 0, 0.044 - k * 0.018, -0.061 - k * 0.012);
    }
    // torso (pivot at hips)
    bx(this.torso, pants, 0.36, 0.14, 0.22, 0, 0.05, 0);
    chest(this.torso, shirt);
    // Collar, shirt placket, seams and sleeve patches retain outfit customization.
    bx(this.torso, shirt, 0.17, 0.075, 0.17, 0, 0.575, 0);
    bx(this.torso, m('#2a302b'), 0.018, 0.4, 0.012, 0, 0.36, -0.133);
    bx(this.torso, m('#2a2a2a'), 0.38, 0.05, 0.23, 0, 0.12, 0); // belt
    bx(this.torso, m('#888b86', 0.45), 0.055, 0.044, 0.022, 0, 0.12, -0.125);
    for (const x of [-0.14, 0.14]) bx(this.torso, accent, 0.05, 0.42, 0.025, x, 0.4, -0.135);
    bx(this.torso, m('#282c27'), 0.1, 0.17, 0.07, -0.17, 0.36, 0.14); // radio
    bx(this.torso, boots, 0.009, 0.12, 0.009, -0.17, 0.5, 0.14);
    if (look.style === 'vest') {
      chest(this.torso, accent, true);
      for (const z of [-0.143, 0.143]) for (const y of [0.25, 0.42]) bx(this.torso, m('#b8bbac', 0.6), 0.36, 0.025, 0.012, 0, y, z);
      bx(this.torso, m('#41483d'), 0.09, 0.1, 0.035, 0.11, 0.34, -0.15);
    } else if (look.style === 'armored') {
      bx(this.torso, accent, 0.35, 0.36, 0.07, 0, 0.38, -0.125);
      bx(this.torso, accent, 0.34, 0.38, 0.06, 0, 0.38, 0.125);
      for (let i = -1; i <= 1; i++) bx(this.torso, m('#3c4239'), 0.085, 0.14, 0.065, i * 0.105, 0.25, -0.18);
      for (let y = 0.38; y < 0.52; y += 0.045) bx(this.torso, m('#454a42'), 0.29, 0.015, 0.012, 0, y, -0.165);
    } else if (look.style === 'coat') {
      organic(this.torso, shirt, 0.41, 0.35, 0.28, 0, -0.06, 0);
      bx(this.torso, accent, 0.05, 0.07, 0.018, 0.12, 0.44, -0.139);
    } else {
      for (const x of [-0.13, 0.13]) bx(this.torso, m('#333c35'), 0.04, 0.35, 0.018, x, 0.38, -0.142);
      bx(this.torso, accent, 0.075, 0.045, 0.02, 0.09, 0.47, -0.147);
    }
    // head
    this.head.position.set(0, 0.59, -0.015);
    organic(this.head, skin, 0.09, 0.1, 0.09, 0, 0.0, 0);
    organic(this.head, skin, 0.192, 0.25, 0.217, 0, 0.15, 0);
    organic(this.head, skin, 0.145, 0.09, 0.16, 0, 0.065, -0.02); // jaw and chin
    organic(this.head, skin, 0.035, 0.055, 0.044, 0, 0.145, -0.108);
    for (const x of [-0.044, 0.044]) {
      bx(this.head, m('#302921'), 0.035, 0.008, 0.008, x, 0.187, -0.099);
      organic(this.head, m('#d3d1bc', 0.5), 0.027, 0.012, 0.01, x, 0.17, -0.098);
      organic(this.head, m('#262e24', 0.45), 0.009, 0.011, 0.005, x, 0.17, -0.104);
      organic(this.head, skin, 0.034, 0.063, 0.038, Math.sign(x) * 0.102, 0.14, 0);
    }
    bx(this.head, m('#8a6250'), 0.04, 0.008, 0.007, 0, 0.092, -0.095);
    switch (look.headgear) {
      case 'cap': organic(this.head, accent, 0.219, 0.13, 0.235, 0, 0.272, 0); bx(this.head, accent, 0.18, 0.014, 0.11, 0, 0.255, -0.14); break;
      case 'beanie': organic(this.head, accent, 0.225, 0.17, 0.245, 0, 0.265, 0); break;
      case 'helmet': organic(this.head, m('#343c37', 0.65), 0.265, 0.22, 0.29, 0, 0.26, 0.012); bx(this.head, m('#292e2b'), 0.14, 0.035, 0.018, 0, 0.28, -0.133); bx(this.head, m('#3b4d55', 0.15), 0.18, 0.045, 0.027, 0, 0.177, -0.11); break;
      case 'balaclava': organic(this.head, m('#252928'), 0.22, 0.275, 0.24, 0, 0.15, 0.002); bx(this.head, skin, 0.13, 0.036, 0.016, 0, 0.18, -0.118); break;
      case 'headset': bx(this.head, m('#1a1a1a'), 0.25, 0.03, 0.04, 0, 0.29, 0); bx(this.head, m('#1a1a1a'), 0.03, 0.09, 0.09, -0.12, 0.17, 0); bx(this.head, m('#1a1a1a'), 0.03, 0.09, 0.09, 0.12, 0.17, 0); bx(this.head, m('#1a1a1a'), 0.015, 0.015, 0.1, -0.12, 0.13, -0.07); break;
      case 'bandana': organic(this.head, accent, 0.205, 0.11, 0.234, 0, 0.09, -0.007); break;
    }
    if (look.headgear !== 'helmet' && look.headgear !== 'cap' && look.headgear !== 'beanie') organic(this.head, m('#2a1e16'), 0.203, 0.077, 0.221, 0, 0.264, 0.009);
    // arms: right arm reaches forward to the grip, left arm to the handguard
    this.armR.position.set(0.225, 0.55, 0);
    this.armL.position.set(-0.225, 0.55, 0);
    organic(this.armR, shirt, 0.17, 0.19, 0.18, 0, -0.015, -0.015);
    limbBetween(this.armR, shirt, new Vector3(0, -0.015, -0.015), new Vector3(0.055, -0.21, -0.035), 0.078);
    limbBetween(this.armR, shirt, new Vector3(0.055, -0.21, -0.035), new Vector3(-0.095, -0.005, -0.3), 0.061);
    bx(this.armR, gloves, 0.082, 0.09, 0.085, -0.095, -0.015, -0.31);
    bx(this.armR, accent, 0.018, 0.075, 0.065, 0.084, -0.055, -0.01);
    organic(this.armL, shirt, 0.17, 0.19, 0.18, 0, -0.015, -0.015);
    limbBetween(this.armL, shirt, new Vector3(0, -0.015, -0.015), new Vector3(-0.045, -0.2, -0.18), 0.075);
    limbBetween(this.armL, shirt, new Vector3(-0.045, -0.2, -0.18), new Vector3(0.32, -0.02, -0.58), 0.058);
    bx(this.armL, gloves, 0.09, 0.075, 0.09, 0.32, -0.02, -0.58);
    bx(this.armL, accent, 0.018, 0.075, 0.065, -0.084, -0.055, -0.01);
    this.hand.position.set(-0.095, -0.005, -0.31);
    this.armR.add(this.hand);
    batchModel(this.hips);
    this.localize();
  }

  /** Swap shared materials for per-model clones (shaders are still shared). */
  private localize() {
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || o.name === 'blob') return;
      const mat = mesh.material as MeshStandardMaterial;
      if (Array.isArray(mat) || !mat.isMeshStandardMaterial || this.own.has(mat) || [...this.own.values()].includes(mat)) {
        if (this.own.has(mat)) mesh.material = this.own.get(mat)!;
        return;
      }
      const clone = mat.clone();
      clone.userData.base = mat.color.clone();
      clone.color.copy(clone.userData.base).multiply(this.tint);
      this.own.set(mat, clone);
      mesh.material = clone;
    });
  }

  /** Light the model with baked irradiance sampled at its position (1 = neutral). */
  setLight(c: Color) {
    if (this.tint.equals(c)) return;
    this.tint.copy(c);
    for (const m of this.own.values()) m.color.copy(m.userData.base).multiply(c);
  }

  /** Attach the held item model ('w:<id>:<finish>', 'g:<kind>', 'bomb', or ''). */
  setHeld(key: string) {
    if (key === this.heldKey) return;
    this.heldKey = key;
    if (this.held) releaseModel(this.held);
    this.held = null;
    if (!key) return;
    const [kind, id, finish, att] = key.split(':');
    let g: Group;
    if (kind === 'w') g = weaponModel(id as WeaponId, finish, att ?? '');
    else if (kind === 'g') g = grenadeModel(id as UtilityId);
    else if (kind === 'd') {
      g = deviceModel(id as GadgetId);
      if (id === 'shield' || id === 'wire' || id === 'flockCam') g.scale.setScalar(0.18);
      else if (id === 'barricade' || id === 'steelBarricade' || id === 'ammoBox') g.scale.setScalar(0.45);
    }
    else g = bombModel();
    g.rotation.y = 0;
    this.held = g;
    this.hand.add(g);
    this.localize();
  }

  update(p: CharacterPose) {
    const dt = Math.min(0.05, p.dt);
    const prone = p.prone ?? 0, slide = p.slide ?? 0;
    this.hips.rotation.set(0, 0, 0);
    if (p.dead) {
      if (prone > 0.5) {
        // A prone casualty settles in place instead of popping up into a standing fall.
        this.update({ ...p, dead: false, speed: 0, firing: 0, reload: 0, planting: false, pitch: 0, dt: 0 });
        this.hips.position.y -= Math.min(1, p.deathT / 0.3) * 0.06;
        this.head.rotation.z = Math.min(1, p.deathT / 0.4) * 0.25;
        return;
      }
      // Knees give way first, then the body falls (direction varies), then settles.
      const t = p.deathT, v = p.deathVariant ?? 0;
      const buckle = Math.min(1, t / 0.16);
      const f = Math.min(1, Math.max(0, (t - 0.06) / 0.5));
      const e = f * f * (3 - 2 * f);
      const s = t > 0.56 ? Math.min(1, (t - 0.56) / 0.3) : 0;
      const bounce = Math.sin(s * Math.PI) * 0.05 * (1 - s);
      const lie = 0.13 * e + bounce;
      this.root.rotation.set(0, this.root.rotation.y, 0);
      this.hips.position.set(0, 0.9 - 0.28 * Math.sin(Math.PI * Math.min(1, f * 1.1)) * (1 - 0.6 * e), 0);
      if (v === 0) { this.root.rotation.x = e * Math.PI / 2 * 0.97; this.hips.position.z = -lie; }
      else if (v === 1) { this.root.rotation.x = -e * Math.PI / 2 * 0.97; this.hips.position.z = lie; }
      else { const sgn = v === 2 ? 1 : -1; this.root.rotation.z = sgn * e * Math.PI / 2 * 0.97; this.hips.position.x = sgn * lie; }
      const knee = 1.25 * buckle * (1 - 0.55 * e);
      this.legL.rotation.set(-0.55 * buckle * (1 - 0.4 * e) * (v === 1 ? 1.4 : 1), 0, 0.1 * e);
      this.legR.rotation.set(-0.35 * buckle * (1 - 0.4 * e), 0, -0.14 * e);
      this.shinL.rotation.x = knee; this.shinR.rotation.x = knee * 0.7;
      this.torso.rotation.set(v === 1 ? 0.35 * e : -0.25 * e, 0.2 * e * (v === 3 ? -1 : 1), 0);
      this.head.rotation.set(v === 0 ? -0.5 * e : 0.3 * e, 0.4 * e, 0);
      this.armR.rotation.set(-0.4 - 1.1 * e, 0, -0.5 * e);
      this.armL.rotation.set(-0.2 - 1.4 * e, 0, 0.7 * e);
      (this.root.getObjectByName('blob') as Mesh).visible = false;
      return;
    }
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.head.rotation.z = 0;
    this.hips.position.x = 0;
    this.torso.rotation.y = 0; this.head.rotation.y = 0; this.armR.rotation.y = 0; this.armL.rotation.y = 0;
    (this.root.getObjectByName('blob') as Mesh).visible = true;
    const run = Math.min(1, p.speed / Math.max(1, p.maxSpeed));
    this.move = damp(this.move, run, 12, dt);
    this.idle += dt;
    if (p.onGround) this.phase += dt * p.speed * Math.PI * 2 / (1.4 + run * 1.15);
    const cr = p.crouch;
    const standingHip = 0.9 - 0.4 * cr - this.move * 0.09 + Math.cos(this.phase * 2) * 0.012 * this.move;
    this.hips.position.y = standingHip + (0.18 - standingHip) * slide;
    this.hips.position.z = 0;
    // Planted stance + lifted recovery, solved back to the knees. Local velocity
    // makes strafe and backpedal steps travel in the actual direction of movement.
    const forward = (p.forward ?? p.speed) / Math.max(0.01, p.speed);
    const right = (p.right ?? 0) / Math.max(0.01, p.speed);
    for (const [leg, shin, foot, offset] of [[this.legL, this.shinL, this.footL, 0], [this.legR, this.shinR, this.footR, 0.5]] as const) {
      const cycle = (this.phase / (Math.PI * 2) + offset) % 1;
      const swing = Math.max(0, (cycle - 0.6) / 0.4);
      const travel = (cycle < 0.6 ? 0.5 - cycle / 0.6 : -0.5 + swing * swing * (3 - 2 * swing)) * this.move * (0.55 + run * 0.25);
      const lift = Math.sin(swing * Math.PI) * this.move * (0.1 + run * 0.13);
      // slide: lead leg stretched out in front, trailing leg folded underneath (baseball slide)
      const lead = offset === 0;
      const slideFoot = lead ? -0.78 : 0.06;
      const slideDrop = lead ? 0.09 : 0.14;
      const pose = legPose(right * travel * (1 - slide) + (lead ? 0 : 0.07) * slide, -this.hips.position.y + 0.09 + (p.onGround ? lift * (1 - slide) : 0.13) - slideDrop * slide,
        (0.025 + cr * 0.08 - forward * travel) * (1 - slide) + slideFoot * slide);
      leg.rotation.set(pose.hip, 0, pose.roll, 'ZXY'); shin.rotation.x = pose.knee;
      foot.rotation.set(pose.ankle, 0, -pose.roll, 'XYZ');
    }
    // torso aim & lean
    this.torso.rotation.x = p.planting ? 0.6 : p.pitch * 0.3 + cr * 0.16 + this.move * 0.06;
    // flinch when hit, swing the arm when throwing
    const flinch = p.hitT !== undefined && p.hitT < 0.25 ? Math.sin(Math.min(1, p.hitT / 0.25) * Math.PI) : 0;
    this.torso.rotation.x -= flinch * 0.22;
    this.torso.rotation.z = -p.lean * 0.38;
    this.torso.position.x = p.lean * 0.12;
    this.torso.position.y = Math.sin(this.idle * 2.3) * 0.002;
    this.head.rotation.x = p.planting ? 0.3 : p.pitch * 0.45;
    const reload = p.reload ?? 0;
    const reloadMotion = reload > 0 ? Math.sin(Math.PI * Math.min(1, reload / 0.9)) : 0;
    const armPitch = p.planting ? -0.9 : p.pitch * 0.7 - reloadMotion * 0.35;
    const thr = p.throwT !== undefined && p.throwT < 0.45 ? p.throwT / 0.45 : -1;
    const throwSwing = thr < 0 ? 0 : thr < 0.35 ? -(thr / 0.35) * 1.4 : -1.4 + ((thr - 0.35) / 0.65) * 2.2 * (1 - (thr - 0.35) / 0.65 * 0.3);
    this.armR.rotation.x = armPitch + p.firing * 0.15 + throwSwing;
    this.armL.rotation.x = armPitch + p.firing * 0.15;
    this.armR.position.z = p.firing * 0.04;
    this.armR.rotation.z = -reloadMotion * 0.2;
    this.armL.rotation.x -= reloadMotion * 0.6;
    this.armL.rotation.z = reloadMotion * 0.35;
    this.armL.position.z = 0;
    // lean back into the slide, shoulders turned a little, gun kept level on target
    this.torso.rotation.x -= slide * 0.55;
    this.torso.rotation.y += slide * 0.22;
    this.torso.rotation.z += slide * 0.1;
    this.armR.rotation.x += slide * 0.55;
    this.armL.rotation.x += slide * 0.55;
    this.armR.rotation.y -= slide * 0.22; this.armL.rotation.y -= slide * 0.22;
    this.head.rotation.x += slide * 0.35;
    if (prone > 0) {
      const crawl = Math.sin(this.phase) * Math.min(1, p.speed / 1.1);
      this.hips.position.y += (0.18 - this.hips.position.y) * prone;
      this.hips.rotation.x = -Math.PI / 2 * prone;
      const torsoPitch = 0.08 + Math.max(-0.12, Math.min(0.18, p.pitch * 0.15));
      this.torso.rotation.x += (torsoPitch - this.torso.rotation.x) * prone;
      this.torso.rotation.z *= 1 - prone;
      this.torso.position.x *= 1 - prone;
      const compensation = (Math.PI / 2 - torsoPitch) * prone;
      this.head.rotation.x += compensation;
      this.head.rotation.y = Math.max(-0.65, Math.min(0.65, p.aimYaw ?? 0)) * prone;
      for (const [arm, sign] of [[this.armR, 1], [this.armL, -1]] as const) {
        arm.rotation.x += compensation;
        arm.rotation.y = Math.max(-1.1, Math.min(1.1, p.aimYaw ?? 0)) * prone;
        arm.position.z += (0.1 + sign * crawl * 0.015) * prone;
      }
      for (const [leg, shin, foot, sign] of [[this.legL, this.shinL, this.footL, 1], [this.legR, this.shinR, this.footR, -1]] as const) {
        leg.rotation.x += (-0.12 + sign * crawl * 0.08 - leg.rotation.x) * prone;
        leg.rotation.z += (sign * (0.1 + Math.abs(crawl) * 0.07) - leg.rotation.z) * prone;
        shin.rotation.x += (0.12 - shin.rotation.x) * prone;
        foot.rotation.x *= 1 - prone; foot.rotation.z *= 1 - prone;
      }
    }
    const blob = this.root.getObjectByName('blob')!;
    blob.scale.set(1 - prone * 0.1, 1 + prone * 1.1, 1);
    const mag = this.held?.getObjectByName('magazine');
    if (mag) { mag.visible = reload < 0.35 || reload > 0.6; mag.position.y = -reloadMotion * 0.12; }
  }

  dispose() {
    if (this.held) releaseModel(this.held);
    // Body batches belong to this character. Held weapon geometry is cached and
    // shared across agents, so deliberately keep it out of this disposal loop.
    for (const group of [this.torso, this.head, this.armR, this.armL, this.legL, this.legR, this.shinL, this.shinR, this.footL, this.footR]) {
      for (const child of group.children) if (child instanceof Mesh && child.userData.batched) child.geometry.dispose();
    }
    const blob = this.root.getObjectByName('blob') as Mesh;
    blob.geometry.dispose(); (blob.material as Material).dispose();
    for (const material of this.own.values()) material.dispose();
    this.own.clear();
  }
}

/** Ring shown under teammates (team color). */
export function teamRing(color: string): Mesh {
  const ring = new Mesh(new CylinderGeometry(0.5, 0.5, 0.01, 20, 1, true), new MeshBasicMaterial({ color, transparent: true, opacity: 0.0 }));
  return ring;
}
