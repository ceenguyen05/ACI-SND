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
