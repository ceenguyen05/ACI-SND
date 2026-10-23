import { BufferGeometry, Group, Mesh, type Material, type Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rounded = new Map<string, BufferGeometry>();

/** Small bevels catch light; shared immutable geometry keeps procedural models cheap. */
export function bevelBox(w: number, h: number, d: number, radius = Math.min(w, h, d) * 0.16, segments = 1): BufferGeometry {
  const key = [w, h, d, radius, segments].join(':');
  let geometry = rounded.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(w, h, d, segments, radius);
    geometry.userData.sharedResource = true;
    rounded.set(key, geometry);
  }
  return geometry;
}

/** Release a transient model without invalidating cached weapon geometry or materials. */
export function releaseModel(root: Object3D) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry && !mesh.geometry.userData.sharedResource) geometries.add(mesh.geometry);
    if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!mat.userData.sharedResource) materials.add(mat);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

/** Merge siblings by material while preserving named groups for animated parts. */
export function batchModel(root: Group) {
  const buckets = new Map<Material, BufferGeometry[]>();
  for (const child of [...root.children]) {
    if (child instanceof Group) { batchModel(child); continue; }
    if (!(child instanceof Mesh) || child.name || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const copy = child.geometry.clone().applyMatrix4(child.matrix);
    const geometry = copy.index ? copy.toNonIndexed() : copy;
    if (copy !== geometry) copy.dispose();
    const list = buckets.get(child.material) ?? [];
    list.push(geometry); buckets.set(child.material, list);
    root.remove(child);
  }
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.userData.batched = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }
}

