// Prints the ACI HQ grid as ASCII (used to generate docs/MAP.md).  node scripts/print-map.mjs
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { ACI_HQ } = await server.ssrLoadModule('/src/sim/maps/aciHq.ts');
const cols = ACI_HQ.cols;
const tens = Array.from({ length: cols }, (_, c) => (c % 10 === 0 ? String(c / 10) : ' ')).join('');
const ones = Array.from({ length: cols }, (_, c) => String(c % 10)).join('');
console.log('    ' + tens + '\n    ' + ones);
ACI_HQ.grid.forEach((row, r) => console.log(String(r).padStart(3) + ' ' + row));
console.log('\nLegend: # wall · ' + Object.entries(ACI_HQ.floorTypes).map(([k, f]) => `${k} ${f.name}`).join(' · '));
console.log(`Cell = ${ACI_HQ.cellSize} m. World X = ${ACI_HQ.originX} + col×${ACI_HQ.cellSize}, Z = ${ACI_HQ.originZ} + row×${ACI_HQ.cellSize} (north = up).`);
await server.close();
