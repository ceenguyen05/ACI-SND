import { h } from '../dom';

/** Painted key art for the Zombies card: a dark HQ silhouette, glowing eyes, a red sky. */
export function zombieArt(w: number, hgt: number): HTMLCanvasElement {
  const c = h('canvas', { width: w * 2, height: hgt * 2 }) as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  const sky = g.createLinearGradient(0, 0, 0, hgt);
  sky.addColorStop(0, '#2a0806'); sky.addColorStop(0.55, '#5a120a'); sky.addColorStop(1, '#120404');
  g.fillStyle = sky; g.fillRect(0, 0, w, hgt);
  const moon = g.createRadialGradient(w * 0.78, hgt * 0.28, 2, w * 0.78, hgt * 0.28, 60);
  moon.addColorStop(0, 'rgba(255,210,170,.95)'); moon.addColorStop(0.3, 'rgba(255,120,60,.5)'); moon.addColorStop(1, 'rgba(255,80,30,0)');
  g.fillStyle = moon; g.fillRect(0, 0, w, hgt);
  // HQ skyline
  g.fillStyle = '#0c0606';
  g.fillRect(0, hgt * 0.58, w, hgt);
  g.fillRect(w * 0.08, hgt * 0.42, w * 0.3, hgt);
  g.fillRect(w * 0.52, hgt * 0.36, w * 0.26, hgt);
  g.fillRect(w * 0.57, hgt * 0.2, 8, hgt * 0.2);
  // a crowd of shamblers
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w, s = 0.6 + rnd() * 0.9, base = hgt - 4 - rnd() * 18;
    g.fillStyle = '#050202';
    g.beginPath(); g.ellipse(x, base - 46 * s, 7 * s, 8 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 9 * s, base - 40 * s, 18 * s, 26 * s);
    g.fillRect(x - 8 * s, base - 16 * s, 6 * s, 16 * s); g.fillRect(x + 2 * s, base - 16 * s, 6 * s, 16 * s);
    g.save(); g.translate(x + 7 * s, base - 36 * s); g.rotate(-1.2 - rnd() * 0.4); g.fillRect(0, -2.5 * s, 18 * s, 5 * s); g.restore();
    g.save(); g.translate(x - 7 * s, base - 36 * s); g.rotate(-1.9 + rnd() * 0.3); g.fillRect(0, -2.5 * s, 16 * s, 5 * s); g.restore();
    g.fillStyle = i % 4 === 0 ? '#9dff2a' : '#ffb030';
    g.shadowColor = g.fillStyle; g.shadowBlur = 6;
    g.fillRect(x - 3.5 * s, base - 48 * s, 2.2 * s, 1.6 * s); g.fillRect(x + 1.3 * s, base - 48 * s, 2.2 * s, 1.6 * s);
    g.shadowBlur = 0;
  }
  const vig = g.createRadialGradient(w / 2, hgt / 2, hgt * 0.3, w / 2, hgt / 2, w * 0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.6)');
  g.fillStyle = vig; g.fillRect(0, 0, w, hgt);
  return c;
}
