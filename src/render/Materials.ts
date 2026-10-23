import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Euler, Material, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Quaternion, Vector3, type Group,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEX, scannedSurface, surfaceDetail, type TexInfo } from './Textures';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useBakedDiffuse, type BakedLighting } from './lighting/BakedLighting';

/** Shared material library keyed by short names. 'p:#rrggbb' = painted, 'e:#rrggbb' = emissive/unlit. */
export class MaterialLib {
  private mats = new Map<string, Material>();
  /**
   * 'high' uses PBR (MeshStandardMaterial); lower presets use cheaper shading.
   * With baked lighting, static surfaces take their diffuse light from the lightmap
   * ('lm:' keys) or from baked per-vertex probe light (all other keys).
   */
  constructor(readonly pbr = true, readonly detail = true, readonly baked: BakedLighting | null = null) {}
  private texWorld = new Map<string, { w: number; h: number }>();
  private lm = false;

  get(key: string): Material {
    let m = this.mats.get(key);
    if (m) return m;
    this.lm = key.startsWith('lm:');
    const base = this.lm ? key.slice(3) : key;
    m = this.create(base);
    if (this.lm) this.texWorld.set(key, this.texWorld.get(base) ?? { w: 1, h: 1 });
    if (base === 'concrete' || base === 'concreteSite' || base === 'warehouse') {
      // Neutral industrial concrete while preserving the scan's wear and grain.
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        prev.call(m, shader, r);
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, 0.12);`);
      };
      m.customProgramCacheKey = () => 'neutral-concrete';
    }
    if (this.baked && !(m as MeshBasicMaterial).isMeshBasicMaterial) useBakedDiffuse(m, this.lm ? 'lightmap' : 'vertex');
    this.lm = false;
    this.mats.set(key, m);
    return m;
  }

  /** True if geometry drawn with this key should receive baked per-vertex probe light. */
  probeLit(key: string): boolean {
    if (!this.baked || key.startsWith('lm:') || key.startsWith('e:')) return false;
    return key !== 'light' && key !== 'lightWarm' && key !== 'screen';
  }

  /** World size (meters) one texture repeat covers, for UV generation. */
  worldSize(key: string): { w: number; h: number } {
    this.get(key);
    return this.texWorld.get(key) ?? { w: 1, h: 1 };
  }

  private std(key: string, info: TexInfo | null, opts: { color?: string; rough?: number; metal?: number } = {}) {
    if (info) this.texWorld.set(key, { w: info.worldW, h: info.worldH });
    const surface = info && this.detail && key !== 'screen' ? surfaceDetail(info) : null;
    const baked = this.baked;
    if (baked && !this.pbr) {
      return new MeshBasicMaterial({
        map: info?.tex ?? null, color: new Color(opts.color ?? '#ffffff').multiplyScalar((opts.metal ?? 0) > 0.5 ? 0.9 : 1),
        vertexColors: !this.lm, lightMap: this.lm ? baked.atlas : null, lightMapIntensity: baked.intensity,
      });
    }
    if (baked) {
      return new MeshStandardMaterial({
        map: info?.tex ?? null, color: new Color(opts.color ?? '#ffffff'),
        roughness: opts.rough ?? 0.85, metalness: Math.min(0.6, opts.metal ?? 0), vertexColors: !this.lm,
        normalMap: surface?.normal ?? null, roughnessMap: surface?.roughness ?? null,
        lightMap: this.lm ? baked.atlas : null, lightMapIntensity: baked.intensity, envMapIntensity: 0.55,
      });
    }
    if (!this.pbr) {
      return new MeshLambertMaterial({ map: info?.tex ?? null, normalMap: surface?.normal ?? null, color: new Color(opts.color ?? '#ffffff').multiplyScalar((opts.metal ?? 0) > 0.5 ? 0.85 : 1), vertexColors: true });
    }
    return new MeshStandardMaterial({
      map: info?.tex ?? null, color: new Color(opts.color ?? '#ffffff'),
      roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, vertexColors: true,
      normalMap: surface?.normal ?? null, roughnessMap: surface?.roughness ?? null,
    });
  }

  private create(key: string): Material {
    if (key === 'p:*') return this.std(key, TEX.painted(), { rough: 0.7, metal: 0.1 });
    if (key === 'm:*') return this.std(key, TEX.metal(), { rough: 0.45, metal: 0.6 });
    if (key.startsWith('p:')) return this.std(key, TEX.painted(), { color: key.slice(2), rough: 0.7, metal: 0.1 });
    if (key.startsWith('m:')) return this.std(key, TEX.metal(), { color: key.slice(2), rough: 0.45, metal: 0.6 });
    if (key.startsWith('e:')) return new MeshBasicMaterial({ color: new Color(key.slice(2)), vertexColors: false });
    switch (key) {
      // floors
      case 'carpet': case 'carpetSite': return this.std(key, TEX.carpet(), { rough: 1 });
      case 'confCarpet': return this.std(key, TEX.confCarpet(), { rough: 1 });
      case 'marble': return this.std(key, TEX.marble(), { rough: 0.25, metal: 0.05 });
      case 'tile': return this.std(key, TEX.tile(), { rough: 0.5 });
      case 'checker': return this.std(key, TEX.checker(), { rough: 0.4 });
      case 'serverFloor': return this.std(key, TEX.serverFloor(), { rough: 0.6, metal: 0.2 });
      case 'lino': return this.std(key, TEX.lino(), { rough: 0.6 });
      case 'concrete': case 'concreteSite': return this.std(key, scannedSurface('concrete_floor'), { rough: 0.92, color: '#c4c7c7' });
      case 'warehouse': return this.std(key, scannedSurface('concrete_floor'), { rough: 0.82, color: '#d5d5ca' });
      case 'asphalt': case 'asphaltSpawn': return this.std(key, TEX.asphalt(), { rough: 0.95 });
      // walls
      case 'wall:office': return this.std(key, TEX.officeWall(), { rough: 0.9 });
      case 'wall:lobby': return this.std(key, TEX.lobbyWall(), { rough: 0.7 });
      case 'wall:factory': return this.std(key, scannedSurface('corrugated_iron'), { rough: 0.8, metal: 0.35, color: '#b7c1c0' });
      case 'wall:exterior': return this.std(key, scannedSurface('red_brick_03'), { rough: 0.95, color: '#d8c7b9' });
      case 'masonry': return this.std(key, scannedSurface('red_brick_03'), { rough: 0.96, color: '#b6aba0' });
      // ceilings
      case 'ceil:office': return this.std(key, TEX.dropCeiling(), { rough: 1 });
      case 'ceil:lobby': return this.std(key, TEX.plaster(), { rough: 1 });
      case 'ceil:factory': return this.std(key, TEX.metalDeck(), { rough: 0.8, metal: 0.3 });
      // props
      case 'wood': return this.std(key, TEX.wood(), { rough: 0.6 });
      case 'darkWood': return this.std(key, TEX.darkWood(), { rough: 0.5 });
      case 'crate': return this.std(key, TEX.crate(), { rough: 0.9 });
      case 'cardboard': return this.std(key, TEX.cardboard(), { rough: 1 });
      case 'fabric': return this.std(key, TEX.fabric(), { rough: 1 });
      case 'metal': return this.std(key, TEX.metal(), { rough: 0.4, metal: 0.7 });
      case 'serverFront': return this.std(key, TEX.serverFront(), { rough: 0.5, metal: 0.3 });
      case 'screen': {
        const m = this.std(key, TEX.screen(), { rough: 0.2 }) as MeshStandardMaterial | MeshLambertMaterial | MeshBasicMaterial;
        if ('emissive' in m) { m.emissive = new Color('#ffffff'); m.emissiveMap = TEX.screen().tex; m.emissiveIntensity = 0.6; }
        return m;
      }
      case 'machineBadge': return this.std(key, TEX.machineBadge(), { rough: 0.55, metal: 0.25 });
      case 'hazard': return this.std(key, TEX.hazard(), { rough: 0.6 });
      case 'rubber': return this.std(key, null, { color: '#1c1d1f', rough: 0.95 });
      case 'chrome': return this.std(key, null, { color: '#d8dde2', rough: 0.15, metal: 1 });
      case 'glass': {
        const m = new MeshStandardMaterial({ color: '#9fc6d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, side: DoubleSide, vertexColors: true });
        m.depthWrite = false;
        return m;
      }
      case 'window': return this.std(key, null, { color: '#71949c', rough: 0.16, metal: 0.72 });
      case 'foliage': return this.std(key, null, { color: '#3f7a3a', rough: 0.9 });
      case 'skin': return this.std(key, null, { color: '#c99b7a', rough: 0.8 });
      // Over-bright so tone mapping keeps fixtures reading as light sources, not grey panels.
      case 'light': return new MeshBasicMaterial({ color: new Color('#fffdf4').multiplyScalar(this.baked ? 3.2 : 1) });
      case 'lightWarm': return new MeshBasicMaterial({ color: new Color('#ffe6b0').multiplyScalar(this.baked ? 2.6 : 1) });
      default: return this.std(key, null, { color: '#ff00ff' });
    }
  }

  dispose() { for (const material of this.mats.values()) material.dispose(); this.mats.clear(); }
}

/** Adds a per-vertex AO-ish tint: darker near the floor. */
export function bakeHeightAO(geo: BufferGeometry, worldY0: number, strength = 0.35, fadeH = 1.4) {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + worldY0;
    const t = Math.min(1, Math.max(0, y / fadeH));
    const c = 1 - strength * (1 - t) * (1 - t);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
}

/** Scale box UVs so textures keep their real-world size on every face. */
export function worldUVBox(geo: BoxGeometry, w: number, h: number, d: number, texW: number, texH: number) {
  const uv = geo.getAttribute('uv') as BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * fw / texW, uv.getY(i) * fh / texH);
    }
  }
  uv.needsUpdate = true;
}

const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _s = new Vector3(1, 1, 1), _p = new Vector3(), _c = new Color();

/** Collects transformed geometry by material and merges into a few draw calls. */
export class Batcher {
  private lists = new Map<string, { material: string; geometries: BufferGeometry[] }>();
  constructor(readonly lib: MaterialLib) {}

  addGeometry(mat: string, geo: BufferGeometry, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0) {
    _e.set(rotX, rotY, rotZ);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    geo.applyMatrix4(_m);
    if (!geo.getAttribute('color')) {
      const n = geo.getAttribute('position').count;
      const c = new Float32Array(n * 3).fill(1);
      geo.setAttribute('color', new BufferAttribute(c, 3));
    }
    const baked = this.lib.baked;
    if (baked && /^[pm]:#/.test(mat)) {
      // Paint colour goes into the vertex colours so every painted / metal prop shares one
      // material (hundreds fewer draw calls). Lighting is a product, so the result is identical.
      _c.set(mat.slice(2));
      const col = geo.getAttribute('color');
      for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * _c.r, col.getY(i) * _c.g, col.getZ(i) * _c.b);
      mat = mat[0] + ':*';
    }
    if (baked && this.lib.probeLit(mat)) {
      // Bake the light-probe irradiance into the vertex colours (multiplied with existing AO).
      const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), col = geo.getAttribute('color');
      for (let i = 0; i < pos.count; i++) {
        const nx = nor ? nor.getX(i) : 0, ny = nor ? nor.getY(i) : 1, nz = nor ? nor.getZ(i) : 0;
        baked.probe(pos.getX(i) + nx * 0.15, pos.getY(i) + ny * 0.15, pos.getZ(i) + nz * 0.15, _c);
        const shape = 0.84 + 0.16 * ny; // tops read brighter than undersides
        col.setXYZ(i, col.getX(i) * _c.r * shape, col.getY(i) * _c.g * shape, col.getZ(i) * _c.b * shape);
      }
      col.needsUpdate = true;
    }
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.computeBoundingBox();
    const bounds = g.boundingBox!;
    // Material batching within 24 m tiles preserves frustum culling. Previously a
    // single visible wall submitted every wall and prop of that material on the map.
    const tile = `${mat}|${Math.floor((bounds.min.x + bounds.max.x) / 48)}|${Math.floor((bounds.min.z + bounds.max.z) / 48)}`;
    let list = this.lists.get(tile);
    if (!list) this.lists.set(tile, (list = { material: mat, geometries: [] }));
    list.geometries.push(g);
  }

  /** Box centered at (x, y + h/2, z) i.e. y = base height. */
  box(mat: string, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, ao = true) {
    const geo = new BoxGeometry(w, h, d);
    const ws = this.lib.worldSize(mat);
    worldUVBox(geo, w, h, d, ws.w, ws.h);
    if (ao) bakeHeightAO(geo, y + h / 2);
    this.addGeometry(mat, geo, x, y + h / 2, z, rotY);
  }

  roundedBox(mat: string, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
    const geo = new RoundedBoxGeometry(w, h, d, 1, Math.min(0.035, Math.min(w, h, d) * 0.16));
    const ws = this.lib.worldSize(mat);
    const pos = geo.getAttribute('position'), normal = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      uv.setXY(i, (nx > nz ? pos.getZ(i) : pos.getX(i)) / ws.w, (ny > nx && ny > nz ? pos.getZ(i) : pos.getY(i)) / ws.h);
    }
    bakeHeightAO(geo, y + h / 2);
    this.addGeometry(mat, geo, x, y + h / 2, z, rotY);
  }

  cylinder(mat: string, r: number, h: number, x: number, y: number, z: number, seg = 14, rotX = 0, rotZ = 0, rTop = r) {
    const geo = new CylinderGeometry(rTop, r, h, seg);
    if (rotX === 0 && rotZ === 0) bakeHeightAO(geo, y + h / 2);
    this.addGeometry(mat, geo, x, y + h / 2, z, 0, rotX, rotZ);
  }

  build(target: Group, opts: { castShadow?: boolean } = {}) {
    for (const { material: key, geometries: list } of this.lists.values()) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, this.lib.get(key));
      mesh.castShadow = !!opts.castShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (key === 'glass') mesh.renderOrder = 2;
      target.add(mesh);
      for (const g of list) g.dispose();
    }
    this.lists.clear();
  }
}
