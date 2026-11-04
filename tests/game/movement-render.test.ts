import { describe, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { OUTFITS } from '../../src/config/cosmetics';
import { CharacterModel, type CharacterPose } from '../../src/render/CharacterModel';
import { ViewModel, type ViewModelState } from '../../src/render/ViewModel';
import type { MovementCycle } from '../../src/render/MovementMotion';

// Test the real model transforms; only browser-painted texture maps are replaced.
vi.mock('../../src/render/Textures', () => {
  const info = () => ({ tex: null, worldW: 1, worldH: 1 });
  return { TEX: new Proxy({}, { get: () => info }), surfaceDetail: () => ({ normal: null, roughness: null }),
    finishTexture: () => null, flareSprite: () => null, contactShadow: () => null };
});

describe('rendered movement', () => {
  it.each([1.5, 3.3, 4.5, 6.35])('keeps planted feet near the floor throughout a %s m/s stride', (speed) => {
    const model = new CharacterModel(OUTFITS[0].look);
    const rig = model as unknown as { gait: MovementCycle; footL: Group; footR: Group };
    const p: CharacterPose = { speed, maxSpeed: 6.35, forward: speed, right: 0, crouch: 0, pitch: 0, lean: 0,
      onGround: true, dead: false, deathT: 0, firing: 0, planting: false, dt: 1 / 60 };
    for (let i = 0; i < 120; i++) model.update(p);
    let maxError = 0;
    for (const [forward, right, crouch] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [Math.SQRT1_2, Math.SQRT1_2, 0], [1, 0, 1]]) {
      const pose = { ...p, forward: speed * forward, right: speed * right, crouch };
      for (let i = 0; i < 120; i++) model.update(pose);
      for (let i = 0; i < 80; i++) {
        rig.gait.phase = i / 80 * Math.PI * 2;
        model.update({ ...pose, dt: 0 }); model.root.updateMatrixWorld(true);
        for (const [foot, offset] of [[rig.footL, 0], [rig.footR, 0.5]] as const) {
          const target = 0.09 + rig.gait.foot(offset).lift;
          maxError = Math.max(maxError, Math.abs(foot.getWorldPosition(new Vector3()).y - target));
        }
        const left = rig.footL.getWorldPosition(new Vector3()), rightFoot = rig.footR.getWorldPosition(new Vector3());
        expect(rightFoot.x - left.x).toBeGreaterThanOrEqual(0.099);
      }
    }
    expect(maxError).toBeLessThan(0.015);
    model.dispose();
  });

  it('settles the running weapon and brings it back onto the sight line when aiming', () => {
    const vm = new ViewModel(); vm.setItem('w:ravager');
    const rig = vm as unknown as { rig: Group; runT: number };
    const idle: ViewModelState = { dt: 1 / 60, speed: 0, maxSpeed: 6.35, forwardSpeed: 0, lateralSpeed: 0, verticalSpeed: 0,
      onGround: true, crouch: 0, lookDX: 0, lookDY: 0, ads: false, scoped: false, reload: 0, draw: 1,
      planting: false, defusing: false, throwPrimed: false };
    for (let i = 0; i < 120; i++) vm.update(idle);
    const rest = rig.rig.position.clone();
    for (let i = 0; i < 120; i++) vm.update({ ...idle, speed: 6.35, forwardSpeed: 6.35 });
    expect(rig.runT).toBeGreaterThan(0.9);
    expect(rig.rig.position.y).toBeLessThan(rest.y - 0.01);
    for (let i = 0; i < 120; i++) vm.update({ ...idle, speed: 6.35, forwardSpeed: 6.35, ads: true, busy: true });
    const aimedMoving = rig.rig.position.clone();
    expect(rig.runT).toBeLessThan(0.001);
    for (let i = 0; i < 120; i++) vm.update({ ...idle, ads: true, busy: true });
    expect(rig.rig.position.distanceTo(aimedMoving)).toBeLessThan(0.001);
    for (let i = 0; i < 120; i++) vm.update(idle);
    expect(rig.rig.position.distanceTo(rest)).toBeLessThan(0.0001);
  });
});
