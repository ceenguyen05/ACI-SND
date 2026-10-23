// Headless end-to-end smoke test.
// Builds are served with `vite preview`, then Chromium (via Playwright) clicks through
// Title → Main menu → Agents → Loadout → Start match → Buy menu, and finally runs an
// accelerated all-bot match (?autotest=1) until rounds complete. Fails on any console error.
// Screenshots are written to ./screenshots.
import { preview, build } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });
const skipBuild = process.argv.includes('--no-build');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

if (!skipBuild) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4173, strictPort: false }, logLevel: 'warn' });
const url = server.resolvedUrls.local[0];
console.log('serving', url);

const browser = await chromium.launch({
  args: process.argv.includes('--swiftshader')
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const fps = () => page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));

try {
  if (!only || only === 'ui') {
    await page.goto(url);
    await page.waitForSelector('.title-screen', { timeout: 60000 });
    await wait(1500);
    console.log('title FPS:', await fps());
    await shot('01-title');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.menu');
    await wait(800);
    await shot('02-menu-play');
    await page.click('text=Agents');
    await wait(800);
    await shot('03-menu-agents');
    await page.click('text=Loadout');
    await wait(800);
    await shot('04-menu-loadout');
    await page.click('.nav-item >> text=Settings');
    await wait(400);
    await page.click('.seg >> text=Crosshair');
    await wait(300);
    await shot('05-menu-settings');
    await page.click('text=How to play');
    await wait(300);
    await shot('06-menu-help');
    await page.click('.nav-item >> text=Play');
    await page.click('.seg >> text=Attackers');
    await page.click('text=Start match');
    await page.waitForSelector('.hud', { timeout: 60000 });
    await wait(2500);
    for (const q of ['low', 'medium', 'high']) {
      await page.evaluate((q) => { const a = window.__aci.app; a.profile.settings.quality = q; a.applySettings(a.profile.settings); }, q);
      await wait(800);
      console.log(`in-game FPS (${q}):`, await fps());
      await shot(`07-ingame-spawn-${q}`);
    }
    await page.evaluate(() => { const a = window.__aci.app; a.profile.settings.quality = 'medium'; a.applySettings(a.profile.settings); });
    await shot('07-ingame-spawn');
    // simulate the player: buy a rifle via the buy menu
    await page.evaluate(() => { const s = window.__aci.session; s.input.gameFocus = true; });
    await page.keyboard.press('KeyB');
    await wait(500);
    await shot('08-buy-menu');
    // weapons tab → pistol, gadgets tab → grenades (the menu is split into Weapons / Gadgets / Utilities)
    for (const [tab, item] of [['Weapons', 'P-30 Duty'], ['Gadgets', 'Flashbang'], ['Gadgets', 'Decoy']]) {
      await page.click(`.buy-tab >> text=${tab}`, { timeout: 2000 }).catch(() => errors.push('buy tab failed: ' + tab));
      await page.click(`.buy-item >> text=${item}`, { timeout: 2000 }).catch(() => errors.push('buy click failed: ' + item));
    }
    await wait(300);
    await shot('09-buy-menu-after');
    await page.keyboard.press('KeyB');
    const bought = await page.evaluate(() => {
      const p = window.__aci.match.player;
      return { secondary: p.secondary?.def.id ?? null, armor: p.armor, helmet: p.helmet, money: p.money, flash: p.grenades.flash };
    });
    console.log('player after buying:', bought);
    if (bought.secondary !== 'p30' || bought.flash !== 1 || bought.money !== 250) errors.push('buying failed: ' + JSON.stringify(bought));
    // ---- player combat: teleport an enemy in front of the player and shoot it with real mouse events
    await page.evaluate(() => {
      const { match, session } = window.__aci;
      match.skipFreeze();
      window.__hits = 0; window.__kills = 0;
      match.events.on('hit', (e) => { if (e.attackerId === match.player.id) window.__hits++; });
      match.events.on('kill', (e) => { if (e.killerId === match.player.id) window.__kills++; });
      session.input.locked = true; session.input.gameFocus = true; // emulate pointer lock
    });
    await wait(300);
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => {
        const { match, session } = window.__aci;
        const p = match.player; p.health = 1e9;
        const enemy = match.agents.find((a) => a.team !== p.team && a.alive);
        if (!enemy) return;
        match.debugTeleport(p, -1, 15, 0, 0);
        match.debugTeleport(enemy, -1, 9, Math.PI, 0);
        session.ctrl.yaw = 0; session.ctrl.pitch = Math.atan2(enemy.height * 0.62 - p.eyeHeight, 6);
      });
      await page.mouse.down(); await wait(60); await page.mouse.up(); await wait(220);
    }
    const combat = await page.evaluate(() => ({ hits: window.__hits, kills: window.__kills }));
    console.log('player combat:', combat);
    if (combat.hits < 3) errors.push('player could not hit a target: ' + JSON.stringify(combat));
    await shot('09b-player-combat');
    await page.evaluate(() => { window.__aci.session.input.locked = false; });
    // look around & fire a burst programmatically (pointer lock is unavailable headless)
    await page.evaluate(() => { const m = window.__aci.match; m.skipFreeze(); });
    await page.keyboard.down('KeyW');
    await wait(1200);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('Tab');
    await wait(200);
    await shot('10-ingame-moving');
    const state = await page.evaluate(() => {
      const m = window.__aci.match;
      return { phase: m.phase, round: m.round, alive: m.agents.filter((a) => a.alive).length, time: m.time };
    });
    console.log('in-game state:', state);
    await page.evaluate(() => window.__aci.session.onExit());
    await wait(500);
  }

  if (!only || only === 'auto') {
    await page.goto(url + '?autotest=1&speed=10');
    await page.waitForSelector('.hud', { timeout: 60000 });
    const t0 = Date.now();
    let n = 0;
    for (;;) {
      await wait(4000);
      const st = await page.evaluate(() => {
        const m = window.__aci.match;
        return { phase: m.phase, round: m.round, history: m.history.map((h) => `${h.winner}/${h.reason}`), alive: m.agents.filter((a) => a.alive).length, time: Math.round(m.time) };
      });
      console.log(`[autotest ${Math.round((Date.now() - t0) / 1000)}s]`, JSON.stringify(st));
      if (n < 6) await shot(`20-autotest-${n++}`);
      if (st.phase === 'matchOver' || st.history.length >= 2) break;
      if (Date.now() - t0 > 240000) { errors.push('autotest timed out'); break; }
    }
    await shot('29-autotest-end');
  }
} catch (e) {
  errors.push('test script error: ' + (e.stack || e));
  await shot('99-failure').catch(() => {});
}

await browser.close();
await server.close();
if (errors.length) {
  console.error(`\nSMOKE TEST FAILED (${errors.length} errors):`);
  for (const e of errors.slice(0, 20)) console.error(' -', e);
  process.exit(1);
}
console.log('\nSMOKE TEST PASSED');
