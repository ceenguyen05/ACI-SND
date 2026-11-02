import type { CrosshairSettings } from '../../config/cosmetics';

/** Half-size (CSS px) a canvas needs to hold `s` with a dynamic gap of `spreadPx`. */
export function crosshairExtent(s: CrosshairSettings, spreadPx = 0): number {
  const gap = s.gap + (s.dynamic ? spreadPx : 0);
  const reach = s.style === 'circle' ? gap + s.size : gap + s.size * 2;
  return Math.ceil(Math.max(reach, s.thickness) + s.thickness + 3);
}

/**
 * Draw a CS-style crosshair centered in the canvas. `spreadPx` widens the gap (dynamic crosshair),
 * in CSS px; `scale` is device pixels per CSS px, so lines land on whole device pixels (crisp on
 * HiDPI screens).
 */
export function drawCrosshair(g: CanvasRenderingContext2D, s: CrosshairSettings, spreadPx = 0, scale = 1) {
  const W = g.canvas.width, H = g.canvas.height;
  g.clearRect(0, 0, W, H);
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const t = Math.max(1, Math.round(s.thickness * scale));
  const gap = Math.round((s.gap + (s.dynamic ? spreadPx : 0)) * scale);
  const len = Math.max(1, Math.round(s.size * 2 * scale));
  const ol = Math.max(1, Math.round(scale));
  g.globalAlpha = s.alpha;
  const rect = (x: number, y: number, w: number, h: number) => {
    if (s.outline) { g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(x - ol, y - ol, w + ol * 2, h + ol * 2); }
    g.fillStyle = s.color; g.fillRect(x, y, w, h);
  };
  const off = Math.floor(t / 2);
  if (s.style === 'classic') {
    rect(cx - off, cy - gap - len, t, len);
    rect(cx - off, cy + gap + 1, t, len);
    rect(cx - gap - len, cy - off, len, t);
    rect(cx + gap + 1, cy - off, len, t);
  } else if (s.style === 'circle') {
    const r = Math.max(t, gap + len / 2);
    if (s.outline) { g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = t + ol * 2; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = s.color; g.lineWidth = t; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2); g.stroke();
  }
  if (s.dot || s.style === 'dot') rect(cx - off, cy - off, t, t);
  g.globalAlpha = 1;
}
