// Diagnostic: load the game in Chromium and print console output, page errors and any
// fatal-error overlay text.
//   node scripts/tools/diag.mjs [--no-build]   production build (what players get)
//   node scripts/tools/diag.mjs --dev          unminified dev server (readable stack traces)
import { build, createServer, preview } from 'vite';
import { launchBrowser } from '../lib/browser.mjs';

const dev = process.argv.includes('--dev');
let url, close;
if (dev) {
  const server = await createServer({ server: { port: 5299 }, logLevel: 'error' });
  await server.listen();
  url = 'http://localhost:5299/'; close = () => server.close();
} else {
  if (!process.argv.includes('--no-build')) await build({ logLevel: 'warn' });
  const server = await preview({ preview: { port: 4178 }, logLevel: 'warn' });
  url = server.resolvedUrls.local[0]; close = () => server.close();
}
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const seen = new Set();
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack || e));
page.on('console', (m) => {
  const text = m.text();
  if (dev && (m.type() !== 'error' || seen.has(text))) return; // dev servers are noisy: unique errors only
  seen.add(text);
  console.log(`[${m.type()}]`, text.slice(0, dev ? 1500 : 600));
});
await page.goto(url);
await page.waitForTimeout(dev ? 9000 : 5000);
console.log('overlay:', await page.evaluate(() => document.querySelector('.overlay-dim pre')?.textContent ?? 'none'));
await browser.close();
await close();
