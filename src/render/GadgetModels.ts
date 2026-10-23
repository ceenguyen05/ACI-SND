import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Material,
} from 'three';
import type { GadgetId } from '../config/gadgets';
import type { DeviceKind } from '../sim/gadget/GadgetManager';

/** Procedural models for gadgets. Local frame: front faces -Z, origin at the base / mount point. */
const cache = new Map<string, Material>();
const mat = (key: string, color: string, o: { rough?: number; metal?: number; emissive?: string; ei?: number; opacity?: number } = {}) => {
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color), roughness: o.rough ?? 0.6, metalness: o.metal ?? 0.3,
      ...(o.emissive ? { emissive: new Color(o.emissive), emissiveIntensity: o.ei ?? 1 } : {}),
      transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
    });
    cache.set(key, m);
    m.userData.sharedResource = true;
  }
  return m;
};
const dark = () => mat('g:dark', '#1e2024', { rough: 0.5, metal: 0.4 });
const steel = () => mat('g:steel', '#8a9097', { rough: 0.35, metal: 0.8 });
const rubber = () => mat('g:rubber', '#121212', { rough: 0.95, metal: 0 });
const lens = () => mat('g:lens', '#0a1a2a', { rough: 0.05, metal: 0.9, emissive: '#1a4a8a', ei: 0.6 });
const redLed = () => mat('g:led', '#ff2020', { emissive: '#ff2020', ei: 3 });
const cyanLed = () => mat('g:cyan', '#30d0ff', { emissive: '#30d0ff', ei: 2.5 });

