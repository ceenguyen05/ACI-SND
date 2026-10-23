import { LatheGeometry, Vector2 } from 'three';

/** A continuous trouser/sleeve silhouette, with small folds instead of capsule joints. */
export function garment(length: number, width: number, depth: number, sleeve = false) {
  const profile = sleeve
    ? [[0.62, 0], [0.78, 0.035], [0.76, 0.08], [0.88, 0.28], [0.94, 0.52], [1, 0.82], [0.9, 0.97], [0.65, 1]]
    : [[0.66, 0], [0.77, 0.04], [0.78, 0.14], [0.9, 0.4], [1, 0.68], [0.95, 0.9], [0.8, 1]];
  const points = [new Vector2(0, -length), ...profile.map(([r, y]) => new Vector2(r * width, (y - 1) * length)), new Vector2(0, 0)];
  const geo = new LatheGeometry(points, 16);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const angle = Math.atan2(z, x);
    const fold = 1 + Math.sin(y * 74 + Math.cos(angle * 3) * 1.8) * 0.035;
    p.setXYZ(i, x * fold, y, z * depth / width * fold);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Planar two-bone IK plus lateral rotation; the foot remains at its intended height. */
export function legPose(x: number, y: number, z: number, upper = 0.43, lower = 0.43) {
  const vertical = Math.hypot(x, y);
  const distance = Math.min(upper + lower - 0.001, Math.max(0.05, Math.hypot(vertical, z)));
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  const hip = Math.atan2(-z, vertical) + Math.acos(clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance)));
  const knee = -(Math.PI - Math.acos(clamp((upper * upper + lower * lower - distance * distance) / (2 * upper * lower))));
  return { hip, knee, roll: Math.atan2(x, -y), ankle: -hip - knee };
}
