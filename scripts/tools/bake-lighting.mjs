// Bakes ACI HQ's static lighting (lightmap atlas + light-probe grid) into public/lightmaps.
//   npm run bake
// Re-run after editing the map; tests fail if the baked data is stale.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const t0 = Date.now();
const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { ACI_HQ } = await server.ssrLoadModule('/src/sim/maps/aciHq.ts');
const { World } = await server.ssrLoadModule('/src/sim/world/World.ts');
const { bakeLighting } = await server.ssrLoadModule('/src/render/lighting/LightBaker.ts');
const { lightingHash, LIGHT_RANGE, BAKE_VERSION } = await server.ssrLoadModule('/src/render/lighting/LightLayout.ts');
const world = new World(ACI_HQ);
const out = bakeLighting(world, { log: (s) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`) });
await server.close();

// ---- minimal PNG encoder (RGB8) ----------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgbFloat) {
  const encode = (v) => {
    // linear irradiance / range → sRGB transfer for perceptual precision in the darks
    const x = Math.max(0, Math.min(1, v / LIGHT_RANGE));
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(s * 255);
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) raw[y * (width * 3 + 1) + 1 + x * 3 + c] = encode(rgbFloat[(y * width + x) * 3 + c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/lightmaps', { recursive: true });
const { layout, atlas, probes } = out;
writeFileSync('public/lightmaps/aci_hq_atlas.png', png(layout.width, layout.height, atlas));
writeFileSync('public/lightmaps/aci_hq_probes.png', png(probes.nx, probes.nz * probes.ny, probes.data));
const meta = {
  map: 'aci_hq', version: BAKE_VERSION, hash: lightingHash(world), range: LIGHT_RANGE,
  atlas: { width: layout.width, height: layout.height, file: 'aci_hq_atlas.png' },
  probes: { nx: probes.nx, nz: probes.nz, ny: probes.ny, x0: probes.x0, z0: probes.z0, spacing: probes.spacing, levels: probes.levels, file: 'aci_hq_probes.png' },
};
writeFileSync('public/lightmaps/aci_hq.json', JSON.stringify(meta, null, 1));
let lo = Infinity, hi = 0, sum = 0;
for (let i = 0; i < atlas.length; i++) { lo = Math.min(lo, atlas[i]); hi = Math.max(hi, atlas[i]); sum += atlas[i]; }
console.log(`baked ${layout.width}x${layout.height} atlas + ${probes.nx}x${probes.nz}x${probes.ny} probes in ${((Date.now() - t0) / 1000).toFixed(1)}s  (min ${lo.toFixed(3)} max ${hi.toFixed(2)} mean ${(sum / atlas.length).toFixed(3)})`);
