import {
  AdditiveBlending, BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, RingGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, type Material, type Object3D,
} from 'three';
import { weaponModel } from './WeaponModels';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { PERKS, POWERUPS, type PerkId, type PowerUpId } from '../config/zombies';
import { batchModel } from './Geometry';

/** Procedural props for Zombies. Every model's front faces local −Z (rotate by the placement yaw). */

const std = (color: string, rough = 0.7, metal = 0.1, emissive?: string) =>
  new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(emissive ? { emissive: new Color(emissive), emissiveIntensity: 1 } : {}) });
const glowMat = (color: string, opacity = 1) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

function box(g: Object3D, m: Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, name = '') {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  if (name) mesh.name = name;
  g.add(mesh);
  return mesh;
}
function cylinder(g: Object3D, m: Material, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0, seg = 16) {
  const mesh = new Mesh(new CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, 0, rz);
  g.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------- canvas textures
const texCache = new Map<string, CanvasTexture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.sharedResource = true;
  texCache.set(key, t);
  return t;
}
const FONT = 'Bahnschrift, "Segoe UI", Arial, sans-serif';

export function labelTexture(text: string, sub: string, color: string, bg = 'rgba(12,14,16,0.92)'): CanvasTexture {
  return canvasTex(`label:${text}:${sub}:${color}`, 512, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#f2f2f2'; g.font = `700 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text.toUpperCase(), 256, sub ? 46 : 64, 470);
    if (sub) { g.fillStyle = color; g.font = `600 36px ${FONT}`; g.fillText(sub, 256, 96, 470); }
  });
}

function hazardTex() {
  return canvasTex('hazard', 256, 64, (g) => {
    g.fillStyle = '#e8b818'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#16161a';
    for (let x = -64; x < 256 + 64; x += 48) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 24, 64); g.lineTo(x + 88, 0); g.lineTo(x + 64, 0); g.closePath(); g.fill(); }
  });
}

function perkTex(id: PerkId) {
  const p = PERKS[id];
  return canvasTex(`perk:${id}`, 256, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#0a0b0e'); grd.addColorStop(1, '#16181d');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = p.color; g.lineWidth = 8; g.strokeRect(10, 10, 236, 492);
    g.fillStyle = p.color; g.font = `800 150px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.glyph, 128, 190);
    g.fillStyle = '#f4f4f4'; g.font = `800 40px ${FONT}`;
    const words = p.name.toUpperCase().split(' ');
    words.forEach((w, i) => g.fillText(w, 128, 350 + i * 46, 220));
    g.fillStyle = p.color; g.font = `700 22px ${FONT}`; g.fillText('PERK-A-COLA', 128, 470);
  });
}

function glyphTex(glyph: string, color: string) {
  return canvasTex(`glyph:${glyph}:${color}`, 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = color; g.font = `900 ${glyph.length > 1 ? 58 : 78}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 16;
    g.fillText(glyph, 64, 68);
  });
}

