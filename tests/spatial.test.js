import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatial, spatialMath } from '../src/engines/spatial.js';

const finiteState = (state) => {
  for (const item of state.instances)
    for (const value of item.position) assert.ok(Number.isFinite(value));
};

test('all 3D labs step with finite bounded output', () => {
  for (const mode of ['mechanics', 'fluid', 'heat', 'optics']) {
    const lab = createSpatial({ mode });
    lab.step(1 / 60);
    const state = lab.getState();
    assert.ok(state.instances.length > 0);
    finiteState(state);
  }
});

test('mechanics gravity pulls a suspended body down', () => {
  const lab = createSpatial({ mode: 'mechanics' });
  const start = lab.getState().instances.find((x) => x.id === 'm2').position[1];
  for (let i = 0; i < 90; i++) lab.step(1 / 60);
  assert.ok(
    lab.getState().instances.find((x) => x.id === 'm2').position[1] < start,
  );
});

test('a platform is static under repeated physics steps', () => {
  const lab = createSpatial({ mode: 'mechanics' });
  lab.interact([2, 2, 0], 'platform');
  const platform = lab.getState().instances.at(-1);
  for (let i = 0; i < 60; i++) lab.step(1 / 60);
  assert.deepEqual(
    lab.getState().instances.find((x) => x.id === platform.id).position,
    platform.position,
  );
});

test('heat transfers through the depth axis', () => {
  const lab = createSpatial({ mode: 'heat' });
  lab.interact([0, 4, 0], 'hot');
  for (let i = 0; i < 120; i++) lab.step(1 / 60);
  const s = lab.getState();
  assert.ok(s.stats.max > s.stats.average);
  assert.ok(s.instances.some((x) => x.position[2] !== 0 && x.opacity > 0.12));
});

test('Snell refraction bends air-to-glass toward the normal', () => {
  const r = spatialMath.refract([1, -1, 0], [0, 1, 0], 1, 1.5);
  assert.ok(r && Math.abs(r[0]) < Math.SQRT1_2);
});

test('a finite 3D mirror intersects and reflects ray paths', () => {
  const lab = createSpatial({ mode: 'optics' });
  lab.interact([-3, 3, 0], 'mirror');
  const state = lab.getState();
  assert.ok(state.stats.reflections > 0);
  assert.ok(
    state.lines.some((line) => line.a[0] < -2.99 && line.b[0] < line.a[0]),
  );
});
