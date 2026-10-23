import { Color, LinearFilter, SRGBColorSpace, ShaderChunk, Texture, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { World } from '../../sim/world/World';
import { buildLayout, lightingHash, type LightLayout } from './LightLayout';

/** Runtime handle to the offline-baked lighting for a map. */
export interface BakedLighting {
  atlas: Texture;
  /** lightMapIntensity that turns an encoded texel back into irradiance (Basic & Standard). */
  intensity: number;
  layout: LightLayout;
  /** Linear irradiance at a world position (trilinear probe grid). 1.0 ≈ a normally lit room. */
  probe(x: number, y: number, z: number, out?: Color): Color;
}

interface Meta {
  hash: string; range: number;
  atlas: { width: number; height: number; file: string };
  probes: { nx: number; nz: number; ny: number; x0: number; z0: number; spacing: number; levels: number[]; file: string };
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

async function bitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}

/**
 * Loads `public/lightmaps/<map>.json` + PNGs. Returns null (and the game falls back to
 * real-time lights) if the files are missing or were baked for a different map version.
 */
export async function loadBakedLighting(world: World, base = './lightmaps/'): Promise<BakedLighting | null> {
  try {
    const res = await fetch(`${base}${world.map.id}.json`);
    if (!res.ok) return null;
    const meta = await res.json() as Meta;
    if (meta.hash !== lightingHash(world)) {
      console.warn(`[lighting] baked data is stale for ${world.map.id} — run "npm run bake". Using real-time lights.`);
      return null;
    }
    const [atlasImg, probeImg] = await Promise.all([bitmap(base + meta.atlas.file), bitmap(base + meta.probes.file)]);
    const atlas = new Texture(atlasImg);
    atlas.colorSpace = SRGBColorSpace;
    atlas.flipY = false;
    atlas.generateMipmaps = false;
    atlas.minFilter = LinearFilter;
    atlas.magFilter = LinearFilter;
    atlas.channel = 1;
    atlas.needsUpdate = true;

    // decode probes on the CPU (sampled every frame for characters / view model)
    const p = meta.probes;
    const canvas = document.createElement('canvas');
    canvas.width = probeImg.width; canvas.height = probeImg.height;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(probeImg, 0, 0);
    const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const data = new Float32Array(p.nx * p.nz * p.ny * 3);
    for (let i = 0; i < p.nx * p.nz * p.ny; i++) {
      for (let c = 0; c < 3; c++) data[i * 3 + c] = srgbToLinear(px[i * 4 + c] / 255) * meta.range;
    }
    const layout = buildLayout(world);
    if (layout.width !== meta.atlas.width || layout.height !== meta.atlas.height) {
      console.warn('[lighting] atlas layout mismatch — run "npm run bake".');
      return null;
    }
    const at = (i: number, k: number, l: number, c: number) => data[((l * p.nz + k) * p.nx + i) * 3 + c];
    const probe = (x: number, y: number, z: number, out = new Color()) => {
      const fx = Math.max(0, Math.min(p.nx - 1.001, (x - p.x0) / p.spacing));
      const fz = Math.max(0, Math.min(p.nz - 1.001, (z - p.z0) / p.spacing));
      let l = 0;
      while (l < p.ny - 2 && y > p.levels[l + 1]) l++;
      const fy = Math.max(0, Math.min(1, (y - p.levels[l]) / (p.levels[l + 1] - p.levels[l])));
      const i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
      const v = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const lerp2 = (ll: number) =>
          (at(i, k, ll, c) * (1 - tx) + at(i + 1, k, ll, c) * tx) * (1 - tz) + (at(i, k + 1, ll, c) * (1 - tx) + at(i + 1, k + 1, ll, c) * tx) * tz;
        v[c] = lerp2(l) * (1 - fy) + lerp2(l + 1) * fy;
      }
      return out.setRGB(v[0], v[1], v[2]);
    };
    return { atlas, intensity: meta.range * Math.PI, layout, probe };
  } catch (err) {
    console.warn('[lighting] could not load baked lighting:', err);
    return null;
  }
}

/**
 * Patch a lit (Standard / Lambert) material so its *diffuse* comes only from baked light:
 * the lightmap (mode 'lightmap') or the vertex colour channel (mode 'vertex'), while
 * reflections / specular from the environment map stay real-time. Real-time lights then
 * only affect dynamic objects, so nothing is lit twice.
 */
export function useBakedDiffuse(material: Material, mode: 'lightmap' | 'vertex') {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev.call(material, shader, renderer);
    let fs = shader.fragmentShader;
    if (mode === 'vertex') fs = fs.replace('#include <color_fragment>', '');
    // three.js substitutes light counts textually, so instead of disabling the light loops we
    // discard their output: static diffuse comes only from the bake.
    fs = fs.replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
      reflectedLight.directDiffuse = vec3( 0.0 );
      reflectedLight.directSpecular = vec3( 0.0 );
      irradiance = vec3( 0.0 );
      ${mode === 'vertex' ? 'irradiance += vColor.rgb * PI;' : ''}`);
    fs = fs.replace('#include <lights_fragment_maps>', ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''));
    shader.fragmentShader = fs;
  };
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${prevKey()}|baked-${mode}`;
}
