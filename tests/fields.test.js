import assert from 'node:assert/strict';
import { createFluid } from '../src/engines/fluid.js';
import { createHeat } from '../src/engines/heat.js';

const fluid = createFluid({ width: 300, height: 200 }).reset('vortex');
const before = fluid.getState().dye.slice();
fluid.step(0.05);
const after = fluid.getState();
assert.equal(
  after.dye.length,
  after.cols * after.rows,
  'fluid exposes grid dye',
);
assert.ok(after.stats.dye > 0, 'vortex has visible dye');
assert.ok(
  before.some((v, i) => Math.abs(v - after.dye[i]) > 0.00001),
  'advection moves vortex dye',
);
assert.ok(
  Number.isFinite(after.stats.divergence),
  'projection produces finite divergence',
);
fluid.pointerDown(150, 100, 'wall').pointerUp();
const wall = fluid.getState();
assert.ok(wall.solid.some(Boolean), 'wall tool marks no-flow cells');
fluid.step(0.05);
for (let i = 0; i < wall.solid.length; i++)
  if (wall.solid[i]) assert.equal(wall.u[i], 0, 'solid has no horizontal flow');

const heat = createHeat({ width: 300, height: 200 }).reset('conduction');
const h0 = heat.getState();
assert.ok(
  h0.stats.max >= 80 && h0.stats.min === 0,
  'conduction preset has hot and cold reservoirs',
);
const center = (h0.rows >> 1) * h0.cols + (h0.cols >> 1);
const start = h0.temp[center];
heat.step(0.05);
assert.ok(
  heat.getState().temp[center] >= start,
  'heat diffuses into room-temperature center',
);
heat.pointerDown(150, 100, 'wall').pointerUp();
const insulated = heat.getState();
assert.ok(insulated.solid.some(Boolean), 'wall tool creates insulating cells');
heat.setOptions({ conductivity: 2, sourceTemperature: 120 }).step(0.05);
for (const t of heat.getState().temp)
  assert.ok(
    Number.isFinite(t) && t >= 0 && t <= 120,
    'explicit heat update remains bounded',
  );
console.log('fluid and heat field checks passed');
