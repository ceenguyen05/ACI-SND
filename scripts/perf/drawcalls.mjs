// Breaks down draw calls by scene subtree.  node scripts/perf/drawcalls.mjs [--no-build] [--map=aci_b2]
import { preview, build } from 'vite';
import { launchBrowser, startFromMenu } from '../lib/browser.mjs';
if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4179 }, logLevel: 'warn' });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForSelector('.title-screen', { timeout: 60000 });
await page.keyboard.press('Enter');
const mapId = process.argv.find((a) => a.startsWith('--map='))?.slice(6) ?? 'aci_hq';
await startFromMenu(page, 'snd', false, '', { aci_hq: 'ACI HQ', aci_b2: 'ACI Building 2' }[mapId]);
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
  // Draw calls and triangles for one rendered frame from the spawn view.
  r.render();
  const info = { calls: r.renderer.info.render.calls, triangles: r.renderer.info.render.triangles };
  let meshes = 0, tris = 0;
  mapGroup.traverse((c) => { if (c.isMesh) { meshes++; const g = c.geometry; tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3 * (c.isInstancedMesh ? c.count : 1); } });
  return JSON.stringify({ map: window.__aci.match.world.map.id, frame: info, mapMeshes: meshes, mapTriangles: Math.round(tris), visibleBySubtree: out, mapMeshesByType: byMat }, null, 1);
}));
await browser.close(); await server.close();
