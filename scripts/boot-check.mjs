// Deploy boot check (runs in CI before every GitHub Pages deploy, and locally with `npm run check:boot`).
//
// Serves the production build from a sub-path exactly like GitHub Pages does
// (https://<user>.github.io/<repo>/), loads it in headless Chromium and verifies that:
//   - every asset resolves under the sub-path (no 404s – catches broken base paths),
//   - the title screen, menu and a match start without any console or page errors,
//   - the simulation runs (10 s of match time stepped in the page).
// It does not depend on frame rate, so it is reliable on GPU-less CI runners (software WebGL).
//
//   node scripts/boot-check.mjs [--no-build] [--swiftshader]
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';

const OUT = 'screenshots/boot';
mkdirSync(OUT, { recursive: true });
const repo = (process.env.GITHUB_REPOSITORY ?? 'ceenguyen05/ACI-SND').split('/').pop();
const BASE = `/${repo}/`;
const DIST = resolve('dist');

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });

// ---- minimal static server: dist/ mounted at /<repo>/ (like GitHub Pages) -----------------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain',
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(BASE)) { res.writeHead(404).end('outside the Pages sub-path'); return; }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(DIST, rel));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}${BASE}`;
console.log('serving dist at', url);

const errors = [];
const missing = [];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.setDefaultTimeout(180_000);
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
// cheapest settings: software WebGL is slow and this check only needs a few frames
await page.addInitScript(() => {
  try { localStorage.setItem('aci-snd-profile-v1', JSON.stringify({ settings: { quality: 'low', renderScale: 0.5, announcer: false, tips: false } })); } catch { /* ignore */ }
});

const step = async (name, fn) => {
  const t0 = Date.now();
  await fn();
  console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

try {
  await step('title screen', async () => { await page.goto(url); await page.waitForSelector('.title-screen'); });
  await step('main menu', async () => { await page.keyboard.press('Enter'); await page.waitForSelector('.menu'); });
  await step('start a match', async () => { await startFromMenu(page); await page.waitForSelector('.hud'); });
  await step('simulate 10 s of the round', async () => {
    const st = await page.evaluate(() => {
      const { match } = window.__aci;
      match.skipFreeze();
      for (let i = 0; i < 64 * 10; i++) match.step(1 / 64);
      return { phase: match.phase, round: match.round, agents: match.agents.length, time: match.time };
    });
    console.log('    state', JSON.stringify(st));
    if (st.agents < 2 || st.round < 1 || !(st.time > 9)) errors.push('simulation did not advance: ' + JSON.stringify(st));
  });
  await step('render + screenshot', async () => { await page.screenshot({ path: `${OUT}/boot.png`, timeout: 180_000 }); });
  // Zombies boots too: back to the menu, start a game, simulate the first wave
  await step('back to the menu', async () => { await page.evaluate(() => window.__aci.session.quit()); await page.waitForSelector('.mm-home'); });
  await step('start zombies', async () => { await startFromMenu(page, 'zombies'); await page.waitForSelector('.zhud'); });
  await step('simulate 20 s of zombies', async () => {
    const st = await page.evaluate(() => {
      const { match } = window.__aci;
      for (let i = 0; i < 64 * 20; i++) match.step(1 / 64);
      return { wave: match.wave, spawned: match.spawned, zombies: match.zombiePool.length, humans: match.humans.length, time: match.time };
    });
    console.log('    state', JSON.stringify(st));
    if (st.wave < 1 || st.spawned < 1 || st.humans < 1) errors.push('zombies did not start: ' + JSON.stringify(st));
  });
  await step('render zombies + screenshot', async () => { await page.screenshot({ path: `${OUT}/boot-zombies.png`, timeout: 180_000 }); });
} catch (e) {
  errors.push('boot check error: ' + (e.stack || e));
  await page.screenshot({ path: `${OUT}/failure.png`, timeout: 60_000 }).catch(() => {});
}

await browser.close();
server.close();
const problems = [...missing.map((m) => 'missing asset: ' + m), ...errors];
if (problems.length) {
  console.error(`\nBOOT CHECK FAILED (${problems.length}):`);
  for (const p of problems.slice(0, 25)) console.error(' -', p);
  process.exit(1);
}
console.log('\nBOOT CHECK PASSED');
