// Visual check: buy-menu Rebuy / Auto-buy, objective markers, round tips, stance HUD, settings.
//   node scripts/qol-look.mjs [--no-build]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots/qol';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4184 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await page.click('.mm-item >> text=Settings');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/settings-game.png` });
await page.click('.mm-back');
await startFromMenu(page, 'snd', false, 'Defenders');
await page.waitForSelector('.hud');
await page.waitForTimeout(1200); // round-1 tip appears
await page.evaluate(() => { for (const el of document.querySelectorAll('.click-to-play')) el.remove(); });
await page.screenshot({ path: `${OUT}/tip-round1.png` });
// buy menu: auto-buy
await page.evaluate(() => { const { match, session } = window.__aci; match.player.money = 6000; session.openBuy(); });
await page.waitForTimeout(200);
await page.click('.buy-qbtn >> text=Auto-buy');
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/buy-autobuy.png` });
await page.evaluate(() => window.__aci.session.closeBuy());
// live: site markers, then a planted bomb
await page.evaluate(() => {
  const { match, session } = window.__aci;
  match.skipFreeze();
  match.player.health = 1e9;
  for (const a of match.agents) if (a !== match.player) { a.health = 1e9; match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0); }
  const p = match.player;
  match.debugTeleport(p, 0, -25, Math.PI * 0.85, 0);
  session.ctrl.yaw = Math.PI * 0.85; session.ctrl.pitch = 0;
});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/objective-markers.png` });
await page.evaluate(() => {
  const { match } = window.__aci;
  const s = match.world.map.plantSpots.B[0];
  match.bomb.state = 'planted'; match.bomb.site = 'B'; match.bomb.plantedAt = match.time; match.bomb.pos.set(s.x, 0, s.z);
  match.phase = 'planted';
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/bomb-marker.png` });
const hud = await page.evaluate(() => {
  const z = document.querySelector('.hud-buyzone')?.getBoundingClientRect();
  const k = document.querySelector('.hud-streaks')?.getBoundingClientRect();
  return { buyzone: z && { top: z.top, bottom: z.bottom }, streaks: k && { top: k.top, bottom: k.bottom } };
});
console.log('hud', JSON.stringify(hud));
await browser.close();
await server.close();
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
