// Real-browser gunplay regression and visual evidence. node scripts/checks/gunplay-check.mjs [--no-build]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build, preview } from 'vite';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';

const out = 'screenshots/gunplay';
mkdirSync(out, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4183, strictPort: true }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const errors = [], report = {};
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen', { timeout: 60000 });
  await page.keyboard.press('Enter');
  await startFromMenu(page, 'snd', false, 'Defenders');
  await page.waitForSelector('.hud');
  await page.evaluate(() => {
    const { app, match: m, session: s } = window.__aci;
    app.profile.settings.aimAssist = 'off'; app.profile.settings.tips = false;
    for (const bot of m.bots.values()) bot.think = () => ({ ...bot.agent.cmd, fire: false, alt: false, forward: 0, right: 0, jump: false, crouch: false, prone: false, use: false, select: null, selectGadget: null });
    m.skipFreeze(); m.step(1 / 64); s.paused = true;
    for (const el of document.querySelectorAll('.click-to-play, .pause-menu, .overlay-dim, .tip')) el.remove();
    const p = m.player, e = m.agents.find((a) => a.team !== p.team);
    for (const a of m.agents) if (a !== p && a !== e) a.alive = false;
    p.health = e.health = 1e8;
    window.__foe = e;
    window.__stageGun = (id, ads, edge = false) => {
      m.debugGive(p, id); m.debugTeleport(p, 36, -20, 0);
      m.debugTeleport(e, 36 + (edge ? 0.25 : 0), -32, Math.PI);
      e.armor = 0; e.helmet = false;
      p.wpn.ads = ads && !p.activeWeapon().def.scope;
      p.wpn.scope = ads && p.activeWeapon().def.scope ? 1 : 0;
      const eye = p.eyePos(), target = e.aimPoint(false);
      p.pitch = Math.atan2(target.y - eye.y, 12); p.yaw = 0;
      s.ctrl.yaw = p.yaw; s.ctrl.pitch = p.pitch;
      p.wpn.drawUntil = p.wpn.nextAttack = 0;
      p.wpn.triggerLatched = false; p.wpn.recoilIdx = p.wpn.fireInacc = 0;
      p.aimPunchPitch = p.aimPunchYaw = 0; p.wpn.lastShot = -10;
      s.view.beforeStep(); s.view.afterStep();
    };
    window.__fireOne = () => {
      const cmd = s.ctrl.command(p); cmd.fire = true;
      cmd.alt = p.wpn.ads; cmd.select = null;
      m.setPlayerCommand(cmd); s.view.beforeStep(); m.step(1 / 64); s.view.afterStep();
    };
  });
  report.edgeShots = await page.evaluate(() => {
    const { match: m } = window.__aci, p = m.player, e = window.__foe;
    window.__stageGun('sentinel', true, true);
    let shots = 0, hits = 0, headshots = 0;
    const offS = m.events.on('shot', (v) => { if (v.agentId === p.id) shots++; });
    const offH = m.events.on('hit', (v) => { if (v.attackerId === p.id && v.victimId === e.id) { hits++; if (v.group === 'head') headshots++; } });
    for (let i = 0; i < 60; i++) {
      p.activeWeapon().mag = 100; p.wpn.triggerLatched = false;
      p.wpn.nextAttack = 0; p.wpn.recoilIdx = p.wpn.fireInacc = 0;
      p.aimPunchPitch = p.aimPunchYaw = 0;
      window.__fireOne();
    }
    offS(); offH(); return { shots, hits, headshots };
  });
  assert.equal(report.edgeShots.shots, 60);
  assert(report.edgeShots.hits >= 35, 'a nearly aligned ADS body shot should be forgiving');
  assert.equal(report.edgeShots.headshots, 0);

  report.aim = [];
  for (const [id, ads] of [['sentinel', false], ['sentinel', true], ['marshal', true], ['breacher', true]]) {
    await page.evaluate(([id, ads]) => window.__stageGun(id, ads), [id, ads]);
    await page.waitForTimeout(450);
    const r = await page.evaluate(() => {
      const { match: m, session: s, app } = window.__aci, p = m.player;
      const before = p.activeWeapon().mag;
      window.__fireOne();
      s.view.frame(1 / 120, 1, { yaw: p.yaw, pitch: p.pitch }, { dx: 0, dy: 0 });
      const cam = app.renderer.camera; cam.updateMatrixWorld(true);
      const yaw = p.yaw + (p.aimPunchYaw + p.flinchYaw) * Math.PI / 180;
      const pitch = p.pitch + (p.aimPunchPitch + p.flinchPitch) * Math.PI / 180;
      const direction = p.eyePos().set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const ndc = cam.position.clone().addScaledVector(direction, 100).project(cam);
      const aimErrorPx = Math.hypot((ndc.x - s.view.aimNdc.x) * innerWidth / 2, (ndc.y - s.view.aimNdc.y) * innerHeight / 2);
      // Freeze this real shot's presentation for a reproducible screenshot.
      const vm = app.renderer.viewModel, update = vm.update.bind(vm);
      vm.update = (v) => update({ ...v, dt: 0 });
      const fx = app.renderer.effects, fxUpdate = fx.update.bind(fx);
      fx.update = (...v) => { v[0] = 0; fxUpdate(...v); };
      const hudUpdate = s.hud.update.bind(s.hud);
      s.hud.update = (...v) => { v[0] = 0; hudUpdate(...v); };
      window.__unfreezeFX = () => { vm.update = update; fx.update = fxUpdate; s.hud.update = hudUpdate; };
      return { aimErrorPx, recoil: p.aimPunchPitch, flashVisible: vm.flash.visible, ammoUsed: before - p.activeWeapon().mag };
    });
    assert(r.aimErrorPx < 0.05, `${id}: reticle must match the current shot direction during recoil`);
    assert.equal(r.ammoUsed, 1, `${id}: the visual check must fire a real shot`);
    report.aim.push({ id, ads, ...r });
    await page.screenshot({ path: `${out}/${id}-${ads ? 'aimed' : 'hip'}-firing.png` });
    await page.evaluate(() => window.__unfreezeFX());
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('GUNPLAY CHECK PASSED', JSON.stringify(report), 'no console errors');
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally {
  await browser.close(); await server.close();
}
