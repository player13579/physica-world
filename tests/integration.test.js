import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatial, spatialMath } from '../src/engines/spatial.js';
import { createFluid } from '../src/engines/fluid.js';
import { createHeat } from '../src/engines/heat.js';

test('3D glass of index one leaves incident direction unchanged', () => {
  const lab = createSpatial({ mode: 'optics' });
  lab.setOptions({ refractiveIndex: 1, rayCount: 5 });
  for (const ray of lab.getState().lines) {
    assert.ok(ray.b[0] > ray.a[0]);
    assert.ok(Math.abs(ray.b[1] - ray.a[1]) < 1e-8);
    assert.ok(Math.abs(ray.b[2] - ray.a[2]) < 1e-8);
  }
  lab.interact([3, 3, 0], 'glass');
  const ids = lab.getState().instances.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('3D refraction detects total internal reflection', () => {
  assert.equal(
    spatialMath.refract(
      [Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3), 0],
      [0, 1, 0],
      1.5,
      1,
    ),
    null,
  );
});
test('3D mechanics enforces capacity and erase does not create phantom bodies', () => {
  const lab = createSpatial({ mode: 'mechanics' });
  for (let i = 0; i < 110; i++) lab.interact([0, 7, 0], 'ball');
  assert.equal(lab.getState().instances.length, 100);
  for (let i = 0; i < 105; i++) lab.interact([0, 2, 0], 'erase');
  assert.equal(lab.getState().instances.length, 0);
  lab.interact([0, 2, 0], 'grab');
  assert.equal(lab.getState().instances.length, 0);
  assert.throws(() => lab.interact([NaN, 2, 0], 'ball'));
});
test('3D thermal source heats an initially ambient neighbour along Z', () => {
  const lab = createSpatial({ mode: 'heat' });
  lab.interact([0, 4, 0], 'hot');
  const neighbour = 'h' + (9 + 18 * (6 + 12 * 7));
  assert.ok(!lab.getState().instances.some((x) => x.id === neighbour));
  for (let i = 0; i < 60; i++) lab.step(1 / 60);
  assert.ok(
    lab.getState().instances.some((x) => x.id === neighbour),
    'depth neighbour should warm enough to become visible',
  );
});
test('3D fluid obstacle tools are independent and all faces exclude particles', () => {
  const lab = createSpatial({ mode: 'fluid' });
  lab.interact([-1, 1, 0], 'wall');
  assert.equal(lab.getState().stats.obstacles, 1);
  for (let i = 0; i < 20; i++) lab.step(1 / 60);
  const s = lab.getState(),
    o = s.instances.find((i) => i.shape === 'box');
  for (const p of s.instances.filter((i) => i.shape === 'sphere'))
    assert.ok(
      p.position.some(
        (v, k) => Math.abs(v - o.position[k]) >= o.size[k] / 2 + 0.074,
      ),
    );
  lab.interact([-1, 1, 0], 'erase');
  assert.equal(lab.getState().stats.obstacles, 0);
  for (let i = 0; i < 20; i++) lab.interact([0, 3, 0], 'dye');
  assert.equal(lab.getState().stats.particles, 600);
});
test('2D drawing retains its wall and cold brush during a drag', () => {
  const fluid = createFluid({ width: 300, height: 200 });
  fluid.reset('empty');
  fluid.pointerDown(70, 100, 'wall');
  fluid.pointerMove(130, 100);
  fluid.pointerUp();
  assert.ok(fluid.getState().solid.reduce((a, b) => a + b, 0) > 1);
  const heat = createHeat({ width: 300, height: 200 });
  heat.reset('empty');
  heat.pointerDown(70, 100, 'cold');
  heat.pointerMove(130, 100);
  heat.pointerUp();
  assert.ok(heat.getState().sources.filter((x) => x === -1).length > 1);
  assert.equal(heat.getState().stats.max, 20);
});
