// Shared Chromium launch settings for the browser checks and screenshot scripts.
//
// - On a developer machine (Windows / macOS) the GPU is used through ANGLE.
// - On CI (GitHub Actions' Linux runners have no GPU) or with `--swiftshader`, WebGL runs on
//   SwiftShader, Chromium's software renderer. It's slower but renders the same frames, so
//   the logic checks behave identically.
import { chromium } from 'playwright';

export const isCI = !!process.env.CI;
export const softwareGL = process.argv.includes('--swiftshader') || (isCI && process.platform === 'linux');

export function browserArgs(extra = []) {
  const gl = softwareGL
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : process.platform === 'win32'
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--enable-gpu', '--ignore-gpu-blocklist'];
  return [...gl, '--autoplay-policy=no-user-gesture-required', ...extra];
}

export function launchBrowser(extra = []) {
  return chromium.launch({ args: browserArgs(extra) });
}

/**
 * From the main menu: Play Now → pick the mode card → Start match (or Watch bots).
 * `mode` is 'snd' (Search & Destroy) or 'zombies'.
 */
export async function startFromMenu(page, mode = 'snd', spectate = false, side = '') {
  await page.waitForSelector('.mm-item.primary', { timeout: 60000 });
  await page.click('.mm-item.primary');
  await page.waitForSelector(`.ms-card.${mode}`);
  await page.click(`.ms-card.${mode}`);
  if (side) await page.click(`.ms-panel .seg >> text=${side}`);
  await page.click(spectate ? '.ms-start >> text=Watch bots' : '.ms-start >> text=Start match');
}
