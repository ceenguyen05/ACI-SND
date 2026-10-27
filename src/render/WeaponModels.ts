import { BoxGeometry, Color, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, QuadraticBezierCurve3, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type Material } from 'three';
import type { WeaponId } from '../config/weapons';
import type { AttachmentId } from '../config/attachments';
import type { UtilityId } from '../config/utilities';
import { FINISHES } from '../config/cosmetics';
import { finishTexture, surfaceDetail, TEX } from './Textures';
import { batchModel, bevelBox } from './Geometry';

/** Procedural weapon models. Local frame: barrel along -Z, grip at origin, units meters. */
const matCache = new Map<string, Material>();
function mat(key: string, make: () => Material): Material {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  m.userData.sharedResource = true;
  return m;
}
const black = () => mat('w:black', () => new MeshStandardMaterial({ color: '#292d31', map: TEX.metal().tex, normalMap: surfaceDetail(TEX.metal()).normal, roughness: 0.48, metalness: 0.65 }));
const steel = () => mat('w:steel', () => new MeshStandardMaterial({ color: '#5a5f66', roughness: 0.35, metalness: 0.85 }));
const woodM = () => mat('w:wood', () => new MeshStandardMaterial({ color: '#a49b8b', map: TEX.wood().tex, normalMap: surfaceDetail(TEX.wood()).normal, roughness: 0.46 }));
const polymer = () => mat('w:poly', () => new MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.8 }));
const glassM = () => mat('w:glass', () => new MeshStandardMaterial({ color: '#203040', roughness: 0.05, metalness: 0.9 }));

export function finishMaterial(finishId: string | undefined): Material {
  if (finishId === 'forged') {
    // Prototype Forge upgrade: a shifting violet/cyan energy camo that glows in the dark
    return mat('finish:forged', () => new MeshStandardMaterial({
      map: finishTexture('forged', '#24123a', '#a060ff', 'hex'), emissive: new Color('#5a28d0'), emissiveIntensity: 0.55,
      roughness: 0.28, metalness: 0.75, normalMap: surfaceDetail(TEX.metal()).normal,
    }));
  }
  const f = FINISHES.find((x) => x.id === finishId) ?? FINISHES[0];
  return mat('finish:' + f.id, () => new MeshStandardMaterial({
    map: finishTexture(f.id, f.base, f.accent, f.pattern), roughness: 0.5 - f.metal * 0.3, metalness: f.metal,
    normalMap: surfaceDetail(TEX.metal()).normal, roughnessMap: surfaceDetail(TEX.metal()).roughness,
  }));
}

