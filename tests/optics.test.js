import test from 'node:test';
import assert from 'node:assert/strict';
import { reflect, refract, createOptics } from '../src/engines/optics.js';

test('reflection preserves the angle of incidence', () => {
  const incoming = { x: 1, y: -1 },
    normal = { x: 0, y: 1 },
    reflected = reflect(incoming, normal);
  assert.ok(Math.abs(reflected.x - Math.SQRT1_2) < 1e-10);
  assert.ok(Math.abs(reflected.y - Math.SQRT1_2) < 1e-10);
});
test('Snell refraction bends toward normal entering glass', () => {
  const out = refract({ x: 0.5, y: -0.8660254 }, { x: 0, y: 1 }, 1, 1.5);
  assert.ok(out && Math.abs(out.x - 1 / 3) < 1e-6 && out.y < -0.94);
});
test('critical-angle crossing produces total internal reflection', () => {
  assert.equal(refract({ x: 0.8, y: -0.6 }, { x: 0, y: 1 }, 1.5, 1), null);
});
test('engine produces finite bounded ray segments', () => {
  const engine = createOptics();
  const state = engine.reset('lens');
  assert.ok(state.rays.length > 0 && state.rays.length < 500);
  assert.ok(
    state.rays.every((r) =>
      [r.a.x, r.a.y, r.b.x, r.b.y].every(Number.isFinite),
    ),
  );
});
