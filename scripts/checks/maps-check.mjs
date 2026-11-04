// Map selection in a real browser: the S&D map picker, starting on ACI Building 2, returning to the
// ACI HQ menu backdrop, Randomize, a graphics-quality change on Building 2, and the online map select.
//   node scripts/checks/maps-check.mjs [--no-build]
import { preview, build } from 'vite';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
mkdirSync('screenshots/maps', { recursive: true });
const server = await preview({ preview: { port: 4183 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /stale|lighting/.test(m.text()))) errors.push(`[${m.type()}] ${m.text()}`); });
const step = async (name, fn) => { const t = Date.now(); await fn(); console.log(`  ✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); };
const state = () => page.evaluate(() => {
  const { app, match } = window.__aci ?? {};
  return { rendered: app?.world?.map.id, sim: match?.world?.map.id, baked: !!app?.renderer?.baked, mode: app?.mode };
});
const quitToMenu = async () => {
  await page.evaluate(() => window.__aci.session.quit());
  await page.waitForSelector('.mm-item.primary', { timeout: 60000 });
  await page.waitForFunction(() => window.__aci.app.mode === 'menu');
};

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.title-screen', { timeout: 60000 });
  await page.keyboard.press('Enter');

  await step('map picker shows three choices', async () => {
    await page.click('.mm-item.primary');
    await page.click('.ms-card.snd');
    await page.waitForSelector('.ms-map');
    const labels = await page.locator('.ms-map b').allTextContents();
    assert.deepEqual(labels, ['ACI HQ', 'ACI Building 2', 'Randomize']);
    await page.click('.ms-map >> text="ACI Building 2"');
    assert.match(await page.locator('.ms-panel h3').textContent(), /ACI Building 2/);
    await page.screenshot({ path: 'screenshots/maps/01-snd-setup.png' });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  });

  await step('start on ACI Building 2 (baked lighting, sim and renderer agree)', async () => {
    await startFromMenu(page, 'snd', true, '', 'ACI Building 2');
    await page.waitForSelector('.hud', { timeout: 60000 });
    await page.waitForFunction(() => window.__aci?.app?.mode === 'game');
    const s = await state();
    assert.equal(s.sim, 'aci_b2'); assert.equal(s.rendered, 'aci_b2'); assert.ok(s.baked, 'Building 2 lightmaps loaded');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'screenshots/maps/02-b2-spectate.png' });
  });

  await step('graphics quality change rebuilds Building 2, not the menu map', async () => {
    await page.evaluate(() => { const { app } = window.__aci; app.profile.settings.quality = app.renderer.quality === 'low' ? 'medium' : 'low'; app.applySettings(app.profile.settings); });
    await page.waitForTimeout(500);
    assert.equal((await state()).rendered, 'aci_b2');
    await page.evaluate(() => { const { app } = window.__aci; app.profile.settings.quality = 'medium'; app.applySettings(app.profile.settings); });
  });

  await step('quitting returns to the ACI HQ menu backdrop', async () => {
    await quitToMenu();
    const s = await state();
    assert.equal(s.rendered, 'aci_hq');
    await page.click('.mm-item.primary'); await page.click('.ms-card.snd');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/maps/03-menu-after-b2.png' });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  });

  await step('Randomize picks both maps over several starts', async () => {
    const seen = new Set();
    for (let i = 0; i < 8 && seen.size < 2; i++) {
      await startFromMenu(page, 'snd', true, '', 'Randomize');
      await page.waitForSelector('.hud', { timeout: 60000 });
      await page.waitForFunction(() => window.__aci?.app?.mode === 'game');
      const s = await state();
      assert.equal(s.sim, s.rendered);
      seen.add(s.sim);
      await quitToMenu();
    }
    assert.deepEqual([...seen].sort(), ['aci_b2', 'aci_hq']);
  });

  await step('online menu offers the map choice for S&D only', async () => {
    await page.click('.mm-item >> text=/Play Online/');
    await page.waitForSelector('.online-panel');
    const options = await page.getByLabel('Online map').locator('option').allTextContents();
    assert.deepEqual(options, ['ACI HQ', 'ACI Building 2', 'Randomize']);
    await page.screenshot({ path: 'screenshots/maps/04-online-menu.png' });
    await page.getByLabel('Online game mode').selectOption('zombies');
    assert.equal(await page.getByLabel('Online map').count(), 0);
  });

  assert.deepEqual(errors, []);
  console.log('\nMAPS CHECK PASSED');
} catch (err) {
  await page.screenshot({ path: 'screenshots/maps/99-failure.png' }).catch(() => {});
  console.error(err);
  if (errors.length) console.error('console:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