function part(g: Group, m: Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const mesh = new Mesh(bevelBox(w, h, d), m);
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
function cyl(g: Group, m: Material, r: number, len: number, x: number, y: number, z: number, seg = 16, r2 = r) {
  const mesh = new Mesh(new CylinderGeometry(r2, r, len, seg), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

function magazine(g: Group): Group {
  const mag = new Group(); mag.name = 'magazine'; g.add(mag); return mag;
}

/** Extruded side silhouette: useful for stocks that are not rectangular blocks. */
function stock(g: Group, material: Material, wood: boolean) {
  const shape = new Shape();
  shape.moveTo(0.075, 0.052); shape.lineTo(0.18, 0.047); shape.lineTo(0.31, 0.026);
  shape.lineTo(0.315, -0.07); shape.lineTo(0.275, -0.07); shape.lineTo(0.17, -0.015);
  shape.lineTo(0.075, -0.008); shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: 0.038, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2, steps: 1 });
  const mesh = new Mesh(geo, material); mesh.rotation.y = -Math.PI / 2; mesh.position.x = 0.019; g.add(mesh);
  part(g, polymer(), 0.048, 0.098, 0.014, 0, -0.021, 0.314);
  if (!wood) {
    cyl(g, black(), 0.014, 0.14, 0, 0.04, 0.14);
    part(g, black(), 0.035, 0.012, 0.05, 0, -0.043, 0.22);
  }
}

function sights(g: Group, front: number, rear = 0.035) {
  part(g, black(), 0.028, 0.012, 0.025, 0, 0.09, rear);
  for (const x of [-0.011, 0.011]) part(g, steel(), 0.006, 0.014, 0.012, x, 0.102, rear);
  part(g, black(), 0.026, 0.014, 0.022, 0, 0.075, front);
  part(g, steel(), 0.004, 0.024, 0.007, 0, 0.092, front);
}

interface RifleSpec { recv: number; barrel: number; hand: number; stock: 'solid' | 'wood' | 'skeleton' | 'none' | 'bullpup'; mag: 'curved' | 'straight' | 'short' | 'none'; scope?: number; wood?: boolean; handle?: boolean; muzzle?: 'brake' | 'flash' | 'suppressor' }

function rifle(skin: Material, s: RifleSpec): Group {
  const g = new Group();
  const mag = magazine(g);
  const bodyH = s.wood ? 0.054 : 0.075;
  part(g, skin, 0.05, bodyH, s.recv, 0, 0.04, -s.recv / 2 + 0.08);
  if (s.wood) {
    cyl(g, black(), 0.024, s.recv * 0.85, 0, 0.061, -s.recv / 2 + 0.08, 20);
    cyl(g, black(), 0.008, s.hand + 0.08, 0, 0.072, -s.recv + 0.05 - s.hand / 2, 12);
  }
  part(g, s.wood ? woodM() : skin, 0.055, 0.06, s.hand, 0, 0.03, -s.recv + 0.08 - s.hand / 2);
  cyl(g, steel(), 0.011, s.barrel, 0, 0.045, -s.recv + 0.08 - s.barrel / 2, 16);
  const tip = -s.recv + 0.08 - s.barrel;
  if (s.muzzle === 'suppressor') cyl(g, black(), 0.02, 0.16, 0, 0.045, tip - 0.06, 10);
  else if (s.muzzle === 'brake') part(g, black(), 0.03, 0.03, 0.06, 0, 0.045, tip + 0.02);
  part(g, polymer(), 0.03, 0.1, 0.045, 0, -0.04, 0.02, 0.25);  // grip
  // Open trigger guard, curved trigger and receiver controls.
  part(g, black(), 0.012, 0.006, 0.065, 0, -0.035, -0.03);
  part(g, black(), 0.012, 0.035, 0.006, 0, -0.018, -0.061);
  part(g, steel(), 0.006, 0.024, 0.009, 0, -0.012, -0.025, -0.25);
  part(g, black(), 0.003, 0.023, 0.07, 0.026, 0.049, -0.05); // ejection port
  const bolt = new Group(); bolt.name = 'bolt'; g.add(bolt);
  part(bolt, steel(), 0.008, 0.013, 0.037, 0.029, 0.05, -0.045);
  if (s.scope) {
    part(bolt, steel(), 0.038, 0.008, 0.009, 0.04, 0.039, 0.014, 0, 0, -0.35);
    const handle = new Mesh(new SphereGeometry(0.012, 12, 8), black());
    handle.position.set(0.061, 0.032, 0.014); bolt.add(handle);
  }
  part(g, steel(), 0.007, 0.007, 0.035, -0.028, 0.017, 0.025, 0.25);
  for (const z of [-0.12, 0.025]) part(g, steel(), 0.003, 0.008, 0.008, -0.027, 0.04, z);
  if (s.mag === 'curved') {
    const outline = new Shape();
    outline.moveTo(-0.087, 0.006); outline.quadraticCurveTo(-0.088, -0.1, -0.14, -0.18);
    outline.lineTo(-0.202, -0.168); outline.quadraticCurveTo(-0.15, -0.085, -0.151, 0.006); outline.closePath();
    const body = new Mesh(new ExtrudeGeometry(outline, { depth: 0.032, bevelEnabled: true,
      bevelSize: 0.003, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 10, steps: 1 }), black());
    body.rotation.y = -Math.PI / 2; body.position.x = 0.016; mag.add(body);
    for (const x of [-0.019, 0.019]) for (const offset of [0, 0.014, 0.028]) {
      const curve = new QuadraticBezierCurve3(new Vector3(x, -0.018, -0.1 - offset),
        new Vector3(x, -0.09, -0.102 - offset), new Vector3(x, -0.158, -0.153 - offset));
      mag.add(new Mesh(new TubeGeometry(curve, 8, 0.0014, 4, false), steel()));
    }
  } else if (s.mag === 'straight') {
    part(mag, black(), 0.034, 0.15, 0.055, 0, -0.06, -0.12, -0.08);
    for (const z of [-0.13, -0.11]) for (const x of [-0.018, 0.018]) part(mag, steel(), 0.002, 0.105, 0.004, x, -0.065, z, -0.08);
    part(mag, polymer(), 0.039, 0.012, 0.061, 0, -0.137, -0.126);
  } else if (s.mag === 'short') part(mag, black(), 0.03, 0.08, 0.045, 0, -0.03, -0.1);
  if (s.stock === 'solid') stock(g, polymer(), false);
  else if (s.stock === 'wood') stock(g, woodM(), true);
  else if (s.stock === 'skeleton') { part(g, black(), 0.02, 0.02, 0.22, 0, 0.05, 0.18); part(g, black(), 0.02, 0.07, 0.02, 0, 0.02, 0.29); }
  else if (s.stock === 'bullpup') part(g, polymer(), 0.055, 0.105, 0.22, 0, 0.015, 0.19);
  if (s.stock !== 'none' && s.stock !== 'skeleton') part(g, polymer(), 0.052, 0.09, 0.018, 0, 0.015, 0.315);
  // Rail teeth and handguard ventilation break up the old rectangular silhouette.
  if (!s.wood) for (let z = 0.035; z > -s.recv + 0.1; z -= 0.022) part(g, steel(), 0.025, 0.006, 0.009, 0, 0.087, z);
  for (let i = 0; i < Math.floor(s.hand / 0.033); i++) {
    const z = -s.recv + 0.065 - i * 0.033;
    for (const x of [-0.028, 0.028]) part(g, black(), 0.003, 0.013, 0.019, x, 0.038, z);
  }
  if (s.handle) { part(g, skin, 0.025, 0.04, 0.22, 0, 0.1, -0.08); part(g, skin, 0.02, 0.05, 0.02, 0, 0.08, 0.01); }
  else if (!s.wood) part(g, black(), 0.02, 0.015, s.recv * 0.7, 0, 0.085, -s.recv / 2 + 0.08);
  if (s.scope) {
    cyl(g, black(), 0.022, s.scope, 0, 0.13, -0.05, 12);
    cyl(g, black(), 0.03, 0.05, 0, 0.13, -0.05 - s.scope / 2, 12);
    cyl(g, glassM(), 0.026, 0.005, 0, 0.13, -0.05 - s.scope / 2 - 0.027, 12);
    cyl(g, black(), 0.029, 0.055, 0, 0.13, -0.05 + s.scope / 2, 20);
    cyl(g, glassM(), 0.025, 0.005, 0, 0.13, -0.02 + s.scope / 2, 20);
    part(g, black(), 0.035, 0.025, 0.035, 0, 0.16, -0.06);
    part(g, black(), 0.025, 0.035, 0.035, 0.024, 0.13, -0.06);
    part(g, black(), 0.02, 0.04, 0.02, 0, 0.1, -0.1); part(g, black(), 0.02, 0.04, 0.02, 0, 0.1, 0.02);
  } else {
    sights(g, tip + s.barrel * 0.15 + 0.06);
  }
  // Dark bore and retaining ring make the muzzle read as a tube.
  const muzzleZ = tip - (s.muzzle === 'suppressor' ? 0.14 : 0.008);
  cyl(g, polymer(), 0.007, 0.004, 0, 0.045, muzzleZ, 16);
  g.userData.muzzle = new Vector3(0, 0.045, tip - (s.muzzle === 'suppressor' ? 0.14 : 0));
  const handZ = -s.recv + 0.08 - s.hand / 2;
  g.userData.anchor = {
    railY: s.handle ? 0.122 : s.wood ? 0.088 : 0.093, railZ: -0.06,
    underY: 0.0, underZ: s.hand > 0.06 ? handZ : -s.recv + 0.05,
    sideX: 0.03, sideY: 0.03, sideZ: s.hand > 0.06 ? handZ + s.hand * 0.15 : -s.recv + 0.06,
    stockZ: 0.3, barrelY: 0.045,
  } satisfies Anchor;
  return g;
}

function pistol(skin: Material, o: { len: number; h: number; supp?: boolean; ext?: boolean }): Group {
  const g = new Group();
  const slide = new Group(); slide.name = 'slide'; g.add(slide);
  const mag = magazine(g);
  part(slide, skin, 0.034, o.h, o.len, 0, 0.045, -o.len / 2 + 0.04);
  part(g, polymer(), 0.028, 0.035, o.len * 0.85, 0, 0.012, -o.len / 2 + 0.05);
  part(g, polymer(), 0.028, 0.1, 0.04, 0, -0.04, 0.015, 0.2);
  part(mag, black(), 0.031, 0.014, 0.045, 0, -0.09, 0.025);
  if (o.ext) {
    // extended stick magazine + folding brace for the machine pistol
    part(mag, black(), 0.028, 0.11, 0.04, 0, -0.14, 0.03, 0.2);
    part(mag, polymer(), 0.032, 0.012, 0.045, 0, -0.198, 0.042);
    part(g, black(), 0.012, 0.012, 0.13, 0, 0.0, 0.1);
    part(g, black(), 0.04, 0.05, 0.012, 0, -0.01, 0.165);
    part(g, black(), 0.022, 0.03, 0.05, 0, -0.005, -o.len + 0.09); // vertical fore-grip stub
  }
  part(g, black(), 0.012, 0.006, 0.045, 0, -0.029, -0.025);
  part(g, black(), 0.012, 0.026, 0.006, 0, -0.016, -0.045);
  part(g, steel(), 0.005, 0.02, 0.007, 0, -0.013, -0.024, -0.2);
  for (let i = 0; i < 6; i++) for (const x of [-0.0175, 0.0175]) part(slide, black(), 0.002, o.h * 0.65, 0.003, x, 0.045, 0.022 - i * 0.007);
  part(slide, black(), 0.003, 0.014, 0.035, 0.018, 0.054, -0.04);
  part(slide, black(), 0.026, 0.011, 0.012, 0, 0.045 + o.h / 2, 0.025);
  part(slide, steel(), 0.005, 0.011, 0.009, 0, 0.045 + o.h / 2, -o.len + 0.052);
  let tip = -o.len + 0.04;
  if (o.supp) { cyl(g, black(), 0.017, 0.13, 0, 0.05, tip - 0.06, 10); tip -= 0.13; }
  cyl(g, steel(), 0.008, 0.006, 0, 0.045, tip - 0.002);
  cyl(g, polymer(), 0.005, 0.002, 0, 0.045, tip - 0.006);
  g.userData.muzzle = new Vector3(0, 0.05, tip);
  g.userData.anchor = {
    railY: 0.045 + o.h / 2, railZ: -0.03, underY: -0.006, underZ: -o.len * 0.6 + 0.05,
    sideX: 0, sideY: -0.016, sideZ: -o.len * 0.6 + 0.05, stockZ: 0.15, barrelY: 0.05,
  } satisfies Anchor;
  return g;
}

function shotgun(skin: Material): Group {
  const g = new Group();
  part(g, skin, 0.05, 0.07, 0.22, 0, 0.04, -0.03);
  cyl(g, steel(), 0.014, 0.55, 0, 0.06, -0.42, 20);
  cyl(g, black(), 0.012, 0.45, 0, 0.032, -0.36, 20);
  const pump = new Group(); pump.name = 'pump'; g.add(pump);
  cyl(pump, woodM(), 0.028, 0.16, 0, 0.032, -0.3, 20);
  for (let k = 0; k < 9; k++) cyl(pump, black(), 0.0285, 0.003, 0, 0.032, -0.37 + k * 0.016, 20);
  stock(g, woodM(), true);
  part(g, polymer(), 0.03, 0.09, 0.04, 0, -0.035, 0.05, 0.3);
  part(g, black(), 0.006, 0.024, 0.007, 0, -0.01, -0.02);
  part(g, black(), 0.012, 0.006, 0.07, 0, -0.029, -0.02);
  part(g, black(), 0.012, 0.027, 0.006, 0, -0.015, -0.055);
  part(g, black(), 0.004, 0.026, 0.08, 0.027, 0.046, -0.03);
  cyl(g, polymer(), 0.01, 0.003, 0, 0.06, -0.697, 20);
  sights(g, -0.64);
  g.userData.muzzle = new Vector3(0, 0.06, -0.7);
  g.userData.anchor = { railY: 0.078, railZ: -0.04, underY: 0.004, underZ: -0.3, sideX: 0.03, sideY: 0.06, sideZ: -0.48, stockZ: 0.3, barrelY: 0.06 } satisfies Anchor;
  return g;
}

/** Belt-fed machine gun: rifle body + heat shroud, box magazine, feed cover and folded bipod. */
function lmg(skin: Material, heavy: boolean): Group {
  const g = rifle(skin, { recv: 0.38, barrel: heavy ? 0.44 : 0.36, hand: 0.2, stock: 'solid', mag: 'none', muzzle: heavy ? 'brake' : 'flash', handle: !heavy });
  const mag = g.getObjectByName('magazine') as Group;
  const boxM = heavy ? mat('w:olive', () => new MeshStandardMaterial({ color: '#4a5038', roughness: 0.75, metalness: 0.2 })) : polymer();
  part(mag, boxM, 0.075, 0.12, 0.13, -0.03, -0.05, -0.13);
  part(mag, black(), 0.08, 0.02, 0.135, -0.03, 0.015, -0.13);
  // ammo belt into the feed tray
  for (let i = 0; i < 6; i++) {
    const b = new Mesh(new CylinderGeometry(0.005, 0.005, 0.035, 6), mat('w:brass', () => new MeshStandardMaterial({ color: '#b6934c', roughness: 0.3, metalness: 0.8 })));
    b.rotation.z = Math.PI / 2; b.position.set(0.012, 0.035 + i * 0.006, -0.08 - i * 0.012); mag.add(b);
  }
  part(g, skin, 0.064, 0.03, 0.16, 0, 0.09, -0.08); // feed cover
  // ventilated heat shroud over the barrel
  const shroudZ = -0.38 + 0.08 - 0.12;
  cyl(g, black(), 0.022, 0.24, 0, 0.045, shroudZ, 12);
  for (let k = 0; k < 6; k++) cyl(g, polymer(), 0.0225, 0.012, 0, 0.045, shroudZ - 0.1 + k * 0.04, 12);
  // folded bipod
  for (const x of [-0.016, 0.016]) part(g, steel(), 0.008, 0.008, 0.26, x, 0.012, -0.5, 0.04);
  part(g, black(), 0.04, 0.02, 0.03, 0, 0.022, -0.37);
  if (heavy) part(g, skin, 0.02, 0.035, 0.12, 0, 0.11, -0.2); // carry handle
  const an = g.userData.anchor as Anchor;
  g.userData.anchor = { ...an, railY: heavy ? 0.106 : 0.122, railZ: -0.06, underZ: -0.3, sideZ: -0.3 } satisfies Anchor;
  return g;
}

/** Break-action 40 mm grenade launcher. The chambered shell is the "magazine". */
function thumper(skin: Material): Group {
  const g = new Group();
  const mag = magazine(g);
  part(g, skin, 0.06, 0.072, 0.17, 0, 0.045, -0.03);
  cyl(g, skin, 0.034, 0.36, 0, 0.058, -0.29, 22);
  cyl(g, black(), 0.037, 0.022, 0, 0.058, -0.462, 22);
  cyl(g, polymer(), 0.027, 0.004, 0, 0.058, -0.474, 22);
  for (const z of [-0.2, -0.3, -0.38]) cyl(g, black(), 0.0355, 0.01, 0, 0.058, z, 22);
  cyl(mag, mat('w:brass', () => new MeshStandardMaterial({ color: '#b6934c', roughness: 0.3, metalness: 0.8 })), 0.03, 0.05, 0, 0.058, -0.105, 18);
  stock(g, woodM(), true);
  part(g, woodM(), 0.05, 0.05, 0.16, 0, 0.012, -0.24); // fore-end
  part(g, polymer(), 0.03, 0.095, 0.04, 0, -0.035, 0.04, 0.3);
  part(g, black(), 0.012, 0.006, 0.07, 0, -0.03, -0.02);
  part(g, black(), 0.012, 0.027, 0.006, 0, -0.016, -0.055);
  part(g, steel(), 0.006, 0.022, 0.008, 0, -0.012, -0.02, -0.25);
  // flip-up ladder sight
  part(g, steel(), 0.034, 0.05, 0.004, 0, 0.115, -0.13, -0.3);
  part(g, black(), 0.04, 0.008, 0.012, 0, 0.098, -0.12);
  part(g, steel(), 0.005, 0.02, 0.006, 0, 0.1, -0.44);
  g.userData.muzzle = new Vector3(0, 0.058, -0.48);
  return g;
}

/** Shoulder-fired rocket launcher: tube, warhead (the "magazine"), optic and grips. */
function rpg(skin: Material): Group {
  const g = new Group();
  const mag = magazine(g);
  const olive = mat('w:olive', () => new MeshStandardMaterial({ color: '#4a5038', roughness: 0.75, metalness: 0.2 }));
  cyl(g, olive, 0.042, 0.98, 0, 0.075, -0.06, 22);
  cyl(g, black(), 0.045, 0.16, 0, 0.075, 0.43, 22, 0.06); // rear flare
  cyl(g, black(), 0.046, 0.03, 0, 0.075, -0.54, 22);
  for (const z of [-0.25, 0.1]) cyl(g, black(), 0.045, 0.05, 0, 0.075, z, 22);
  part(g, woodM(), 0.03, 0.03, 0.3, 0, 0.03, -0.05);  // heat guard
  // warhead poking out of the front
  cyl(mag, olive, 0.04, 0.12, 0, 0.075, -0.62, 20);
  const cone = new Mesh(new CylinderGeometry(0.012, 0.055, 0.2, 20), olive); cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.075, -0.78); mag.add(cone);
  cyl(mag, steel(), 0.01, 0.05, 0, 0.075, -0.9, 10);
  // grips + trigger
  part(g, polymer(), 0.03, 0.1, 0.04, 0, -0.02, 0.02, 0.2);
  part(g, polymer(), 0.03, 0.09, 0.04, 0, -0.01, -0.28, 0.1);
  part(g, black(), 0.012, 0.006, 0.06, 0, -0.012, -0.02);
  // optic on the left
  part(g, skin, 0.03, 0.05, 0.12, -0.065, 0.11, -0.12); // optic housing carries the finish
  cyl(g, glassM(), 0.016, 0.005, -0.065, 0.115, -0.183, 12);
  part(g, black(), 0.04, 0.012, 0.03, -0.04, 0.1, -0.12);
  g.userData.muzzle = new Vector3(0, 0.075, -0.6);
  return g;
}

