// Zombies check: menus → mode select → a real Zombies game with a bot squad, then staged
// shots of every zombie type, the machines, power-ups, hazards, downed / revive, the armory,
// exfil and game over. Fails on console errors.   node scripts/zombies-look.mjs [--no-build] [--swiftshader]
import { preview, build } from 'vite';
import { launchBrowser } from './lib/browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'screenshots/zombies';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4191 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(120000);
const errors = [];
const report = { checks: [], horde: {}, result: null, errors };
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }));
const step = async (label, fn) => { const t = Date.now(); await fn(); const seconds = (Date.now() - t) / 1000; report.checks.push({ label, seconds }); console.log(`  ✓ ${label} (${seconds.toFixed(1)}s)`); };
const clean = () => page.evaluate(() => { for (const el of document.querySelectorAll('.click-to-play')) el.remove(); });

await page.addInitScript(() => {
  localStorage.setItem('aci-snd-profile-v1', JSON.stringify({ settings: { announcer: false, quality: 'medium' } }));
});

await step('title + menu', async () => {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen');
  await wait(1400);
  await shot('01-title');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.mm-home');
  await wait(900);
  await page.hover('.mm-item.primary');
  await wait(400);
  await shot('02-menu');
});

await step('mode select', async () => {
  await page.click('.mm-item.primary');
  await wait(800);
  await page.hover('.ms-card.zombies', { position: { x: 300, y: 120 } });
  await wait(500);
  await shot('03-mode-select');
  await page.click('.ms-card.zombies');
  await wait(800);
  await page.click('.ms-squad-btn >> text=Squad of 3');
  await wait(1200);
  await shot('04-zombies-setup');
});

await step('start zombies', async () => {
  await page.click('.ms-start >> text=Start match');
  await page.waitForSelector('.zhud');
  await page.evaluate(() => { const { match } = window.__aci; const p = match.player; p.maxHealth = p.health = 1e6; });
  await wait(1500);
  await clean();
  await shot('05-lobby-start');
});

await step('first waves with the squad', async () => {
  await page.evaluate(() => { const s = window.__aci.session; s.timeScale = 3; });
  await page.waitForFunction(() => window.__aci.match.wave >= 1 && window.__aci.match.aliveZombies().length >= 2, null, { timeout: 120000 });
  await page.evaluate(() => { const s = window.__aci.session; s.timeScale = 1; });
  await wait(1500);
  await clean();
  console.log('    wave', await page.evaluate(() => window.__aci.match.wave), 'alive', await page.evaluate(() => window.__aci.match.aliveZombies().length));
  await shot('06-wave1-live');
  await page.evaluate(() => { window.__aci.session.timeScale = 4; });
  await page.waitForFunction(() => window.__aci.match.wave >= 2, null, { timeout: 180000 });
  await page.evaluate(() => { window.__aci.session.timeScale = 1; });
  await wait(600);
  await clean();
  await shot('07-wave2-banner');
});

const stage = async (fn, arg) => page.evaluate(fn, arg);
await step('wall-buy prompt + purchase', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugKillAll();
    const p = match.player;
    p.money = 50000;
    const w = match.wallBuys.find((x) => x.weapon === 'judge');
    const fx = w.pos.x - Math.sin(w.yaw) * 1.1, fz = w.pos.z - Math.cos(w.yaw) * 1.1;
    const yaw = Math.atan2(-(w.pos.x - fx), -(w.pos.z - fz));
    match.debugTeleport(p, fx, fz, yaw, -0.05);
    session.ctrl.yaw = yaw; session.ctrl.pitch = -0.05;
  });
  await wait(700);
  await clean();
  await shot('08-wallbuy-prompt');
});

await step('real keys: F buys a wall weapon, F opens the Armory, number keys buy', async () => {
  await stage(() => window.__aci.session.lock());
  await wait(300);
  const tap = async (key) => { await page.keyboard.down(key); await wait(120); await page.keyboard.up(key); await wait(250); };
  await tap('KeyF');
  const bought = await page.evaluate(() => [window.__aci.match.player.primary?.def.id, window.__aci.match.player.secondary?.def.id]);
  console.log('    after F at the Judge:', bought.join(' + '));
  if (!bought.includes('judge')) throw new Error('F did not buy the wall weapon');
  await stage(() => {
    const { match, session } = window.__aci;
    const p = match.player, a = match.armoryPos;
    const fx = a.x - Math.sin(a.yaw) * 1.25, fz = a.z - Math.cos(a.yaw) * 1.25;
    const yaw = Math.atan2(-(a.x - fx), -(a.z - fz));
    match.debugTeleport(p, fx, fz, yaw, -0.25);
    session.ctrl.yaw = yaw; session.ctrl.pitch = -0.25;
  });
  await wait(300);
  await tap('KeyF');
  await page.waitForSelector('.armory', { state: 'visible', timeout: 5000 });
  await tap('Digit2');
  const stun = await page.evaluate(() => window.__aci.match.player.grenades.stun);
  await tap('KeyF');
  const closed = await page.evaluate(() => !window.__aci.session.armory.visible);
  console.log('    armory: stun grenades', stun, '· closed with F:', closed);
  if (stun < 1 || !closed) throw new Error('armory key flow failed');
});

