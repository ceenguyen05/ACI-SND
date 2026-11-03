// Sight / crosshair alignment check: every gun at the hip and aimed (ADS or scoped) at a target
// 12 m ahead, cropped around the screen centre and tiled into contact sheets. Aimed views also get
// a 3x detail crop with a magenta mark on the exact screen centre (the post / dot should sit on it).
//   node scripts/visual/sights-look.mjs [--no-build] [--only=a,b] [--spray] [--dpr=1.5]
//   --spray: also fire 10 rounds from automatic guns and measure, in pixels, how far the crosshair
//   sits from the last bullet's impact (it should follow the recoil onto the impacts).
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const spray = process.argv.includes('--spray');
const dpr = Number(process.argv.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 1);
const OUT = 'screenshots/sights';
mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4179 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await startFromMenu(page, 'snd', false, 'Defenders');
await page.waitForSelector('.hud');
await page.evaluate(() => {
  const { app, match, session } = window.__aci;
  app.profile.settings.quality = 'medium'; app.applySettings(app.profile.settings);
  match.skipFreeze(); match.player.health = 1e9;
  session.paused = true;
  for (const el of document.querySelectorAll('.click-to-play, .pause-menu, .overlay-dim')) el.remove();
  // keep every bot out of the way except one target, standing still 12 m down the A long hall
  const p = match.player;
  const foe = match.agents.find((a) => a.team !== p.team);
  for (const a of match.agents) if (a !== p && a !== foe) match.debugTeleport(a, a.team === 'T' ? -50 + a.id : 50 - a.id, 34, 0, 0);
  match.bots.delete(foe.id);
  foe.health = 1e9;
  window.__setup = (id, att, mode, wall = null) => {
    if (att) p.loadouts[id] = { owned: [att], equipped: { optic: att } };
    else delete p.loadouts[id];
    match.debugGive(p, id);
    // open floor with the target 12 m north; sprays go into a wall instead (a different spot per gun)
    const [x, z, yaw] = wall === null ? [36, -20, 0] : [30, -10, Math.PI / 2 + (wall - 2) * 0.22];
    match.debugTeleport(p, x, z, yaw, 0);
    match.debugTeleport(foe, wall === null ? x : 50, wall === null ? z - 12 : 34, Math.PI, 0);
    // aim at the target's head
    const eye = p.eyePos(), head = foe.aimPoint(true);
    const pitch = Math.atan2(head.y - eye.y, Math.hypot(head.x - eye.x, head.z - eye.z));
    p.yaw = yaw; p.pitch = pitch;
    session.ctrl.yaw = yaw; session.ctrl.pitch = pitch;
    p.wpn.ads = mode === 'ads' && !p.activeWeapon().def.scope;
    p.wpn.scope = mode === 'ads' && p.activeWeapon().def.scope ? 1 : 0;
    p.wpn.recoilIdx = 0; p.wpn.fireInacc = 0; p.aimPunchPitch = p.aimPunchYaw = 0;
    session.view.beforeStep(); session.view.afterStep();
  };
});

const guns = ['k9', 'warden', 'p30', 'judge', 'viper', 'vespa', 'hornet', 'mako', 'breacher', 'reaper', 'galeforce', 'tempest',
  'ravager', 'sentinel', 'talon', 'bulwark', 'anvil', 'thumper', 'hammer', 'kestrel', 'marshal', 'longbow', 'disruptor'];
const optics = [['sentinel', 'reddot'], ['tempest', 'reddot'], ['talon', 'holo'], ['anvil', 'reddot'], ['bulwark', 'holo'], ['ravager', 'acog'], ['p30', 'reddot'], ['vespa', 'holo'],
  ['breacher', 'reddot'], ['breacher', 'holo']];