/** ACI R&D "Disruptor": a compact plasma gun with glowing coils; the energy cell is the "magazine". */
function disruptor(skin: Material): Group {
  const g = new Group();
  const mag = magazine(g);
  const coil = mat('w:plasma', () => new MeshStandardMaterial({ color: '#1e4a18', emissive: new Color('#6aff3a'), emissiveIntensity: 1.8, roughness: 0.3 }));
  part(g, skin, 0.072, 0.095, 0.27, 0, 0.05, -0.07);
  cyl(g, black(), 0.034, 0.24, 0, 0.062, -0.31, 18);
  for (const z of [-0.23, -0.29, -0.35]) cyl(g, coil, 0.042, 0.018, 0, 0.062, z, 18);
  cyl(g, steel(), 0.05, 0.035, 0, 0.062, -0.44, 18, 0.032);
  part(mag, coil, 0.042, 0.085, 0.055, 0, -0.03, -0.03);
  part(g, polymer(), 0.036, 0.105, 0.045, 0, -0.045, 0.055, 0.25);
  part(g, skin, 0.028, 0.045, 0.15, 0, 0.118, -0.06);
  part(g, black(), 0.012, 0.006, 0.06, 0, -0.02, 0.0);
  g.userData.muzzle = new Vector3(0, 0.062, -0.46);
  return g;
}

