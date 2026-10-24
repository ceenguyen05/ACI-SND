// Visual review helper: tours the map and the weapon view-models and saves screenshots.
//   node scripts/screenshots.mjs [--no-build]
import { preview, build } from 'vite';
import { launchBrowser } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots/tour';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4174 }, logLevel: 'warn' });
const url = server.resolvedUrls.local[0];
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await page.click('.seg >> text=Defenders');
await page.click('text=Start match');
await page.waitForSelector('.hud');
await page.evaluate(() => {
  const { match, session } = window.__aci;
  match.skipFreeze();
  match.player.health = 1e9; // god mode for the tour
  session.paused = true;     // freeze the simulation, rendering continues
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
});

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const spots = [
  ['a-site-from-lobby', 20.5, -28, yawTo(1, 0.15), -0.05],
  ['a-site-from-long', 54, -12, yawTo(-0.6, -1), 0],
  ['b-site-from-hall', -31, -18, yawTo(-1, -0.4), -0.05],
  ['b-site-back', -55, -36, yawTo(1, 0.6), 0],
  ['mid-from-t', -1, 22, 0, 0],
  ['mid-doors', -1, -8, 0, 0],
  ['warehouse', 10, 4, 0, 0],
  ['factory-floor', 21, -3, yawTo(1, 0), 0],
  ['shipping', 6, 16, yawTo(1, 0), 0],
  ['cubicles', -8, -1, yawTo(-1, 0), 0],
  ['server-room', -42, 12, yawTo(-1, 0.3), 0],
  ['conference', -27, -26, yawTo(1, -0.6), 0],
  ['break-room', -32, -2, yawTo(-1, 0), 0],
  ['mail-room', -8, 12, yawTo(-1, 0.3), 0],
  ['lobby-ct', 0, -25, Math.PI, 0],
  ['yard', -30, 34, yawTo(1, -0.2), 0.05],
];
for (const [name, x, z, yaw, pitch] of spots) {
  await page.evaluate(([x, z, yaw, pitch]) => {
    const { match, session } = window.__aci;
    match.debugTeleport(match.player, x, z, yaw, pitch);
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    session.view.beforeStep(); session.view.afterStep();
  }, [x, z, yaw, pitch]);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/map-${name}.png` });
}
await page.evaluate(() => {
  const { match, session } = window.__aci;
  match.debugTeleport(match.player, 30, -2, Math.PI / 2 * -1, 0);
  session.ctrl.yaw = -Math.PI / 2; session.ctrl.pitch = 0;
  session.view.beforeStep(); session.view.afterStep();
});
for (const id of ['ravager', 'sentinel', 'longbow', 'vespa', 'breacher', 'k9', 'judge', 'knife']) {
  await page.evaluate((id) => { const { match } = window.__aci; match.debugGive(match.player, id); match.player.wpn.drawUntil = 0; }, id);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/vm-${id}.png` });
}
// ---- gadgets showcase
await page.evaluate(() => {
  const { match, session } = window.__aci;
  const p = match.player, g = match.gadgets;
  const V = p.motor.pos.constructor;
  match.debugTeleport(p, 36, -17, 0, -0.15);
  session.ctrl.yaw = 0; session.ctrl.pitch = -0.15;
  g.placeAt(p, 'shield', new V(34, 0, -20), 0);
  g.placeAt(p, 'wire', new V(38.5, 0, -20.5), 0);
  g.placeAt(p, 'mine', new V(36.5, 0, -19.5), Math.PI / 2);
  g.placeAt(p, 'flockCam', new V(40.5, 0, -19.5), 0);
  for (let i = 0; i < 140; i++) match.step(1 / 64);
  match.debugTeleport(p, 36, -17, 0, -0.15);
  session.view.beforeStep(); session.view.afterStep();
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/gadgets-placed.png` });
await page.evaluate(() => {
  const { match } = window.__aci;
  const p = match.player;
  match.debugGiveGadget(p, 'drone');
  match.debugTeleport(p, 36, -17, 0, -0.1);
  match.gadgets.deploy(p, 'drone');
  match.debugTeleport(p, 30, -28, Math.PI / 2, 0.25);
  match.gadgets.deploy(p, 'stickyCam');
  for (let i = 0; i < 120; i++) match.step(1 / 64);
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/gadgets-drone-view.png` });
for (const kind of ['stickyCam', 'cctv']) {
  await page.evaluate((kind) => {
    const { match } = window.__aci;
    const d = match.gadgets.devices.find((x) => x.kind === kind);
    if (d) match.gadgets.operate(match.player, d.id);
  }, kind);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/gadgets-${kind}-view.png` });
}
await page.evaluate(() => { const { match } = window.__aci; match.gadgets.operate(match.player, null); });
await page.keyboard.press('KeyB');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/gadgets-buy-menu.png` });

await browser.close();
await server.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'tour complete, no errors');