function questionTex() {
  return canvasTex('question', 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#7ae8ff'; g.shadowColor = '#40d0ff'; g.shadowBlur = 18;
    g.font = `900 100px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 64, 70);
  });
}

function textPlane(tex: CanvasTexture, w: number, h: number, glow = false) {
  const m = new Mesh(new PlaneGeometry(w, h), glow ? new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false })
    : new MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: true }));
  return m;
}

// ---------------------------------------------------------------------------- doors & debris
/** Security roller shutter filling a doorway (local X = across the doorway). */
export function shutterModel(w: number, h: number, name: string, price: number): Group {
  const g = new Group();
  const frame = std('#30353b', 0.5, 0.6), slatA = std('#7d848c', 0.45, 0.65), slatB = std('#6c737b', 0.5, 0.6);
  box(g, frame, 0.14, h, 0.3, -w / 2 + 0.07, h / 2, 0);
  box(g, frame, 0.14, h, 0.3, w / 2 - 0.07, h / 2, 0);
  box(g, frame, w, 0.3, 0.42, 0, h - 0.15, 0);
  const panel = new Group(); panel.name = 'panel';
  for (let y = 0, i = 0; y < h - 0.3; y += 0.17, i++) box(panel, i % 2 ? slatA : slatB, w - 0.2, 0.15, 0.05, 0, y + 0.075, 0);
  const stripe = new MeshStandardMaterial({ map: hazardTex(), roughness: 0.6 });
  box(panel, stripe, w - 0.2, 0.26, 0.07, 0, 0.13, 0);
  const tex = labelTexture(name, `${price.toLocaleString('en-US')} pts`, '#ffcf4a');
  for (const side of [-1, 1]) {
    const s = textPlane(tex, Math.min(1.9, w - 0.4), Math.min(1.9, w - 0.4) / 4, true);
    s.position.set(0, Math.min(h - 0.6, 1.75), side * 0.045);
    if (side < 0) s.rotation.y = Math.PI;
    panel.add(s);
  }
  g.add(panel);
  return g;
}

/** A doorway that never opens: furniture, boards and caution tape. */
export function debrisModel(w: number, seed: number): Group {
  const g = new Group();
  const wood = std('#7a5a36', 0.85), crate = std('#8a6a40', 0.8), tape = std('#e8c020', 0.5), dark = std('#3a3a3e', 0.6, 0.4);
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 6; i++) box(g, wood, w + 0.2, 0.16, 0.05, 0, 0.35 + i * 0.32, (i % 2 ? -1 : 1) * 0.06, 0, 0, (rnd() - 0.5) * 0.25);
  for (let i = 0; i < Math.max(2, Math.round(w / 1.2)); i++) {
    const s = 0.6 + rnd() * 0.4;
    box(g, crate, s, s, s, -w / 2 + 0.5 + i * (w - 1) / Math.max(1, Math.round(w / 1.2) - 1), s / 2, -0.4 + rnd() * 0.2, 0, rnd() * 0.6);
  }
  box(g, dark, 1.2, 0.08, 0.6, rnd() - 0.5, 1.15, -0.5, 0.3, 0.2, 0.6); // a tipped-over desk top
  for (const y of [1.05, 1.45]) box(g, tape, w + 0.4, 0.05, 0.01, 0, y, -0.18, 0, 0, (rnd() - 0.5) * 0.2);
  return g;
}

// ---------------------------------------------------------------------------- wall weapons
export function wallBuyModel(id: WeaponId, price: number): Group {
  const g = new Group();
  const board = std('#2e2620', 0.9);
  box(g, board, 1.32, 0.66, 0.04, 0, 0, 0.0);
  box(g, std('#a88a5a', 0.5, 0.6), 1.38, 0.04, 0.05, 0, 0.35, 0);
  box(g, std('#a88a5a', 0.5, 0.6), 1.38, 0.04, 0.05, 0, -0.35, 0);
  // the actual gun, mounted sideways
  const gun = weaponModel(id);
  gun.rotation.set(0, Math.PI / 2, 0);
  const small = WEAPONS[id].class === 'pistol';
  gun.scale.setScalar(small ? 1.6 : id === 'hammer' || id === 'bulwark' || id === 'anvil' ? 0.95 : 1.15);
  gun.position.set(small ? 0.05 : 0.2, 0.08, -0.06);
  g.add(gun);
  // chalk-glow outline behind the gun
  const outline = new Mesh(new PlaneGeometry(1.2, 0.36), glowMat('#fff3c8', 0.09));
  outline.position.set(0, 0.06, -0.025);
  g.add(outline);
  const label = textPlane(labelTexture(WEAPONS[id].name, `${price.toLocaleString('en-US')} pts`, '#ffcf4a'), 0.92, 0.23, true);
  label.position.set(0, -0.23, -0.03);
  label.rotation.y = Math.PI;
  g.add(label);
  return g;
}

// ---------------------------------------------------------------------------- machines
export function perkMachineModel(perk: PerkId): Group {
  const g = new Group();
  const p = PERKS[perk];
  const body = std(new Color(p.color).multiplyScalar(0.55).getStyle(), 0.45, 0.35);
  const trim = std('#1a1c20', 0.4, 0.6);
  box(g, body, 1.15, 2.05, 0.85, 0, 1.025, 0);
  box(g, trim, 1.19, 0.12, 0.89, 0, 2.08, 0);
  box(g, trim, 1.19, 0.1, 0.89, 0, 0.05, 0);
  const panel = textPlane(perkTex(perk), 0.78, 1.56, true);
  panel.name = 'panel';
  panel.position.set(-0.08, 1.15, -0.432);
  panel.rotation.y = Math.PI;
  g.add(panel);
  box(g, trim, 0.2, 0.5, 0.06, 0.42, 1.1, -0.44);
  box(g, std('#d8d8d8', 0.3, 0.8), 0.06, 0.3, 0.02, 0.42, 1.15, -0.475);
  box(g, trim, 0.7, 0.18, 0.12, -0.08, 0.32, -0.44); // dispenser slot
  const crown = new Mesh(new BoxGeometry(1.2, 0.28, 0.9), new MeshBasicMaterial({ color: new Color(p.color).multiplyScalar(1.15), toneMapped: false }));
  crown.name = 'crown';
  crown.position.set(0, 2.3, 0);
  g.add(crown);
  const pool = new Mesh(new CircleGeometry(1.1, 28), glowMat(p.color, 0.18));
  pool.name = 'pool';
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, -0.9);
  g.add(pool);
  return g;
}

export function mysteryBoxModel(): Group {
  const g = new Group();
  const wood = std('#5a3e24', 0.8), dark = std('#2a2018', 0.85), metal = std('#9a8a60', 0.35, 0.8);
  const crate = new Group(); crate.name = 'crate'; g.add(crate);
  box(crate, wood, 1.7, 0.62, 0.72, 0, 0.31, 0);
  for (const x of [-0.82, 0.82]) for (const z of [-0.33, 0.33]) box(crate, metal, 0.08, 0.66, 0.08, x, 0.33, z);
  for (const side of [-1, 1]) {
    const q = textPlane(questionTex(), 0.42, 0.42, true);
    q.position.set(side * 0.42, 0.33, -0.365); q.rotation.y = Math.PI;
    crate.add(q);
  }
  const lid = new Group(); lid.name = 'lid'; lid.position.set(0, 0.62, 0.36);
  box(lid, wood, 1.72, 0.12, 0.74, 0, 0.06, -0.37);
  box(lid, metal, 1.74, 0.03, 0.06, 0, 0.12, -0.72);
  const q2 = textPlane(questionTex(), 0.4, 0.4, true); q2.rotation.x = -Math.PI / 2; q2.position.set(0, 0.125, -0.37); lid.add(q2);
  crate.add(lid);
  const inner = new Mesh(new PlaneGeometry(1.55, 0.6), glowMat('#8ae8ff', 0.0));
  inner.name = 'inner'; inner.rotation.x = -Math.PI / 2; inner.position.set(0, 0.6, 0);
  crate.add(inner);
  const beam = new Mesh(new CylinderGeometry(0.42, 0.42, 30, 20, 1, true), glowMat('#5ad8ff', 0.11));
  beam.name = 'beam'; beam.position.y = 15;
  (beam.material as MeshBasicMaterial).side = DoubleSide;
  g.add(beam);
  const show = new Group(); show.name = 'show'; show.position.set(0, 0.95, 0);
  g.add(show);
  // inactive spot: a tarp over a pallet
  const tarp = new Group(); tarp.name = 'tarp';
  box(tarp, std('#4a5a3a', 0.95), 1.6, 0.5, 0.7, 0, 0.25, 0);
  box(tarp, dark, 1.75, 0.12, 0.8, 0, 0.06, 0);
  g.add(tarp);
  return g;
}

export function teddyModel(): Group {
  const g = new Group();
  const fur = std('#8a5a34', 0.95);
  const ball = (r: number, x: number, y: number, z: number) => { const m = new Mesh(new SphereGeometry(r, 14, 10), fur); m.position.set(x, y, z); g.add(m); };
  ball(0.16, 0, 0.2, 0); ball(0.12, 0, 0.44, 0); ball(0.05, -0.09, 0.54, 0); ball(0.05, 0.09, 0.54, 0);
  ball(0.06, -0.17, 0.25, -0.03); ball(0.06, 0.17, 0.25, -0.03); ball(0.07, -0.08, 0.05, -0.05); ball(0.07, 0.08, 0.05, -0.05);
  return g;
}

export function forgeModel(): Group {
  const g = new Group();
  const steel = std('#3a3f46', 0.4, 0.75), dark = std('#1c1e22', 0.5, 0.6), brass = std('#a8803a', 0.35, 0.85);
  box(g, steel, 2.6, 0.45, 1.5, 0, 0.225, 0);
  for (const x of [-1.1, 1.1]) box(g, steel, 0.32, 2.1, 1.2, x, 1.3, 0.05);
  box(g, steel, 2.6, 0.35, 1.3, 0, 2.2, 0.05);
  box(g, dark, 1.7, 0.6, 0.15, 0, 0.9, -0.6); // intake
  box(g, brass, 1.9, 0.08, 0.1, 0, 1.25, -0.66);
  const core = new Group(); core.name = 'core'; core.position.set(0, 1.62, -0.1);
  const ring = new Mesh(new TorusGeometry(0.42, 0.07, 10, 28), glowMat('#b06aff', 0.9)); ring.name = 'ring'; core.add(ring);
  const ring2 = new Mesh(new TorusGeometry(0.3, 0.04, 8, 24), glowMat('#5ae0ff', 0.9)); ring2.rotation.x = Math.PI / 2; core.add(ring2);
  const heart = new Mesh(new SphereGeometry(0.16, 16, 12), glowMat('#e0c0ff', 0.9)); heart.name = 'heart'; core.add(heart);
  g.add(core);
  const sign = textPlane(labelTexture('Prototype Forge', '5,000 pts · upgrade', '#b06aff'), 1.8, 0.45, true);
  sign.position.set(0, 2.2, -0.6); sign.rotation.y = Math.PI;
  g.add(sign);
  const show = new Group(); show.name = 'show'; show.position.set(0, 1.0, -0.82);
  g.add(show);
  return g;
}

export function powerModel(): Group {
  const g = new Group();
  const panel = std('#5a6068', 0.55, 0.5), dark = std('#22252a', 0.5, 0.5);
  box(g, panel, 1.05, 1.7, 0.26, 0, 1.15, 0);
  box(g, dark, 0.95, 1.55, 0.02, 0, 1.15, -0.13);
  for (let i = 0; i < 3; i++) box(g, std('#d8d8c0', 0.6), 0.22, 0.06, 0.02, -0.28 + i * 0.28, 1.8, -0.145);
  const lever = new Group(); lever.name = 'lever'; lever.position.set(0, 1.15, -0.2);
  box(lever, std('#888', 0.3, 0.8), 0.08, 0.5, 0.08, 0, 0.25, 0);
  box(lever, std('#c0281e', 0.5, 0.2), 0.32, 0.1, 0.1, 0, 0.5, 0);
  lever.rotation.x = 0.7;
  g.add(lever);
  const red = new Mesh(new SphereGeometry(0.05, 10, 8), glowMat('#ff3020')); red.name = 'ledOff'; red.position.set(-0.3, 1.6, -0.15); g.add(red);
  const green = new Mesh(new SphereGeometry(0.05, 10, 8), glowMat('#40ff60')); green.name = 'ledOn'; green.position.set(0.3, 1.6, -0.15); green.visible = false; g.add(green);
  const sign = textPlane(labelTexture('Main Power', 'Turn on for perks & forge', '#ffcf4a'), 1.0, 0.25, true);
  sign.position.set(0, 0.2, -0.14); sign.rotation.y = Math.PI;
  g.add(sign);
  return g;
}

export function armoryModel(): Group {
  const g = new Group();
  const top = std('#5a4a38', 0.8), steel = std('#4a5058', 0.5, 0.6), olive = std('#4a5a3a', 0.8);
  box(g, top, 1.9, 0.08, 0.85, 0, 0.92, 0);
  for (const x of [-0.85, 0.85]) for (const z of [-0.35, 0.35]) box(g, steel, 0.06, 0.9, 0.06, x, 0.45, z);
  box(g, steel, 1.8, 0.04, 0.75, 0, 0.3, 0);
  box(g, olive, 0.5, 0.3, 0.35, -0.55, 1.11, 0.05); box(g, olive, 0.45, 0.22, 0.32, -0.5, 0.42, 0.05);
  for (let i = 0; i < 4; i++) { const m = new Mesh(new SphereGeometry(0.05, 10, 8), std('#5a6a3a', 0.6)); m.position.set(0.2 + i * 0.12, 1.0, -0.15); g.add(m); }
  box(g, std('#2a2a2a', 0.5, 0.3), 0.55, 0.36, 0.05, 0.55, 1.2, 0.25, 0, 0.3);
  const screen = textPlane(labelTexture('Armory', 'Press F', '#7dff6a', 'rgba(4,18,8,0.95)'), 0.5, 0.125, true);
  screen.position.set(0.53, 1.2, 0.215); screen.rotation.y = Math.PI + 0.3;
  g.add(screen);
  const sign = textPlane(labelTexture('Armory', 'Armor · Lethals · Gear', '#7dff6a'), 1.4, 0.35, true);
  sign.position.set(0, 1.85, 0.4); sign.rotation.y = Math.PI;
  g.add(sign);
  return g;
}

export function radioModel(): Group {
  const g = new Group();
  const olive = std('#3e4a32', 0.7, 0.2);
  box(g, olive, 0.42, 0.24, 0.26, 0, 0.12, 0);
  box(g, std('#1a1a1a', 0.5), 0.36, 0.12, 0.02, 0, 0.14, -0.135);
  cylinder(g, std('#222', 0.4, 0.6), 0.008, 0.7, 0.16, 0.55, 0.05);
  const led = new Mesh(new SphereGeometry(0.03, 10, 8), glowMat('#40ff60')); led.name = 'led'; led.position.set(-0.14, 0.2, -0.14); g.add(led);
  const beacon = new Mesh(new CylinderGeometry(0.3, 0.3, 14, 16, 1, true), glowMat('#40ff60', 0.0)); beacon.name = 'beacon'; beacon.position.y = 7;
  (beacon.material as MeshBasicMaterial).side = DoubleSide;
  g.add(beacon);
  return g;
}

export function powerUpModel(kind: PowerUpId): Group {
  const g = new Group();
  const def = POWERUPS[kind];
  const coin = new Mesh(new CylinderGeometry(0.26, 0.26, 0.06, 28), std('#c8a040', 0.25, 0.9, '#3a2a00'));
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  for (const side of [-1, 1]) {
    const face = new Mesh(new PlaneGeometry(0.4, 0.4), new MeshBasicMaterial({ map: glyphTex(def.glyph, def.color), transparent: true, toneMapped: false, depthWrite: false }));
    face.position.z = side * 0.035;
    if (side < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  const halo = new Mesh(new SphereGeometry(0.5, 16, 12), glowMat(def.color, 0.22));
  halo.name = 'halo';
  g.add(halo);
  const ring = new Mesh(new RingGeometry(0.42, 0.5, 32), glowMat(def.color, 0.35));
  ring.name = 'ring'; ring.rotation.x = -Math.PI / 2; ring.position.y = -0.85;
  g.add(ring);
  return g;
}

export function heliModel(): Group {
  const g = new Group();
  const body = std('#3a4038', 0.55, 0.35), dark = std('#1a1d1f', 0.5, 0.5), glass = std('#1a2a38', 0.1, 0.9);
  const hull = new Mesh(new SphereGeometry(1, 20, 14), body); hull.scale.set(1.3, 1.2, 2.6); hull.position.y = 1.6; g.add(hull);
  const cockpit = new Mesh(new SphereGeometry(1, 16, 12), glass); cockpit.scale.set(1.0, 0.8, 1.2); cockpit.position.set(0, 1.9, -1.7); g.add(cockpit);
  box(g, body, 0.45, 0.45, 5.2, 0, 2.0, 4.6);
  box(g, body, 0.12, 1.2, 0.7, 0, 2.6, 7.0);
  const tail = new Group(); tail.name = 'tail'; tail.position.set(0.3, 2.6, 7.1);
  box(tail, dark, 0.04, 1.6, 0.14, 0, 0, 0); box(tail, dark, 0.04, 0.14, 1.6, 0, 0, 0);
  g.add(tail);
  for (const x of [-1.1, 1.1]) { box(g, dark, 0.1, 0.1, 3.6, x, 0.05, 0); box(g, dark, 0.08, 0.6, 0.08, x * 0.9, 0.35, -1); box(g, dark, 0.08, 0.6, 0.08, x * 0.9, 0.35, 1); }
  cylinder(g, dark, 0.15, 0.5, 0, 2.95, 0);
  const rotor = new Group(); rotor.name = 'rotor'; rotor.position.set(0, 3.25, 0);
  for (let i = 0; i < 4; i++) box(rotor, dark, 0.35, 0.05, 6.4, 0, 0, 0, 0, i * Math.PI / 4 * 2);
  const blur = new Mesh(new CircleGeometry(6.4, 40), new MeshBasicMaterial({ color: '#202020', transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide }));
  blur.rotation.x = -Math.PI / 2; rotor.add(blur);
  g.add(rotor);
  const light = new Mesh(new SphereGeometry(0.12, 10, 8), glowMat('#ff3020')); light.name = 'beaconLight'; light.position.set(0, 0.5, 0.6); g.add(light);
  return g;
}

export function lzModel(radius: number): Group {
  const g = new Group();
  const ring = new Mesh(new RingGeometry(radius - 0.35, radius, 64), glowMat('#ff4030', 0.5));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.name = 'ring';
  g.add(ring);
  const h = new Mesh(new PlaneGeometry(2.6, 2.6), new MeshBasicMaterial({ map: glyphTex('H', '#ffb030'), transparent: true, depthWrite: false, toneMapped: false }));
  h.rotation.x = -Math.PI / 2; h.position.y = 0.04;
  g.add(h);
  return g;
}

/** Multiply every material colour of a static prop by the baked light at its position. */
export function tintModel(root: Object3D, light: Color) {
  const tinted = new Map<Material, Material>();
  const tint = (material: Material): Material => {
    const m = material as MeshStandardMaterial;
    if (!m.isMeshStandardMaterial) return material;
    const ready = tinted.get(m);
    if (ready) return ready;
    // Mounted guns share template materials with held / dropped guns. Their local
    // baked-light tint must never darken the weapon cache or a later match.
    const local = m.userData.sharedResource ? m.clone() : m;
    if (local !== m) local.userData.sharedResource = false;
    local.color.multiply(light);
    tinted.set(m, local);
    return local;
  };
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.material) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
  });
}

/** Batch static siblings while retaining named animation pivots and switchable LEDs. */
export function batchZombiesModel(root: Group) {
  const originals = new Set<import('three').BufferGeometry>();
  root.traverse((o) => { const geometry = (o as Mesh).geometry; if (geometry && !geometry.userData.sharedResource) originals.add(geometry); });
  batchModel(root);
  // The generic batcher leaves ownership to its caller. Release replaced private
  // geometry here, keeping cached weapon geometry and every named animated mesh.
  root.traverse((o) => { const geometry = (o as Mesh).geometry; if (geometry) originals.delete(geometry); });
  for (const geometry of originals) geometry.dispose();
}