/** Steel crowbar (used for prying barricades and as the quick-melee tool when owned). */
export function crowbarModel(): Group {
  const g = new Group();
  const red = mat('w:crowbar', () => new MeshStandardMaterial({ color: '#b3261e', roughness: 0.45, metalness: 0.6 }));
  cyl(g, red, 0.011, 0.5, 0, 0, -0.17, 8);
  const hook = new Mesh(new TorusGeometry(0.035, 0.011, 6, 12, Math.PI), red); hook.rotation.y = Math.PI / 2; hook.position.set(0, 0.035, -0.42); g.add(hook);
  part(g, steel(), 0.026, 0.008, 0.035, 0, 0.07, -0.43);
  part(g, steel(), 0.024, 0.008, 0.04, 0, 0.012, 0.09, 0.4);
  g.userData.muzzle = new Vector3(0, 0, -0.45);
  batchModel(g);
  return g;
}

function knife(): Group {
  const g = new Group();
  const blade = mat('w:blade', () => new MeshStandardMaterial({ color: '#c8cdd2', roughness: 0.2, metalness: 1 }));
  part(g, polymer(), 0.025, 0.03, 0.12, 0, 0, 0.02);
  part(g, black(), 0.05, 0.035, 0.012, 0, 0, -0.045);
  const outline = new Shape();
  outline.moveTo(0, -0.018); outline.lineTo(0.14, -0.018); outline.lineTo(0.22, 0.015);
  outline.lineTo(0.16, 0.026); outline.lineTo(0, 0.022); outline.closePath();
  const geo = new ExtrudeGeometry(outline, { depth: 0.003, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.001, bevelSegments: 1, steps: 1 });
  const b = new Mesh(geo, blade); b.rotation.y = Math.PI / 2; b.position.set(-0.0015, 0, -0.045); g.add(b);
  for (let i = 0; i < 7; i++) part(g, black(), 0.027, 0.032, 0.003, 0, 0, -0.027 + i * 0.014);
  const loop = new Mesh(new TorusGeometry(0.009, 0.0025, 6, 12), steel()); loop.rotation.y = Math.PI / 2; loop.position.z = 0.085; g.add(loop);
  g.userData.muzzle = new Vector3(0, 0, -0.25);
  return g;
}

