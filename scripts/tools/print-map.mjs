// Prints a Search & Destroy map grid as ASCII (used to generate docs/MAP.md).
//   node scripts/tools/print-map.mjs            → ACI HQ
//   node scripts/tools/print-map.mjs aci_b2     → ACI Building 2
//   node scripts/tools/print-map.mjs --props    → also overlay solid props as '*'
import { createServer } from 'vite';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'aci_hq';
const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { SND_MAPS } = await server.ssrLoadModule('/src/sim/maps/index.ts');
const { propColliders } = await server.ssrLoadModule('/src/sim/world/World.ts');
const map = SND_MAPS[id];
if (!map) { console.error(`Unknown map "${id}". Maps: ${Object.keys(SND_MAPS).join(', ')}`); process.exit(1); }
const grid = map.grid.map((row) => row.split(''));
if (args.includes('--props')) {
  for (const p of map.props) {
    if (p.solid === false) continue;
    for (const b of propColliders(p)) {
      for (let x = b.minX + 0.5; x < b.maxX; x += 1) for (let z = b.minZ + 0.5; z < b.maxZ; z += 1) {
        const c = Math.floor((x - map.originX) / map.cellSize), r = Math.floor((z - map.originZ) / map.cellSize);
        if (grid[r]?.[c] && grid[r][c] !== '#') grid[r][c] = '*';
      }
    }
  }
}
const cols = map.cols;
const tens = Array.from({ length: cols }, (_, c) => (c % 10 === 0 ? String(c / 10) : ' ')).join('');
const ones = Array.from({ length: cols }, (_, c) => String(c % 10)).join('');
console.log(`${map.name} (${map.id})\n    ` + tens + '\n    ' + ones);
grid.forEach((row, r) => console.log(String(r).padStart(3) + ' ' + row.join('')));
console.log('\nLegend: # wall · ' + Object.entries(map.floorTypes).map(([k, f]) => `${k} ${f.name}`).join(' · '));
console.log(`Cell = ${map.cellSize} m. World X = ${map.originX} + col×${map.cellSize}, Z = ${map.originZ} + row×${map.cellSize} (north = up).`);
await server.close();