const shots = [];
const W = 400, H = 260, DW = 132, DH = 86;
const clip = { x: 640 - W / 2, y: 360 - H / 2, width: W, height: H };
const detail = { x: 640 - DW / 2, y: 360 - DH / 2, width: DW, height: DH };
const png = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const grab = async (label, zoomed = false) => {
  await page.waitForTimeout(450);
  shots.push({ label, src: png(await page.screenshot({ clip })) });
  if (zoomed) shots.push({ label: label + ' (3x centre)', src: png(await page.screenshot({ clip: detail })), zoomed: true });
};
for (const id of guns) {
  if (only && !only.includes(id)) continue;
  for (const mode of ['hip', 'ads']) {
    await page.evaluate(([id, mode]) => window.__setup(id, null, mode), [id, mode]);
    await grab(`${id} ${mode}`, mode === 'ads');
  }
}
for (const [id, att] of optics) {
  if (only && !only.includes(id) && !only.includes(att)) continue;
  await page.evaluate(([id, att]) => window.__setup(id, att, 'ads'), [id, att]);
  await grab(`${id}+${att} ads`, true);
}
// scoped while strafing: the spread ring opens to the real moving inaccuracy
for (const id of ['kestrel', 'longbow']) {
  if (only && !only.includes(id)) continue;
  await page.evaluate((id) => { window.__setup(id, null, 'ads'); window.__aci.match.player.motor.vel.set(3.5, 0, 0); }, id);
  await grab(`${id} scoped, strafing`);
  await page.evaluate(() => window.__aci.match.player.motor.vel.set(0, 0, 0));
}
if (spray) {
  // Fire through the real weapon system (paused session: step the sim by hand), freeze, then
  // compare the crosshair with where the last bullet hit, both in screen pixels.
  const guns = ['sentinel', 'ravager', 'vespa', 'bulwark', 'marshal'];
  for (const [gi, id] of guns.entries()) {
    if (only && !only.includes(id)) continue;
    for (const mode of ['hip', 'ads']) {
      await page.evaluate(([id, mode, wall]) => {
        const { match, session } = window.__aci;
        window.__setup(id, null, mode, wall);
        const p = match.player, def = p.activeWeapon().def;
        let last = null;
        const off = match.events.on('shot', (e) => { if (e.agentId === p.id && !e.pellet) last = e.end.clone(); });
        const cycle = Math.ceil((60 / def.rpm) * 64), ticks = 10 * cycle - 1;
        for (let i = 0; i < ticks; i++) {
          const cmd = session.ctrl.command(p);
          // semi-autos need a fresh trigger pull per shot; scopes are already up (alt would toggle them)
          cmd.fire = def.auto || i % cycle < cycle / 2; cmd.alt = mode === 'ads' && !def.scope;
          match.setPlayerCommand(cmd);
          session.view.beforeStep(); match.step(1 / 64); session.view.afterStep();
        }
        off();
        window.__lastImpact = last;
      }, [id, mode, gi]);
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const { session } = window.__aci;
        const cam = session.view.r.camera, v = window.__lastImpact.clone().project(cam);
        const hit = { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
        const box = document.querySelector('.crosshair').getBoundingClientRect();
        const aim = session.view.aimNdc;
        const xh = { x: (aim.x + 1) / 2 * innerWidth, y: (1 - aim.y) / 2 * innerHeight };
        return { hit, xh, cross: { x: box.left, y: box.top }, err: Math.hypot(hit.x - xh.x, hit.y - xh.y), centreErr: Math.hypot(hit.x - innerWidth / 2, hit.y - innerHeight / 2) };
      });
      console.log(`${id.padEnd(9)} ${mode}: last impact ${r.err.toFixed(1)} px from the aim point (${r.centreErr.toFixed(1)} px from screen centre)`);
      await grab(`${id} spray ${mode}`);
    }
  }
}
// contact sheet
const sheet = await browser.newPage({ viewport: { width: 4 * (W + 8) + 8, height: 600 } });
const per = 16;
for (let s = 0; s * per < shots.length; s++) {
  const part = shots.slice(s * per, (s + 1) * per);
  const mark = 'position:absolute;background:#f0f;';
  await sheet.setContent(`<body style="margin:0;background:#111;color:#eee;font:13px Arial;display:flex;flex-wrap:wrap;gap:8px;padding:8px">${
    part.map((p) => `<div><div>${p.label}</div><div style="position:relative;width:${W}px;height:${H}px">` +
      `<img src="${p.src}" width="${W}" height="${H}" style="display:block;image-rendering:pixelated">` +
      (p.zoomed ? `<i style="${mark}left:${W / 2 - 14}px;top:${H / 2}px;width:8px;height:1px"></i><i style="${mark}left:${W / 2 + 6}px;top:${H / 2}px;width:8px;height:1px"></i>` : '') +
      `</div></div>`).join('')}</body>`);
  await sheet.screenshot({ path: `${OUT}/sheet-${s + 1}.png`, fullPage: true });
}
await browser.close();
await server.close();
console.log(`${shots.length} views → ${OUT}/sheet-*.png`);
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors');