/** Mount points on a gun model for attachments (local frame: barrel along -Z). */
interface Anchor { railY: number; railZ: number; underY: number; underZ: number; sideX: number; sideY: number; sideZ: number; stockZ: number; barrelY: number }

/** Builds Gunsmith attachments onto a gun model and updates its muzzle / sight metadata. */
function fitAttachments(g: Group, list: AttachmentId[]) {
  const an = g.userData.anchor as Anchor | undefined;
  if (!an || !list.length) return;
  const muzzle = g.userData.muzzle as Vector3;
  const glass = mat('w:optic-glass', () => new MeshStandardMaterial({ color: '#7fa6b8', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22 }));
  const lens = (c: string) => mat('w:lens' + c, () => new MeshStandardMaterial({ color: c, emissive: new Color(c), emissiveIntensity: 2.4 }));
  const extendMuzzle = (len: number) => { muzzle.z -= len; };
  for (const id of list) {
    switch (id) {
      case 'reddot': {
        const y = an.railY, z = an.railZ;
        part(g, black(), 0.024, 0.008, 0.04, 0, y + 0.004, z);
        for (const x of [-0.015, 0.015]) part(g, black(), 0.004, 0.028, 0.014, x, y + 0.021, z - 0.008);
        part(g, black(), 0.034, 0.005, 0.014, 0, y + 0.036, z - 0.008);
        part(g, glass, 0.026, 0.024, 0.002, 0, y + 0.021, z - 0.014);
        g.userData.sightY = y + 0.021; g.userData.optic = 'reddot';
        break;
      }
      case 'holo': {
        const y = an.railY, z = an.railZ;
        part(g, black(), 0.034, 0.012, 0.064, 0, y + 0.006, z);
        for (const x of [-0.019, 0.019]) part(g, black(), 0.004, 0.036, 0.05, x, y + 0.03, z - 0.004);
        part(g, black(), 0.042, 0.005, 0.05, 0, y + 0.049, z - 0.004);
        part(g, glass, 0.034, 0.03, 0.002, 0, y + 0.03, z - 0.028);
        part(g, black(), 0.014, 0.008, 0.012, 0.022, y + 0.018, z + 0.01); // battery cap
        g.userData.sightY = y + 0.029; g.userData.optic = 'holo';
        break;
      }
      case 'acog': {
        const y = an.railY, z = an.railZ;
        part(g, black(), 0.024, 0.014, 0.05, 0, y + 0.007, z);
        cyl(g, black(), 0.016, 0.11, 0, y + 0.031, z - 0.01, 16);
        cyl(g, black(), 0.021, 0.03, 0, y + 0.031, z - 0.075, 16, 0.017);
        cyl(g, black(), 0.019, 0.026, 0, y + 0.031, z + 0.056, 16);
        cyl(g, glassM(), 0.018, 0.004, 0, y + 0.031, z - 0.091, 16);
        part(g, black(), 0.012, 0.012, 0.02, 0, y + 0.052, z - 0.01);
        g.userData.sightY = y + 0.031; g.userData.optic = 'acog';
        break;
      }
      case 'suppressor':
        cyl(g, black(), 0.019, 0.16, 0, muzzle.y, muzzle.z - 0.08, 18);
        cyl(g, steel(), 0.0195, 0.008, 0, muzzle.y, muzzle.z - 0.004, 18);
        extendMuzzle(0.16); g.userData.suppressed = true;
        break;
      case 'compensator':
        cyl(g, black(), 0.014, 0.05, 0, muzzle.y, muzzle.z - 0.025, 14);
        for (const k of [0, 1, 2]) part(g, steel(), 0.016, 0.004, 0.006, 0, muzzle.y + 0.013, muzzle.z - 0.012 - k * 0.013);
        extendMuzzle(0.05);
        break;
      case 'flashhider':
        cyl(g, black(), 0.012, 0.02, 0, muzzle.y, muzzle.z - 0.01, 12);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          part(g, black(), 0.005, 0.005, 0.03, Math.cos(a) * 0.009, muzzle.y + Math.sin(a) * 0.009, muzzle.z - 0.035);
        }
        extendMuzzle(0.05); g.userData.smallFlash = true;
        break;
      case 'brake':
        part(g, black(), 0.03, 0.026, 0.06, 0, muzzle.y, muzzle.z - 0.03);
        for (const k of [0, 1, 2]) for (const x of [-0.016, 0.016]) part(g, steel(), 0.003, 0.016, 0.008, x, muzzle.y, muzzle.z - 0.012 - k * 0.017);
        extendMuzzle(0.06);
        break;
      case 'choke':
        cyl(g, steel(), 0.013, 0.04, 0, muzzle.y, muzzle.z - 0.02, 14, 0.016);
        extendMuzzle(0.04);
        break;
      case 'longbarrel':
        cyl(g, steel(), 0.011, 0.1, 0, muzzle.y, muzzle.z - 0.05, 14);
        cyl(g, black(), 0.013, 0.012, 0, muzzle.y, muzzle.z - 0.1, 14);
        extendMuzzle(0.1);
        break;
      case 'vgrip': part(g, polymer(), 0.026, 0.075, 0.03, 0, an.underY - 0.036, an.underZ, 0.12); break;
      case 'agrip': part(g, polymer(), 0.024, 0.032, 0.075, 0, an.underY - 0.014, an.underZ - 0.01, -0.32); break;
      case 'bipod':
        for (const x of [-0.014, 0.014]) part(g, steel(), 0.007, 0.007, 0.21, x, an.underY - 0.01, an.underZ - 0.12, 0.05);
        part(g, black(), 0.036, 0.016, 0.024, 0, an.underY - 0.006, an.underZ - 0.01);
        break;
      case 'laser1mw':
      case 'laser5mw': {
        const c = id === 'laser1mw' ? '#ff2a2a' : '#3aff5a';
        part(g, black(), 0.02, 0.02, 0.05, an.sideX + 0.012, an.sideY, an.sideZ);
        cyl(g, lens(c), 0.004, 0.003, an.sideX + 0.012, an.sideY + 0.003, an.sideZ - 0.026, 8);
        g.userData.laser = id === 'laser1mw' ? 'red' : 'green';
        break;
      }
      case 'flashlight':
        cyl(g, black(), 0.012, 0.06, an.sideX + 0.014, an.sideY, an.sideZ, 12);
        cyl(g, black(), 0.015, 0.016, an.sideX + 0.014, an.sideY, an.sideZ - 0.034, 14);
        cyl(g, lens('#fff4d8'), 0.012, 0.003, an.sideX + 0.014, an.sideY, an.sideZ - 0.043, 14);
        g.userData.light = true;
        break;
      case 'extmag': {
        const m = g.getObjectByName('magazine');
        if (m) m.scale.set(1, 1.4, 1.08);
        break;
      }
      case 'drum': {
        const m = g.getObjectByName('magazine') as Group | undefined;
        if (!m) break;
        for (const c of [...m.children]) m.remove(c);
        const drum = new Mesh(new CylinderGeometry(0.055, 0.055, 0.05, 22), black());
        drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.085, -0.12); m.add(drum);
        for (const x of [-0.026, 0.026]) { const cap = new Mesh(new CylinderGeometry(0.045, 0.045, 0.004, 22), steel()); cap.rotation.z = Math.PI / 2; cap.position.set(x, -0.085, -0.12); m.add(cap); }
        part(m, black(), 0.03, 0.04, 0.04, 0, -0.02, -0.12);
        break;
      }
      case 'tacstock':
        part(g, mat('w:rubber', () => new MeshStandardMaterial({ color: '#141414', roughness: 0.95 })), 0.05, 0.1, 0.02, 0, 0.01, an.stockZ + 0.02);
        part(g, polymer(), 0.03, 0.018, 0.1, 0, 0.068, an.stockZ - 0.07);
        break;
      case 'lightstock':
        part(g, steel(), 0.01, 0.01, 0.14, 0, -0.03, an.stockZ - 0.06, 0.25);
        break;
      default: break; // ammo has no model
    }
  }
}

