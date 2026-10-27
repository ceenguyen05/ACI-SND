// Visual check of the Gunsmith: buy-menu tab, fitted guns in first person, optics, laser and light.
//   node scripts/gunsmith-look.mjs [--no-build]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots/gunsmith';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4181 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await startFromMenu(page, 'snd', false, 'Defenders');
await page.waitForSelector('.hud');
const snap = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); };

// buy a rifle + attachments through the real menu
await page.evaluate(() => {
  const { app, match, session } = window.__aci;
  app.profile.settings.announcer = false;
  match.player.money = 16000; match.player.health = 1e9;
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
  session.openBuy();
});
await page.click('.buy-item >> text=Sentinel M4');
await page.click('.buy-tab >> text=Gunsmith');
for (const name of ['Holographic Sight', 'Suppressor', 'Vertical Grip', '5 mW Tac Laser', 'Extended Mag']) {
  await page.click(`.gs-att >> text=${name}`);
}
await page.hover('.gs-att >> text=Muzzle Brake');
await snap('gunsmith-tab', 300);

await page.evaluate(() => {
  const { match, session } = window.__aci;
  session.closeBuy();
  match.skipFreeze();
  for (const a of match.agents) if (a !== match.player) match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0);
  window.__shot = (x, z, yaw, pitch) => {
    match.debugTeleport(match.player, x, z, yaw, pitch);
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    session.view.beforeStep(); session.view.afterStep();
  };
  window.__shot(30, -24, Math.PI / 2, 0);
});
await page.waitForTimeout(400);
await page.evaluate(() => { window.__aci.session.paused = true; window.__aci.match.player.wpn.drawUntil = 0; });
await snap('vm-kitted', 500);
// aiming down the holo sight
await page.evaluate(() => { const { match } = window.__aci; match.player.wpn.ads = true; });
await snap('ads-holo', 500);
// swap to an ACOG (fit it directly: we're outside the buy zone here)
await page.evaluate(() => {
  const { match } = window.__aci;
  match.fitAttachment(match.player, 'sentinel', 'acog');
  match.player.wpn.ads = true;
});
await snap('ads-acog', 500);
// third person: an enemy with a green laser, then a light, aiming at us
await page.evaluate(() => {
  const { match, session } = window.__aci;
  const p = match.player; p.wpn.ads = false;
  const foe = match.agents.find((a) => a.team !== p.team);
  match.bots.delete(foe.id); // hold still
  window.__shot(-36, 4, 0, 0);
  match.debugTeleport(foe, -36.6, -5, Math.PI, 0);
  foe.loadouts.ravager = { owned: ['laser5mw'], equipped: { laser: 'laser5mw' } };
  match.debugGive(foe, 'ravager');
  foe.pitch = -0.02;
  window.__foe = foe;
  session.paused = true;
});
await snap('enemy-laser', 600);
await page.evaluate(() => {
  const { match } = window.__aci;
  const foe = window.__foe;
  foe.loadouts.ravager = { owned: ['flashlight'], equipped: { laser: 'flashlight' } };
  match.debugGive(foe, 'ravager');
  foe.lightOn = true;
  match.player.yaw = 0; match.player.pitch = 0;
  foe.yaw = Math.PI + 0.05; foe.pitch = -0.04;
  match.losCache.clear(); match.updateWeaponLights();
  match.player.dazzleUntil = match.time + 5; match.player.dazzleStrength = 0.8;
});
await snap('enemy-light', 600);

await browser.close();
await server.close();
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
