import type { PerspectiveCamera } from 'three';
import type { CrosshairSettings } from '../../config/cosmetics';
import { adsOptic, scopedView } from '../../config/weapons';
import { clamp } from '../../core/math';
import { spreadCone } from '../../sim/combat/Ballistics';
import { launcherHoldover } from '../../sim/combat/Ordnance';
import type { Agent } from '../../sim/entities/Agent';
import { h } from '../dom';
import { crosshairExtent, drawCrosshair } from './Crosshair';

export interface SightFrame {
  /** The viewer, alive and looking through their own eyes; null hides everything. */
  agent: Agent | null;
  camera: PerspectiveCamera;
  /** Screen position (NDC) the next shot goes to (MatchView.aimNdc). */
  aimX: number; aimY: number;
  /** How far the gun is raised to the eye: 0 at the hip, 1 with the sights lined up. */
  ads: number;
  crosshair: CrosshairSettings;
  /** A menu is open over the game. */
  menu: boolean;
}

/** Range marks (m) for launchers: the 40 mm grenade's iron sight and the rocket scope. */
const GRENADE_RANGES = [10, 20, 30, 40, 50];
const ROCKET_RANGES = [25, 50, 75, 100];
/** Scope circle radii as a fraction of the viewport height (match the CSS vignettes). */
const SCOPE_R = 0.34, PGO_R = 0.3;

/**
 * Everything you aim with on screen: the crosshair (its gap is the real spread cone), red-dot and
 * holo reticles, the ACOG, sniper and rocket scopes, and launcher range marks. All of it sits on
 * the screen point the next shot goes to, so it climbs with the part of the recoil the camera
 * doesn't show, and drifts with stun sway.
 */
export class Sights {
  readonly el: HTMLElement;
  private xBox: HTMLElement; private xCanvas: HTMLCanvasElement; private xKey = '';
  private scope: HTMLElement; private scopeCanvas: HTMLCanvasElement; private scopeKey = '';
  private scopeSpread: HTMLElement; private scopeZoom: HTMLElement;
  private acog: HTMLElement;
  private pgo: HTMLElement; private pgoCanvas: HTMLCanvasElement; private pgoKey = '';
  private dot: HTMLElement;
  private ladder: HTMLCanvasElement; private ladderKey = '';
  /** Where the crosshair is drawn, relative to the screen centre (CSS px): the HUD's hitmarker follows it. */
  readonly offset = { x: 0, y: 0 };

  constructor() {
    this.el = h('div', { class: 'sights' },
      this.scope = h('div', { class: 'scope-overlay hidden' }, h('div', { class: 'scope-vignette' }),
        this.scopeCanvas = h('canvas', { class: 'scope-reticle' }), this.scopeSpread = h('div', { class: 'scope-spread' }),
        this.scopeZoom = h('div', { class: 'scope-zoom' })),
      this.acog = h('div', { class: 'acog-overlay hidden' }, h('div', { class: 'acog-ring' }), h('div', { class: 'acog-chevron' })),
      this.pgo = h('div', { class: 'pgo-overlay hidden' }, h('div', { class: 'pgo-ring' }), this.pgoCanvas = h('canvas', { class: 'pgo-reticle' })),
      this.dot = h('div', { class: 'reticle hidden' }),
      this.ladder = h('canvas', { class: 'range-ladder hidden' }),
      this.xBox = h('div', { class: 'crosshair' }, this.xCanvas = h('canvas')),
    );
  }

