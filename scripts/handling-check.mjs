// Browser regression / visual evidence for movement, weapon handling and quality presets.
// Run with: node scripts/handling-check.mjs [--no-build]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build, preview } from 'vite';
import { launchBrowser } from './lib/browser.mjs';

const out = 'screenshots/handling';
mkdirSync(out, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4176 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], report = { presets: {}, movement: {}, weapon: {} };
page.on('pageerror', (error) => errors.push(String(error.stack || error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const capture = async (name) => {
  const paused = await page.evaluate(() => { const s = window.__aci?.session; if (!s) return null; const old = s.paused; s.paused = true; return old; });
  await page.screenshot({ path: `${out}/${name}.png` });
  if (paused !== null) await page.evaluate((paused) => { window.__aci.session.paused = paused; }, paused);
};
const settle = () => page.waitForTimeout(400);
const pose = async (x, z, yaw, pitch = 0) => {
  await page.evaluate(([x, z, yaw, pitch]) => {
    const { match, session } = window.__aci;
    match.debugTeleport(match.player, x, z, yaw, pitch);
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    session.view.beforeStep(); session.view.afterStep();
  }, [x, z, yaw, pitch]);
  await settle();
};
const state = () => page.evaluate(() => {
  const p = window.__aci.match.player;
  return { x: p.pos.x, y: p.pos.y, z: p.pos.z, speed: p.speed2D, grounded: p.motor.onGround, duck: p.motor.duck,
    prone: p.motor.prone, slide: p.motor.slideTime, slidePose: p.motor.slidePose, slideCooldown: p.motor.slideCooldown,
    eyeHeight: p.eyeHeight, cameraY: window.__aci.app.renderer.camera.position.y,
    mag: p.activeWeapon()?.mag, recoil: p.aimPunchPitch, ads: p.wpn.ads };
});

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen', { timeout: 60000 });
  await page.keyboard.press('Enter');
  await page.click('.seg >> text=Defenders');
  await page.click('text=Start match');
  await page.waitForSelector('.hud');
  await page.evaluate(() => {
    const { match, session } = window.__aci;
    for (const bot of match.bots.values()) bot.think = () => ({ ...bot.agent.cmd, forward: 0, right: 0, jump: false, fire: false, alt: false, use: false, select: null, selectGadget: null });
    match.skipFreeze();
    session.input.locked = true; session.input.gameFocus = true;
    document.querySelector('.click-to-play')?.classList.add('hidden');
  });
  await settle();
  await pose(-1, 15, 0);
  const start = await state();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(650); await page.keyboard.up('KeyW');
  const running = await state();
  await page.waitForTimeout(400);
  const stopped = await state();
  assert(running.z < start.z - 1.5, 'W should move the player forward');
  assert(stopped.speed < 0.05, 'release should brake to a stop');
  await page.keyboard.down('Space'); await page.waitForTimeout(200);
  const jumping = await state();
  assert(jumping.y > 0.6 && !jumping.grounded, 'Space should jump');
  await page.waitForTimeout(950);
  const heldJump = await state();
  assert(heldJump.grounded, 'holding Space should not auto-bhop');
  await page.keyboard.up('Space');
  await page.keyboard.down('KeyC'); await page.waitForTimeout(300);
  assert((await state()).duck > 0.95, 'C should crouch');
  assert((await state()).prone < 0.1, 'short crouch should not enter prone');
  await page.waitForTimeout(900);
  const prone = await state();
  assert(prone.prone > 0.99 && Math.abs(prone.eyeHeight - 0.43) < 0.02, 'holding C should lower the body and camera into prone');
  assert(Math.abs(prone.cameraY - prone.y - prone.eyeHeight) < 0.03, 'prone camera must match the shooting origin');
  await capture('prone');
  await page.keyboard.up('KeyC'); await page.waitForTimeout(550);
  assert((await state()).duck < 0.05, 'release should stand up');
  assert((await state()).prone < 0.05, 'release should leave prone');
  await pose(-1, 15, 0);
  await page.keyboard.press('AltLeft'); await page.waitForTimeout(100);
  assert.equal((await state()).slide, 0, 'slide cannot start from rest');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(650);
  const beforeSlide = await state();
  await page.keyboard.press('AltLeft'); await page.waitForTimeout(180);
  const sliding = await state();
  assert(sliding.slide > 0 && sliding.slidePose > 0.9, 'Left Alt should slide while running');
  assert(sliding.speed < beforeSlide.speed, 'sliding should decelerate without a speed boost');
  assert(sliding.eyeHeight < 1, 'slide should lower the camera');
  await capture('slide');
  await page.waitForTimeout(600);
  await page.keyboard.press('AltLeft'); await page.waitForTimeout(80);
  assert.equal((await state()).slide, 0, 'slide cooldown prevents repeated slides');
  await page.keyboard.up('KeyW'); await settle();
  report.movement = { start, running, stopped, jumping, heldJump, prone, beforeSlide, sliding };

  await page.evaluate(() => { const { match } = window.__aci; match.debugGive(match.player, 'ravager'); match.player.wpn.drawUntil = 0; });
  await settle();
  await page.mouse.down(); await page.waitForTimeout(650);
  const firing = await state();
  await capture('rifle-firing');
  await page.mouse.up();
  assert(firing.mag <= 24 && firing.mag >= 22, 'automatic rifle should fire at its intended cadence');
  assert(firing.recoil > 0, 'firing should apply recoil');
  await page.keyboard.press('KeyR'); await page.waitForTimeout(700);
  const magazineOut = await page.evaluate(() => window.__aci.app.renderer.viewModel.magazine?.position.y);
  assert(magazineOut < -0.05, 'reload should move the magazine');
  await capture('rifle-reload');
  await page.waitForTimeout(2200);
  assert((await state()).mag === 30, 'reload should replenish ammunition');
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(300);
  assert((await state()).ads, 'right mouse should aim down sights');
  await capture('rifle-ads');
  await page.mouse.up({ button: 'right' }); await settle();
  report.weapon = { firing, magazineOut, reloaded: (await state()).mag };

  await page.evaluate(() => { window.__aci.session.paused = true; });
  await pose(30, -2, -Math.PI / 2, 0);
  for (const quality of ['low', 'medium', 'high']) {
    await page.evaluate((quality) => {
      const app = window.__aci.app;
      app.profile.settings.quality = quality; app.applySettings(app.profile.settings);
    }, quality);
    await page.waitForTimeout(1000);
    const fps = await page.evaluate(() => new Promise((resolve) => {
      const start = performance.now(); let frames = 0;
      const sample = () => {
        frames++;
        if (performance.now() - start < 2000) requestAnimationFrame(sample);
        else resolve(Math.round(frames * 1000 / (performance.now() - start)));
      };
      requestAnimationFrame(sample);
    }));
    report.presets[quality] = { fps };
    await capture(`factory-${quality}`);
    console.log(quality, fps, 'FPS');
  }
  await page.evaluate(() => { const a = window.__aci.app; a.profile.settings.quality = 'medium'; a.applySettings(a.profile.settings); });
  for (const [name, x, z, yaw, pitch] of [
    ['a-site', 54, -12, Math.atan2(0.6, 1), 0],
    ['b-site', -55, -36, Math.atan2(-1, -0.6), 0],
    ['yard', -30, 34, Math.atan2(-1, 0.2), 0.05],
  ]) { await pose(x, z, yaw, pitch); await capture(name); }
  await pose(30, -2, -Math.PI / 2);
  for (const id of ['sentinel', 'longbow', 'k9', 'knife']) {
    await page.evaluate((id) => { const { match } = window.__aci; match.debugGive(match.player, id); match.player.wpn.drawUntil = 0; }, id);
    await settle(); await capture(id);
  }
  // Agent silhouette at combat distance, at an unobstructed point in mid.
  await pose(-1, 15, 0);
  await page.evaluate(() => {
    const { match } = window.__aci;
    const target = match.agents.find((a) => a.team !== match.player.team);
    match.debugTeleport(target, -1, 10, Math.PI, 0);
    window.__aci.session.view.beforeStep(); window.__aci.session.view.afterStep();
  });
  await settle(); await capture('agent');
  assert.deepEqual(errors, [], 'browser must not report runtime errors');
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('HANDLING CHECK PASSED', JSON.stringify(report));
} catch (error) {
  await capture('failure').catch(() => {});
  throw error;
} finally {
  await browser.close(); await server.close();
}
