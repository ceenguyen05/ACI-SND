import { describe, expect, it } from 'vitest';
import { legPose } from '../src/render/HumanoidGeometry';

describe('character foot placement', () => {
  it.each([
    ['standing', 0, -0.81, 0.025], ['crouching', 0, -0.41, 0.105],
    ['strafing', 0.25, -0.7, 0.1], ['running', 0, -0.7, -0.35],
  ] as const)('keeps the foot at the target while %s', (_, x, y, z) => {
    const p = legPose(x, y, z);
    const py = -0.43 * (Math.cos(p.hip) + Math.cos(p.hip + p.knee));
    const pz = -0.43 * (Math.sin(p.hip) + Math.sin(p.hip + p.knee));
    expect(-py * Math.sin(p.roll)).toBeCloseTo(x, 6);
    expect(py * Math.cos(p.roll)).toBeCloseTo(y, 6);
    expect(pz).toBeCloseTo(z, 6);
    expect(p.hip + p.knee + p.ankle).toBeCloseTo(0, 6);
  });
});