await step('zombie motion: rise, walk, headshot, sink', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugClear();
    match.wavePhase = 'intermission'; match.phaseUntil = match.time + 999;
    const p = match.player;
    match.debugTeleport(p, 4, -37.2, Math.PI, -0.08);
    session.ctrl.yaw = Math.PI; session.ctrl.pitch = -0.08;
    window.__z = match.spawnZombie('walker', 4, -32);
  });
  await wait(450);
  await clean();
  await shot('23-rise');
  await wait(1500);
  await shot('24-walk');
  await stage(() => { const { match } = window.__aci; const z = window.__z; match.applyDamage(z, match.player, { health: 99999, armor: 0 }, 'head', 'ravager', z.eyePos(), z.pos.clone().normalize()); });
  await wait(450);
  await shot('25-headshot');
  await wait(3200);
  await shot('26-corpse-sinking');
});

await step('power on, perks, box, forge', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugOpenAll();
    match.turnOnPower(match.player);
    const p = match.player;
    const m = match.perkMachines.find((x) => x.perk === 'ironGut');
    const fx = m.pos.x - Math.sin(m.yaw) * 2.6, fz = m.pos.z - Math.cos(m.yaw) * 2.6;
    const yaw = Math.atan2(-(m.pos.x - fx), -(m.pos.z - fz));
    match.debugTeleport(p, fx, fz, yaw, 0.08);
    session.ctrl.yaw = yaw; session.ctrl.pitch = 0.08;
  });
  await wait(3200);
  await clean();
  await shot('09-perk-machine-powered');
  await stage(() => {
    const { match, session } = window.__aci;
    const p = match.player, b = match.box;
    const fx = b.pos.x - Math.sin(b.yaw) * 3, fz = b.pos.z - Math.cos(b.yaw) * 3;
    const yaw = Math.atan2(-(b.pos.x - fx), -(b.pos.z - fz));
    match.debugTeleport(p, fx, fz, yaw, -0.12);
    session.ctrl.yaw = yaw; session.ctrl.pitch = -0.12;
    match.useBox(p);
  });
  await wait(1600);
  await clean();
  await shot('10-mystery-box-spin');
  await wait(3200);
  await shot('11-mystery-box-ready');
  await stage(() => {
    const { match, session } = window.__aci;
    const p = match.player, f = match.forge;
    match.takeBoxWeapon(p);
    match.giveWeapon(p, 'ravager');
    const fx = f.pos.x - Math.sin(f.yaw) * 3.4, fz = f.pos.z - Math.cos(f.yaw) * 3.4;
    const yaw = Math.atan2(-(f.pos.x - fx), -(f.pos.z - fz));
    match.debugTeleport(p, fx, fz, yaw, 0.08);
    session.ctrl.yaw = yaw; session.ctrl.pitch = 0.08;
    match.startForge(p);
  });
  await wait(1500);
  await clean();
  await shot('12-forge-working');
  await wait(3000);
  await stage(() => { const { match } = window.__aci; match.takeForged(match.player); });
  await wait(1200);
  await shot('13-forged-weapon');
});

await step('zombie lineup', async () => {
  for (const [i, kinds] of [['walker', 'runner', 'crawler', 'brute', 'bloater'], ['bomber', 'spitter', 'armored', 'shrieker', 'tank']].entries()) {
    await stage((kinds) => {
      const { match, session } = window.__aci;
      match.debugClear();
      match.wavePhase = 'intermission'; match.phaseUntil = match.time + 999;
      const p = match.player;
      match.debugTeleport(p, 4, -37.2, Math.PI, -0.06);
      session.ctrl.yaw = Math.PI; session.ctrl.pitch = -0.06;
      kinds.forEach((k, j) => {
        const z = match.spawnZombie(k, -1.2 + j * 2.6 + (k === 'tank' ? 0.6 : 0), -31.5);
        z.zombie.mode = 'chase'; z.zombie.modeUntil = 0;
        z.yaw = 0; z.motor.bodyYaw = 0;
      });
      session.paused = true;
      session.view.beforeStep(); session.view.afterStep();
    }, kinds);
    await wait(900);
    await clean();
    await shot(`14-lineup-${i + 1}`);
    await stage(() => { window.__aci.session.paused = false; });
  }
});

