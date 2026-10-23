// High-preset architecture, character poses, action animation and GPU error check.
// Also records a reviewable WebM. Run: node scripts/visual-check.mjs [--no-build]
import assert from 'node:assert/strict';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const out = 'screenshots/visual';
mkdirSync(out, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4177 }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const errors = [], report = {};
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png` }); };
const camera = async (x, y, z, yaw, pitch = 0) => page.evaluate(([x, y, z, yaw, pitch]) => {
  const { match, session } = window.__aci;
  session.view.freeCam = { pos: match.player.pos.clone().set(x, y, z), yaw, pitch };
}, [x, y, z, yaw, pitch]);

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen', { timeout: 60000 });
  await page.keyboard.press('Enter');
  await page.click('.seg >> text=Defenders');
  await page.click('text=Start match');
  await page.waitForSelector('.hud');
  await page.evaluate(() => {
    const { app, session, match } = window.__aci;
    app.profile.settings.quality = 'high'; app.applySettings(app.profile.settings);
    session.paused = true; session.input.locked = true; session.input.gameFocus = true;
    document.querySelector('.click-to-play')?.classList.add('hidden');
    match.debugGive(match.player, 'ravager'); match.player.wpn.drawUntil = 0;
    for (const bot of match.bots.values()) bot.think = () => ({ ...bot.agent.cmd, forward: 0, right: 0, fire: false, use: false });
  });
  await page.addStyleTag({ content: '.hud { visibility: hidden; }' });
  await page.waitForTimeout(1500);
  await camera(30, 1.65, -2, -Math.PI / 2); await shot('factory');
  await camera(-30, 1.65, 34, Math.atan2(-1, 0.2), 0.03); await shot('facade');
  await camera(54, 1.65, -12, Math.atan2(0.6, 1)); await shot('a-site');

  await camera(-1, 1.18, 15, 0, -0.04);
  await page.evaluate(() => {
    const { match, session } = window.__aci;
    const target = match.agents.find((a) => a.team !== match.player.team);
    window.__visualTarget = target;
    match.debugTeleport(target, -1, 12, Math.PI, 0);
    target.look[target.team] = { outfit: 'qa-tactical', primary: '#374249', secondary: '#3f463b', accent: '#68715a', skin: '#a9775a', headgear: 'helmet', style: 'armored' };
    match.debugGive(target, 'sentinel'); target.vel.set(0, 0, 0); target.motor.onGround = true;
    session.view.beforeStep(); session.view.afterStep();
  });
  await shot('operator-standing');
  const feet = () => page.evaluate(() => {
    const a = window.__visualTarget, model = window.__aci.session.view.chars.get(a.id).model;
    return [model.footL, model.footR].map((foot) => { const p = a.pos.clone(); foot.getWorldPosition(p); return p.y; });
  });
  report.standingAnkles = await feet();
  await page.evaluate(() => { window.__visualTarget.motor.duck = 1; });
  await shot('operator-crouching'); report.crouchedAnkles = await feet();
  for (const y of [...report.standingAnkles, ...report.crouchedAnkles]) assert(Math.abs(y - 0.09) < 0.015, 'standing and crouched feet should stay grounded');
  await camera(-3.1, 1.15, 14.5, -0.699, -0.22);
  await page.evaluate(() => {
    const a = window.__visualTarget; a.motor.prone = 1; a.motor.bodyYaw = a.yaw;
  });
  await shot('operator-prone');
  report.prone = await page.evaluate(() => {
    const a = window.__visualTarget, model = window.__aci.session.view.chars.get(a.id).model;
    const head = a.pos.clone(), hip = a.pos.clone(); model.head.getWorldPosition(head); model.hips.getWorldPosition(hip);
    return { headPivot: head.y, hip: hip.y, height: a.height, eye: a.eyeHeight };
  });
  assert(report.prone.headPivot < 0.4 && report.prone.hip < 0.3, 'prone model must lie on the floor');
  await page.evaluate(() => { const a = window.__visualTarget; a.vel.z = -1; });
  await page.waitForTimeout(1500); await shot('operator-crawling');
  await page.evaluate(() => { const a = window.__visualTarget; a.vel.set(0, 0, 0); a.motor.prone = 0; a.motor.slidePose = 1; });
  await shot('operator-sliding');
  await page.evaluate(() => { window.__visualTarget.motor.slidePose = 0; });
  await camera(-1, 1.18, 15, 0, -0.04);
  await page.evaluate(() => {
    const a = window.__visualTarget; a.motor.duck = 0;
    a.wpn.reloadUntil = window.__aci.match.time + a.activeWeapon().def.reloadTime * 0.65;
  });
  await shot('operator-reloading');
  await page.evaluate(() => { window.__visualTarget.wpn.reloadUntil = 0; });
  await page.evaluate(() => new Promise((resolve) => {
    const { session } = window.__aci, a = window.__visualTarget;
    const entry = session.view.chars.get(a.id), start = performance.now();
    function move() {
      const t = (performance.now() - start) / 1000;
      a.pos.x = -1 + Math.sin(t * 3.2) * 0.65; a.vel.x = Math.cos(t * 3.2) * 2.08;
      entry.prev.copy(a.pos); entry.cur.copy(a.pos);
      if (t < 2.5) requestAnimationFrame(move);
      else { a.vel.set(0, 0, 0); resolve(); }
    }
    requestAnimationFrame(move);
  }));

  await page.evaluate(() => {
    const { match, session } = window.__aci;
    session.view.freeCam = null;
    match.debugTeleport(match.player, 30, -2, -Math.PI / 2, 0);
    session.ctrl.yaw = -Math.PI / 2; session.ctrl.pitch = 0;
    session.view.beforeStep(); session.view.afterStep();
  });
  await shot('rifle-detail');
  await page.evaluate(() => {
    const { match } = window.__aci; match.debugGive(match.player, 'breacher'); match.player.wpn.drawUntil = 0;
  });
  await shot('shotgun-detail');
  await page.evaluate(() => window.__aci.app.renderer.viewModel.onFire(1));
  await page.waitForTimeout(250);
  report.pumpTravel = await page.evaluate(() => window.__aci.app.renderer.viewModel.pump.position.z);
  assert(report.pumpTravel > 0.025, 'shotgun pump must cycle after a shot');
  await shot('shotgun-cycle');
  await page.evaluate(() => {
    const { match } = window.__aci; match.debugGive(match.player, 'longbow'); match.player.wpn.drawUntil = 0;
  });
  await shot('sniper-detail');
  // A thrown gadget / settled decoy must retain its model across frames and release
  // its GPU geometry when removed. Repeated rounds must not accumulate these buffers.
  report.resources = await page.evaluate(async () => {
    const { match, session, app } = window.__aci;
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let stable = true;
    const sizes = [];
    for (let i = 0; i < 12; i++) {
      const id = 900000 + i;
      const pos = match.player.pos.clone().add(match.player.viewDir().multiplyScalar(2)); pos.y = 0.2;
      match.gadgets.thrown.push({ id, kind: 'c4', pos, vel: pos.clone().set(0, 0, 0), ownerId: match.player.id, team: match.player.team, thrownAt: match.time, restSince: 0, aiTarget: null });
      match.utility.decoys.push({ id, pos, ownerId: match.player.id, end: match.time + 10, nextBurst: match.time + 10 });
      await frames();
      const device = session.view.devices.get(-100000 - id), decoy = session.view.projectiles.get(-id);
      await frames();
      stable &&= !!device && !!decoy && device === session.view.devices.get(-100000 - id) && decoy === session.view.projectiles.get(-id);
      match.gadgets.thrown = match.gadgets.thrown.filter((x) => x.id !== id);
      match.utility.decoys = match.utility.decoys.filter((x) => x.id !== id);
      await frames();
      sizes.push(app.renderer.renderer.info.memory.geometries);
    }
    return { stableModels: stable, geometryCountsAfterRemoval: sizes };
  });
  assert(report.resources.stableModels, 'thrown gadgets and decoys must reuse their model across frames');
  const sizes = report.resources.geometryCountsAfterRemoval;
  assert(sizes.at(-1) <= sizes[0] + 2, 'repeated gadget removal must not leak GPU geometry');
  report.renderer = await page.evaluate(() => {
    const r = window.__aci.app.renderer;
    return { quality: r.quality, bakedLighting: !!r.baked, contactShading: !!r.post, calls: r.renderer.info.render.calls,
      triangles: r.renderer.info.render.triangles, glError: r.renderer.getContext().getError() };
  });
  assert.equal(report.renderer.glError, 0, 'WebGL must have no errors');
  assert.equal(report.renderer.contactShading, true);
  assert.deepEqual(errors, [], 'no runtime, shader or asset loading errors');
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('VISUAL CHECK PASSED', JSON.stringify(report));
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally {
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), `${out}/animation-review.webm`);
  await browser.close(); await server.close();
}
