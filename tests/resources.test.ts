import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { bevelBox, releaseModel } from '../src/render/Geometry';
import { deviceModel } from '../src/render/GadgetModels';

describe('render resource ownership', () => {
  it('releases owned geometry and material once and detaches the model', () => {
    const parent = new Group(), model = new Group(), geo = new BoxGeometry(), mat = new MeshBasicMaterial();
    model.add(new Mesh(geo, mat), new Mesh(geo, mat)); parent.add(model);
    let geometries = 0, materials = 0;
    geo.addEventListener('dispose', () => geometries++); mat.addEventListener('dispose', () => materials++);
    releaseModel(model);
    expect(geometries).toBe(1); expect(materials).toBe(1); expect(parent.children).toHaveLength(0);
  });

  it('keeps shared weapon geometry and materials alive for other instances', () => {
    const model = new Group(), geo = bevelBox(0.2, 0.3, 0.4), mat = new MeshBasicMaterial();
    mat.userData.sharedResource = true;
    model.add(new Mesh(geo, mat));
    let disposed = 0;
    const onDispose = () => disposed++;
    geo.addEventListener('dispose', onDispose); mat.addEventListener('dispose', onDispose);
    releaseModel(model);
    expect(disposed).toBe(0);
    expect(bevelBox(0.2, 0.3, 0.4)).toBe(geo);
    geo.removeEventListener('dispose', onDispose); mat.dispose();
  });

  it('releases removed gadgets without disposing materials used by other gadgets', () => {
    const first = deviceModel('c4'), second = deviceModel('c4');
    const a = first.children[0] as Mesh, b = second.children[0] as Mesh;
    expect(a.material).toBe(b.material); expect(a.geometry).not.toBe(b.geometry);
    let geometryDisposals = 0, materialDisposals = 0;
    a.geometry.addEventListener('dispose', () => geometryDisposals++);
    const mat = a.material as MeshBasicMaterial;
    const onDispose = () => materialDisposals++;
    mat.addEventListener('dispose', onDispose);
    releaseModel(first);
    expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(0);
    mat.removeEventListener('dispose', onDispose); releaseModel(second);
  });
});