await step('special attack tells + close-up detail', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugClear(); session.paused = true;
    match.wavePhase = 'active'; match.wave = 10; match.waveKindNow = 'boss';
    match.waveTotal = 24; match.spawned = 2; match.killedThisWave = 0;
    const p = match.player;
    match.debugTeleport(p, 4, -37.2, Math.PI, -0.24);
    session.ctrl.yaw = Math.PI; session.ctrl.pitch = -0.24;
    const bomber = match.spawnZombie('bomber', 1.8, -31.5);
    Object.assign(bomber.zombie, { mode: 'fuse', modeAt: match.time - 0.5, modeUntil: match.time + 0.4, targetId: p.id });
    const tank = match.spawnZombie('tank', 10, -28.5);
    Object.assign(tank.zombie, { mode: 'roar', modeAt: match.time - 0.5, modeUntil: match.time + 0.5, targetId: p.id });
    session.view.beforeStep(); session.view.afterStep();
  });
  await wait(650); await clean();
  await page.waitForSelector('.z-threat:not(.hidden)');
  const warnings = await stage(() => [...window.__aci.session.zview.warnings.values()].filter((w) => w.root.visible).length);
  if (warnings !== 2) throw new Error(`Expected two world attack tells, got ${warnings}`);
  await shot('27-special-attack-tells');
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugClear();
    const z = match.spawnZombie('walker', 4.2, -35.1);
    z.zombie.mode = 'chase'; z.yaw = 0; z.motor.bodyYaw = 0;
    session.ctrl.pitch = 0.02;
    session.view.beforeStep(); session.view.afterStep();
  });
  await wait(400); await shot('28-zombie-detail');
  await stage(() => { const { match, session } = window.__aci; match.wavePhase = 'intermission'; match.phaseUntil = match.time + 999; session.paused = false; });
});

await step('simultaneous machine displays + quality presets', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    session.paused = true;
    Object.assign(match.box, { state: 'ready', weapon: 'ravager', userId: match.player.id, until: match.time + 99 });
    Object.assign(match.forge, { state: 'working', weapon: 'ravager', ownerId: match.player.id, startedAt: match.time - 2, until: match.time + 99 });
  });
  await wait(250);
  const displays = await stage(() => {
    const { match, session } = window.__aci, v = session.zview;
    const box = v.boxes[match.box.spot].getObjectByName('show').children[0];
    const forge = v.forge.getObjectByName('show').children[0];
    return { separate: box !== forge, boxVisible: box?.visible, forgeHidden: !forge?.visible };
  });
  if (!displays.separate || !displays.boxVisible || !displays.forgeHidden) throw new Error(`Machine model reuse failed: ${JSON.stringify(displays)}`);
  await stage(() => {
    const { match } = window.__aci;
    Object.assign(match.box, { state: 'idle', weapon: null, userId: null });
    Object.assign(match.forge, { state: 'idle', weapon: null, ownerId: null });
  });
  for (const quality of ['low', 'high', 'medium']) {
    await stage((quality) => { const { app } = window.__aci; app.profile.settings.quality = quality; app.applySettings(app.profile.settings); }, quality);
    await wait(450); await shot(`30-zombies-${quality}`);
  }
  await stage(() => { window.__aci.session.paused = false; });
});

await step('power-ups and hazards', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugClear();
    const p = match.player;
    match.debugTeleport(p, 4, -37.2, Math.PI, -0.2);
    session.ctrl.yaw = Math.PI; session.ctrl.pitch = -0.2;
    ['maxAmmo', 'instaKill', 'doublePoints', 'nuke', 'carpenter', 'fireSale', 'bonusPoints'].forEach((k, j) => {
      const pu = match.dropPowerUp(k, p.pos.clone().set(-2 + j * 2, 0, -31.5));
      pu.born = match.time;
    });
  });
  await wait(900);
  await clean();
  await shot('15-powerups');
  await stage(() => {
    const { match } = window.__aci;
    match.powerUps.length = 0;
    const b = match.spawnZombie('bloater', 1, -32);
    match.applyDamage(b, match.player, { health: 1e6, armor: 0 }, 'chest', 'p30', b.pos.clone(), b.pos.clone().normalize());
    const s = match.spawnZombie('spitter', 9, -29);
    s.zombie.mode = 'chase';
    match.acid.push({ id: 9999, pos: s.pos.clone().set(7, 0, -33), start: match.time, until: match.time + 8, radius: 2.2 });
  });
  await wait(1400);
  await clean();
  await shot('16-gas-and-acid');
});