const templates = new Map<string, Group>();
export function weaponModel(id: WeaponId, finishId?: string, att = ''): Group {
  const key = id + ':' + (finishId ?? 'factory') + ':' + att;
  const cached = templates.get(key);
  if (cached) return cached.clone(true);
  const skin = finishMaterial(finishId);
  let g: Group;
  switch (id) {
    case 'knife': g = knife(); break;
    case 'k9': g = pistol(skin, { len: 0.18, h: 0.04 }); break;
    case 'warden': g = pistol(skin, { len: 0.19, h: 0.04, supp: true }); break;
    case 'p30': g = pistol(skin, { len: 0.19, h: 0.042 }); break;
    case 'judge': g = pistol(skin, { len: 0.26, h: 0.055 }); break;
    case 'viper': g = pistol(skin, { len: 0.21, h: 0.046, ext: true }); break;
    case 'vespa': g = rifle(skin, { recv: 0.24, barrel: 0.06, hand: 0.02, stock: 'skeleton', mag: 'straight' }); break;
    case 'hornet': g = rifle(skin, { recv: 0.26, barrel: 0.1, hand: 0.08, stock: 'skeleton', mag: 'straight', muzzle: 'flash' }); break;
    case 'mako': g = rifle(skin, { recv: 0.3, barrel: 0.06, hand: 0.08, stock: 'bullpup', mag: 'short', muzzle: 'flash' }); break;
    case 'reaper': g = rifle(skin, { recv: 0.32, barrel: 0.3, hand: 0.18, stock: 'solid', mag: 'straight', muzzle: 'brake' }); break;
    case 'bulwark': g = lmg(skin, false); break;
    case 'anvil': g = lmg(skin, true); break;
    case 'thumper': g = thumper(skin); break;
    case 'hammer': g = rpg(skin); break;
    case 'disruptor': g = disruptor(skin); break;
    case 'breacher': g = shotgun(skin); break;
    case 'galeforce': g = rifle(skin, { recv: 0.3, barrel: 0.22, hand: 0.2, stock: 'skeleton', mag: 'curved', muzzle: 'brake' }); break;
    case 'tempest': g = rifle(skin, { recv: 0.36, barrel: 0.18, hand: 0.12, stock: 'bullpup', mag: 'straight', handle: true }); break;
    case 'ravager': g = rifle(skin, { recv: 0.32, barrel: 0.3, hand: 0.2, stock: 'wood', mag: 'curved', wood: true, muzzle: 'brake' }); break;
    case 'sentinel': g = rifle(skin, { recv: 0.3, barrel: 0.3, hand: 0.24, stock: 'solid', mag: 'straight', muzzle: 'flash' }); break;
    case 'talon': g = rifle(skin, { recv: 0.4, barrel: 0.16, hand: 0.1, stock: 'bullpup', mag: 'curved', handle: true, muzzle: 'flash' }); break;
    case 'marshal': g = rifle(skin, { recv: 0.34, barrel: 0.4, hand: 0.28, stock: 'solid', mag: 'straight', scope: 0.2, muzzle: 'brake' }); break;
    case 'kestrel': g = rifle(skin, { recv: 0.3, barrel: 0.42, hand: 0.18, stock: 'solid', mag: 'short', scope: 0.26 }); break;
    case 'longbow': g = rifle(skin, { recv: 0.36, barrel: 0.5, hand: 0.26, stock: 'solid', mag: 'short', scope: 0.32, muzzle: 'brake' }); break;
    default: g = pistol(skin, { len: 0.18, h: 0.04 });
  }
  g.name = id;
  g.userData.suppressed = id === 'warden';
  if (att) fitAttachments(g, att.split('+') as AttachmentId[]);
  batchModel(g);
  templates.set(key, g);
  g.traverse((o) => { if (o instanceof Mesh) o.geometry.userData.sharedResource = true; });
  return g.clone(true);
}

