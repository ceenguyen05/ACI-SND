// Focused visual regression: actual character / weapon rigs and interpolated stair camera.
// Run: node scripts/checks/movement-check.mjs [--no-build]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build, preview } from 'vite';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';

const out = 'screenshots/movement';
mkdirSync(out, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4184 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e.stack || e)));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen', { timeout: 60000 });
  await page.keyboard.press('Enter');
  await startFromMenu(page, 'snd', false, 'Defenders');
  await page.waitForSelector('.hud');
  const result = await page.evaluate(async () => {
    const { match, session, app } = window.__aci;
    session.paused = true;
    // Drive presentation deterministically; the app can keep rendering the staged frame.
    session.update = () => {};
    const r = app.renderer, view = session.view, player = match.player;
    const stairs = [];
    for (const rise of [0.3, -0.3]) {
      match.debugTeleport(player, -1, 15, 0);
      player.motor.onGround = true;
      view.stairs.reset();
      view.beforeStep(); view.afterStep();
      const oldY = player.eyePos().y;
      view.beforeStep(); player.pos.y += rise; view.afterStep();
      for (const alpha of [0, 0.25, 0.5, 1]) {
        view.frame(0, alpha, { yaw: 0, pitch: 0 }, { dx: 0, dy: 0 });
        stairs.push({ rise, alpha, error: r.camera.position.y - oldY });
      }
    }
    for (const e of view.chars.values()) { e.model.root.visible = false; e.xray.visible = false; e.shadow.visible = false; }
    const target = match.agents.find(a => a !== player);
    const model = view.chars.get(target.id).model;
    model.root.visible = true; model.root.position.set(-1, 0, 10); model.setHeld('w:ravager');
    r.showViewModel = false; r.camera.position.set(-1, 1.15, 13.2); r.camera.rotation.set(0, 0, 0, 'YXZ');
    const base = { speed: 6.35, maxSpeed: 6.35, forward: 6.35, right: 0, crouch: 0, pitch: 0, lean: 0,
      onGround: true, dead: false, deathT: 0, firing: 0, planting: false, dt: 1 / 60 };
    const frames = [];
    for (const [name, yaw, override] of [
      ['Run', Math.PI / 2, {}], ['Strafe', 0, { forward: 0, right: 6.35 }],
      ['Backpedal', Math.PI / 2, { forward: -6.35 }], ['Crouch', Math.PI / 2, { speed: 2.15, forward: 2.15, crouch: 1 }],
      ['Slide', Math.PI / 2, { slide: 1, crouch: 1 }],
    ]) {
      model.root.rotation.y = yaw;
      for (let i = 0; i < 120; i++) model.update({ ...base, ...override });
      for (let i = 0; i < 4; i++) {
        model.gait.phase = i / 4 * Math.PI * 2;
        model.update({ ...base, ...override, dt: 0 }); r.render();
        const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 280;
        canvas.getContext('2d').drawImage(r.canvas, 400, 120, 480, 560, 0, 0, 240, 280);
        frames.push({ label: `${name} · ${i + 1}`, url: canvas.toDataURL() });
      }
    }
    model.root.visible = false;
    const vm = r.viewModel;
    vm.setItem('w:ravager'); r.showViewModel = true; r.camera.position.set(-1, 1.63, 15);
    const idle = { dt: 1 / 60, speed: 0, maxSpeed: 6.35, forwardSpeed: 0, lateralSpeed: 0, verticalSpeed: 0,
      onGround: true, crouch: 0, lookDX: 0, lookDY: 0, ads: false, scoped: false, reload: 0, draw: 1,
      planting: false, defusing: false, throwPrimed: false };
    const weapons = [], weaponPoses = [];
    for (const [name, override] of [['Idle', {}], ['Running', { speed: 6.35, forwardSpeed: 6.35 }],
      ['Running ADS', { speed: 6.35, forwardSpeed: 6.35, ads: true, busy: true }], ['Landing', {}]]) {
      for (let i = 0; i < 120; i++) vm.update({ ...idle, ...override });
      if (name === 'Landing') { vm.onLand(true); for (let i = 0; i < 3; i++) vm.update(idle); }
      r.render(); weapons.push({ label: name, url: r.canvas.toDataURL() });
      weaponPoses.push({ name, position: vm.rig.position.toArray(), rotation: vm.rig.rotation.toArray().slice(0, 3) });
    }
    const sheet = async (frames, width, height, cols) => {
      const c = document.createElement('canvas'); c.width = width * cols; c.height = (height + 28) * Math.ceil(frames.length / cols);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#172029'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
      for (let i = 0; i < frames.length; i++) {
        const im = new Image(); im.src = frames[i].url; await im.decode();
        const x = i % cols * width, y = Math.floor(i / cols) * (height + 28);
        ctx.drawImage(im, x, y, width, height); ctx.fillText(frames[i].label, x + 8, y + height + 20);
      }
      return c.toDataURL();
    };
    return { stairs, weaponPoses, gait: await sheet(frames, 240, 280, 4), weapons: await sheet(weapons, 640, 360, 2) };
  });
  for (const s of result.stairs) assert(Math.abs(s.error) < 1e-6, `stair interpolation: ${JSON.stringify(s)}`);
  for (const pose of result.weaponPoses) assert([...pose.position, ...pose.rotation].every(Number.isFinite));
  for (const name of ['gait', 'weapons']) {
    writeFileSync(`${out}/${name}.png`, Buffer.from(result[name].split(',')[1], 'base64')); delete result[name];
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...result, errors }, null, 2));
  console.log('MOVEMENT CHECK PASSED', JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