await step('downed + revive', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugClear();
    const p = match.player;
    p.maxHealth = 100; p.health = 100;
    match.debugTeleport(p, 3, -33, Math.PI * 0.8, 0);
    session.ctrl.yaw = Math.PI * 0.8;
    for (const b of match.humans) if (b !== p) match.debugTeleport(b, 3 + Math.random() * 6, -28 - Math.random() * 3, 0, 0);
    match.applyDamage(p, null, { health: 999, armor: 0 }, 'chest', 'zombie', p.pos.clone(), p.pos.clone().normalize());
  });
  await wait(1200);
  await clean();
  await shot('17-downed');
  const revived = await page.waitForFunction(() => !window.__aci.match.player.zp.downed, null, { timeout: 30000 }).then(() => true).catch(() => false);
  console.log('    bot revived the player:', revived);
  if (!revived) throw new Error('Bot did not revive the player');
  await page.waitForSelector('.z-protection:not(.hidden)');
  await shot('29-revive-protection');
  await stage(() => { const p = window.__aci.match.player; p.maxHealth = p.health = 1e6; });
});

await step('armory + scoreboard', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    const p = match.player, a = match.armoryPos;
    const fx = a.x - Math.sin(a.yaw) * 1.2, fz = a.z - Math.cos(a.yaw) * 1.2;
    match.debugTeleport(p, fx, fz, Math.atan2(-(a.x - fx), -(a.z - fz)), -0.2);
    session.openArmory();
  });
  await wait(500);
  await shot('18-armory');
  await page.keyboard.press('Digit8');
  await wait(200);
  await stage(() => { const s = window.__aci.session; s.closeArmory(); s.scoreboard.show(true); });
  await wait(300);
  await shot('19-scoreboard');
  await stage(() => window.__aci.session.scoreboard.show(false));
});

await step('horde frame rate', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugClear();
    match.wavePhase = 'intermission'; match.phaseUntil = match.time + 999;
    const p = match.player;
    match.debugTeleport(p, 4, -37.2, Math.PI, -0.05);
    session.ctrl.yaw = Math.PI; session.ctrl.pitch = -0.05;
    for (let i = 0; i < 24; i++) {
      const z = match.spawnZombie(['walker', 'runner', 'walker', 'brute', 'crawler', 'walker'][i % 6], -8 + (i % 8) * 3, -26 + Math.floor(i / 8) * 2.5);
      if (z) { z.zombie.mode = 'chase'; }
    }
  });
  await wait(1500);
  report.horde = { quality: 'medium', zombies: 24, fps: await fps(), ...await stage(() => ({ drawCalls: window.__aci.session.r.renderer.info.render.calls, triangles: window.__aci.session.r.renderer.info.render.triangles })) };
  console.log('    FPS with a 24-zombie horde on screen (medium):', report.horde.fps);
  await clean();
  await shot('20-horde');
});

await step('exfil + game over', async () => {
  await stage(() => {
    const { match, session } = window.__aci;
    match.debugKillAll();
    match.wave = 10;
    match.exfil.phase = 'available';
    match.callExfil(match.player);
    const lz = match.layout.lz, p = match.player;
    match.debugTeleport(p, lz.x - 5, lz.z + 1, -1.1, 0.32);
    session.ctrl.yaw = -1.1; session.ctrl.pitch = 0.32;
  });
  await wait(1200);
  await page.waitForFunction(() => window.__aci.match.exfil.phase === 'holding', null, { timeout: 10000 });
  await stage(() => { const { match } = window.__aci; match.exfil.until = match.time + 5; });
  await wait(3500);
  await clean();
  await shot('21-exfil-chopper');
  await page.waitForSelector('.z-end', { timeout: 20000 });
  await wait(800);
  await shot('22-exfil-success');
});

const final = await page.evaluate(() => ({ won: window.__aci.match.won, wave: window.__aci.match.wave, kills: window.__aci.match.totalKills }));
console.log('result', JSON.stringify(final));
report.result = final;
if (!final.won) errors.push('Exfil did not finish with a win');
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
await server.close();
if (errors.length) { console.log('CONSOLE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
