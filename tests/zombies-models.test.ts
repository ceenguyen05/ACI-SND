import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { batchZombiesModel, tintModel } from '../src/render/ZombiesModels';
import { releaseModel } from '../src/render/Geometry';

describe('Zombies prop rendering', () => {
  it('shared prop materials receive lighting once regardless of how many slats use them', () => {
    const g = new Group(), mat = new MeshStandardMaterial({ color: new Color(0.8, 0.6, 0.4) });
    const geometry = new BoxGeometry(1, 1, 1);
    for (let i = 0; i < 24; i++) g.add(new Mesh(geometry, mat));
    tintModel(g, new Color(0.5, 0.5, 0.5));
    expect(mat.color.r).toBeCloseTo(0.4); expect(mat.color.g).toBeCloseTo(0.3); expect(mat.color.b).toBeCloseTo(0.2);
    releaseModel(g);
  });

  it('batching reduces slat submissions while keeping the shutter pivot and LEDs operable', () => {
    const g = new Group(), panel = new Group(); panel.name = 'panel'; g.add(panel);
    const mat = new MeshStandardMaterial();
    const geometry = new BoxGeometry(1, 0.1, 0.1);
    let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
    for (let i = 0; i < 24; i++) { const slat = new Mesh(geometry, mat); slat.position.y = i * 0.17; panel.add(slat); }
    const led = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), mat); led.name = 'ledOn'; g.add(led);
    batchZombiesModel(g);
    expect(g.getObjectByName('panel')).toBe(panel);
    expect(panel.children).toHaveLength(1);
    expect(g.getObjectByName('ledOn')).toBe(led);
    panel.visible = false; led.visible = false;
    let visible = 0; g.traverseVisible((o) => { if (o instanceof Mesh) visible++; });
    expect(visible).toBe(0);
    expect(disposed).toBe(1);
    releaseModel(g);
  });

  it('local prop lighting cannot darken cached materials used by held weapons or later matches', () => {
    const original = new MeshStandardMaterial({ color: new Color(0.8, 0.6, 0.4) });
    original.userData.sharedResource = true;
    const g = new Group(), a = new Mesh(new BoxGeometry(1, 1, 1), original), b = new Mesh(new BoxGeometry(1, 1, 1), original);
    g.add(a, b); tintModel(g, new Color(0.5, 0.5, 0.5));
    expect(a.material).toBe(b.material);
    expect(a.material).not.toBe(original);
    expect(a.material.userData.sharedResource).toBe(false);
    expect(original.color.r).toBeCloseTo(0.8);
    expect(a.material.color.r).toBeCloseTo(0.4);
    releaseModel(g); original.dispose();
  });

  it('batching never disposes cached weapon geometry used by another model', () => {
    const shared = new BoxGeometry(1, 1, 1); shared.userData.sharedResource = true;
    let disposed = 0; shared.addEventListener('dispose', () => disposed++);
    const g = new Group(); g.add(new Mesh(shared, new MeshStandardMaterial()));
    batchZombiesModel(g); releaseModel(g);
    expect(disposed).toBe(0);
    shared.dispose();
  });
});
