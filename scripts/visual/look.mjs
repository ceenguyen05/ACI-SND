// Quick visual check: a handful of in-game views at a chosen quality.
//   node scripts/visual/look.mjs [quality=medium] [--no-build] [--spots=a,b,c] [--map=aci_b2]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const quality = process.argv.find((a) => ['low', 'medium', 'high'].includes(a)) ?? 'medium';
const only = process.argv.find((a) => a.startsWith('--spots='))?.slice(8).split(',');
const mapId = process.argv.find((a) => a.startsWith('--map='))?.slice(6) ?? 'aci_hq';
const MAP_TILE = { aci_hq: 'ACI HQ', aci_b2: 'ACI Building 2' };
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
await startFromMenu(page, 'snd', false, 'Defenders', MAP_TILE[mapId]);
await page.waitForSelector('.hud');
await page.evaluate((q) => {
  const { app, match, session } = window.__aci;
  app.profile.settings.quality = q; app.applySettings(app.profile.settings);
  match.skipFreeze(); match.player.health = 1e9;
  session.paused = true;
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
}, quality);
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const B2_SPOTS = [
  ['atrium', 0, -19.5, 0, 0.06],
  ['b-site', -28.6, -19.2, yawTo(-1, -0.55), -0.06],
  ['cafe-kitchen', -34, -24, yawTo(-0.8, -1), -0.02],
  ['a-site', 26.4, -20.8, yawTo(1, -0.45), -0.06],
  ['lab-bench', 30.5, -30, yawTo(-0.2, -1), -0.25],
  ['mid', 0, 2.6, 0, 0],
  ['lobby', 0, 15.2, 0, 0.08],
  ['parking', 0, 33, 0, 0.1],
  ['parking-east', 26, 28.2, yawTo(1, -0.15), 0.04],
  ['parking-west', -24, 28.2, yawTo(-1, -0.15), 0.04],
  ['party', -34.6, 0.6, yawTo(-1, -0.7), -0.05],
  ['restroom', -20, -9.6, 0, -0.08],
  ['bullpen', 36.4, 0.4, yawTo(1, -0.75), -0.1],
  ['training', -14.2, 15, yawTo(-1, -0.25), -0.05],
  ['mechanical', -47, 15, 0, 0],
  ['rf-lab', 47, 15.2, yawTo(-0.35, -1), -0.05],
  ['office', 16, 10.6, Math.PI, -0.2],
  ['coffee', -13.6, -21, yawTo(-1, 0.25), -0.05],
  ['server', 12.5, -8.5, yawTo(-1, 0.3), -0.05],
  ['boardroom', -14, -26.6, yawTo(-0.6, -1), -0.12],
  ['b-doors', -35, -31, yawTo(-0.2, 1), 0.02],
  // traffic products: field-test poles, plate readers, the photo-enforcement camera, speed signs
  ['poles', 46.6, 25.5, 0, 0.32],
  ['alpr', 46.4, 27.4, yawTo(1, 0), 0.28],
  ['speed-camera', -12.6, 30.6, yawTo(-1, 0), 0.22],
  ['speed-sign-pole', 41.6, 30.4, yawTo(-1, 0), 0.16],
  ['atrium-gear', -5.6, -27.4, yawTo(-1, 0.1), 0.05],
];
const spots = (mapId === 'aci_b2' ? B2_SPOTS : [
  ['a-site', 20.5, -28, yawTo(1, 0.15), -0.05],
  ['b-site', -31, -18, yawTo(-1, -0.4), -0.05],
  ['mid', -1, 22, 0, 0],
  ['shipping', 6, 16, yawTo(1, 0), 0],
  ['yard', -30, 34, yawTo(1, -0.2), 0.05],
  ['lobby', 0, -25, Math.PI, 0],
  ['cubicles', -8, -1, yawTo(-1, 0), 0],
  ['warehouse', 10, 4, 0, 0],
  ['pods', -55.5, -27, yawTo(1, -0.45), -0.12],
  ['conference', -21.5, -26, yawTo(-0.35, -1), -0.15],
  ['break-room', -34, -8, yawTo(-1, 0.35), -0.08],
  ['showcase', 0.5, -33.5, yawTo(-0.45, -1), -0.05],
  ['test-floor', 21, -3, yawTo(1, -0.05), 0.08],
  ['robot', 45.5, -22.5, yawTo(1, -0.55), 0],
  ['yard-west', -32, 29.5, yawTo(-1, 0.6), 0.04],
  ['pod-inside', -35.3, -30.2, yawTo(-1, 0.2), -0.42],
  ['speed-sign', -6.5, -26.5, yawTo(-1, -0.3), 0.05],
  ['facade', 0, 34, 0, 0.12],
  ['lobby-door', 0, -31, Math.PI, 0.12],
  ['test-corner', 50, -1, yawTo(1, 0.45), 0.12],
  ['yard-alpr', -50, 28.4, yawTo(-1, -0.1), 0.22],
]).filter((s) => !only || only.includes(s[0]));
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
  await page.screenshot({ path: `${OUT}/${mapId === 'aci_hq' ? '' : mapId + '-'}${quality}-${name}.png` });
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
