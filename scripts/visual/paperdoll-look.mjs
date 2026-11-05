// Visual check: the HUD paper doll (Settings › Game › Paper doll) in a few poses.
//   node scripts/visual/paperdoll-look.mjs [--no-build]
// Writes screenshots/paperdoll/: a full frame plus close-ups of the top-right corner.
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots/paperdoll';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4185 }, logLevel: 'warn' });
const browser = await launchBrowser();
const W = 1280, H = 720;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await startFromMenu(page, 'snd', false, 'Attackers');
await page.waitForSelector('.hud');
await page.waitForTimeout(800);
await page.evaluate(() => {
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
  const { app, match, session } = window.__aci;
  app.profile.settings.paperDoll = 'always';
  match.skipFreeze();
  match.player.health = 1e9;
  for (const a of match.agents) if (a !== match.player) { a.health = 1e9; match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0); }
  match.debugTeleport(match.player, 0, -25, Math.PI * 0.85, 0);
  session.ctrl.yaw = Math.PI * 0.85; session.ctrl.pitch = 0;
  // a kill-feed row, to check it sits left of the doll
  const bot = match.agents.find((a) => a.team !== match.player.team);
  match.events.emit('kill', { killerId: match.player.id, victimId: bot.id, weapon: 'ravager', headshot: true, assisterId: null, flashAssist: false, wallbang: false });
});
await page.waitForTimeout(900);
// Freeze the simulation so poses set by hand stay put while frames keep rendering.
await page.evaluate(() => { window.__aci.session.timeScale = 0; });

const corner = { x: W - 360, y: 0, width: 360, height: 230 };
const shot = async (name, setup, wait = 350) => {
  await page.evaluate(setup);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: corner });
};

await page.screenshot({ path: `${OUT}/full.png` });
await shot('standing', () => {});
await shot('firing', () => {
  const doll = window.__aci.app.renderer.paperDoll;
  doll.onShot(); doll.flashT = 99;
}, 120);
await shot('crouch-reload', () => {
  const { match, app } = window.__aci, p = match.player, w = p.activeWeapon();
  app.renderer.paperDoll.flashT = 0;
  p.motor.duck = 1;
  p.wpn.reloadUntil = match.time + w.def.reloadTime * 0.55;
});
await shot('prone', () => {
  const { match } = window.__aci, p = match.player;
  p.wpn.reloadUntil = 0; p.motor.duck = 0; p.motor.prone = 1; p.motor.bodyYaw = p.yaw;
}, 600);
await shot('throw', () => {
  const { match, app } = window.__aci, p = match.player;
  p.motor.prone = 0; app.renderer.paperDoll.onSwing();
}, 140);
// "When acting": standing still hides it after the linger time.
await shot('action-idle', () => { window.__aci.app.profile.settings.paperDoll = 'action'; }, 2600);

await browser.close();
await server.close();
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