export function grenadeModel(kind: UtilityId): Group {
  const g = new Group();
  const col: Record<UtilityId, string> = { frag: '#4f5a33', flash: '#c8ccd0', smoke: '#5a7a66', fire: '#8a4a20', decoy: '#7a7a50', pulse: '#1a2a34', stun: '#4a5668', tknife: '#9aa0a6' };
  const body = mat('g:' + kind, () => new MeshStandardMaterial({ color: col[kind], roughness: 0.6, metalness: 0.3 }));
  if (kind === 'frag') {
    const s = new Mesh(new SphereGeometry(0.045, 10, 8), body); s.scale.set(1, 1.2, 1); g.add(s);
    part(g, steel(), 0.02, 0.025, 0.02, 0, 0.06, 0);
    part(g, steel(), 0.008, 0.06, 0.012, 0.02, 0.04, 0);
  } else if (kind === 'fire') {
    const glass = mat('g:bottle', () => new MeshStandardMaterial({ color: '#6a8a40', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8 }));
    const b = new Mesh(new CylinderGeometry(0.035, 0.04, 0.14, 10), glass); g.add(b);
    const n = new Mesh(new CylinderGeometry(0.014, 0.02, 0.07, 8), glass); n.position.y = 0.1; g.add(n);
    const rag = mat('g:rag', () => new MeshStandardMaterial({ color: '#d8c8a8', roughness: 1 }));
    const r = new Mesh(new BoxGeometry(0.03, 0.05, 0.03), rag); r.position.y = 0.15; g.add(r);
  } else if (kind === 'tknife') {
    // balanced throwing knife: slim double-edged blade with a wrapped handle and ring
    const blade = mat('w:tblade', () => new MeshStandardMaterial({ color: '#c8cdd2', roughness: 0.22, metalness: 1 }));
    const shape = new Shape();
    shape.moveTo(0, -0.012); shape.lineTo(0.1, -0.009); shape.lineTo(0.15, 0); shape.lineTo(0.1, 0.009); shape.lineTo(0, 0.012); shape.closePath();
    const bm = new Mesh(new ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0008, bevelSegments: 1, steps: 1 }), blade);
    bm.rotation.y = Math.PI / 2; bm.position.set(-0.0015, 0, -0.02); g.add(bm);
    part(g, polymer(), 0.012, 0.022, 0.09, 0, 0, 0.025);
    for (let i = 0; i < 5; i++) part(g, black(), 0.014, 0.024, 0.004, 0, 0, 0.0 + i * 0.016);
    const ring = new Mesh(new TorusGeometry(0.012, 0.003, 6, 12), steel()); ring.rotation.y = Math.PI / 2; ring.position.z = 0.08; g.add(ring);
    g.userData.muzzle = new Vector3(0, 0, -0.17);
    return g;
  } else if (kind === 'stun') {
    const c = new Mesh(new CylinderGeometry(0.03, 0.03, 0.13, 12), body); g.add(c);
    const band = mat('g:stunband', () => new MeshStandardMaterial({ color: '#e0c030', roughness: 0.5, metalness: 0.2 }));
    for (const y of [-0.035, 0.035]) { const b = new Mesh(new CylinderGeometry(0.031, 0.031, 0.012, 12), band); b.position.y = y; g.add(b); }
    for (let i = 0; i < 6; i++) { const hole = new Mesh(new CylinderGeometry(0.006, 0.006, 0.01, 6), black()); hole.rotation.z = Math.PI / 2; hole.position.set(Math.cos(i) * 0.029, 0, Math.sin(i) * 0.029); hole.lookAt(0, 0, 0); g.add(hole); }
    const top = new Mesh(new CylinderGeometry(0.02, 0.025, 0.025, 8), steel()); top.position.y = 0.077; g.add(top);
    part(g, steel(), 0.008, 0.06, 0.012, 0.024, 0.05, 0);
  } else if (kind === 'pulse') {
    const p = new Mesh(new CylinderGeometry(0.05, 0.05, 0.035, 14), body); g.add(p);
    const ring = mat('g:pulsering', () => new MeshStandardMaterial({ color: '#30d0ff', emissive: new Color('#30d0ff'), emissiveIntensity: 2 }));
    const rr = new Mesh(new CylinderGeometry(0.052, 0.052, 0.008, 14), ring); g.add(rr);
  } else {
    const c = new Mesh(new CylinderGeometry(0.032, 0.032, 0.12, 10), body); g.add(c);
    const top = new Mesh(new CylinderGeometry(0.02, 0.025, 0.025, 8), steel()); top.position.y = 0.07; g.add(top);
  }
  g.userData.muzzle = new Vector3(0, 0, 0);
  return g;
}

