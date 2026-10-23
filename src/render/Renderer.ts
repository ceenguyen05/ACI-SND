import { ACESFilmicToneMapping, Fog, PCFShadowMap, PCFSoftShadowMap, PerspectiveCamera, PMREMGenerator, SRGBColorSpace, Scene, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { World } from '../sim/world/World';
import { Effects } from './Effects';
import { buildMapVisual, type MapVisual } from './MapMesh';
import { MaterialLib } from './Materials';
import { setMaxAnisotropy } from './Textures';
import { ViewModel } from './ViewModel';
import { SpatialPost } from './SpatialPost';
import type { BakedLighting } from './lighting/BakedLighting';

/** Owns the WebGL renderer, the world scene/camera and the first-person view-model pass. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(74, 1, 0.05, 900);
  lib = new MaterialLib();
  readonly viewModel = new ViewModel();
  readonly effects = new Effects();
  map: MapVisual | null = null;
  /** Offline-baked lightmaps + probes (null → real-time lighting fallback). */
  baked: BakedLighting | null = null;
  private scale = 1;
  private post: SpatialPost | null = null;
  showViewModel = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    setMaxAnisotropy(Math.min(16, this.renderer.capabilities.getMaxAnisotropy()));
    // Generated reflection environment gives metal / glass readable highlights indoors.
    const generator = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = generator.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 0.32;
    this.viewModel.scene.environment = env.texture;
    this.viewModel.scene.environmentIntensity = 0.85;
    room.dispose(); generator.dispose();
    this.scene.fog = new Fog(0x9baab5, 65, 220);
    this.scene.add(this.camera);
    this.scene.add(this.effects.group);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  quality: 'low' | 'medium' | 'high' = 'medium';

  /** (Re)build the static map visuals for a quality preset. */
  loadMap(world: World, quality: 'low' | 'medium' | 'high') {
    if (this.map) {
      this.scene.remove(this.map.group);
      for (const l of this.map.lights) this.scene.remove(l);
      const materials = new Set<import('three').Material>();
      this.map.group.traverse((o) => {
        const m = o as import('three').Mesh;
        m.geometry?.dispose();
        if (m.material) for (const material of Array.isArray(m.material) ? m.material : [m.material]) materials.add(material);
      });
      for (const material of materials) material.dispose();
      for (const light of this.map.lights) if ('dispose' in light && typeof light.dispose === 'function') light.dispose();
      this.lib.dispose();
    }
    this.quality = quality;
    if (quality === 'high' && !this.post) this.post = new SpatialPost();
    if (quality !== 'high' && this.post) { this.post.dispose(); this.post = null; }
    // Medium keeps the new geometry / materials with inexpensive diffuse shading;
    // per-pixel surface maps are reserved for High on integrated GPUs.
    this.lib = new MaterialLib(quality === 'high', quality === 'high', this.baked);
    // Baked lighting already contains the sun's shadows; dynamic objects use blob shadows.
    const shadows = this.baked ? 0 : quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 0;
    this.map = buildMapVisual(world, this.lib, { shadows, pointLights: quality !== 'low', baked: this.baked });
    if (!shadows && !this.baked) this.map.sun.intensity = 0.6;
    this.scene.add(this.map.group);
    for (const l of this.map.lights) this.scene.add(l);
    this.renderer.shadowMap.enabled = shadows > 0;
    this.renderer.shadowMap.type = quality === 'high' ? PCFSoftShadowMap : PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }

  setRenderScale(s: number) { this.scale = s; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // render at CSS-pixel resolution × scale (ignoring OS DPI scaling keeps laptops fast)
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.setAspect(w / h);
    this.post?.resize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)));
  }

  get height() { return this.renderer.domElement.height; }

  render() {
    const r = this.renderer;
    r.info.reset();
    this.map?.updateLights(this.camera.position);
    if (this.post) this.post.render(r, this.scene, this.camera);
    else { r.clear(); r.render(this.scene, this.camera); }
    if (this.showViewModel) {
      r.clearDepth();
      r.render(this.viewModel.scene, this.viewModel.camera);
    }
  }
}
