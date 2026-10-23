// Per-frame CPU cost breakdown (independent of other load on the machine):
// session update (sim + view + HUD) vs. WebGL render submission, per quality preset.
//   node scripts/frame-cost.mjs [--no-build]
import { preview, build } from 'vite';
import { chromium } from 'playwright';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4182 }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await page.click('text=Start match');
await page.waitForSelector('.hud');
await page.evaluate(() => {
  const { app, session } = window.__aci;
  const t = window.__t = { upd: 0, ren: 0, n: 0, view: 0, hud: 0, sim: 0 };
  const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const s = performance.now(); const r = f(...a); t[key] += performance.now() - s; return r; }; };
  wrap(session, 'update', 'upd');
  wrap(session.view, 'frame', 'view');
  wrap(session.hud, 'update', 'hud');
  wrap(session.match, 'step', 'sim');
  const r = app.renderer;
  const rf = r.render.bind(r);
  r.render = (...a) => { const s = performance.now(); const x = rf(...a); t.ren += performance.now() - s; t.n++; return x; };
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
  window.__aci.match.skipFreeze();
});
for (const q of ['low', 'medium', 'high']) {
  await page.evaluate((q) => { const a = window.__aci.app; a.profile.settings.quality = q; a.applySettings(a.profile.settings); }, q);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const t = window.__t; for (const k of Object.keys(t)) t[k] = 0; });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => { const t = window.__t; const n = Math.max(1, t.n); return { frames: t.n, fps: +(t.n / 3).toFixed(1), session: +(t.upd / n).toFixed(2), sim: +(t.sim / n).toFixed(2), view: +(t.view / n).toFixed(2), hud: +(t.hud / n).toFixed(2), render: +(t.ren / n).toFixed(2) }; });
  console.log(q.padEnd(7), JSON.stringify(r));
}
await browser.close();
await server.close();