export function bombModel(): Group {
  const g = new Group();
  const body = mat('bomb:body', () => new MeshStandardMaterial({ color: '#4a4a3a', roughness: 0.7 }));
  part(g, body, 0.32, 0.1, 0.2, 0, 0.05, 0);
  for (let i = -1; i <= 1; i++) part(g, mat('bomb:tube', () => new MeshStandardMaterial({ color: '#b8a070', roughness: 0.8 })), 0.3, 0.04, 0.05, 0, 0.12, i * 0.06);
  part(g, black(), 0.12, 0.02, 0.09, 0.06, 0.15, 0.0);
  part(g, mat('bomb:screen', () => new MeshStandardMaterial({ color: '#203020', emissive: new Color('#30ff60'), emissiveIntensity: 0.6 })), 0.08, 0.005, 0.03, 0.06, 0.162, -0.02);
  const led = new Mesh(new SphereGeometry(0.012, 8, 6), mat('bomb:led', () => new MeshStandardMaterial({ color: '#ff2020', emissive: new Color('#ff2020'), emissiveIntensity: 3 })));
  led.position.set(-0.1, 0.17, 0.05);
  led.name = 'led';
  g.add(led);
  const wire = mat('bomb:wire', () => new MeshStandardMaterial({ color: '#c02020' }));
  part(g, wire, 0.2, 0.008, 0.008, -0.02, 0.16, 0.07);
  return g;
}
