import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createNatureWorld } from '../src/engines/nature-engine.js';
import { createEnvironment } from '../src/render/nature-environment.js';

test('environment color channels have actual backing data for every rendered mesh', () => {
  const scene = new THREE.Scene();
  const environment = createEnvironment(scene, createNatureWorld({ n: 32 }));
  let tintedBatches = 0;
  try {
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!material.vertexColors) continue;
        const colors = object.geometry.getAttribute('color');
        assert.ok(
          colors,
          `${object.name}: an enabled vertex color channel must exist`,
        );
        assert.equal(
          colors.count,
          object.geometry.getAttribute('position').count,
        );
        assert.ok(colors.array.every(Number.isFinite));
      }
      if (!object.isInstancedMesh || !object.count) return;
      assert.ok(
        object.instanceColor,
        `${object.name}: per-instance palette exists`,
      );
      assert.ok(object.instanceColor.count >= object.count);
      assert.ok(object.instanceColor.array.every(Number.isFinite));
      const palette = object.instanceColor.array;
      assert.ok(
        palette.some(
          (value, i) =>
            i % 3 === 0 &&
            Math.max(value, palette[i + 1], palette[i + 2]) -
              Math.min(value, palette[i + 1], palette[i + 2]) >
              0.02,
        ),
        `${object.name}: its natural palette contains chromatic colors`,
      );
      tintedBatches++;
    });
    assert.ok(
      tintedBatches >= 10,
      'trees, grass, reeds and rocks all exercise the color contract',
    );
  } finally {
    environment.dispose();
  }
});

test('forest geometry stays finite, boundary walls stay on the perimeter, disposal releases the scene', () => {
  const w = createNatureWorld({ n: 32 });
  const scene = new THREE.Scene();
  const environment = createEnvironment(scene, w);
  const trunk = scene.getObjectByName('tree-trunks');
  assert.ok(trunk.count > 50, 'a populated natural forest is present');
  assert.equal(
    trunk.geometry.parameters.height,
    1,
    'instance scale supplies the trunk height',
  );
  assert.ok(trunk.geometry.parameters.radialSegments >= 6);
  let walls = 0;
  scene.traverse((object) => {
    if (object.isInstancedMesh)
      assert.ok(object.instanceMatrix.array.every(Number.isFinite));
    if (!object.name.startsWith('exposed-stratified-earth-')) return;
    walls++;
    const p = object.geometry.attributes.position,
      indices = object.geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      const edge = ['getX', 'getZ'].some((axis) =>
        [-16, 16].some((bound) =>
          ids.every((j) => Math.abs(p[axis](j) - bound) < 1e-5),
        ),
      );
      assert.ok(edge, 'no diagonal wall crosses the playable terrain');
      const a = new THREE.Vector3().fromBufferAttribute(p, ids[0]),
        b = new THREE.Vector3().fromBufferAttribute(p, ids[1]),
        c = new THREE.Vector3().fromBufferAttribute(p, ids[2]);
      const center = a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      const normal = b.sub(a).cross(c.sub(a));
      assert.ok(
        normal.x * center.x + normal.z * center.z > 0,
        'the earth boundary faces outward, not into the terrain',
      );
    }
  });
  assert.equal(walls, 3);
  w.fuel.fill(0);
  w.fire.fill(0);
  w.water.fill(0.3);
  environment.update(20, w.settings);
  const grass = scene.getObjectByName('wind-grass');
  const m = new THREE.Matrix4(),
    scale = new THREE.Vector3();
  for (let i = 0; i < grass.count; i++) {
    grass.getMatrixAt(i, m);
    scale.setFromMatrixScale(m);
    assert.ok(scale.length() < 0.15, 'flooded/burned grass disappears');
  }
  environment.rebuild();
  environment.dispose();
  environment.dispose();
  assert.equal(scene.children.length, 0);
});
