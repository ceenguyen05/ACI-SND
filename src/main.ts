import './ui/styles/main.css';
import { App } from './app/App';
import { World } from './sim/world/World';
import { ACI_HQ } from './sim/maps/aciHq';
import { loadBakedLighting } from './render/lighting/BakedLighting';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ui = document.getElementById('ui-root') as HTMLElement;

// Show a loading screen while procedural textures and the map are generated.
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div>ACI: SERIES 1</div><div style="font-size:12px;letter-spacing:.3em;color:#8c96a3">BUILDING ACI HQ</div><div class="bar"><i></i></div>';
ui.append(loading);

requestAnimationFrame(() => setTimeout(async () => {
  try {
    const world = new World(ACI_HQ);
    const baked = await loadBakedLighting(world);
    new App(canvas, ui, world, baked);
  } catch (e) {
    console.error(e);
    loading.innerHTML = `<div>Failed to start: ${(e as Error).message}</div><div style="font-size:12px;letter-spacing:0">WebGL is required. Try an up-to-date Chrome, Edge or Firefox.</div>`;
    return;
  }
  loading.remove();
}, 30));
