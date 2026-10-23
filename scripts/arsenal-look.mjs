// Visual check of the arsenal: buy menu tabs, new weapon / gadget view models, quick melee,
// barricades, killstreaks and explosions.   node scripts/arsenal-look.mjs [--no-build] [--only=a,b]
import { preview, build } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const want = (n) => !only || only.includes(n);
const OUT = 'screenshots/arsenal';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4178 }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await page.click('.seg >> text=Defenders');
await page.click('text=Start match');
await page.waitForSelector('.hud');
await page.evaluate(() => {
  const { app, match, session } = window.__aci;
  app.profile.settings.quality = 'medium'; app.applySettings(app.profile.settings);
  match.player.health = 1e9;
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
  window.__shot = (x, z, yaw, pitch) => {
    match.debugTeleport(match.player, x, z, yaw, pitch);
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    session.view.beforeStep(); session.view.afterStep();
  };
  // keep the bots out of the way
  for (const a of match.agents) if (a !== match.player) match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0);
});
const snap = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); };

// ---- buy menu (during freeze)
if (want('buy')) {
  await page.evaluate(() => { const { session } = window.__aci; session.openBuy(); });
  for (const [i, tab] of ['weapons', 'gadgets', 'utilities'].entries()) {
    await page.evaluate((k) => window.__aci.session.buy.key(k), `Digit${i + 1}`);
    await snap(`buy-${tab}`, 250);
  }
  await page.evaluate(() => window.__aci.session.closeBuy());
}
await page.evaluate(() => { const { match, session } = window.__aci; match.skipFreeze(); session.paused = true; });

// ---- view models
if (want('vm')) {
  for (const id of ['bulwark', 'anvil', 'thumper', 'hammer', 'mako', 'reaper']) {
    await page.evaluate((id) => {
      const { match } = window.__aci;
      match.debugGive(match.player, id);
      match.player.wpn.drawUntil = match.time;
      window.__shot(30, -24, Math.PI / 2, 0);
    }, id);
    await snap(`vm-${id}`, 500);
  }
  await page.evaluate(() => { const { match } = window.__aci; match.debugGiveGadget(match.player, 'stim', 3); window.__shot(30, -24, Math.PI / 2, 0); });
  await snap('vm-stim', 500);
  // quick melee mid-thrust (rifle in hand)
  await page.evaluate(() => { const { match, session } = window.__aci; match.debugGive(match.player, 'sentinel'); match.player.wpn.drawUntil = match.time; session.view.r.viewModel.onQuickMelee(false); });
  await snap('vm-quickmelee', 150);
  await page.evaluate(() => { const { match, session } = window.__aci; match.player.hasCrowbar = true; session.view.r.viewModel.onQuickMelee(true); });
  await snap('vm-crowbar', 150);
}

// ---- fortifications: barricade the two closest doors and look at them
if (want('barricade')) {
  await page.evaluate(() => {
    const { match } = window.__aci;
    const p = match.player;
    const frames = match.gadgets.doorFrames();
    const f = frames.find((d) => Math.abs(d.cx + 29) < 1 && Math.abs(d.cz + 31) < 1) ?? frames[0];
    window.__shot(f.alongX ? f.cx : f.cx - 1.4, f.alongX ? f.cz - 1.4 : f.cz, f.alongX ? Math.PI : -Math.PI / 2, 0);
    match.gadgets.placeBarricade(p, 'barricade', p.eyePos(), p.viewDir());
    window.__shot(f.alongX ? f.cx : f.cx - 3.2, f.alongX ? f.cz - 3.2 : f.cz, f.alongX ? Math.PI : -Math.PI / 2, -0.05);
  });
  await snap('barricade-wood', 500);
  // placement preview while holding a steel barricade at the next door
  await page.evaluate(() => {
    const { match } = window.__aci;
    const f = match.gadgets.doorFrames().find((d) => Math.abs(d.cx + 19) < 1 && Math.abs(d.cz + 31) < 1) ?? match.gadgets.doorFrames()[0];
    match.debugGiveGadget(match.player, 'steelBarricade', 1);
    window.__shot(f.alongX ? f.cx : f.cx - 1.6, f.alongX ? f.cz - 1.6 : f.cz, f.alongX ? Math.PI : -Math.PI / 2, -0.1);
  });
  await snap('barricade-preview', 500);
  await page.evaluate(() => {
    const { match } = window.__aci;
    const p = match.player;
    const f = match.gadgets.doorFrames().find((d) => Math.abs(d.cx + 19) < 1 && Math.abs(d.cz + 31) < 1) ?? match.gadgets.doorFrames()[0];
    window.__shot(f.alongX ? f.cx : f.cx - 1.4, f.alongX ? f.cz - 1.4 : f.cz, f.alongX ? Math.PI : -Math.PI / 2, 0);
    match.gadgets.placeBarricade(p, 'steelBarricade', p.eyePos(), p.viewDir());
    window.__shot(f.alongX ? f.cx : f.cx - 3.2, f.alongX ? f.cz - 3.2 : f.cz, f.alongX ? Math.PI : -Math.PI / 2, -0.05);
  });
  await snap('barricade-steel', 500);
}

// ---- devices: ammo box + hunter drone
if (want('devices')) {
  await page.evaluate(() => {
    const { match } = window.__aci;
    const p = match.player;
    window.__shot(36, -20, 0, -0.25);
    match.gadgets.placeAt(p, 'ammoBox', p.pos.clone().set(36.5, 0, -22.2), 0.4);
    const h = match.gadgets.spawnHunter(p);
    h.pos.set(35.3, 1.7, -23);
    match.player.streakKills = 3; match.player.streaks = ['uav'];
  });
  await snap('devices', 500);
}

// ---- explosion from an RPG into a wall
if (want('rpg')) {
  await page.evaluate(() => {
    const { match, session } = window.__aci;
    match.debugGive(match.player, 'hammer');
    match.player.wpn.drawUntil = match.time;
    window.__shot(36, -20, 0, -0.05);
    session.paused = false;
    match.ordnance.fireLauncher(match.player, 'hammer', 0);
  });
  await snap('rpg-flight', 120);
  await snap('rpg-blast', 350);
}

// ---- cruise missile thermal view
if (want('missile')) {
  await page.evaluate(() => {
    const { match } = window.__aci;
    for (const a of match.agents) if (a !== match.player && a.team !== match.player.team) match.debugTeleport(a, 30 + a.id, -25, 0, 0);
    window.__aci.session.paused = false;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const { match } = window.__aci;
    match.debugGiveStreak(match.player, 'missile');
    match.killstreaks.activate(match.player);
  });
  await snap('missile', 1200);
}

await browser.close();
await server.close();
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
