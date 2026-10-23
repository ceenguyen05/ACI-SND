// Diagnostic: load the built game, print console output and any fatal-error overlay text.
//   node scripts/diag.mjs [--no-build]
import { preview, build } from 'vite';
import { chromium } from 'playwright';

if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4178 }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack || e));
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 600)));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForTimeout(5000);
console.log('overlay:', await page.evaluate(() => document.querySelector('.overlay-dim pre')?.textContent ?? 'none'));
await browser.close();
await server.close();
