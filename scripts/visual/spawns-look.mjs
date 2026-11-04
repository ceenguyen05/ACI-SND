// Where everyone starts, three rounds in a row: a top-down plot plus the player's own view at freeze time.
//   node scripts/visual/spawns-look.mjs [--no-build] [--map=aci_b2] [--side=Attackers|Defenders]
import { preview, build } from 'vite';
import { mkdirSync } from 'node:fs';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';

const mapId = process.argv.find((a) => a.startsWith('--map='))?.slice(6) ?? 'aci_hq';
const side = process.argv.find((a) => a.startsWith('--side='))?.slice(7) ?? 'Defenders';
const OUT = 'screenshots/spawns';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4185 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await startFromMenu(page, 'snd', false, side, { aci_hq: 'ACI HQ', aci_b2: 'ACI Building 2' }[mapId]);
await page.waitForSelector('.hud');
await page.waitForFunction(() => window.__aci?.app?.mode === 'game');
await page.evaluate(() => {
  const { match } = window.__aci;
  match.phaseEnd = match.time + 9999; // stay in freeze time
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
});
const log = [];
for (let round = 1; round <= 3; round++) {
  if (round > 1) await page.evaluate(() => { const m = window.__aci.match; m.startRound(); m.phaseEnd = m.time + 9999; });
  await page.evaluate(() => { const { session, match } = window.__aci; session.ctrl.syncFrom(match.player); session.view.beforeStep(); session.view.afterStep(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${mapId}-${side.toLowerCase()}-round${round}.png` });
  log.push(await page.evaluate(() => {
    const m = window.__aci.match, p = m.player;
    const where = (a) => `${a.team}@(${a.pos.x.toFixed(1)},${a.pos.z.toFixed(1)})`;
    return { round: m.round, areas: m.spawnAreas, you: where(p), canBuy: m.canBuyNow(p), everyone: m.agents.map(where).join(' ') };
  }));
}
// top-down plot of all three rounds
const plot = await page.evaluate(async () => {
  const m = window.__aci.match, map = m.world.map, ppm = 6;
  const c = document.createElement('canvas'); c.width = map.cols * map.cellSize * ppm; c.height = map.rows * map.cellSize * ppm;
  const g = c.getContext('2d');
  g.fillStyle = '#20252c'; g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < map.rows; r++) for (let col = 0; col < map.cols; col++) {
    if (map.grid[r][col] === '#') continue;
    g.fillStyle = map.floorTypes[map.grid[r][col]].ceiling === null ? '#5a5f66' : '#7c838c';
    g.fillRect(col * map.cellSize * ppm, r * map.cellSize * ppm, map.cellSize * ppm + 0.5, map.cellSize * ppm + 0.5);
  }
  const P = (x, z) => [(x - map.originX) * ppm, (z - map.originZ) * ppm];
  for (const t of ['T', 'CT']) for (const a of map.spawnAreas[t]) {
    const [x0, z0] = P(a.zone.x0, a.zone.z0), [x1, z1] = P(a.zone.x1, a.zone.z1);
    g.strokeStyle = t === 'T' ? '#e8b04a' : '#5d9be8'; g.lineWidth = 2; g.strokeRect(x0, z0, x1 - x0, z1 - z0);
    g.fillStyle = '#fff'; g.font = '14px Arial'; g.fillText(a.name, x0 + 4, z0 + 16);
  }
  return c.toDataURL();
});
await page.evaluate(() => {});
const colors = ['#ff4040', '#40ff70', '#ffffff'];
const positions = log.map((l) => l.everyone);
await page.setContent(`<body style="margin:0;background:#111"><canvas id=c></canvas><script>
  const img = new Image(); img.onload = () => { const c = document.getElementById('c'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const rounds = ${JSON.stringify(positions)}, colors = ${JSON.stringify(colors)}, ox = ${mapId === 'aci_hq' ? -60 : -53}, oz = ${mapId === 'aci_hq' ? -40 : -38};
  rounds.forEach((r, i) => r.split(' ').forEach((e) => { const m = e.match(/(T|CT)@\\((-?[\\d.]+),(-?[\\d.]+)\\)/); const x = (+m[2] - ox) * 6, z = (+m[3] - oz) * 6;
    g.fillStyle = colors[i]; g.beginPath(); g.arc(x, z, 7, 0, 7); g.fill(); g.fillStyle = '#000'; g.font = 'bold 10px Arial'; g.fillText(String(i + 1), x - 3, z + 4); }));
  document.title = 'done'; }; img.src = ${JSON.stringify(plot)};</script></body>`);
await page.waitForFunction(() => document.title === 'done');
await page.locator('#c').screenshot({ path: `${OUT}/${mapId}-plot.png` });
await browser.close(); await server.close();
for (const l of log) console.log(JSON.stringify(l));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
