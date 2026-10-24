// Breaks down draw calls by scene subtree.  node scripts/drawcalls.mjs [--no-build]
import { preview, build } from 'vite';
import { launchBrowser } from './lib/browser.mjs';
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4179 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
await page.click('text=Start match');
await page.waitForSelector('.hud');
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => {
  const r = window.__aci.app.renderer;
  const out = {};
  const count = (o, label) => { let n = 0; o.traverseVisible((c) => { if (c.isMesh || c.isLine || c.isPoints || c.isSprite) n++; }); out[label] = n; };
  for (const child of r.scene.children) count(child, child.name || child.type);
  const mapGroup = r.scene.getObjectByName('map');
  const byMat = {};
  mapGroup.traverse((c) => { if (c.isMesh) { const k = c.material.type + (c.material.map ? '+map' : ''); byMat[k] = (byMat[k] ?? 0) + 1; } });
  return JSON.stringify({ visibleBySubtree: out, mapMeshesByType: byMat }, null, 1);
}));
await browser.close(); await server.close();
