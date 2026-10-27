// Quick visual check: a handful of in-game views at a chosen quality.
//   node scripts/look.mjs [quality=medium] [--no-build] [--spots=a,b,c]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const quality = process.argv.find((a) => ['low', 'medium', 'high'].includes(a)) ?? 'medium';
const only = process.argv.find((a) => a.startsWith('--spots='))?.slice(8).split(',');
const OUT = 'screenshots/look';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4177 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await startFromMenu(page, 'snd', false, 'Defenders');
await page.waitForSelector('.hud');
await page.evaluate((q) => {
  const { app, match, session } = window.__aci;
  app.profile.settings.quality = q; app.applySettings(app.profile.settings);
  match.skipFreeze(); match.player.health = 1e9;
  session.paused = true;
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
}, quality);
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const spots = [
  ['a-site', 20.5, -28, yawTo(1, 0.15), -0.05],
  ['b-site', -31, -18, yawTo(-1, -0.4), -0.05],
  ['mid', -1, 22, 0, 0],
  ['shipping', 6, 16, yawTo(1, 0), 0],
  ['yard', -30, 34, yawTo(1, -0.2), 0.05],
  ['lobby', 0, -25, Math.PI, 0],
  ['cubicles', -8, -1, yawTo(-1, 0), 0],
  ['warehouse', 10, 4, 0, 0],
].filter((s) => !only || only.includes(s[0]));
for (const [name, x, z, yaw, pitch] of spots) {
  await page.evaluate(([x, z, yaw, pitch]) => {
    const { match, session } = window.__aci;
    match.debugTeleport(match.player, x, z, yaw, pitch);
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    // put an enemy in view for character lighting checks
    const e = match.agents.find((a) => a.team !== match.player.team && a.alive);
    if (e) match.debugTeleport(e, x - Math.sin(yaw) * 6 + Math.cos(yaw) * 1.2, z - Math.cos(yaw) * 6 - Math.sin(yaw) * 1.2, yaw + Math.PI, 0);
    session.view.beforeStep(); session.view.afterStep();
  }, [x, z, yaw, pitch]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${quality}-${name}.png` });
}
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));
await browser.close();
await server.close();
console.log(`quality=${quality} fps=${fps}`);
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