  update(f: SightFrame) {
    const a = f.agent, def = a?.activeWeapon()?.def;
    const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    // the shot's screen point relative to the centre (CSS px), and an off-axis angle in CSS px
    const dx = snap(f.aimX * W / 2), dy = snap(-f.aimY * H / 2);
    const tanHalf = Math.tan(f.camera.fov * Math.PI / 360);
    const toPx = (angle: number) => Math.tan(angle) * (H / 2) / tanHalf;
    const at = `translate(${dx}px, ${dy}px)`;

    const scoped = !!a && scopedView(def, a.wpn.ads, a.wpn.scope);
    const optic = a?.wpn.ads ? adsOptic(def) : undefined;
    const sniper = scoped && !!def?.scope;

    // ---- sniper scope: duplex reticle, zoom readout, and a ring showing the real spread whenever
    // moving / firing / jumping has opened it past the gun's settled accuracy
    this.scope.classList.toggle('hidden', !sniper);
    if (sniper && a && def?.scope) {
      this.scope.style.transform = at;
      const r = SCOPE_R * H;
      this.drawScopeReticle(r, dpr);
      const cone = spreadCone(def, a), rest = (def.spread.base + (a.crouched ? def.spread.crouch : def.spread.stand)) / 1000;
      const ring = Math.min(r, toPx(cone));
      this.scopeSpread.style.width = this.scopeSpread.style.height = `${(ring * 2).toFixed(1)}px`;
      this.scopeSpread.style.opacity = String(clamp((cone / rest - 1.25) / 0.75, 0, 1));
      this.scopeZoom.textContent = `${def.scope.zooms[a.wpn.scope - 1].toFixed(1)}×`;
    }

    // ---- ACOG and the rocket launcher's ranging scope
    this.acog.classList.toggle('hidden', !(scoped && optic === 'acog'));
    if (scoped && optic === 'acog') this.acog.style.transform = at;
    const rocket = scoped && optic === 'pgo' && !!a && !!def?.projectile;
    this.pgo.classList.toggle('hidden', !rocket);
    if (rocket && a && def) {
      this.pgo.style.transform = at;
      this.drawRocketScope(ROCKET_RANGES.map((m) => toPx(launcherHoldover(def, a.pitch, m))), toPx(Math.PI / 180), PGO_R * H, dpr);
    }

    // ---- red dot / holo: shown once the sight is up to the eye
    const reflex = (optic === 'reddot' || optic === 'holo') && f.ads > 0.55;
    this.dot.classList.toggle('hidden', !reflex);
    this.dot.classList.toggle('holo', optic === 'holo');
    if (reflex) this.dot.style.transform = at;

    // ---- iron-sighted grenade launcher: range marks under the front post
    const lob = !!a && !!def?.projectile && !optic && a.wpn.ads && f.ads > 0.6 && def.projectile.gravity > 3;
    this.ladder.classList.toggle('hidden', !lob);
    if (lob && a && def) this.drawLadder(GRENADE_RANGES.map((m) => toPx(launcherHoldover(def, a.pitch, m))), W / 2 + dx, H / 2 + dy, dpr);

    // ---- crosshair: fades out as sights come up; its gap is the full spread cone
    const fade = clamp(1 - (f.ads - 0.2) / 0.45, 0, 1);
    const showX = !!a && !scoped && !f.menu && fade > 0;
    this.xBox.style.display = showX ? '' : 'none';
    const follow = f.crosshair.followRecoil !== false;
    this.offset.x = follow ? dx : 0; this.offset.y = follow ? dy : 0;
    if (!showX || !a) return;
    const spread = def && def.class !== 'knife' ? Math.min(H * 0.42, toPx(spreadCone(def, a))) : 0;
    this.xBox.style.opacity = fade < 1 ? fade.toFixed(2) : '';
    this.xBox.style.transform = `translate(${snap(W / 2 + this.offset.x)}px, ${snap(H / 2 + this.offset.y)}px)`;
    const s = f.crosshair, sp = Math.round(spread * dpr) / dpr;
    const key = `${s.style}|${s.color}|${s.size}|${s.gap}|${s.thickness}|${s.dot}|${s.outline}|${s.dynamic}|${s.alpha}|${sp}|${dpr}`;
    if (key === this.xKey) return;
    this.xKey = key;
    // canvas in whole device pixels around the centre so lines stay crisp at any display scale;
    // sized in 32 px steps so a breathing spread redraws it without reallocating every frame
    const n = 32 * Math.ceil((crosshairExtent(s, sp) * dpr) / 16);
    const c = this.xCanvas;
    if (c.width !== n) {
      c.width = c.height = n;
      c.style.width = c.style.height = `${n / dpr}px`;
      c.style.left = c.style.top = `${-n / 2 / dpr}px`;
    }
    drawCrosshair(c.getContext('2d')!, s, sp, dpr);
  }

