// Controlled Zombies render profile: same paused horde, warmed shaders, culling A/B.
// node scripts/zombies-perf.mjs [--no-build]
import { build, preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4192 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.addInitScript(() => localStorage.setItem('aci-snd-profile-v1', JSON.stringify({ settings: { announcer: false, quality: 'medium' } })));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen', { timeout: 60000 });
  await page.keyboard.press('Enter');
  await startFromMenu(page, 'zombies');
  await page.waitForSelector('.zhud');
  await page.evaluate(() => {
    const { match: m, session: s, app } = window.__aci;
    s.paused = true; m.debugClear(); m.debugOpenAll(); m.turnOnPower(null);
    m.wavePhase = 'intermission'; m.phaseUntil = m.time + 999;
    m.debugTeleport(m.player, 4, -37.2, Math.PI, -0.05);
    s.ctrl.yaw = Math.PI; s.ctrl.pitch = -0.05;
    for (let i = 0; i < 24; i++) {
      const z = m.spawnZombie(['walker', 'runner', 'walker', 'brute', 'crawler', 'walker'][i % 6], -8 + (i % 8) * 3, -26 + Math.floor(i / 8) * 2.5);
      z.zombie.mode = 'chase'; z.yaw = 0; z.motor.bodyYaw = 0;
    }
    s.view.beforeStep(); s.view.afterStep();
    document.querySelectorAll('.click-to-play').forEach((el) => el.remove());
    const stats = window.__zPerf = { n: 0, update: 0, render: 0, zview: 0, zModels: 0, hud: 0, calls: 0 };
    const wrap = (obj, key, stat) => { const fn = obj[key].bind(obj); obj[key] = (...args) => { const t = performance.now(); const r = fn(...args); stats[stat] += performance.now() - t; return r; }; };
    wrap(s, 'update', 'update'); wrap(s.zview, 'frame', 'zview'); wrap(s.view, 'frameZombie', 'zModels'); wrap(s.zhud, 'update', 'hud');
    const fn = app.renderer.render.bind(app.renderer);
    app.renderer.render = () => { const t = performance.now(); const result = fn(); stats.render += performance.now() - t; stats.n++; stats.calls += app.renderer.renderer.info.render.calls; return result; };
  });
  await page.waitForTimeout(2000);
  const report = { samples: [], errors };
  for (const [label, culling, props] of [['current', true, true], ['unculled', false, true], ['no-mode-props', true, false], ['current-repeat', true, true]]) {
    await page.evaluate(({ culling, props }) => {
      const { session } = window.__aci;
      for (const e of session.view.chars.values()) if (e.model.kind) e.model.root.traverse((o) => { if (o.isMesh) o.frustumCulled = culling; });
      session.zview.root.visible = props;
    }, { culling, props });
    await page.waitForTimeout(350);
    await page.evaluate(() => { for (const key of Object.keys(window.__zPerf)) window.__zPerf[key] = 0; });
    const t = Date.now(); await page.waitForTimeout(4000); const seconds = (Date.now() - t) / 1000;
    const result = await page.evaluate(() => {
      const p = window.__zPerf, n = Math.max(1, p.n);
      return { frames: p.n, updateMs: p.update / n, renderMs: p.render / n, propsMs: p.zview / n, modelsMs: p.zModels / n, hudMs: p.hud / n, drawCalls: Math.round(p.calls / n) };
    });
    report.samples.push({ label, fps: +(result.frames / seconds).toFixed(1), ...result });
    console.log(label, JSON.stringify(report.samples.at(-1)));
  }
  mkdirSync('screenshots/zombies', { recursive: true });
  writeFileSync('screenshots/zombies/performance.json', JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close(); await server.close();
}
