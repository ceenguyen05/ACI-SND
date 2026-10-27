// Visual check for the S&D "moments" pass: new guns, tactical gear, heartbeat screen, pings,
// stun, kill feed icons, multi-kill banner and the final killcam.
//   node scripts/moments-look.mjs [--no-build] [--only=vm,gear,kill]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const want = (n) => !only || only.includes(n);
const OUT = 'screenshots/moments';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4180 }, logLevel: 'warn' });
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
await page.evaluate(() => {
  const { app, match, session } = window.__aci;
  app.profile.settings.announcer = false;
  match.player.health = 1e9;
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
  match.skipFreeze();
  window.__shot = (x, z, yaw, pitch) => {
    match.debugTeleport(match.player, x, z, yaw, pitch);
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    session.view.beforeStep(); session.view.afterStep();
  };
  window.__park = () => { for (const a of match.agents) if (a !== match.player) match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0); };
  window.__park();
});
await page.waitForTimeout(300);
await page.evaluate(() => { window.__aci.session.paused = true; });
const snap = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); };

if (want('vm')) {
  for (const id of ['talon', 'viper', 'marshal']) {
    await page.evaluate((id) => { const { match } = window.__aci; match.debugGive(match.player, id); match.player.wpn.drawUntil = match.time; window.__shot(30, -24, Math.PI / 2, 0); }, id);
    await snap(`vm-${id}`, 450);
  }
  for (const g of ['stun', 'tknife']) {
    await page.evaluate((g) => { const { match } = window.__aci; match.player.grenades[g] = 1; match.debugGive(match.player, 'p30'); window.__aci.session.view.r.viewModel.setItem(''); match.player.active = 'grenade'; match.player.activeGrenade = g; match.player.wpn.drawUntil = match.time; window.__shot(30, -24, Math.PI / 2, 0); }, g);
    await snap(`vm-${g}`, 450);
  }
  // inspect mid-animation
  await page.evaluate(() => { const { match } = window.__aci; match.debugGive(match.player, 'talon'); match.player.wpn.drawUntil = match.time - 2; });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__aci.session.view.r.viewModel.onInspect());
  await snap('vm-inspect', 750);
}

if (want('gear')) {
  // heartbeat sensor with enemies ahead behind walls
  await page.evaluate(() => {
    const { match, session } = window.__aci;
    window.__shot(-36, 4, 0, -0.05);
    const foes = match.agents.filter((a) => a.team !== match.player.team);
    match.debugTeleport(foes[0], -40, -8, 0, 0); match.debugTeleport(foes[1], -30, -12, 0, 0);
    for (const a of foes) a.health = 1e9;
    match.debugGiveGadget(match.player, 'heartbeat', 1);
    match.player.heartbeatNext = 0;
    session.paused = false;
  });
  await snap('heartbeat', 900);
  // ping an enemy in plain view
  await page.evaluate(() => {
    const { match, session } = window.__aci;
    session.paused = true;
    const foe = match.agents.find((a) => a.team !== match.player.team);
    match.debugGive(match.player, 'sentinel');
    window.__shot(-36, 4, 0, 0);
    match.debugTeleport(foe, -36, -5, Math.PI, 0);
    match.player.pitch = Math.atan2(1.1 - 1.63, 9);
    match.teamPing(match.player);
    match.player.pingReadyAt = 0;
    window.__shot(-35.5, 4, 0.05, -0.03);
  });
  await snap('ping', 500);
  // stunned
  await page.evaluate(() => { const { match } = window.__aci; match.player.stunUntil = match.time + 3; match.player.stunStrength = 0.9; });
  await snap('stun', 400);
  await page.evaluate(() => { const { match } = window.__aci; match.player.stunUntil = 0; });
}

if (want('kill')) {
  // two quick kills → double kill banner + kill feed icons, then the killcam
  await page.evaluate(() => {
    const { match, session } = window.__aci;
    window.__park();
    const p = match.player;
    match.debugGive(p, 'sentinel');
    window.__shot(-36, 4, 0, 0);
    session.paused = false;
    const foes = match.agents.filter((a) => a.team !== p.team);
    foes.forEach((f, i) => { f.health = 100; match.debugTeleport(f, -37 + i * 1.6, -4 - i, Math.PI, 0); });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const { match } = window.__aci;
    const p = match.player;
    const foes = match.agents.filter((a) => a.team !== p.team);
    const V = p.pos.constructor;
    const hit = (f) => match.applyDamage(f, p, { health: 400, armor: 0 }, 'head', 'sentinel', f.eyePos(new V()), new V(0, 0, -1));
    hit(foes[0]); setTimeout(() => hit(foes[1]), 350);
  });
  await snap('double-kill', 700);
  await page.evaluate(() => {
    const { match } = window.__aci;
    const p = match.player;
    for (const f of match.agents.filter((a) => a.team !== p.team && a.alive)) {
      const V = p.pos.constructor;
      match.applyDamage(f, p, { health: 400, armor: 0 }, 'chest', 'sentinel', f.centerPos(new V()), new V(0, 0, -1));
    }
  });
  await page.waitForTimeout(1700); // killcam starts 1.3 s after the round ends
  await snap('killcam', 900);
  await snap('killcam-late', 1500);
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => { const { match, session } = window.__aci; return { round: match.round, phase: match.phase, killcam: !!session.view.killcam }; });
  console.log('after killcam', JSON.stringify(after));
  if (after.round < 2 || after.killcam) errors.push('round did not continue after the killcam: ' + JSON.stringify(after));
}

await browser.close();
await server.close();
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