  /** Duplex sniper reticle: thin centre cross with stadia ticks, heavy outer posts, lit centre dot. */
  private drawScopeReticle(r: number, dpr: number) {
    const n = 2 * Math.ceil((r + 2) * dpr), key = `${n}`;
    if (key === this.scopeKey) return;
    this.scopeKey = key;
    const c = this.scopeCanvas, g = c.getContext('2d')!;
    c.width = c.height = n;
    c.style.width = c.style.height = `${n / dpr}px`;
    c.style.margin = `${-n / 2 / dpr}px 0 0 ${-n / 2 / dpr}px`;
    const m = n / 2, R = r * dpr, inner = R * 0.42;
    const thin = Math.max(1, Math.round(dpr)), thick = Math.max(3, Math.round(4 * dpr));
    const line = (x: number, y: number, w: number, hh: number) => g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hh));
    g.clearRect(0, 0, n, n);
    g.fillStyle = 'rgba(0,0,0,0.92)';
    line(m - inner, m - thin / 2, inner * 2, thin);
    line(m - thin / 2, m - inner, thin, inner * 2);
    for (const [x, y, w, hh] of [[m - R, m - thick / 2, R - inner, thick], [m + inner, m - thick / 2, R - inner, thick],
      [m - thick / 2, m - R, thick, R - inner], [m - thick / 2, m + inner, thick, R - inner]]) line(x, y, w, hh);
    const tick = Math.round(4 * dpr);
    for (let k = 1; k <= 4; k++) {
      const d = (inner * k) / 5;
      for (const s of [-1, 1]) { line(m + s * d - thin / 2, m - tick / 2, thin, tick); line(m - tick / 2, m + s * d - thin / 2, tick, thin); }
    }
    g.fillStyle = '#ff3b30'; g.shadowColor = 'rgba(255,40,30,0.9)'; g.shadowBlur = 4 * dpr;
    g.beginPath(); g.arc(m, m, 1.5 * dpr, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
  }

  /** PGO-style rocket reticle: aiming chevron with lead ticks, and a chevron per range below it. */
  private drawRocketScope(marks: number[], degPx: number, r: number, dpr: number) {
    const n = 2 * Math.ceil(r * dpr);
    const key = `${n}|${Math.round(degPx * dpr)}|${marks.map((y) => Math.round(y * dpr)).join(',')}`;
    if (key === this.pgoKey) return;
    this.pgoKey = key;
    const c = this.pgoCanvas, g = c.getContext('2d')!;
    if (c.width !== n) {
      c.width = c.height = n;
      c.style.width = c.style.height = `${n / dpr}px`;
      c.style.margin = `${-n / 2 / dpr}px 0 0 ${-n / 2 / dpr}px`;
    }
    const m = n / 2, u = dpr, reach = 0.8 * r * u;
    g.clearRect(0, 0, n, n);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const chevron = (y: number, w: number) => { g.moveTo(m - w, y + w * 0.75); g.lineTo(m, y); g.lineTo(m + w, y + w * 0.75); };
    const reticle = () => {
      g.beginPath();
      chevron(m, 9 * u);
      // lead / stadia scale on the aiming line: a tick per degree
      g.moveTo(m - reach, m); g.lineTo(m - 16 * u, m); g.moveTo(m + 16 * u, m); g.lineTo(m + reach, m);
      for (let x = degPx * u; degPx > 2 && x <= reach; x += degPx * u) for (const s of [-1, 1]) if (x > 16 * u) { g.moveTo(m + s * x, m - 3 * u); g.lineTo(m + s * x, m + 3 * u); }
      for (const y of marks) if (Number.isFinite(y)) chevron(m + y * u, 5 * u);
      g.stroke();
    };
    // etched black lines with a faint lit edge, so they read on dark walls and bright sky alike
    g.strokeStyle = 'rgba(255,236,200,0.45)'; g.lineWidth = Math.max(2, Math.round(3.4 * u)); reticle();
    g.strokeStyle = 'rgba(14,12,8,0.95)'; g.lineWidth = Math.max(1, Math.round(1.4 * u)); reticle();
    g.font = `600 ${Math.round(10 * u)}px Bahnschrift, Arial`; g.textBaseline = 'middle';
    g.lineWidth = Math.max(2, Math.round(3 * u)); g.strokeStyle = 'rgba(0,0,0,0.8)'; g.fillStyle = '#ffc266';
    marks.forEach((y, i) => {
      if (!Number.isFinite(y)) return;
      const left = i % 2 === 0, x = m + (left ? -9 : 9) * u, yy = m + y * u + 2 * u;
      g.textAlign = left ? 'right' : 'left';
      g.strokeText(String(ROCKET_RANGES[i]), x, yy); g.fillText(String(ROCKET_RANGES[i]), x, yy);
    });
  }

  /** Grenade-launcher range ladder: a tick and distance under the front post for each range. */
  private drawLadder(marks: number[], x: number, y: number, dpr: number) {
    const finite = marks.filter(Number.isFinite);
    const hgt = Math.ceil((finite.length ? Math.max(...finite) : 0) + 16), w = 84;
    const c = this.ladder;
    c.style.transform = `translate(${Math.round((x - w / 2) * dpr) / dpr}px, ${Math.round(y * dpr) / dpr}px)`;
    const key = `${hgt}|${dpr}|${marks.map((v) => Math.round(v * dpr)).join(',')}`;
    if (key === this.ladderKey) return;
    this.ladderKey = key;
    c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
    c.style.width = `${w}px`; c.style.height = `${hgt}px`;
    const g = c.getContext('2d')!, m = (w / 2) * dpr;
    g.clearRect(0, 0, c.width, c.height);
    g.font = `600 ${Math.round(10 * dpr)}px Bahnschrift, Arial`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.lineWidth = Math.max(1, Math.round(dpr));
    marks.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const yy = Math.round(v * dpr) + 0.5, half = (i % 2 ? 5 : 8) * dpr;
      g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 3 * dpr;
      g.beginPath(); g.moveTo(m - half, yy); g.lineTo(m + half, yy); g.stroke();
      g.strokeStyle = '#ffb347'; g.lineWidth = Math.max(1, Math.round(dpr));
      g.beginPath(); g.moveTo(m - half, yy); g.lineTo(m + half, yy); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillText(`${GRENADE_RANGES[i]}`, m + half + 4 * dpr + 1, yy + 1);
      g.fillStyle = '#ffd9a0'; g.fillText(`${GRENADE_RANGES[i]}`, m + half + 4 * dpr, yy);
    });
  }
}
