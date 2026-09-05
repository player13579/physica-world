import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNatureWorld,
  terrainHeight,
  getSunState,
} from '../src/engines/nature-engine.js';

test('nature engine contract', async (t) => {
  const volume = (world) => world.stats().waterVolume;

  function disableExternalSources(world) {
    world.settings.spring = 0;
    world.settings.rain = 0;
    world.settings.sunPower = 0;
    world.settings.wind = 0;
  }

  await t.test(
    'terrain has a descending river corridor and a lower pond',
    () => {
      const upstream = terrainHeight(0, -14);
      const downstream = terrainHeight(0, 13);
      assert.ok(
        upstream > downstream + 1.5,
        `${upstream} should exceed ${downstream}`,
      );
      assert.ok(terrainHeight(0, 8) < terrainHeight(8, 8));
    },
  );

  await t.test(
    'closed accounting conserves water including evaporation and open-boundary outflow',
    () => {
      const world = createNatureWorld({ n: 24, size: 24, seed: 4 });
      disableExternalSources(world);
      world.settings.ambient = 10;
      world.temperature.fill(10);
      world.waterTemperature.fill(10);
      world.fire.fill(0);
      const initial = volume(world);
      for (let i = 0; i < 350; i++) world.step(0.04);
      const s = world.stats();
      const accounted = s.waterVolume + s.evaporatedVolume + s.outflowVolume;
      assert.ok(
        Math.abs(accounted - initial) < Math.max(2e-4, initial * 2e-5),
        `${accounted} != ${initial}`,
      );
      assert.equal(s.inflowVolume, 0);
      assert.equal(s.rainVolume, 0);
    },
  );

  await t.test(
    'gravity sends the river toward positive z and terrain barriers divert it',
    () => {
      const base = createNatureWorld({ n: 34, size: 28, seed: 7 });
      disableExternalSources(base);
      base.fire.fill(0);
      for (let i = 0; i < 80; i++) base.step(0.04);
      let downstream = 0;
      let wet = 0;
      for (let z = 2; z < base.n - 3; z++) {
        for (let x = 1; x < base.n - 1; x++) {
          const i = z * base.n + x;
          if (base.water[i] > 0.01) {
            downstream += base.flowZ[i];
            wet++;
          }
        }
      }
      assert.ok(
        downstream / wet > 0.01,
        `mean downstream velocity ${downstream / wet}`,
      );

      const changed = createNatureWorld({ n: 34, size: 28, seed: 7 });
      disableExternalSources(changed);
      changed.fire.fill(0);
      changed.brush('rock', 0, 0, 3.2, 2.5);
      for (let i = 0; i < 100; i++) changed.step(0.04);
      let lateral = 0;
      let changedWet = 0;
      for (let i = 0; i < changed.water.length; i++) {
        if (changed.water[i] > 0.01) {
          lateral += Math.abs(changed.flowX[i]);
          changedWet++;
        }
      }
      assert.ok(
        lateral / changedWet > 0.01,
        'barrier should produce measurable lateral flow',
      );
      assert.ok(changed.revision > base.revision);
    },
  );

  await t.test(
    'dry fire consumes fuel while standing water quenches the same ignition energy',
    () => {
      const dry = createNatureWorld({ n: 25, size: 20, seed: 11 });
      dry.reset('dry');
      disableExternalSources(dry);
      dry.fire.fill(0);
      dry.temperature.fill(22);
      const center = 12 * dry.n + 12;
      dry.fuel[center] = 2;
      dry.moisture[center] = 0.04;
      dry.temperature[center] = 560;
      dry.fire[center] = 1;
      const initialFuel = dry.fuel[center];
      for (let i = 0; i < 300; i++) dry.step(0.04);
      assert.ok(dry.fuel[center] < initialFuel - 0.035);
      assert.ok(dry.stats().burnedMass > 0);

      const wet = createNatureWorld({ n: 25, size: 20, seed: 11 });
      wet.reset('dry');
      disableExternalSources(wet);
      wet.fire.fill(0);
      wet.temperature.fill(22);
      wet.fuel[center] = 2;
      wet.moisture[center] = 1;
      wet.water[center] = 0.08;
      wet.temperature[center] = 560;
      wet.fire[center] = 1;
      for (let i = 0; i < 300; i++) wet.step(0.04);
      assert.ok(wet.fire[center] < 0.02);
      assert.ok(wet.fuel[center] > initialFuel - 0.006);
    },
  );

  await t.test(
    'fire radiation deposits heat in neighbors and can ignite dry fuel',
    () => {
      const makeWorld = (burningSource) => {
        const world = createNatureWorld({ n: 27, size: 13, seed: 18 });
        world.reset('dry');
        disableExternalSources(world);
        world.fire.fill(0);
        world.temperature.fill(20);
        world.water.fill(0);
        world.moisture.fill(0.02);
        const source = 13 * world.n + 13;
        const neighbor = source + 1;
        world.fuel[source] = burningSource ? 3 : 0;
        world.fuel[neighbor] = 2;
        world.temperature[source] = burningSource ? 650 : 20;
        world.temperature[neighbor] = 144;
        world.fire[source] = burningSource ? 1 : 0;
        return { world, neighbor };
      };
      const active = makeWorld(true);
      const control = makeWorld(false);
      const world = active.world;
      const source = 13 * world.n + 13;
      const neighbor = source + 1;
      const neighborStart = world.temperature[neighbor];
      for (let i = 0; i < 1800; i++) {
        active.world.step(0.04);
        control.world.step(0.04);
      }
      assert.ok(
        world.temperature[neighbor] >
          control.world.temperature[control.neighbor] + 2,
        'burning source must deposit measurable neighbor heat above cooling control',
      );
      assert.ok(
        world.temperature[neighbor] > neighborStart,
        `neighbor reached ${world.temperature[neighbor]}`,
      );
      assert.ok(
        world.fire[neighbor] > 1e-6 &&
          control.world.fire[control.neighbor] === 0,
        'radiation should push near-threshold dry fuel into ignition',
      );
      assert.ok(
        world.fuel[neighbor] < control.world.fuel[control.neighbor] - 0.00001,
        'radiative ignition should increase measured fuel consumption',
      );
    },
  );

  await t.test('water flux transports thermal energy downstream', () => {
    const world = createNatureWorld({ n: 25, size: 20, seed: 25 });
    disableExternalSources(world);
    world.fire.fill(0);
    world.temperature.fill(20);
    world.waterTemperature.fill(20);
    let hot = -1;
    for (let z = 2; z < 8 && hot < 0; z++) {
      for (let x = 1; x < world.n - 1; x++) {
        const i = z * world.n + x;
        if (world.water[i] > 0.05) {
          hot = i;
          break;
        }
      }
    }
    assert.ok(hot >= 0);
    world.waterTemperature[hot] = 85;
    const z0 = (hot / world.n) | 0;
    const before = [];
    for (let z = z0 + 1; z <= Math.min(world.n - 1, z0 + 4); z++)
      before.push(world.waterTemperature[z * world.n + (hot % world.n)]);
    for (let i = 0; i < 100; i++) world.step(0.04);
    let warming = 0;
    for (let k = 0; k < before.length; k++) {
      const z = z0 + 1 + k;
      warming = Math.max(
        warming,
        world.waterTemperature[z * world.n + (hot % world.n)] - before[k],
      );
    }
    assert.ok(warming > 0.02, `downstream warming ${warming}`);
  });

  await t.test('rain adds accounted volume and suppresses combustion', () => {
    const dry = createNatureWorld({ n: 20, size: 16, seed: 31 });
    dry.reset('dry');
    disableExternalSources(dry);
    const wet = createNatureWorld({ n: 20, size: 16, seed: 31 });
    wet.reset('dry');
    disableExternalSources(wet);
    const i = 10 * dry.n + 10;
    for (const world of [dry, wet]) {
      world.fire.fill(0);
      world.temperature.fill(22);
      world.fuel[i] = 2;
      world.moisture[i] = 0.08;
      world.temperature[i] = 560;
      world.fire[i] = 1;
    }
    wet.settings.rain = 240;
    const beforeRain = wet.stats().waterVolume;
    for (let k = 0; k < 400; k++) {
      dry.step(0.04);
      wet.step(0.04);
    }
    const wetStats = wet.stats();
    assert.ok(wetStats.rainVolume > 0);
    assert.ok(
      wetStats.waterVolume +
        wetStats.outflowVolume +
        wetStats.evaporatedVolume >
        beforeRain,
    );
    assert.ok(
      wet.fuel[i] > dry.fuel[i] + 0.01,
      `${wet.fuel[i]} should exceed ${dry.fuel[i]}`,
    );
    assert.ok(wet.fire[i] < dry.fire[i] || wet.fire[i] < 0.05);
  });

  await t.test(
    'sun angle changes irradiance and terrain creates horizon shadows',
    () => {
      const world = createNatureWorld({ n: 36, size: 32, seed: 2 });
      world.settings.hour = 12;
      world.step(0.016);
      const noonPower = world.stats().solarPower;
      const noonState = getSunState(world.settings);
      assert.ok(Math.abs(Math.hypot(...noonState.direction) - 1) < 1e-10);
      world.settings.hour = 7;
      world.step(0.016);
      const lowPower = world.stats().solarPower;
      let dark = 0;
      let lit = 0;
      for (const value of world.sunlight) {
        if (value < 0.001) dark++;
        if (value > 20) lit++;
      }
      assert.ok(noonPower > lowPower * 1.2);
      assert.ok(
        dark > 0 && lit > 0,
        `expected shadow and sun, got ${dark}/${lit}`,
      );
      world.settings.hour = 12;
      world.settings.rain = 0;
      world.step(0.016);
      const clearPower = world.stats().solarPower;
      world.settings.rain = 100;
      world.step(0.016);
      const rainyPower = world.stats().solarPower;
      assert.ok(
        Math.abs(rainyPower / clearPower - 0.36) < 0.002,
        `${rainyPower} / ${clearPower}`,
      );
      assert.ok(
        Math.abs(getSunState(world.settings).irradianceMultiplier - 0.36) <
          1e-12,
      );
      world.settings.rain = 0;
      world.step(0.016);
      let brightest = 0;
      for (let i = 1; i < world.sunlight.length; i++)
        if (world.sunlight[i] > world.sunlight[brightest]) brightest = i;
      const openLight = world.sunlight[brightest];
      const canopyX = -world.size / 2 + (brightest % world.n) * world.dx;
      const canopyZ =
        -world.size / 2 + Math.floor(brightest / world.n) * world.dx;
      const canopyBase = world.height[brightest] + 0.5;
      assert.ok(
        world.setCanopies(
          [
            {
              x: canopyX,
              z: canopyZ,
              base: canopyBase,
              top: canopyBase + 3,
              radius: world.dx * 1.6,
              opacity: 0.8,
            },
          ],
          1,
        ),
      );
      world.step(0.016);
      const shadedLight = world.sunlight[brightest];
      assert.ok(
        shadedLight < openLight * 0.25,
        `${shadedLight} should be less than ${openLight}`,
      );
      assert.ok(
        Math.abs(shadedLight / openLight - 0.2) < 0.002,
        'one canopy must attenuate once even when its crown spans several ray samples',
      );
      assert.equal(
        world.setCanopies([], 1),
        false,
        'same source revision must not replace or invalidate canopy state',
      );
      world.step(0.016);
      assert.equal(world.sunlight[brightest], shadedLight);
      assert.ok(world.setCanopies([], 2));
      world.step(0.016);
      assert.ok(
        Math.abs(world.sunlight[brightest] - openLight) < openLight * 1e-5,
        'removing a charred/lost canopy should restore open sunlight',
      );
    },
  );

  await t.test('long integration remains finite and bounded', () => {
    const world = createNatureWorld({ n: 32, size: 24, seed: 77 });
    world.settings.rain = 28;
    world.settings.spring = 1.4;
    world.brush('fire', 5, 3, 1.4, 1.2);
    for (let i = 0; i < 1800; i++) world.step(i % 7 === 0 ? 0.11 : 0.04);
    for (const field of [
      'height',
      'water',
      'temperature',
      'waterTemperature',
      'fuel',
      'moisture',
      'fire',
      'flowX',
      'flowZ',
      'sunlight',
    ]) {
      for (const value of world[field])
        assert.ok(Number.isFinite(value), `${field} contains ${value}`);
    }
    assert.ok(Math.min(...world.water) >= 0);
    assert.ok(Math.max(...world.water) < 8);
    assert.ok(Math.max(...world.temperature) <= 1250);
    assert.ok(Math.min(...world.temperature) >= -40);
    assert.ok(Math.min(...world.fuel) >= 0 && Math.max(...world.fuel) <= 3);
    const s = world.stats();
    for (const value of Object.values(s)) assert.ok(Number.isFinite(value));
  });

  await t.test(
    'brush bounds, sampling, and revision semantics are stable',
    () => {
      const world = createNatureWorld({ n: 20, size: 16 });
      const revision = world.revision;
      const vegetationRevision = world.vegetationRevision;
      assert.ok(world.burnRate instanceof Float32Array);
      assert.equal(world.sample(99, 0), null);
      assert.ok(world.brush('plant', 999, -999, 100, 99));
      assert.equal(world.revision, revision);
      assert.equal(world.vegetationRevision, vegetationRevision + 1);
      assert.ok(world.brush('raise', 0, 0, 1, 1));
      assert.equal(world.revision, revision + 1);
      const s = world.sample(0, 0);
      assert.ok(s && Object.keys(s).includes('speed'));
      const exact = world.sample(0, 0);
      world.brush('fire', exact.x, exact.z, world.dx * 0.55, 1);
      const center =
        Math.round((exact.z + world.size / 2) / world.dx) * world.n +
        Math.round((exact.x + world.size / 2) / world.dx);
      const firstTemperature = world.temperature[center];
      const firstEnergy = world.stats().userIgnitionEnergy;
      world.brush('fire', exact.x, exact.z, world.dx * 0.55, 1);
      assert.equal(world.temperature[center], firstTemperature);
      assert.equal(world.stats().userIgnitionEnergy, firstEnergy);
      world.reset('valley');
      assert.equal(world.vegetationRevision, vegetationRevision + 2);
      assert.equal(world.brush('unknown', 0, 0), false);
    },
  );
});
