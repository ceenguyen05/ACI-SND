// Measures in-game FPS per quality preset over several samples.  node scripts/perf.mjs [--no-build]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4175 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await startFromMenu(page);
await page.waitForSelector('.hud');
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));
for (const q of ['medium', 'low', 'medium', 'high']) {
  await page.evaluate((q) => { const a = window.__aci.app; a.profile.settings.quality = q; a.applySettings(a.profile.settings); }, q);
  await page.waitForTimeout(1500);
  const samples = [await fps(), await fps(), await fps()];
  const info = await page.evaluate(() => { const r = window.__aci.app.renderer.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, programs: r.programs?.length }; });
  console.log(q.padEnd(7), samples.join(' / '), JSON.stringify(info));
}
await browser.close();
await server.close();
