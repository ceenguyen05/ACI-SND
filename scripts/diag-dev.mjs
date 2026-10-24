// Diagnostic against the unminified dev server (readable stacks).  node scripts/diag-dev.mjs
import { createServer } from 'vite';
import { launchBrowser } from './lib/browser.mjs';
const server = await createServer({ server: { port: 5299 }, logLevel: 'error' });
await server.listen();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const seen = new Set();
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack || e));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !seen.has(t)) { seen.add(t); console.log(`[${m.type()}]`, t.slice(0, 1500)); } });
await page.goto('http://localhost:5299/');
await page.waitForTimeout(9000);
await browser.close();
await server.close();
