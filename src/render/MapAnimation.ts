import {
  BoxGeometry, CanvasTexture, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry,
  Quaternion, SRGBColorSpace, Vector3, type Texture,
} from 'three';
import { Random } from '../core/Random';
import { Batcher, type MaterialLib } from './Materials';

interface Blinker { color: Color; period: number; duty: number; phase: number; lit: boolean }

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _off = new Color();
/** Brightness of an unlit lamp relative to its lit colour. */
const OFF = 0.13;

/**
 * Cosmetic motion on the map: products riding the conveyors, ceiling fans, the test-cell robot,
 * status LEDs and radar speed displays. Driven by wall-clock time, never by the simulation, so
 * nothing here affects collision, sight lines or replays.
 */
export class MapAnimator {
  readonly group = new Group();
  private updates: ((t: number) => void)[] = [];
  private blinkers: Blinker[] = [];
  private blinkMatrices: Matrix4[] = [];
  private blinkMesh: InstancedMesh | null = null;
  private textures: Texture[] = [];

  constructor(private lib: MaterialLib) { this.group.name = 'map-animation'; }

  /**
   * Geometry drawn in world space by `draw` (so baked probe light is sampled where it really is),
   * re-centred on a pivot at (x, y, z). Rotate / move the returned group to animate it.
   */
  part(x: number, y: number, z: number, draw: (b: Batcher) => void, parent: Group = this.group): Group {
    const pivot = new Group();
    pivot.position.set(x, y, z);
    if (parent !== this.group) { parent.updateMatrixWorld(true); parent.worldToLocal(pivot.position); }
    for (const mesh of this.meshes(x, y, z, draw)) pivot.add(mesh);
    parent.add(pivot);
    return pivot;
  }

  /** `count` copies of the geometry drawn by `draw`; `place` writes copy i's matrix relative to (x, y, z). */
  instanced(x: number, y: number, z: number, count: number, draw: (b: Batcher) => void,
    place: (i: number, t: number, out: Matrix4) => void) {
    const pivot = new Group();
    pivot.position.set(x, y, z);
    const copies = this.meshes(x, y, z, draw).map((mesh) => {
      const im = new InstancedMesh(mesh.geometry, mesh.material, count);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.renderOrder = mesh.renderOrder;
      pivot.add(im);
      return im;
    });
    this.group.add(pivot);
    const update = (t: number) => {
      for (let i = 0; i < count; i++) {
        place(i, t, _m);
        for (const im of copies) im.setMatrixAt(i, _m);
      }
      for (const im of copies) im.instanceMatrix.needsUpdate = true;
    };
    update(0);
    // Copies stay within the span they start spread over; pad it for the ones easing in / out.
    for (const im of copies) { im.computeBoundingSphere(); im.boundingSphere!.radius += 1; }
    this.updates.push(update);
  }

  /** Small unlit lamp / LED. `period` seconds per cycle, lit for `duty` of it (1 = steady). */
  blinker(x: number, y: number, z: number, w: number, h: number, d: number, rotY: number,
    color: string, period = 1, duty = 0.5, phase = 0) {
    this.blinkMatrices.push(new Matrix4().compose(_p.set(x, y + h / 2, z), _q.setFromAxisAngle(_s.set(0, 1, 0), rotY), new Vector3(w, h, d)));
    this.blinkers.push({ color: new Color(color), period, duty, phase, lit: false });
  }

  onFrame(fn: (t: number) => void) { this.updates.push(fn); }

  /**
   * Roadside radar speed display: "YOUR SPEED" over amber LED digits. Simulated drivers pass
   * every few seconds, ease off once they see their speed, and the display flashes SLOW DOWN
   * above the limit. The plane faces +Z before `rotY`.
   */
  speedDisplay(x: number, y: number, z: number, rotY: number, w: number, h: number, limit: number, seed: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = Math.round(256 * h / w);
    const g = canvas.getContext('2d')!;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    this.textures.push(tex);
    const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.group.add(mesh);

    const W = canvas.width, H = canvas.height, label = Math.round(H * 0.24);
    let shown = '';
    const paint = (key: string, text: string, color: string) => {
      if (key === shown) return;
      shown = key;
      g.fillStyle = '#060606'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#f4f1e6';
      g.font = `bold ${Math.round(label * 0.62)}px "Segoe UI", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('YOUR SPEED', W / 2, label / 2 + 2);
      g.fillStyle = '#1b1712'; g.fillRect(8, label, W - 16, H - label - 8);
      if (text) {
        const big = text.length <= 2;
        g.font = `bold ${Math.round((H - label) * (big ? 0.82 : 0.4))}px Consolas, "Courier New", monospace`;
        g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 14;
        g.fillText(text, W / 2, label + (H - label) / 2 + 2);
        g.shadowBlur = 0;
      }
      // LED pitch: a faint dot grid over the digit field.
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let py = label + 2; py < H - 8; py += 5) g.fillRect(8, py, W - 16, 1);
      for (let px = 10; px < W - 8; px += 5) g.fillRect(px, label, 1, H - label - 8);
      tex.needsUpdate = true;
    };

    const rng = new Random(seed);
    let until = rng.range(0.5, 2.5), speed = 0, tick = 0;
    this.updates.push((t) => {
      if (t >= until) {
        // alternate between an empty road and a passing vehicle
        speed = speed > 0 ? 0 : Math.round(limit + rng.range(-12, 15));
        until = t + (speed > 0 ? rng.range(2.8, 4.5) : rng.range(1.2, 3.5));
        tick = t;
      }
      if (speed > limit && t - tick > 0.7) { speed--; tick = t; }
      if (speed <= 0) { paint('blank', '', ''); return; }
      const flash = speed > limit && Math.floor(t * 2.4) % 2 === 1;
      if (flash) paint('slow', 'SLOW DOWN', '#ff5a36');
      else paint(String(speed), String(speed), '#ffb21e');
    });
  }

  /** Call once after every part / blinker has been registered. */
  finish() {
    const n = this.blinkers.length;
    if (!n) return;
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ toneMapped: false }), n);
    this.blinkMatrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, _off.copy(this.blinkers[i].color).multiplyScalar(OFF)); });
    mesh.computeBoundingSphere();
    this.blinkMesh = mesh;
    this.group.add(mesh);
  }

  animate(t: number) {
    for (const u of this.updates) u(t);
    const mesh = this.blinkMesh;
    if (!mesh) return;
    let changed = false;
    this.blinkers.forEach((b, i) => {
      const lit = b.duty >= 1 || ((t / b.period + b.phase) % 1) < b.duty;
      if (lit === b.lit) return;
      b.lit = lit;
      mesh.setColorAt(i, lit ? b.color : _off.copy(b.color).multiplyScalar(OFF));
      changed = true;
    });
    if (changed && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose() { for (const t of this.textures) t.dispose(); this.textures.length = 0; }

  private meshes(x: number, y: number, z: number, draw: (b: Batcher) => void): Mesh[] {
    const b = new Batcher(this.lib);
    draw(b);
    const tmp = new Group();
    b.build(tmp);
    const out = [...tmp.children] as Mesh[];
    for (const mesh of out) {
      mesh.geometry.translate(-x, -y, -z);
      mesh.geometry.computeBoundingSphere();
    }
    return out;
  }
}
