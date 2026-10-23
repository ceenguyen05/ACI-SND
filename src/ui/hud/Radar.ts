import type { Team } from '../../config/rules';
import type { Match } from '../../sim/mode/Match';
import type { Agent } from '../../sim/entities/Agent';
import type { MapDef } from '../../sim/world/MapTypes';
import { propBounds } from '../../sim/world/World';

const PPM = 4; // pixels per meter in the overview image

/** Pre-renders a top-down overview of the map (used by the radar and the menu map card). */
export function renderOverview(map: MapDef, ppm = PPM): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = map.cols * map.cellSize * ppm;
  c.height = map.rows * map.cellSize * ppm;
  const g = c.getContext('2d')!;
  const cs = map.cellSize * ppm;
  g.fillStyle = '#20252c'; g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < map.rows; r++) for (let col = 0; col < map.cols; col++) {
    const ch = map.grid[r][col];
    if (ch === '#') continue;
    const f = map.floorTypes[ch];
    g.fillStyle = f?.ceiling === null ? '#5a5f66' : f && f.ceiling > 5 ? '#6c727a' : '#7c838c';
    g.fillRect(col * cs, r * cs, cs + 0.5, cs + 0.5);
  }
  g.fillStyle = 'rgba(30,34,40,0.75)';
  for (const p of map.props) {
    if (p.solid === false) continue;
    const b = propBounds(p);
    g.fillRect((b.minX - map.originX) * ppm, (b.minZ - map.originZ) * ppm, (b.maxX - b.minX) * ppm, (b.maxZ - b.minZ) * ppm);
  }
  for (const site of ['A', 'B'] as const) {
    const s = map.sites[site];
    g.fillStyle = 'rgba(220,60,40,0.22)';
    g.fillRect((s.x0 - map.originX) * ppm, (s.z0 - map.originZ) * ppm, (s.x1 - s.x0) * ppm, (s.z1 - s.z0) * ppm);
    g.fillStyle = '#ff6040';
    g.font = `bold ${ppm * 7}px Bahnschrift, Arial`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(site, ((s.x0 + s.x1) / 2 - map.originX) * ppm, ((s.z0 + s.z1) / 2 - map.originZ) * ppm);
  }
  for (const [team, color] of [['T', 'rgba(232,176,74,0.25)'], ['CT', 'rgba(93,155,232,0.25)']] as const) {
    const z = map.buyZones[team];
    g.fillStyle = color;
    g.fillRect((z.x0 - map.originX) * ppm, (z.z0 - map.originZ) * ppm, (z.x1 - z.x0) * ppm, (z.z1 - z.z0) * ppm);
  }
  return c;
}

export class Radar {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private overview: HTMLCanvasElement;

  constructor(private match: Match) {
    this.el = document.createElement('div');
    this.el.className = 'radar';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 400; this.canvas.height = 400;
    this.el.append(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.overview = renderOverview(match.world.map);
  }

  draw(viewer: Agent | null, team: Team | null, yaw: number, rotate: boolean, zoom: number) {
    const g = this.g, W = this.canvas.width, m = this.match, map = m.world.map, now = m.time;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    const scale = (W / 2) / (28 / zoom) / PPM; // show ~28 m radius
    const cx = viewer ? viewer.pos.x : 0, cz = viewer ? viewer.pos.z : 0;
    g.translate(W / 2, W / 2);
    if (rotate && viewer) g.rotate(yaw);
    g.scale(scale, scale);
    g.translate(-(cx - map.originX) * PPM, -(cz - map.originZ) * PPM);
    g.drawImage(this.overview, 0, 0);
    const P = (x: number, z: number) => [(x - map.originX) * PPM, (z - map.originZ) * PPM] as const;
    const dot = (x: number, z: number, color: string, r = 7, label = '') => {
      const [px, pz] = P(x, z);
      g.fillStyle = '#000'; g.beginPath(); g.arc(px, pz, (r + 1.5) / scale * 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = color; g.beginPath(); g.arc(px, pz, r / scale * 2, 0, Math.PI * 2); g.fill();
      if (label) { g.fillStyle = '#000'; g.font = `${10 / scale * 2}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, px, pz); }
    };
    // bomb
    const b = m.bomb;
    const bombVisible = team === 'T' ? b.state !== 'none' : (b.state === 'planted' || (b.state === 'dropped' && now - b.spottedByCT < 1)) || team === null;
    if (bombVisible && b.state !== 'carried' && b.state !== 'none') {
      const [px, pz] = P(b.pos.x, b.pos.z);
      const blink = b.state === 'planted' ? (Math.floor(now * 4) % 2 === 0 ? '#ff3030' : '#ff9030') : '#ff9030';
      g.fillStyle = blink; g.fillRect(px - 5 / scale * 2, pz - 4 / scale * 2, 10 / scale * 2, 8 / scale * 2);
    }
    // own team gadgets
    for (const d of m.gadgets.devices) {
      if (team === null || d.team !== team) continue;
      const [px, pz] = P(d.pos.x, d.pos.z);
      const s = (d.kind === 'mine' ? 3 : 3.5) / scale * 2;
      g.fillStyle = d.kind === 'mine' ? '#ffcc30' : d.kind === 'shield' || d.kind === 'wire' ? '#c8ccd4' : d.jammedUntil > now ? '#555' : '#30d0ff';
      g.fillRect(px - s, pz - s, s * 2, s * 2);
    }
    // decoys look like enemies to the other team
    for (const d of m.utility.decoys) if (team && d.team !== team) dot(d.pos.x, d.pos.z, '#ff3a3a');
    // agents
    for (const a of m.agents) {
      if (!a.alive || a === viewer) continue;
      const mate = team === null || a.team === team;
      if (mate) dot(a.pos.x, a.pos.z, a.team === 'T' ? '#e8b04a' : '#5d9be8', 6.5, a.hasBomb && team === 'T' ? 'C4' : '');
      else if (a.spottedUntil > now) dot(a.pos.x, a.pos.z, '#ff3a3a', 6.5);
    }
    // dead teammates: X
    for (const a of m.agents) if (!a.alive && (team === null || a.team === team) && now - a.deathTime < 10) {
      const [px, pz] = P(a.pos.x, a.pos.z);
      g.strokeStyle = '#ff5050'; g.lineWidth = 2 / scale * 2;
      const s = 4 / scale * 2;
      g.beginPath(); g.moveTo(px - s, pz - s); g.lineTo(px + s, pz + s); g.moveTo(px + s, pz - s); g.lineTo(px - s, pz + s); g.stroke();
    }
    // viewer arrow
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2, W / 2);
    if (viewer) {
      if (!rotate) g.rotate(-yaw);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(0, -14); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
