import { CylinderGeometry, IcosahedronGeometry } from 'three';
import { Random } from '../core/Random';
import type { World } from '../sim/world/World';
import type { Batcher } from './Materials';

/**
 * Scenery past the perimeter wall wherever the map is open to the sky: a belt of North Texas
 * live oaks and cedar elms over the yard fence, with a taller row behind. Visual only; it stands
 * outside every playable cell and has no collision.
 */
export function buildSurroundings(b: Batcher, world: World) {
  const { cellSize: cs, originX: ox, originZ: oz, cols, rows } = world.map;
  const rng = new Random(855);
  const sky = (c: number, r: number) => world.charAt(c, r) !== '#' && world.ceilingAtCell(c, r) === null;
  // For each map edge: is the cell just inside the boundary wall open sky, and where is a point `depth` metres beyond it?
  const edges: { len: number; open: (u: number) => boolean; at: (u: number, depth: number) => [number, number] }[] = [
    { len: cols * cs, open: (u) => sky(Math.floor(u / cs), rows - 2), at: (u, d) => [ox + u, oz + rows * cs + d] },
    { len: cols * cs, open: (u) => sky(Math.floor(u / cs), 1), at: (u, d) => [ox + u, oz - d] },
    { len: rows * cs, open: (u) => sky(1, Math.floor(u / cs)), at: (u, d) => [ox - d, oz + u] },
    { len: rows * cs, open: (u) => sky(cols - 2, Math.floor(u / cs)), at: (u, d) => [ox + cols * cs + d, oz + u] },
  ];
  for (const e of edges) {
    // Mature live oaks / cedar elms are 10-18 m: tall enough to read over the 4.5 m yard wall.
    for (const [depth0, depth1, spacing, h0, h1] of [[4, 9, 7, 10, 14], [13, 22, 9, 13, 18]]) {
      for (let u = rng.range(0, spacing); u < e.len; u += spacing * rng.range(0.75, 1.25)) {
        if (!e.open(Math.min(e.len - 0.01, u))) continue;
        const [x, z] = e.at(u, rng.range(depth0, depth1));
        tree(b, x, z, rng.range(h0, h1), rng);
      }
    }
  }
}

function tree(b: Batcher, x: number, z: number, height: number, rng: Random) {
  const trunk = height * rng.range(0.32, 0.4);
  b.addGeometry('p:#5b4a3b', new CylinderGeometry(0.16, 0.28, trunk, 7), x, trunk / 2, z);
  // Broad, low crowns: a cluster of flattened low-poly blobs around the top of the trunk.
  const spread = height * 0.42;
  const blobs = 4 + Math.floor(rng.range(0, 3));
  for (let k = 0; k < blobs; k++) {
    const a = rng.range(0, Math.PI * 2), d = k === 0 ? 0 : rng.range(0.35, 0.8) * spread;
    const rad = rng.range(0.42, 0.66) * spread;
    const g = new IcosahedronGeometry(rad, 1);
    g.scale(1, rng.range(0.55, 0.78), 1);
    // Dusty olive greens: open sky lights the crowns hard, so keep the albedo low.
    b.addGeometry(k % 2 ? 'p:#34502b' : 'p:#2a4224', g, x + Math.cos(a) * d, trunk + rad * 0.45 + rng.range(-0.2, 0.7), z + Math.sin(a) * d, rng.range(0, 6));
  }
}
