import assert from 'node:assert/strict';
import test from 'node:test';
import { createNatureWorld } from '../src/engines/nature-engine.js';

const G = 9.81;

const volume = (world) => {
  let sum = 0;
  for (const depth of world.water) sum += depth * world.dx ** 2;
  return sum;
};

const massResidual = (world, initial) => {
  const stats = world.stats();
  return (
    stats.waterVolume +
    stats.evaporatedVolume +
    stats.outflowVolume -
    initial -
    stats.inflowVolume -
    stats.rainVolume -
    stats.userAddedVolume
  );
};

const coordinate = (world, index) => -world.size / 2 + index * world.dx;

test('integrated compact creek geometry, water, and source stay in physical scale', () => {
  const world = createNatureWorld({
    n: 128,
    size: 12,
    seed: 714,
    landscape: 'creek',
  });
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let maxSlope = 0;
  for (const height of world.height) {
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
  }
  for (let z = 1; z < world.n - 1; z++) {
    for (let x = 1; x < world.n - 1; x++) {
      const i = z * world.n + x;
      const gx = (world.height[i + 1] - world.height[i - 1]) / (2 * world.dx);
      const gz =
        (world.height[i + world.n] - world.height[i - world.n]) /
        (2 * world.dx);
      maxSlope = Math.max(maxSlope, Math.hypot(gx, gz));
    }
  }
  assert.ok(maxHeight - minHeight < 1.1, `relief ${maxHeight - minHeight}`);
  assert.ok(maxSlope < 0.51, `slope ${maxSlope}`);
  assert.ok(Math.max(...world.water) > 0.14 && Math.max(...world.water) < 0.17);
  for (const zMeters of [-4, 0, 5]) {
    const z = Math.round((zMeters + world.size / 2) / world.dx);
    let wet = 0;
    for (let x = 0; x < world.n; x++)
      if (world.water[z * world.n + x] > 1e-6) wet++;
    const width = wet * world.dx;
    assert.ok(width >= 1.3 && width <= 1.9, `width ${width} at z=${zMeters}`);
  }
  assert.equal(world.stats().burningCells, 0);

  world.reset('dry');
  world.fire.fill(0);
  world.temperature.fill(22);
  world.settings.sunPower = 0;
  world.settings.spring = 1;
  const initial = volume(world);
  world.step(0.04);
  assert.ok(Math.abs(world.stats().inflowVolume - 0.00048) < 1e-12);
  assert.ok(
    Math.max(...world.water) < 0.008,
    `spring peak ${Math.max(...world.water)}`,
  );
  assert.ok(Math.abs(massResidual(world, initial)) < 1e-8);
});

test('integrated creek 0.04 s public stepping agrees with a 0.005 s reference', () => {
  const coarse = createNatureWorld({
    n: 128,
    size: 12,
    seed: 714,
    landscape: 'creek',
  });
  const fine = createNatureWorld({
    n: 128,
    size: 12,
    seed: 714,
    landscape: 'creek',
  });
  for (const world of [coarse, fine]) {
    world.settings.sunPower = 0;
    world.fire.fill(0);
  }
  const initialCoarse = volume(coarse);
  const initialFine = volume(fine);
  for (let t = 0; t < 4; t += 0.04) coarse.step(0.04);
  for (let t = 0; t < 4; t += 0.005) fine.step(0.005);
  let l1 = 0;
  let reference = 0;
  let maxDifference = 0;
  let maxSignal = 0;
  for (let i = 0; i < coarse.water.length; i++) {
    const difference = Math.abs(coarse.water[i] - fine.water[i]);
    l1 += difference;
    reference += Math.abs(fine.water[i]);
    maxDifference = Math.max(maxDifference, difference);
    maxSignal = Math.max(
      maxSignal,
      Math.hypot(coarse.flowX[i], coarse.flowZ[i]) +
        Math.sqrt(G * coarse.water[i]),
    );
  }
  assert.ok(l1 / reference < 0.01, `relative L1 ${l1 / reference}`);
  assert.ok(maxDifference < 0.01, `max depth difference ${maxDifference}`);
  assert.ok(Math.abs(massResidual(coarse, initialCoarse)) < 2e-6);
  assert.ok(Math.abs(massResidual(fine, initialFine)) < 2e-6);
  assert.ok(Number.isFinite(maxSignal));
});

test('integrated creek radiation reaches one metre but has no direct effect beyond 1.2 m', () => {
  const make = (active) => {
    const world = createNatureWorld({
      n: 128,
      size: 12,
      seed: 714,
      landscape: 'creek',
    });
    world.reset('dry');
    world.settings.spring = 0;
    world.settings.sunPower = 0;
    world.settings.wind = 0;
    world.water.fill(0);
    world.fire.fill(0);
    world.temperature.fill(20);
    world.moisture.fill(0.02);
    const sx = 48;
    const sz = 64;
    const source = sz * world.n + sx;
    const near = sz * world.n + sx + Math.round(1 / world.dx);
    const far = sz * world.n + sx + Math.ceil(1.25 / world.dx);
    world.fuel.fill(0);
    world.fuel[near] = 2;
    world.fuel[far] = 2;
    if (active) {
      world.fuel[source] = 3;
      world.temperature[source] = 650;
      world.fire[source] = 1;
    }
    return { world, source, near, far };
  };
  const active = make(true);
  const control = make(false);
  active.world.step(0.04);
  control.world.step(0.04);
  const nearGain =
    active.world.temperature[active.near] -
    control.world.temperature[control.near];
  const farGain =
    active.world.temperature[active.far] -
    control.world.temperature[control.far];
  const nearDistance = Math.abs(
    coordinate(active.world, active.near % active.world.n) -
      coordinate(active.world, active.source % active.world.n),
  );
  const farDistance = Math.abs(
    coordinate(active.world, active.far % active.world.n) -
      coordinate(active.world, active.source % active.world.n),
  );
  assert.ok(
    nearDistance < 1.2 && nearGain > 1e-5,
    `${nearDistance} m, gain ${nearGain}`,
  );
  assert.ok(
    farDistance > 1.2 && Math.abs(farGain) < 1e-7,
    `${farDistance} m, gain ${farGain}`,
  );
  assert.ok(active.world.stats().firePower > 1000);
});
