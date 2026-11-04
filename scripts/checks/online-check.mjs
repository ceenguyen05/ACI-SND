// Run with node --import tsx. Uses the actual production server and frontend.
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../../server/index.ts';
import { captureSnapshot } from '../../src/net/snapshot.ts';
import { Vector3 } from 'three';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
mkdirSync('screenshots/online', { recursive: true });
const app = createGameServer();
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const port = app.server.address().port, url = `http://127.0.0.1:${port}`;
const browser = await launchBrowser();
const errors = [], peers = [], report = {};
const contexts = [];
const until = async (fn, message, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(message);
};
// Keep inputs held across render frames. This interactive check requires a GPU.
const twoFrames = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function page(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); contexts.push(context);
  await context.addInitScript(({ name, serverUrl }) => {
    localStorage.setItem('aci-snd-profile-v1', JSON.stringify({ name }));
    localStorage.setItem('aci.online.server', serverUrl);
  }, { name, serverUrl: `${url.replace('http:', 'ws:')}/online` });
  const p = await context.newPage();
  p.setDefaultTimeout(30_000);
  p.on('pageerror', error => errors.push(`${name}: ${error.stack || error}`));
  p.on('console', msg => { if (msg.type() === 'error') errors.push(`${name}: ${msg.text()}`); });
  await p.goto(url);
  await p.waitForSelector('.title-screen', { timeout: 60000 });
  await p.keyboard.press('Enter');
  await p.getByRole('button', { name: /Play Online Public queue/ }).click();
  await p.waitForSelector('.online-panel');
  // The staged firefight below uses ACI HQ coordinates.
  await p.getByLabel('Online map').selectOption('aci_hq');
  console.log(`Online menu ready: ${name}`);
  return p;
}
async function wire() {
  const ws = new WebSocket(`${url.replace('http:', 'ws:')}/online`); peers.push(ws);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return ws;
}
try {
  const a = await page('Owner'), b = await page('Friend');
  await a.screenshot({ path: 'screenshots/online/01-menu.png' });
  await a.getByRole('button', { name: 'Create private match', exact: true }).click();
  await a.waitForSelector('.online-code');
  const code = (await a.locator('.online-code').textContent()).trim();
  assert.match(code, /^\d{5}$/);
  await b.getByLabel('Private match code').fill(code);
  await b.getByRole('button', { name: 'Join private match', exact: true }).click();
  await b.waitForSelector('.online-code');
  for (let i = 0; i < 3; i++) {
    const ws = await wire(); ws.send(JSON.stringify({ type: 'join', name: `Friend ${i + 2}`, code }));
  }
  await until(() => app.lobby.rooms.get(code)?.players.length === 5, 'Five humans did not enter lobby');
  await a.waitForFunction(() => document.querySelector('.online-content')?.textContent.includes('5/6 players'));
  await a.screenshot({ path: 'screenshots/online/02-private-lobby.png' });
  assert.equal(await b.getByRole('button', { name: 'Play now', exact: true }).count(), 0);
  await a.getByRole('button', { name: 'Play now', exact: true }).click();
  await Promise.all([a.waitForSelector('.hud'), b.waitForSelector('.hud')]);
  await Promise.all([a.waitForFunction(() => window.__aci?.match?.remote), b.waitForFunction(() => window.__aci?.match?.remote)]);
  const room = app.lobby.rooms.get(code), m = room.match;
  m.phaseEnd = m.time + 120; // Leave ample buy time for browser automation.
  assert.equal(m.agents.length, 6); assert.equal(m.bots.size, 1);
  const ai = await a.evaluate(() => ({ id: window.__aci.match.player.id, ids: window.__aci.match.agents.map(a => a.id) }));
  const bi = await b.evaluate(() => ({ id: window.__aci.match.player.id, ids: window.__aci.match.agents.map(a => a.id) }));
  assert.notEqual(ai.id, bi.id); assert.deepEqual(ai.ids, bi.ids);
  await a.waitForFunction(() => window.__aci.match.agents.filter(a => a.isBot).length === 1);
  report.privateRoom = { code, humans: 5, bots: m.bots.size, ownerAgent: ai.id, friendAgent: bi.id };
  report.snapshotBytes = Buffer.byteLength(JSON.stringify(captureSnapshot(m)));
  // A browser may initially be waiting for pointer lock: network replication must continue.
  const before = m.tick;
  await a.waitForTimeout(500);
  assert.ok(m.tick > before + 10);
  await b.waitForFunction(tick => window.__aci.match.tick > tick, before);

  // Buy through the browser, and verify money/armor on server and both clients.
  await a.evaluate(() => { const s = window.__aci.session; s.paused = false; s.pause.show(false); s.input.gameFocus = true; s.openBuy(); });
  await a.locator('.buy-tab').filter({ hasText: 'Utilities' }).click();
  await a.getByRole('button', { name: /^Kevlar Vest/ }).click();
  await until(() => m.getAgent(ai.id).armor === 100, 'Browser purchase did not reach authoritative server');
  await b.waitForFunction(id => window.__aci.match.getAgent(id).armor === 100, ai.id);
  report.purchase = { armor: m.getAgent(ai.id).armor, money: m.getAgent(ai.id).money };
  console.log('Browser purchase replicated');
  await a.evaluate(() => window.__aci.session.buy.hide());

  // Keep server geometry/rules intact, but stage stationary players on the known
  // clear lobby lane to test input → authoritative gunfire → replicated damage.
  m.bots.clear(); m.skipFreeze();
  const shooter = m.getAgent(ai.id), target = m.getAgent(bi.id);
  m.debugTeleport(shooter, -1, 15, 0, 0); m.debugTeleport(target, -1, 9, Math.PI, 0);
  target.armor = 0; target.helmet = false;
  await a.evaluate(() => {
    const { session, match } = window.__aci;
    session.paused = false; session.pause.show(false); session.input.gameFocus = true; session.input.locked = true;
    session.clickToPlay.classList.add('hidden'); session.ctrl.yaw = 0;
    session.ctrl.pitch = Math.atan2(1.18 - match.player.eyeHeight, 6);
    window.__onlineHits = 0;
    match.events.on('hit', e => { if (e.attackerId === match.player.id) window.__onlineHits++; });
  });
  await b.evaluate(() => { const s = window.__aci.session; s.paused = false; s.pause.show(false); });
  await a.waitForTimeout(350);
  // Actual mouse fire goes through PlayerController, WebSocket, server WeaponSystem.
  for (let i = 0; i < 6 && target.alive; i++) { await a.mouse.down(); await twoFrames(a); await a.waitForTimeout(80); await a.mouse.up(); await twoFrames(a); await a.waitForTimeout(280); }
  assert.ok(target.health < 100, 'Server did not register browser gunfire');
  await a.waitForFunction(() => window.__onlineHits > 0);
  await b.waitForFunction(id => window.__aci.match.getAgent(id).health < 100, bi.id);
  report.combat = { health: target.health, hits: await a.evaluate(() => window.__onlineHits) };

  // Walk with real keyboard input. The observer and authority must see movement.
  const moveStart = shooter.pos.clone();
  await a.keyboard.down('KeyD'); await twoFrames(a); await a.waitForTimeout(450); await a.keyboard.up('KeyD');
  assert.ok(shooter.pos.distanceTo(moveStart) > .1, 'Server did not move the browser-controlled agent');
  await until(async () => {
    const pos = await b.evaluate(id => window.__aci.match.getAgent(id).pos.toArray(), ai.id);
    return shooter.pos.distanceTo({ x: pos[0], y: pos[1], z: pos[2] }) < .5;
  }, 'Observer did not receive player movement');
  report.movementMeters = shooter.pos.distanceTo(moveStart);
  await a.screenshot({ path: 'screenshots/online/03-gameplay.png' });
  await b.screenshot({ path: 'screenshots/online/04-friend-view.png' });

  await a.evaluate(() => window.__aci.session.setPaused(true));
  const pausedAt = m.tick; await a.waitForTimeout(400);
  assert.ok(m.tick > pausedAt + 10);
  await a.waitForFunction(tick => window.__aci.match.tick > tick, pausedAt);
  report.pauseKeepsMatchRunning = true;
  // Disconnect owner: observer must receive bot takeover of the existing agent.
  await a.evaluate(() => window.__aci.session.quit());
  await until(() => shooter.isBot, 'Disconnect did not give slot to bot');
  await b.waitForFunction(id => window.__aci.match.getAgent(id).isBot, ai.id);
  report.disconnectBotTakeover = true;
  await b.evaluate(() => window.__aci.session.quit());
  for (const ws of peers.splice(0)) ws.close();
  await until(() => app.lobby.rooms.size === 0, 'Empty room leaked');

  // New public matchmaking through both browser menus; full 1v1 starts automatically.
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /Play Online Public queue/ }).click();
    await p.getByLabel('Online team size').selectOption('1');
  }
  await a.getByRole('button', { name: 'Create public match', exact: true }).click();
  await a.waitForSelector('.online-code');
  const publicCode = (await a.locator('.online-code').textContent()).trim();
  await b.getByRole('button', { name: 'Play online', exact: true }).click();
  await Promise.all([a.waitForFunction(() => window.__aci?.session?.match?.rules.teamSize === 1), b.waitForFunction(() => window.__aci?.session?.match?.rules.teamSize === 1)]);
  assert.equal(app.lobby.rooms.get(publicCode).match.bots.size, 0);
  report.publicQueue = { sameRoom: true, fullAutoStart: true, bots: 0 };
  await a.evaluate(() => window.__aci.session.quit()); await b.evaluate(() => window.__aci.session.quit());

  await a.getByRole('button', { name: /Play Online Public queue/ }).click();
  await a.getByLabel('Private match code').fill('00000');
  await a.getByRole('button', { name: 'Join private match', exact: true }).click();
  await a.waitForFunction(() => document.querySelector('.online-status')?.textContent.includes('Room not found'));
  report.invalidCode = true;

  // Cooperative Zombies uses the same room service, with AI enemies and allied
  // bots in vacant survivor slots. Join an existing private code from either menu.
  await a.getByLabel('Online game mode').selectOption('zombies');
  await a.getByRole('button', { name: 'Create private match', exact: true }).click();
  await a.waitForSelector('.online-code');
  const zcode = (await a.locator('.online-code').textContent()).trim();
  await b.getByRole('button', { name: /Play Online Public queue/ }).click();
  await b.getByLabel('Private match code').fill(zcode);
  await b.getByRole('button', { name: 'Join private match', exact: true }).click();
  await b.waitForSelector('.online-code');
  await a.screenshot({ path: 'screenshots/online/05-zombies-lobby.png' });
  await a.getByRole('button', { name: 'Play now', exact: true }).click();
  for (const p of [a, b]) await p.waitForFunction(() => window.__aci?.session.zm?.remote);
  const zr = app.lobby.rooms.get(zcode), z = zr.match;
  assert.equal(z.humans.length, 3); assert.equal(z.allies.size, 1); assert.ok(z.zombiePool.every(e => e.isBot));
  const za = await a.evaluate(() => window.__aci.match.player.id), zb = await b.evaluate(() => window.__aci.match.player.id);
  const owner = z.getAgent(za), friend = z.getAgent(zb), allies = [...z.allies];
  z.allies.clear(); z.wavePhase = 'intermission'; z.phaseUntil = 1e6; z.debugClear(); z.debugOpenAll(); z.turnOnPower(null);
  z.giveWeapon(owner, 'ravager', 1); z.addPerk(owner, 'rapidFire');
  await b.waitForFunction(id => window.__aci.match.getAgent(id).primary?.def.tier === 1 && window.__aci.match.power && window.__aci.match.gates.every(g => g.open), za);
  assert.equal(await b.evaluate(id => window.__aci.match.getAgent(id).primary.def.damage, za), owner.primary.def.damage);
  z.debugTeleport(owner, 4, -30, Math.PI); z.debugTeleport(friend, 4, -28.6, 0);
  z.applyDamage(friend, null, { health: 99999, armor: 0 }, 'chest', 'zombie', friend.pos.clone(), new Vector3(0, 0, 1));
  assert.equal(friend.zp.downed, true);
  await a.evaluate(() => {
    const s = window.__aci.session; s.paused = false; s.pause.show(false); s.input.locked = true; s.input.gameFocus = true;
    s.clickToPlay.classList.add('hidden'); s.ctrl.yaw = Math.PI; s.ctrl.pitch = 0;
  });
  await b.waitForFunction(() => window.__aci.match.player.zp.downed);
  await a.keyboard.down('KeyF');
  await until(() => !friend.zp.downed, 'Coop player could not revive teammate', 12_000);
  await a.keyboard.up('KeyF');
  await b.waitForFunction(() => !window.__aci.match.player.zp.downed);
  assert.equal(owner.zp.stats.revives, 1);
  report.zombies = { humans: 2, alliedBots: 1, enemiesAI: true, sharedGatesAndPower: true, forgedStats: true, teammateRevived: true };
  // Buy from the authoritative Armory using F and its real menu/number binding.
  const arm = z.armoryPos, fx = arm.x - Math.sin(arm.yaw) * 1.25, fz = arm.z - Math.cos(arm.yaw) * 1.25;
  const yaw = Math.atan2(-(arm.x - fx), -(arm.z - fz)); owner.money = 10000;
  z.debugTeleport(owner, fx, fz, yaw, -.25);
  await a.evaluate(yaw => { window.__aci.session.ctrl.yaw = yaw; window.__aci.session.ctrl.pitch = -.25; }, yaw);
  await a.waitForTimeout(350); await a.keyboard.down('KeyF'); await twoFrames(a); await a.keyboard.up('KeyF');
  await a.waitForSelector('.armory:not(.hidden)');
  await a.keyboard.press('Digit2');
  await until(() => owner.grenades.stun === 1, 'Coop Armory purchase did not reach server');
  await b.waitForFunction(id => window.__aci.match.getAgent(id).grenades.stun === 1, za);
  report.zombies.armoryPurchase = true;
  await a.evaluate(() => window.__aci.session.armory.hide());
  await a.screenshot({ path: 'screenshots/online/06-zombies-coop.png' });
  // Controlled finish fixture exercises qualification/result delivery and UTC streaks.
  for (const p of zr.participants) p.activityTicks = 64 * 35;
  z.time = 200; z.wave = 10; z.endGame(true);
  for (const p of [a, b]) await p.waitForFunction(() => window.__aci.app.profile.onlineCareer.matches >= 1);
  await a.waitForSelector('.z-end');
  await a.waitForFunction(() => document.querySelector('.career-result')?.textContent.includes('XP'));
  const career = await a.evaluate(() => window.__aci.app.profile.onlineCareer);
  assert.ok(career.xp > 0); assert.equal(career.streak, 1); assert.equal(career.rank.games, 0);
  report.progression = { onlineXp: career.xp, streak: career.streak, unratedModesKeepRank: career.rank.games === 0 };
  await a.screenshot({ path: 'screenshots/online/07-career-result.png' });
  await a.evaluate(() => window.__aci.session.quit()); await b.evaluate(() => window.__aci.session.quit());
  await a.getByRole('button', { name: /Career & Rank/ }).click();
  await a.waitForSelector('.career-grid');
  await a.waitForTimeout(650);
  await a.screenshot({ path: 'screenshots/online/08-career.png' });
  assert.ok(await a.locator('.career-page').textContent().then(s => s.includes('Unranked') && s.includes('Daily challenges')));
  // The reconnect path resumes the same server-owned career rather than accepting
  // the browser's cached XP/rank as authority.
  await a.getByRole('button', { name: /Back/ }).first().click();
  await a.getByRole('button', { name: /Play Online Public queue/ }).click();
  await a.getByRole('button', { name: 'Load online profile', exact: true }).click();
  await a.waitForFunction(() => document.querySelector('.online-status')?.textContent.includes('profile loaded'));
  assert.equal(await a.locator('.online-career').textContent().then(s => s.includes(`${career.xp.toLocaleString()} XP`)), true);
  report.progression.resumedCareer = true;
  await a.getByRole('button', { name: 'Back', exact: true }).click();
  await startFromMenu(a, 'snd');
  await a.waitForFunction(() => window.__aci?.session && !window.__aci.session.online && !window.__aci.session.zm);
  const offline = await a.evaluate(() => {
    const { app, match } = window.__aci, before = app.profile.career.xp, online = app.profile.onlineCareer.xp;
    const p = match.player, enemy = match.agents.find(e => e.team !== p.team);
    match.applyDamage(enemy, p, { health: 99999, armor: 0 }, 'head', 'ravager', enemy.pos.clone(), enemy.pos.clone().sub(p.pos).normalize());
    return { before, after: app.profile.career.xp, onlineBefore: online, onlineAfter: app.profile.onlineCareer.xp };
  });
  assert.ok(offline.after > offline.before); assert.equal(offline.onlineAfter, offline.onlineBefore);
  report.progression.offlineXpIsSeparate = true;
  await a.screenshot({ path: 'screenshots/online/09-offline-xp.png' });
  await a.evaluate(() => window.__aci.session.quit());
  assert.deepEqual(errors, [], 'Browser errors');
  console.log('Online browser checks passed:', JSON.stringify(report));
} catch (error) {
  errors.push(String(error.stack || error));
  throw error;
} finally {
  writeFileSync('screenshots/online/report.json', JSON.stringify({ ...report, errors }, null, 2));
  for (const ws of peers) ws.terminate();
  for (const ctx of contexts) await ctx.close();
  await browser.close(); await app.close();
}
