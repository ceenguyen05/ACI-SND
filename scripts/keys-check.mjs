// Drives the new combat keys through the real browser input path:
// V quick melee, H self-stim, 7 killstreak, Z detonate C4, T cameras, and the stim dart.
//   node scripts/keys-check.mjs [--no-build]
import { preview, build } from 'vite';
import { chromium } from 'playwright';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4179 }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await page.click('.seg >> text=Defenders');
await page.click('text=Start match');
await page.waitForSelector('.hud');
await page.evaluate(() => {
  const { match, session } = window.__aci;
  match.skipFreeze();
  session.input.locked = true; session.input.gameFocus = true;
  for (const el of document.querySelectorAll('.click-to-play')) el.remove();
  window.__ev = { quickMelee: 0, stimSelf: 0, streak: 0, c4: 0, operate: 0, dart: 0, ping: 0 };
  const p = match.player;
  match.events.on('quickMelee', (e) => { if (e.agentId === p.id) window.__ev.quickMelee++; });
  match.events.on('stimHeal', (e) => { if (e.targetId === p.id && e.self) window.__ev.stimSelf++; });
  match.events.on('killstreakUsed', (e) => { if (e.agentId === p.id) window.__ev.streak++; });
  match.events.on('c4Detonate', (e) => { if (e.agentId === p.id) window.__ev.c4++; });
  match.events.on('operate', (e) => { if (e.agentId === p.id) window.__ev.operate++; });
  match.events.on('gadgetDeploy', (e) => { if (e.agentId === p.id && e.kind === 'stim') window.__ev.dart++; });
  match.events.on('teamPing', (e) => { if (e.agentId === p.id) window.__ev.ping++; });
  // keep bots away so nothing interrupts the checks
  for (const a of match.agents) if (a !== p) { a.health = 1e9; match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0); }
  p.health = 50;
});
await page.waitForTimeout(400);
const step = async (fn, key, wait = 500) => { if (fn) await page.evaluate(fn); await page.keyboard.press(key); await page.waitForTimeout(wait); };
await step(null, 'KeyV');
await step(() => { const { match } = window.__aci; match.player.gadgets.stim = 3; }, 'KeyH', 800);
await step(() => { const { match } = window.__aci; match.debugGiveStreak(match.player, 'uav'); }, 'Digit7');
await step(() => {
  const { match } = window.__aci;
  const p = match.player;
  // place a C4 charge directly in front of the player, then detonate it with Z
  const d = match.gadgets.make('c4', p.team, p.id, p.pos.clone().set(p.pos.x + 30, 0.1, p.pos.z));
  void d;
}, 'KeyZ');
await step(null, 'KeyT', 400);
await step(null, 'KeyT', 400);
// ping with the middle mouse button
await page.mouse.down({ button: 'middle' }); await page.waitForTimeout(60); await page.mouse.up({ button: 'middle' }); await page.waitForTimeout(300);
// stim dart: equip the stim with 6 and fire with the mouse
await page.evaluate(() => { const { match } = window.__aci; match.player.gadgets.stim = 3; match.player.stimReadyAt = 0; });
await page.keyboard.press('Digit6'); await page.waitForTimeout(700);
await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(400);
// weapon light: a rifle with a Tactical Light from the Gunsmith, toggled with L
await page.evaluate(() => {
  const { match } = window.__aci;
  match.player.loadouts.sentinel = { owned: ['flashlight'], equipped: { laser: 'flashlight' } };
  match.debugGive(match.player, 'sentinel');
});
await page.waitForTimeout(300);
await page.keyboard.press('KeyL'); await page.waitForTimeout(250);
const lightOn = await page.evaluate(() => window.__aci.match.player.lightOn);
await page.keyboard.press('KeyL'); await page.waitForTimeout(250);
const lightOff = await page.evaluate(() => !window.__aci.match.player.lightOn);
const ev = await page.evaluate(() => ({ ...window.__ev, hp: window.__aci.match.player.health, held: window.__aci.match.player.activeGadget }));
await browser.close();
await server.close();
console.log(JSON.stringify({ ...ev, lightOn, lightOff }));
const ok = ev.quickMelee === 1 && ev.stimSelf === 1 && ev.streak === 1 && ev.c4 === 1 && ev.operate >= 1 && ev.dart === 1 && ev.ping === 1 && lightOn && lightOff && !errors.length;
console.log(ok ? 'KEYS CHECK PASSED' : 'KEYS CHECK FAILED ' + errors.join('\n'));
process.exit(ok ? 0 : 1);