function box(g: Group, m: Material, w: number, h: number, d: number, x: number, y: number, z: number, name?: string) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  if (name) mesh.name = name;
  g.add(mesh);
  return mesh;
}
function cyl(g: Group, m: Material, r: number, h: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 14) {
  const mesh = new Mesh(new CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  g.add(mesh);
  return mesh;
}

/** Deterministic 0..1 noise for plank variation. */
const hash = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export interface DeviceSize { w: number; h: number }

export function deviceModel(kind: DeviceKind | GadgetId | 'uav', size?: DeviceSize): Group {
  const g = new Group();
  switch (kind) {
    case 'stim': {
      // Stim pistol: white medical injector with a glowing vial. Grip at origin, muzzle toward -Z.
      const body = mat('g:stimBody', '#e4e8ea', { rough: 0.42, metal: 0.1 });
      const green = mat('g:stimGreen', '#2fd27a', { rough: 0.4, emissive: '#1a9a50', ei: 0.5 });
      box(g, body, 0.038, 0.05, 0.2, 0, 0.045, -0.06);
      const grip = box(g, mat('g:stimGrip', '#454b52', { rough: 0.7, metal: 0.1 }), 0.034, 0.105, 0.05, 0, -0.035, 0.018); grip.rotation.x = 0.22;
      box(g, body, 0.036, 0.03, 0.06, 0, 0.012, 0.0); // frame joining body and grip
      box(g, dark(), 0.012, 0.006, 0.05, 0, -0.03, -0.035);
      box(g, green, 0.04, 0.012, 0.05, 0, 0.045, 0.02);
      cyl(g, steel(), 0.009, 0.07, 0, 0.05, -0.19, 'z');
      cyl(g, dark(), 0.014, 0.02, 0, 0.05, -0.165, 'z');
      const vial = cyl(g, mat('g:vial', '#7dffb0', { opacity: 0.75, emissive: '#30ff80', ei: 0.9, rough: 0.1 }), 0.015, 0.09, 0, 0.088, -0.06, 'z');
      vial.name = 'vial';
      for (const z of [-0.105, -0.015]) cyl(g, steel(), 0.017, 0.008, 0, 0.088, z, 'z');
      box(g, mat('g:cross', '#e03030', { emissive: '#ff2020', ei: 0.4 }), 0.041, 0.03, 0.008, 0, 0.045, -0.12);
      g.userData.muzzle = new Vector3(0, 0.05, -0.23);
      break;
    }
    case 'c4': {
      // local +Y is the surface normal (it sticks like a camera)
      const putty = mat('g:c4', '#d8cfa8', { rough: 0.85, metal: 0 });
      box(g, putty, 0.2, 0.05, 0.12, 0, 0.025, 0);
      const tape = mat('g:tape', '#2a2a2a', { rough: 0.7 });
      for (const x of [-0.06, 0.06]) box(g, tape, 0.025, 0.054, 0.124, x, 0.025, 0);
      box(g, dark(), 0.07, 0.025, 0.05, 0, 0.062, 0.01);
      box(g, redLed(), 0.012, 0.012, 0.012, 0.022, 0.078, 0.01, 'led');
      for (const [x, c] of [[-0.02, '#c02020'], [0, '#2050c0'], [0.02, '#e0c020']] as const) {
        const w = new Mesh(new TorusGeometry(0.03, 0.003, 4, 10, Math.PI), mat('g:wire' + c, c, { rough: 0.6 }));
        w.position.set(x, 0.05, -0.02); w.rotation.y = Math.PI / 2; g.add(w);
      }
      break;
    }
    case 'barricade': {
      // R6-style boarded doorway: overlapping planks nailed across the frame. Local X spans the door.
      const w = size?.w ?? 0.6, h = size?.h ?? 0.45;
      const n = Math.max(2, Math.round(h / 0.27));
      for (let i = 0; i < n; i++) {
        const tint = 0.8 + hash(i * 3 + w) * 0.3;
        const m = mat('g:plank' + (i % 3), new Color('#a27a4c').multiplyScalar(tint).getStyle(), { rough: 0.85, metal: 0 });
        const y = 0.12 + (i + 0.5) * ((h - 0.2) / n);
        const p = box(g, m, w + 0.16, Math.min(0.24, (h - 0.2) / n + 0.03), 0.035, (hash(i) - 0.5) * 0.08, y, (i % 2) * 0.03 - 0.015, 'plank' + i);
        p.rotation.z = (hash(i + 7) - 0.5) * 0.14;
        p.userData.baseRot = p.rotation.z;
        for (const sx of [-1, 1]) box(g, steel(), 0.012, 0.012, 0.012, sx * (w / 2 - 0.04), y + 0.03, -0.04);
      }
      for (const sx of [-1, 1]) box(g, mat('g:batten', '#7a5a36', { rough: 0.9, metal: 0 }), 0.09, h - 0.05, 0.04, sx * (w / 2 - 0.08), h / 2, 0.035);
      break;
    }
    case 'steelBarricade': {
      // Reinforced steel shutter bolted into the frame (only explosives or a crowbar get through).
      const w = size?.w ?? 0.6, h = size?.h ?? 0.45;
      const plate = mat('g:steelPlate', '#59606a', { rough: 0.38, metal: 0.85 });
      const frame = mat('g:steelFrame', '#2e3238', { rough: 0.5, metal: 0.7 });
      const ribs = Math.max(3, Math.round(w / 0.16));
      for (let i = 0; i < ribs; i++) box(g, plate, w / ribs - 0.008, h - 0.08, 0.05 + (i % 2) * 0.02, -w / 2 + (i + 0.5) * (w / ribs), h / 2, 0);
      for (const y of [0.06, h / 2, h - 0.06]) box(g, frame, w + 0.04, 0.08, 0.08, 0, y, 0);
      for (const sx of [-1, 1]) box(g, frame, 0.08, h, 0.08, sx * (w / 2 + 0.01), h / 2, 0);
      box(g, mat('g:hazard', '#e8b818'), w * 0.6, 0.05, 0.085, 0, h * 0.72, 0);
      for (const sx of [-1, 1]) for (const y of [0.06, h / 2, h - 0.06]) box(g, steel(), 0.025, 0.025, 0.09, sx * (w / 2 - 0.05), y, 0);
      break;
    }
    case 'ammoBox': {
      const olive = mat('g:ammoOlive', '#4d5737', { rough: 0.7, metal: 0.25 });
      box(g, olive, 0.62, 0.3, 0.42, 0, 0.15, 0);
      box(g, mat('g:ammoLid', '#434c30', { rough: 0.7, metal: 0.3 }), 0.64, 0.05, 0.44, 0, 0.325, 0);
      box(g, mat('g:stencil', '#e0c040', { rough: 0.6, emissive: '#806010', ei: 0.15 }), 0.3, 0.07, 0.005, 0, 0.17, -0.212);
      for (const sx of [-1, 1]) box(g, dark(), 0.04, 0.03, 0.18, sx * 0.33, 0.24, 0);
      for (const sx of [-0.18, 0.18]) box(g, dark(), 0.035, 0.31, 0.43, sx, 0.155, 0);
      // a few loose magazines on top
      for (const [x, r] of [[-0.12, 0.2], [0.05, -0.3], [0.17, 0.1]] as const) { const m = box(g, dark(), 0.035, 0.03, 0.15, x, 0.365, 0); m.rotation.y = r; }
      box(g, cyanLed(), 0.025, 0.012, 0.012, 0.26, 0.36, -0.2, 'led');
      break;
    }
    case 'hunter': {
      // Killstreak quadcopter with an underslung charge. Rotors are named so the view can spin them.
      const shell = mat('g:hunterShell', '#2b2f36', { rough: 0.35, metal: 0.5 });
      box(g, shell, 0.16, 0.07, 0.24, 0, 0, 0);
      box(g, mat('g:hunterTop', '#c23a24', { rough: 0.4 }), 0.12, 0.012, 0.16, 0, 0.04, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const arm = box(g, dark(), 0.2, 0.02, 0.025, x * 0.1, 0.01, z * 0.1); arm.rotation.y = x * z * Math.PI / 4;
        cyl(g, dark(), 0.022, 0.04, x * 0.19, 0.02, z * 0.19);
        const rotor = new Group(); rotor.name = 'rotor'; rotor.position.set(x * 0.19, 0.045, z * 0.19); g.add(rotor);
        for (const r of [0, Math.PI / 2]) { const b = box(rotor, mat('g:blade', '#151515', { rough: 0.6, opacity: 0.85 }), 0.2, 0.004, 0.022, 0, 0, 0); b.rotation.y = r; }
      }
      box(g, mat('g:charge', '#d8cfa8', { rough: 0.85, metal: 0 }), 0.1, 0.06, 0.12, 0, -0.065, 0);
      box(g, redLed(), 0.015, 0.015, 0.015, 0, 0.0, -0.125, 'led');
      const l = new Mesh(new SphereGeometry(0.022, 10, 8), lens()); l.position.set(0, -0.02, -0.12); g.add(l);
      break;
    }
    case 'missile': {
      // Cruise missile: nose toward -Z, fins + glowing exhaust at the back.
      const body = mat('g:missile', '#c8ccd0', { rough: 0.35, metal: 0.6 });
      cyl(g, body, 0.12, 1.6, 0, 0, 0, 'z', 16);
      const nose = new Mesh(new ConeGeometry(0.12, 0.42, 16), body); nose.rotation.x = -Math.PI / 2; nose.position.z = -1.01; g.add(nose);
      cyl(g, mat('g:band', '#c23a24'), 0.123, 0.08, 0, 0, -0.55, 'z', 16);
      for (let i = 0; i < 4; i++) {
        const fin = box(g, dark(), 0.02, 0.32, 0.3, 0, 0, 0.65); fin.rotation.z = i * Math.PI / 2; fin.position.set(Math.sin(i * Math.PI / 2) * 0.17, Math.cos(i * Math.PI / 2) * 0.17, 0.65);
      }
      const flame = new Mesh(new ConeGeometry(0.1, 0.9, 12), mat('g:flame', '#ffb040', { emissive: '#ff8020', ei: 4, opacity: 0.85 }));
      flame.rotation.x = -Math.PI / 2; flame.position.z = 1.25; flame.name = 'flame'; g.add(flame);
      break;
    }
    case 'heartbeat': {
      // Rugged tablet held in both hands; the screen shows the sweep (named so it can glow).
      const shell = mat('g:tablet', '#2d3238', { rough: 0.55, metal: 0.3 });
      box(g, shell, 0.2, 0.014, 0.15, 0, 0, 0);
      for (const sx of [-1, 1]) box(g, rubber(), 0.025, 0.02, 0.16, sx * 0.105, 0, 0);
      const screen = box(g, mat('g:hbScreen', '#06210f', { emissive: '#1aff6a', ei: 0.55, rough: 0.2 }), 0.16, 0.002, 0.11, 0, 0.008, 0.005, 'screen');
      void screen;
      box(g, redLed(), 0.008, 0.004, 0.008, 0.085, 0.009, -0.065, 'led');
      cyl(g, dark(), 0.012, 0.03, 0, 0.0, -0.085, 'z', 8);  // antenna stub
      break;
    }
    case 'uav': {
      // Recon UAV silhouette circling high over the map.
      const grey = mat('g:uav', '#9aa0a8', { rough: 0.5, metal: 0.4 });
      cyl(g, grey, 0.35, 5, 0, 0, 0, 'z', 12);
      const nose = new Mesh(new SphereGeometry(0.42, 12, 8), grey); nose.scale.z = 1.6; nose.position.z = -2.5; g.add(nose);
      box(g, grey, 14, 0.12, 1.1, 0, 0.1, -0.3);
      for (const sx of [-1, 1]) { const t = box(g, grey, 0.08, 1.2, 0.8, sx * 0.7, 0.5, 2.2); t.rotation.z = sx * 0.6; }
      cyl(g, dark(), 0.25, 0.5, 0, 0, 2.6, 'z', 12);
      box(g, redLed(), 0.2, 0.2, 0.2, 7, 0.15, -0.3, 'led');
      break;
    }
    case 'drone': {
      box(g, dark(), 0.2, 0.08, 0.2, 0, 0.09, 0);
      box(g, mat('g:droneTop', '#f08a1c', { rough: 0.5 }), 0.16, 0.015, 0.14, 0, 0.135, 0.01);
      for (const sx of [-1, 1]) cyl(g, rubber(), 0.085, 0.05, sx * 0.13, 0.085, 0, 'x', 16);
      const eye = new Mesh(new SphereGeometry(0.03, 12, 8), lens());
      eye.position.set(0, 0.1, -0.1); g.add(eye);
      cyl(g, steel(), 0.004, 0.12, 0.06, 0.19, 0.06);
      box(g, redLed(), 0.012, 0.012, 0.012, -0.06, 0.14, -0.09, 'led');
      break;
    }
    case 'stickyCam': {
      // local +Y is the surface normal; lens faces -Z
      cyl(g, dark(), 0.05, 0.03, 0, 0.015, 0, 'y', 16);
      const l = new Mesh(new SphereGeometry(0.022, 12, 8), lens()); l.position.set(0, 0.035, -0.02); g.add(l);
      box(g, redLed(), 0.01, 0.01, 0.01, 0.03, 0.032, 0.02, 'led');
      break;
    }
    case 'flockCam': {
      cyl(g, steel(), 0.035, 1.9, 0, 0.95, 0, 'y', 10);
      cyl(g, mat('g:base', '#555a60'), 0.12, 0.05, 0, 0.025, 0);
      const head = new Group(); head.name = 'head'; head.position.y = 1.9; g.add(head);
      box(head, mat('g:flockBody', '#2a2d32', { rough: 0.4 }), 0.16, 0.12, 0.3, 0, 0, -0.05);
      const fl = new Mesh(new CylinderGeometry(0.045, 0.045, 0.02, 14), lens()); fl.rotation.x = Math.PI / 2; fl.position.set(0, 0, -0.205); head.add(fl);
      box(head, mat('g:ir', '#300808', { emissive: '#ff1010', ei: 0.8 }), 0.12, 0.02, 0.01, 0, -0.045, -0.2);
      const panel = box(g, mat('g:solar', '#0e1a33', { rough: 0.2, metal: 0.6 }), 0.42, 0.02, 0.3, 0, 2.18, 0.12);
      panel.rotation.x = -0.45;
      box(g, steel(), 0.03, 0.18, 0.03, 0, 2.05, 0.1);
      box(g, cyanLed(), 0.02, 0.02, 0.02, 0.07, 1.96, -0.17, 'led');
      break;
    }
    case 'cctv': {
      box(g, mat('g:white', '#e6e8ea', { rough: 0.4, metal: 0.1 }), 0.1, 0.1, 0.32, 0, 0, 0);
      box(g, mat('g:white', '#e6e8ea'), 0.14, 0.03, 0.36, 0, 0.065, -0.02);
      const l = new Mesh(new CylinderGeometry(0.035, 0.035, 0.02, 12), lens()); l.rotation.x = Math.PI / 2; l.position.set(0, 0, -0.17); g.add(l);
      box(g, redLed(), 0.012, 0.012, 0.012, 0.03, -0.03, -0.165, 'led');
      box(g, steel(), 0.03, 0.03, 0.3, 0, 0.02, 0.28);
      break;
    }
    case 'mine': {
      const body = mat('g:mine', '#4a5a30', { rough: 0.7 });
      box(g, body, 0.24, 0.13, 0.05, 0, 0.12, 0);
      box(g, mat('g:mineFace', '#3a4826'), 0.22, 0.11, 0.01, 0, 0.12, -0.03);
      for (const sx of [-1, 1]) { box(g, steel(), 0.01, 0.07, 0.01, sx * 0.08, 0.035, 0.02); box(g, steel(), 0.01, 0.07, 0.01, sx * 0.08, 0.035, -0.02); }
      box(g, redLed(), 0.015, 0.015, 0.015, 0.0, 0.16, -0.03, 'led');
      cyl(g, steel(), 0.01, 0.05, 0.08, 0.2, 0.0);
      break;
    }
    case 'wire': {
      const wireMat = mat('g:wire', '#9aa0a6', { rough: 0.3, metal: 0.9 });
      for (let i = -3; i <= 3; i++) {
        const t = new Mesh(new TorusGeometry(0.24, 0.012, 4, 14), wireMat);
        t.rotation.y = Math.PI / 2;
        t.position.set(i * 0.38, 0.24, 0);
        t.rotation.z = (i % 2) * 0.3;
        g.add(t);
      }
      for (const sx of [-1.25, 1.25]) box(g, mat('g:stake', '#4a3a2a'), 0.04, 0.5, 0.04, sx, 0.25, 0);
      break;
    }
    case 'shield': {
      const plate = mat('g:shield', '#3c444c', { rough: 0.45, metal: 0.7 });
      box(g, plate, 1.2, 0.55, 0.08, 0, 0.3, 0);
      box(g, plate, 1.2, 0.36, 0.08, 0, 0.87, 0);   // leaves a viewing slit at ~0.6–0.69 m
      box(g, plate, 0.12, 0.12, 0.08, -0.54, 0.635, 0);
      box(g, plate, 0.12, 0.12, 0.08, 0.54, 0.635, 0);
      box(g, mat('g:hazard', '#e8b818'), 1.21, 0.05, 0.085, 0, 1.0, 0);
      for (const sx of [-0.45, 0.45]) box(g, steel(), 0.05, 0.05, 0.5, sx, 0.03, 0.2);
      box(g, mat('g:glass', '#8ab4c8', { opacity: 0.4, rough: 0.05 }), 0.96, 0.09, 0.02, 0, 0.635, 0);
      break;
    }
    case 'emp': {
      cyl(g, mat('g:emp', '#202a3a', { rough: 0.4, metal: 0.6 }), 0.035, 0.12, 0, 0, 0);
      for (const y of [-0.035, 0.035]) cyl(g, cyanLed(), 0.037, 0.012, 0, y, 0);
      cyl(g, steel(), 0.02, 0.03, 0, 0.07, 0);
      break;
    }
  }
  return g;
}
