const G = 9.81;
const WATER_DENSITY = 1000;
const WATER_HEAT_CAPACITY = 4180;
// Roughly the upper 1.5-2 cm of soil/vegetation that responds on game time scales.
const SOIL_HEAT_CAPACITY = 32000;
const LATENT_HEAT = 2.45e6;
const FUEL_HEAT = 18e6;
const MAX_BURN_RATE = 0.012;
const STEFAN_BOLTZMANN = 5.670374419e-8;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const smoothstep = (lo, hi, value) => {
  const t = clamp((value - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

export function getSunState(settings = {}) {
  const hourInput = Number(settings.hour);
  const powerInput = Number(settings.sunPower);
  const rainInput = Number(settings.rain);
  const hour = (((Number.isFinite(hourInput) ? hourInput : 15) % 24) + 24) % 24;
  const sunPower = clamp(Number.isFinite(powerInput) ? powerInput : 1, 0, 3);
  const rain = clamp(Number.isFinite(rainInput) ? rainInput : 0, 0, 300);
  const daylightPhase = (Math.PI * (hour - 6)) / 12;
  const daylight = Math.max(0, Math.sin(daylightPhase));
  const elevation = ((65 * Math.PI) / 180) * daylight;
  const sinElevation = Math.sin(elevation);
  const cosElevation = Math.cos(elevation);
  const sunX = Math.cos(daylightPhase) * cosElevation;
  const sunZ = -Math.sin(daylightPhase) * cosElevation;
  const rainAttenuation = 1 - clamp(rain / 100, 0, 0.8) * 0.8;
  return {
    direction: [sunX, sinElevation, sunZ],
    daylight,
    elevation,
    irradianceMultiplier: sunPower * rainAttenuation,
  };
}

function riverCenter(z) {
  return 1.8 * Math.sin((z + 5) * 0.19) + 0.55 * Math.sin((z - 2) * 0.47);
}

export function creekCenter(z) {
  return 0.52 * Math.sin((z + 1.5) * 0.55) + 0.16 * Math.sin((z - 0.3) * 1.35);
}

export function creekTerrainHeight(x, z, size = 12) {
  const lateral = x - creekCenter(z);
  return (
    0.72 -
    0.035 * (z + size / 2) -
    0.15 * Math.exp(-((lateral / 0.52) ** 2)) +
    0.1 * smoothstep(0.42, 1.15, Math.abs(lateral)) +
    0.018 * Math.min(lateral * lateral, 9) +
    0.22 * (Math.abs(x) / (size / 2)) ** 3 +
    0.035 * Math.sin(1.7 * x + 0.5 * z) * Math.sin(1.1 * z) +
    0.018 * Math.sin(3.1 * x - 1.9 * z) -
    0.09 * Math.exp(-((lateral / 0.72) ** 2) - ((z - 2.7) / 1.15) ** 2)
  );
}

export function terrainHeight(x, z, size = 32) {
  const half = size * 0.5;
  const scale = size / 32;
  const xn = x / scale;
  const zn = z / scale;
  const channelX = riverCenter(zn) * scale;
  const lateral = (x - channelX) / scale;
  const downstreamSlope = 3.25 - 0.105 * (zn + 16);
  const valley =
    0.047 * lateral * lateral + 0.52 * (1 - Math.exp(-0.7 * lateral * lateral));
  const shoulders = 2.7 * Math.pow(Math.abs(x) / Math.max(half, 1), 3.2);
  const westMountain = 2.3 * Math.exp(-((xn + 10.5) ** 2 + (zn + 1) ** 2) / 24);
  const eastMountain = 2.0 * Math.exp(-((xn - 10.2) ** 2 + (zn + 6) ** 2) / 22);
  const northRidge =
    1.25 * Math.exp(-((zn + 12.8) ** 2) / 8) * (0.35 + Math.abs(xn) / 16);
  const pond =
    -0.7 * Math.exp(-((lateral / 2.4) ** 2 + ((zn - 8.0) / 3.0) ** 2));
  const undulation =
    0.11 * Math.sin(xn * 0.62 + zn * 0.18) * Math.sin(zn * 0.36);
  return (
    downstreamSlope +
    valley +
    shoulders +
    westMountain +
    eastMountain +
    northRidge +
    pond +
    undulation
  );
}

function hash01(x, z, seed) {
  let h =
    (Math.imul(x + 1013, 374761393) ^ Math.imul(z + 1619, 668265263) ^ seed) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function createNatureWorld({
  n = 80,
  size = 32,
  seed = 714,
  landscape = 'valley',
} = {}) {
  n = clamp(Math.round(Number.isFinite(n) ? n : 80), 8, 192);
  size = clamp(Number.isFinite(size) ? size : 32, 8, 96);
  seed = (Number.isFinite(seed) ? seed : 714) | 0;

  const count = n * n;
  const dx = size / (n - 1);
  const cellArea = dx * dx;
  const half = size * 0.5;
  const compactCreek = landscape === 'creek';
  const centerAt = (z) =>
    compactCreek ? creekCenter(z) : (riverCenter((z * 32) / size) * size) / 32;
  const radiationRadius = compactCreek ? 1.2 : 2.4;
  const maxRadiationOffset = compactCreek
    ? Math.ceil(radiationRadius / dx)
    : Math.min(5, Math.ceil(radiationRadius / dx));
  const radiationOffsets = [];
  for (let oz = -maxRadiationOffset; oz <= maxRadiationOffset; oz++) {
    for (let ox = -maxRadiationOffset; ox <= maxRadiationOffset; ox++) {
      const distance = Math.hypot(ox * dx, oz * dx);
      if (!distance || distance > radiationRadius) continue;
      radiationOffsets.push({
        ox,
        oz,
        view: Math.min(
          0.34,
          cellArea / (2 * Math.PI * distance * distance) +
            0.14 * Math.exp(-distance / 1.2),
        ),
      });
    }
  }
  const radiationTargets = new Int32Array(radiationOffsets.length);
  const radiationWeights = new Float64Array(radiationOffsets.length);
  const emitterIndices = new Int32Array(count),
    emitterPowers = new Float64Array(count);
  const springStencil = [];
  if (compactCreek) {
    const z0 = -half + 0.4,
      x0 = centerAt(z0),
      radius = 0.34;
    let weightSum = 0;
    for (let iz = 0; iz < n; iz++)
      for (let ix = 0; ix < n; ix++) {
        const distance = Math.hypot(-half + ix * dx - x0, -half + iz * dx - z0);
        if (distance >= radius) continue;
        const weight = (1 - distance / radius) ** 2;
        springStencil.push({ index: iz * n + ix, weight });
        weightSum += weight;
      }
    if (!weightSum)
      springStencil.push({
        index: Math.round((x0 + half) / dx) + n * Math.round((z0 + half) / dx),
        weight: 1,
      });
    else springStencil.forEach((entry) => (entry.weight /= weightSum));
  }
  const height = new Float32Array(count);
  const water = new Float32Array(count);
  const temperature = new Float32Array(count);
  const waterTemperature = new Float32Array(count);
  const fuel = new Float32Array(count);
  const moisture = new Float32Array(count);
  const fire = new Float32Array(count);
  const flowX = new Float32Array(count);
  const flowZ = new Float32Array(count);
  const sunlight = new Float32Array(count);

  const fluxE = new Float32Array(count);
  const fluxS = new Float32Array(count);
  const outRate = new Float32Array(count);
  const donorScale = new Float32Array(count);
  const deltaVolume = new Float32Array(count);
  const deltaTempVolume = new Float32Array(count);
  const radiantPower = new Float32Array(count);
  const burnRate = new Float32Array(count);
  const boundaryOut = new Float32Array(n);
  const canopyTop = new Float32Array(count);
  const canopyBase = new Float32Array(count);
  const canopyOpacity = new Float32Array(count);
  const canopyId = new Int32Array(count);
  const maxCanopies = 1024;
  const visitedCanopy = new Int32Array(maxCanopies + 1);

  const settings = {
    hour: 15,
    sunPower: 1,
    wind: 2,
    windAngle: 30,
    rain: 0,
    spring: 1,
    ambient: 22,
  };

  const counters = {
    burnedMass: 0,
    evaporatedVolume: 0,
    inflowVolume: 0,
    outflowVolume: 0,
    rainVolume: 0,
    userAddedVolume: 0,
    userIgnitionEnergy: 0,
  };

  let solarCacheHour = NaN;
  let solarCachePower = NaN;
  let solarCacheRainAttenuation = NaN;
  let solarCacheRevision = -1;
  let solarCacheCanopyRevision = -1;
  let lastCanopySourceRevision;
  let currentFirePower = 0;

  const world = {
    n,
    size,
    landscape: compactCreek ? 'creek' : 'valley',
    dx,
    time: 0,
    revision: 0,
    vegetationRevision: 0,
    canopyRevision: 0,
    height,
    water,
    temperature,
    waterTemperature,
    fuel,
    moisture,
    fire,
    flowX,
    flowZ,
    sunlight,
    // Public causal output in kg/m2/s. Consumers treat this array as read-only.
    burnRate,
    settings,
    step,
    brush,
    setCanopies,
    reset,
    sample,
    stats,
  };

  function coordinate(index) {
    return -half + index * dx;
  }

  function invalidateSolar() {
    solarCacheRevision = -1;
  }

  function invalidateCanopySolar() {
    solarCacheCanopyRevision = -1;
  }

  /**
   * Rasterize canopy volumes used only by the solar solver.
   * Pass a stable sourceRevision to make repeated environment updates no-ops;
   * omit it when every call represents a new canopy state.
   */
  function setCanopies(entries = [], sourceRevision) {
    if (
      sourceRevision !== undefined &&
      Object.is(sourceRevision, lastCanopySourceRevision)
    )
      return false;
    lastCanopySourceRevision = sourceRevision;
    canopyTop.fill(0);
    canopyBase.fill(0);
    canopyOpacity.fill(0);
    canopyId.fill(0);
    const canopies = Array.isArray(entries)
      ? entries.slice(0, maxCanopies)
      : [];
    let id = 0;
    for (const canopy of canopies) {
      if (!canopy || typeof canopy !== 'object') continue;
      const x = Number(canopy.x);
      const z = Number(canopy.z);
      const base = Number(canopy.base);
      const top = Number(canopy.top);
      const radius = clamp(Number(canopy.radius), dx * 0.25, size * 0.2);
      const opacity = clamp(Number(canopy.opacity), 0, 0.98);
      if (
        ![x, z, base, top, radius, opacity].every(Number.isFinite) ||
        top <= base ||
        opacity <= 0
      )
        continue;
      if (
        x + radius < -half ||
        x - radius > half ||
        z + radius < -half ||
        z - radius > half
      )
        continue;
      id++;
      const minX = clamp(Math.floor((x - radius + half) / dx), 0, n - 1);
      const maxX = clamp(Math.ceil((x + radius + half) / dx), 0, n - 1);
      const minZ = clamp(Math.floor((z - radius + half) / dx), 0, n - 1);
      const maxZ = clamp(Math.ceil((z + radius + half) / dx), 0, n - 1);
      for (let iz = minZ; iz <= maxZ; iz++) {
        for (let ix = minX; ix <= maxX; ix++) {
          const radial =
            Math.hypot(coordinate(ix) - x, coordinate(iz) - z) / radius;
          if (radial >= 1) continue;
          const crown = Math.sqrt(1 - radial * radial);
          const localOpacity = opacity * crown;
          const localTop = base + (top - base) * crown;
          const i = iz * n + ix;
          // A single dominant crown per sample bounds memory and traversal cost.
          // Overlap still strengthens shade when the denser crown wins.
          if (
            localOpacity > canopyOpacity[i] ||
            (localOpacity === canopyOpacity[i] && localTop > canopyTop[i])
          ) {
            canopyOpacity[i] = localOpacity;
            canopyBase[i] = base;
            canopyTop[i] = localTop;
            canopyId[i] = id;
          }
        }
      }
    }
    world.canopyRevision++;
    invalidateCanopySolar();
    return true;
  }

  function ensureSunlight() {
    const hourInput = Number(settings.hour);
    const powerInput = Number(settings.sunPower);
    const rainInput = Number(settings.rain);
    const hour =
      (((Number.isFinite(hourInput) ? hourInput : 15) % 24) + 24) % 24;
    const power = clamp(Number.isFinite(powerInput) ? powerInput : 1, 0, 3);
    const state = getSunState(settings);
    const rainAttenuation =
      1 -
      clamp((Number.isFinite(rainInput) ? rainInput : 0) / 100, 0, 0.8) * 0.8;
    if (
      hour === solarCacheHour &&
      power === solarCachePower &&
      rainAttenuation === solarCacheRainAttenuation &&
      world.revision === solarCacheRevision &&
      world.canopyRevision === solarCacheCanopyRevision
    )
      return;
    solarCacheHour = hour;
    solarCachePower = power;
    solarCacheRainAttenuation = rainAttenuation;
    solarCacheRevision = world.revision;
    solarCacheCanopyRevision = world.canopyRevision;

    if (state.daylight <= 0 || state.irradianceMultiplier <= 0) {
      sunlight.fill(0);
      return;
    }
    const { elevation } = state;
    const [sunX, sinElevation, sunZ] = state.direction;
    const horizontalLength = Math.hypot(sunX, sunZ) || 1;
    const rayX = sunX / horizontalLength;
    const rayZ = sunZ / horizontalLength;
    const tanElevation = Math.tan(elevation);
    const rayStep = dx * 1.35;
    const maxRaySteps = Math.ceil(size / rayStep);
    let rayStamp = 0;

    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const left = height[z * n + Math.max(0, x - 1)];
        const right = height[z * n + Math.min(n - 1, x + 1)];
        const up = height[Math.max(0, z - 1) * n + x];
        const down = height[Math.min(n - 1, z + 1) * n + x];
        const gradX = (right - left) / (x > 0 && x < n - 1 ? 2 * dx : dx);
        const gradZ = (down - up) / (z > 0 && z < n - 1 ? 2 * dx : dx);
        const normalLength = Math.hypot(gradX, 1, gradZ);
        const incidence = Math.max(
          0,
          (-gradX * sunX + sinElevation - gradZ * sunZ) / normalLength,
        );
        if (incidence <= 0) {
          sunlight[i] = 0;
          continue;
        }

        let blocked = false;
        let transmission = 1;
        const originHeight = height[i] + 0.025;
        const originX = coordinate(x);
        const originZ = coordinate(z);
        rayStamp++;
        if (rayStamp >= 2147483647) {
          visitedCanopy.fill(0);
          rayStamp = 1;
        }
        const overheadId = canopyId[i];
        if (overheadId > 0 && originHeight < canopyTop[i]) {
          transmission *= 1 - canopyOpacity[i];
          visitedCanopy[overheadId] = rayStamp;
        }
        for (let ray = 1; ray <= maxRaySteps; ray++) {
          const distance = ray * rayStep;
          const sampleX = originX + rayX * distance;
          const sampleZ = originZ + rayZ * distance;
          if (
            sampleX <= -half ||
            sampleX >= half ||
            sampleZ <= -half ||
            sampleZ >= half
          )
            break;
          const sx = clamp(Math.round((sampleX + half) / dx), 0, n - 1);
          const sz = clamp(Math.round((sampleZ + half) / dx), 0, n - 1);
          const sampleIndex = sz * n + sx;
          if (
            (height[sampleIndex] - originHeight) / distance >
            tanElevation + 0.015
          ) {
            blocked = true;
            break;
          }
          const crownId = canopyId[sampleIndex];
          const rayHeight = originHeight + tanElevation * distance;
          if (
            crownId > 0 &&
            visitedCanopy[crownId] !== rayStamp &&
            rayHeight >= canopyBase[sampleIndex] &&
            rayHeight <= canopyTop[sampleIndex]
          ) {
            transmission *= 1 - canopyOpacity[sampleIndex];
            visitedCanopy[crownId] = rayStamp;
          }
        }
        sunlight[i] = blocked
          ? 0
          : 920 * state.irradianceMultiplier * incidence * transmission;
      }
    }
  }

  function addWaterAt(i, depth, sourceTemperature, counterName) {
    if (!(depth > 0)) return;
    const oldDepth = water[i];
    const newDepth = oldDepth + depth;
    waterTemperature[i] =
      (waterTemperature[i] * oldDepth + sourceTemperature * depth) / newDepth;
    water[i] = newDepth;
    if (counterName) counters[counterName] += depth * cellArea;
  }

  function addSources(dt) {
    const ambient = clamp(Number(settings.ambient) || 22, -20, 50);
    const rainRate = clamp(Number(settings.rain) || 0, 0, 300) / 3.6e6;
    if (rainRate > 0) {
      const depth = rainRate * dt;
      const rainTemperature = ambient - 2;
      for (let i = 0; i < count; i++) {
        addWaterAt(i, depth, rainTemperature, null);
        moisture[i] = clamp(moisture[i] + depth / 0.0025, 0, 1);
      }
      counters.rainVolume += depth * cellArea * count;
    }

    const springMultiplier = clamp(Number(settings.spring) || 0, 0, 4);
    if (springMultiplier <= 0) return;
    if (compactCreek) {
      const volume = 0.012 * springMultiplier * dt;
      for (const { index, weight } of springStencil) {
        addWaterAt(index, (volume * weight) / cellArea, ambient - 4, null);
        moisture[index] = Math.max(moisture[index], 0.92);
      }
      counters.inflowVolume += volume;
      return;
    }
    const targetZ = -half + dx * 1.5;
    const targetX = (riverCenter((targetZ * 32) / size) * size) / 32;
    const gx = clamp(Math.round((targetX + half) / dx), 1, n - 2);
    const gz = clamp(Math.round((targetZ + half) / dx), 1, n - 2);
    const totalVolume = 0.055 * springMultiplier * dt;
    const perCellDepth = totalVolume / (4 * cellArea);
    for (let oz = 0; oz < 2; oz++) {
      for (let ox = 0; ox < 2; ox++) {
        const i = (gz + oz) * n + gx + ox;
        addWaterAt(i, perCellDepth, ambient - 4, null);
        moisture[i] = Math.max(moisture[i], 0.92);
      }
    }
    counters.inflowVolume += totalVolume;
  }

  function updateWater(dt) {
    outRate.fill(0);
    deltaVolume.fill(0);
    deltaTempVolume.fill(0);
    const damping = Math.exp(-2.8 * dt);

    for (let z = 0; z < n; z++) {
      const row = z * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        if (x < n - 1) {
          const j = i + 1;
          const meanDepth = 0.5 * (water[i] + water[j]);
          let q = fluxE[i] * damping;
          if (meanDepth > 1e-7)
            q +=
              G *
              Math.max(meanDepth, 0.002) *
              (height[i] + water[i] - (height[j] + water[j])) *
              dt;
          else q = 0;
          q = clamp(
            q,
            -4 * dx * Math.max(water[j], 0.002),
            4 * dx * Math.max(water[i], 0.002),
          );
          fluxE[i] = q;
          outRate[q >= 0 ? i : j] += Math.abs(q);
        } else fluxE[i] = 0;

        if (z < n - 1) {
          const j = i + n;
          const meanDepth = 0.5 * (water[i] + water[j]);
          let q = fluxS[i] * damping;
          if (meanDepth > 1e-7)
            q +=
              G *
              Math.max(meanDepth, 0.002) *
              (height[i] + water[i] - (height[j] + water[j])) *
              dt;
          else q = 0;
          q = clamp(
            q,
            -4 * dx * Math.max(water[j], 0.002),
            4 * dx * Math.max(water[i], 0.002),
          );
          fluxS[i] = q;
          outRate[q >= 0 ? i : j] += Math.abs(q);
        } else fluxS[i] = 0;
      }
    }

    for (let x = 0; x < n; x++) {
      const i = (n - 1) * n + x;
      const depth = water[i];
      const q = depth > 0 ? 0.22 * dx * depth * Math.sqrt(G * depth) : 0;
      boundaryOut[x] = q;
      outRate[i] += q;
    }
    for (let i = 0; i < count; i++) {
      const available = water[i] * cellArea;
      donorScale[i] =
        outRate[i] * dt > available * 0.72
          ? (available * 0.72) / (outRate[i] * dt)
          : 1;
    }

    const transfer = (i, j, rawQ, fluxArray) => {
      if (rawQ === 0) return;
      const donor = rawQ > 0 ? i : j;
      const receiver = rawQ > 0 ? j : i;
      const q = Math.abs(rawQ) * donorScale[donor];
      const volume = q * dt;
      const thermalVolume = volume * waterTemperature[donor];
      deltaVolume[donor] -= volume;
      deltaVolume[receiver] += volume;
      deltaTempVolume[donor] -= thermalVolume;
      deltaTempVolume[receiver] += thermalVolume;
      fluxArray[i] = Math.sign(rawQ) * q;
    };

    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        if (x < n - 1) transfer(i, i + 1, fluxE[i], fluxE);
        if (z < n - 1) transfer(i, i + n, fluxS[i], fluxS);
      }
    }
    for (let x = 0; x < n; x++) {
      const i = (n - 1) * n + x;
      const volume = boundaryOut[x] * donorScale[i] * dt;
      deltaVolume[i] -= volume;
      deltaTempVolume[i] -= volume * waterTemperature[i];
      counters.outflowVolume += volume;
    }

    for (let i = 0; i < count; i++) {
      const oldVolume = water[i] * cellArea;
      const newVolume = Math.max(0, oldVolume + deltaVolume[i]);
      const heatLike = oldVolume * waterTemperature[i] + deltaTempVolume[i];
      water[i] = newVolume / cellArea;
      waterTemperature[i] =
        newVolume > 1e-10
          ? clamp(heatLike / newVolume, -5, 100)
          : temperature[i];
    }

    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const depth = water[i];
        if (depth < 1e-6) {
          flowX[i] = 0;
          flowZ[i] = 0;
          continue;
        }
        const west = x > 0 ? fluxE[i - 1] : 0;
        const east = x < n - 1 ? fluxE[i] : 0;
        const north = z > 0 ? fluxS[i - n] : 0;
        const south = z < n - 1 ? fluxS[i] : boundaryOut[x] * donorScale[i];
        const crossSection = Math.max(depth * dx, 1e-6);
        flowX[i] = clamp((0.5 * (west + east)) / crossSection, -8, 8);
        flowZ[i] = clamp((0.5 * (north + south)) / crossSection, -8, 8);
      }
    }
  }

  function lineOfSightFactor(from, to) {
    const fx = from % n;
    const fz = (from / n) | 0;
    const tx = to % n;
    const tz = (to / n) | 0;
    const mx = Math.round((fx + tx) * 0.5);
    const mz = Math.round((fz + tz) * 0.5);
    const middle = height[mz * n + mx];
    const flameLine = Math.max(height[from], height[to]) + 0.32;
    return middle > flameLine ? 0.12 : 1;
  }

  function updateCombustionAndRadiation(dt) {
    radiantPower.fill(0);
    currentFirePower = 0;
    let emitterCount = 0;
    for (let i = 0; i < count; i++) {
      const standingSuppression = Math.exp(-water[i] / 0.006);
      const dry =
        Math.pow(clamp(1 - moisture[i], 0, 1), 1.45) * standingSuppression;
      // Temperature creates the public fire state in updateThermalAndFire.
      // Requiring that state here keeps fuel loss, emitted power, statistics,
      // and renderer-visible combustion on the same causal signal.
      const active = fire[i];
      const rate =
        fuel[i] > 0.002
          ? MAX_BURN_RATE * active * dry * Math.min(1, fuel[i] / 0.12)
          : 0;
      burnRate[i] = rate;
      if (rate <= 0) continue;
      const consumed = Math.min(fuel[i], rate * dt);
      fuel[i] -= consumed;
      counters.burnedMass += consumed * cellArea;
      const power = (consumed * cellArea * FUEL_HEAT) / dt;
      currentFirePower += power;
      if (power > 1) {
        emitterIndices[emitterCount] = i;
        emitterPowers[emitterCount++] = power;
      }
    }

    for (let emitter = 0; emitter < emitterCount; emitter++) {
      const source = emitterIndices[emitter],
        chemicalPower = emitterPowers[emitter];
      const sx = source % n;
      const sz = (source / n) | 0;
      let targetCount = 0;
      let factorSum = 0;
      for (const offset of radiationOffsets) {
        const x = sx + offset.ox,
          z = sz + offset.oz;
        if (x < 0 || x >= n || z < 0 || z >= n) continue;
        const target = z * n + x;
        const view = offset.view * lineOfSightFactor(source, target);
        radiationTargets[targetCount] = target;
        radiationWeights[targetCount++] = view;
        factorSum += view;
      }
      const normalization = factorSum > 0.8 ? 0.8 / factorSum : 1;
      const radiated = chemicalPower * 0.32;
      for (let j = 0; j < targetCount; j++)
        radiantPower[radiationTargets[j]] +=
          radiated * radiationWeights[j] * normalization;
    }
  }

  function updateThermalAndFire(dt) {
    const ambient = clamp(Number(settings.ambient) || 22, -20, 50);
    const wind = clamp(Number(settings.wind) || 0, 0, 30);
    for (let i = 0; i < count; i++) {
      const depthBeforeEvaporation = water[i];
      const wet = 1 - Math.exp(-depthBeforeEvaporation / 0.008);
      const groundCapacity =
        SOIL_HEAT_CAPACITY * cellArea * (1 + 0.45 * moisture[i]);
      const waterCapacity =
        depthBeforeEvaporation * cellArea * WATER_DENSITY * WATER_HEAT_CAPACITY;
      const solarAbsorption =
        sunlight[i] * (depthBeforeEvaporation > 0.002 ? 0.34 : 0.72);
      const radiationFlux = radiantPower[i] / cellArea;
      const selfFireFlux = burnRate[i] * FUEL_HEAT * 0.16;
      const kelvin = clamp(temperature[i] + 273.15, 180, 1800);
      const ambientKelvin = ambient + 273.15;
      const radiativeCooling =
        0.9 * STEFAN_BOLTZMANN * (kelvin ** 4 - ambientKelvin ** 4);
      const convectiveCooling = (7 + 1.8 * wind) * (temperature[i] - ambient);
      let groundPower =
        (solarAbsorption +
          radiationFlux +
          selfFireFlux -
          radiativeCooling -
          convectiveCooling) *
        cellArea;

      if (waterCapacity > 1) {
        const conductance =
          (170 + 110 * Math.min(1, Math.hypot(flowX[i], flowZ[i]))) * cellArea;
        let exchangeEnergy =
          conductance * (temperature[i] - waterTemperature[i]) * dt;
        const equilibriumEnergy =
          (temperature[i] - waterTemperature[i]) /
          (1 / groundCapacity + 1 / waterCapacity);
        exchangeEnergy = clamp(
          exchangeEnergy,
          Math.min(0, equilibriumEnergy),
          Math.max(0, equilibriumEnergy),
        );
        temperature[i] -= exchangeEnergy / groundCapacity;
        waterTemperature[i] += exchangeEnergy / waterCapacity;
      }

      if (depthBeforeEvaporation > 0) {
        const availableFlux = Math.max(
          0,
          solarAbsorption * 0.26 +
            radiationFlux * 0.42 +
            Math.max(0, waterTemperature[i] - ambient) * 18,
        );
        const possibleVolume =
          (availableFlux * cellArea * dt) / (WATER_DENSITY * LATENT_HEAT);
        const evaporated = Math.min(
          depthBeforeEvaporation * cellArea,
          possibleVolume,
        );
        if (evaporated > 0) {
          water[i] = Math.max(0, water[i] - evaporated / cellArea);
          counters.evaporatedVolume += evaporated;
          groundPower -= (evaporated * WATER_DENSITY * LATENT_HEAT * 0.45) / dt;
          if (waterCapacity > 1)
            waterTemperature[i] -=
              (evaporated * WATER_DENSITY * LATENT_HEAT * 0.55) / waterCapacity;
        }
      }

      temperature[i] = clamp(
        temperature[i] + (groundPower * dt) / groundCapacity,
        -40,
        1250,
      );
      waterTemperature[i] = clamp(waterTemperature[i], -2, 100);

      const saturationTarget = wet;
      if (saturationTarget > moisture[i])
        moisture[i] +=
          (saturationTarget - moisture[i]) * (1 - Math.exp(-1.8 * dt));
      const dryingRate =
        (sunlight[i] / 900) * 0.0007 +
        Math.max(0, temperature[i] - ambient) * 0.000018 +
        wind * 0.00006;
      moisture[i] = clamp(moisture[i] - dryingRate * dt, 0, 1);

      const dry = Math.pow(1 - moisture[i], 2.2) * Math.exp(-water[i] / 0.005);
      // Fine dry vegetation can enter sustained flaming below the ignition
      // temperature of thick wood; moisture and fuel availability still gate it.
      const ignition = smoothstep(145, 250, temperature[i]);
      const fuelAvailability = smoothstep(0.005, 0.16, fuel[i]);
      const targetFire = ignition * dry * fuelAvailability;
      const response = targetFire > fire[i] ? 1.6 : water[i] > 0.002 ? 7 : 2.1;
      fire[i] = clamp(
        fire[i] + (targetFire - fire[i]) * (1 - Math.exp(-response * dt)),
        0,
        1,
      );
      if (fuel[i] <= 0.002 || water[i] > 0.025) fire[i] *= Math.exp(-8 * dt);
    }
  }

  function substep(dt) {
    addSources(dt);
    updateCombustionAndRadiation(dt);
    updateThermalAndFire(dt);
    // Hydraulic stability depends on grid spacing; heat/fire retain their own
    // outer cadence. Subcycle transport, preserving its volume/heat flux pair.
    let remaining = dt;
    while (remaining > 1e-9) {
      let signal = 0.8;
      for (let i = 0; i < count; i++)
        if (water[i] > 1e-6)
          signal = Math.max(
            signal,
            Math.hypot(flowX[i], flowZ[i]) + Math.sqrt(G * water[i]),
          );
      const h = Math.min(remaining, 0.04, (0.65 * dx) / signal);
      updateWater(h);
      remaining -= h;
    }
    world.time += dt;
  }

  function step(dt) {
    dt = Number(dt);
    if (!Number.isFinite(dt) || dt <= 0) return world;
    dt = Math.min(dt, 2);
    ensureSunlight();
    const pieces = Math.max(1, Math.ceil(dt / 0.04));
    const h = dt / pieces;
    for (let piece = 0; piece < pieces; piece++) substep(h);
    return world;
  }

  function brush(tool, x, z, radius = 1.2, strength = 1) {
    if (typeof tool !== 'string') return false;
    x = clamp(Number.isFinite(x) ? x : 0, -half, half);
    z = clamp(Number.isFinite(z) ? z : 0, -half, half);
    radius = clamp(
      Number.isFinite(radius) ? Math.abs(radius) : 1.2,
      dx * 0.55,
      size * 0.3,
    );
    strength = clamp(Number.isFinite(strength) ? strength : 1, 0, 3);
    if (strength === 0) return false;
    const minX = clamp(Math.floor((x - radius + half) / dx), 0, n - 1);
    const maxX = clamp(Math.ceil((x + radius + half) / dx), 0, n - 1);
    const minZ = clamp(Math.floor((z - radius + half) / dx), 0, n - 1);
    const maxZ = clamp(Math.ceil((z + radius + half) / dx), 0, n - 1);
    let changed = false;
    let terrainChanged = false;
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const distance = Math.hypot(coordinate(ix) - x, coordinate(iz) - z);
        if (distance > radius) continue;
        const falloff = (1 - distance / radius) ** 2;
        if (falloff <= 0) continue;
        const i = iz * n + ix;
        if (tool === 'water') {
          addWaterAt(
            i,
            (compactCreek ? 0.04 : 0.09) * strength * falloff,
            settings.ambient - 2,
            'userAddedVolume',
          );
        } else if (tool === 'rain') {
          addWaterAt(
            i,
            (compactCreek ? 0.012 : 0.025) * strength * falloff,
            settings.ambient - 2,
            'rainVolume',
          );
          moisture[i] = clamp(moisture[i] + 0.8 * strength * falloff, 0, 1);
        } else if (tool === 'fire') {
          const targetTemperature = clamp(
            (Number(settings.ambient) || 22) + 520 * strength * falloff,
            -40,
            1250,
          );
          if (targetTemperature > temperature[i]) {
            counters.userIgnitionEnergy +=
              (targetTemperature - temperature[i]) *
              SOIL_HEAT_CAPACITY *
              cellArea *
              (1 + 0.45 * moisture[i]);
            temperature[i] = targetTemperature;
          }
          fire[i] = Math.max(fire[i], clamp(0.92 * strength * falloff, 0, 1));
        } else if (tool === 'raise') {
          height[i] += (compactCreek ? 0.12 : 0.42) * strength * falloff;
          terrainChanged = true;
        } else if (tool === 'lower') {
          height[i] -= (compactCreek ? 0.12 : 0.42) * strength * falloff;
          terrainChanged = true;
        } else if (tool === 'plant') {
          fuel[i] = clamp(fuel[i] + 1.25 * strength * falloff, 0, 3);
          moisture[i] = Math.max(moisture[i], 0.28 * falloff);
        } else if (tool === 'rock') {
          height[i] += (compactCreek ? 0.22 : 0.8) * strength * falloff;
          fuel[i] = 0;
          fire[i] = 0;
          terrainChanged = true;
        } else return false;
        changed = true;
      }
    }
    if (terrainChanged) {
      world.revision++;
      fluxE.fill(0);
      fluxS.fill(0);
      invalidateSolar();
    }
    if (changed && tool === 'plant') world.vegetationRevision++;
    return changed;
  }

  function reset(preset = 'valley') {
    if (!['valley', 'dry', 'rain'].includes(preset)) preset = 'valley';
    world.time = 0;
    world.revision++;
    world.vegetationRevision++;
    canopyTop.fill(0);
    canopyBase.fill(0);
    canopyOpacity.fill(0);
    canopyId.fill(0);
    lastCanopySourceRevision = undefined;
    world.canopyRevision++;
    fluxE.fill(0);
    fluxS.fill(0);
    flowX.fill(0);
    flowZ.fill(0);
    radiantPower.fill(0);
    burnRate.fill(0);
    currentFirePower = 0;
    for (const key of Object.keys(counters)) counters[key] = 0;

    settings.hour = 15;
    settings.sunPower = preset === 'rain' ? 0.35 : 1;
    settings.wind = preset === 'rain' ? 3.5 : 2;
    settings.windAngle = 30;
    settings.rain = preset === 'rain' ? 18 : 0;
    settings.spring = preset === 'dry' ? 0.18 : 1;
    settings.ambient = preset === 'dry' ? 28 : preset === 'rain' ? 17 : 22;

    for (let iz = 0; iz < n; iz++) {
      const z = coordinate(iz);
      const zn = (z * 32) / size;
      const channelX = centerAt(z);
      for (let ix = 0; ix < n; ix++) {
        const x = coordinate(ix);
        const i = iz * n + ix;
        const lateral = Math.abs(x - channelX);
        height[i] = compactCreek
          ? creekTerrainHeight(x, z, size)
          : terrainHeight(x, z, size);
        const noise = compactCreek
          ? 0.5 +
            0.25 * Math.sin(x * 2.7 + z * 1.8) +
            0.25 * Math.cos(x * 4.1 - z * 2.3)
          : hash01(ix, iz, seed);
        let riverDepth =
          preset === 'dry'
            ? 0
            : Math.max(
                0,
                0.19 - 0.11 * (lateral / Math.max(0.7, size / 32)) ** 2,
              );
        const pondRadius = Math.hypot(
          (x - channelX) / ((3.1 * size) / 32),
          (zn - 8) / 3.2,
        );
        let pondDepth =
          preset === 'dry' ? 0 : Math.max(0, 0.34 * (1 - pondRadius));
        if (compactCreek && preset !== 'dry') {
          const halfWidth = 0.72 + 0.12 * (0.5 + 0.5 * Math.sin(0.8 * z));
          riverDepth = Math.max(0, 0.1 * (1 - (lateral / halfWidth) ** 2));
          pondDepth = Math.max(
            0,
            0.16 * (1 - Math.hypot(lateral, (z - 2.7) / 1.35)),
          );
        }
        water[i] =
          Math.max(riverDepth, pondDepth) * (preset === 'rain' ? 1.35 : 1);
        temperature[i] =
          settings.ambient +
          (preset === 'dry' ? 4 : 0) -
          0.45 * height[i] +
          0.8 * (noise - 0.5);
        waterTemperature[i] = settings.ambient - 3;
        const wetBand = compactCreek ? 0.9 : 2.1;
        const nearRiver = Math.exp(
          -(lateral * lateral) / (2 * wetBand * wetBand),
        );
        moisture[i] = clamp(
          (preset === 'dry' ? 0.08 : preset === 'rain' ? 0.78 : 0.24) +
            0.58 * nearRiver +
            (water[i] > 0 ? 0.32 : 0),
          0,
          1,
        );
        const steepOrHigh = smoothstep(4.5, 7.2, height[i]);
        fuel[i] = clamp(
          (0.65 + 1.65 * noise) *
            (1 - 0.82 * nearRiver) *
            (1 - 0.75 * steepOrHigh),
          0,
          3,
        );
        fire[i] = 0;
      }
    }

    if (preset !== 'rain' && (!compactCreek || preset === 'dry')) {
      let best = -1;
      let bestDistance = Infinity;
      for (let iz = 0; iz < n; iz++) {
        for (let ix = 0; ix < n; ix++) {
          const i = iz * n + ix;
          if (water[i] > 0.005) continue;
          const distance =
            (coordinate(ix) - (compactCreek ? size * 0.125 : 4)) ** 2 +
            (coordinate(iz) - (compactCreek ? size * 0.094 : 3)) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        }
      }
      if (best >= 0) {
        fuel[best] = Math.max(fuel[best], 1.35);
        moisture[best] = Math.min(moisture[best], 0.1);
        temperature[best] = 510;
        fire[best] = 0.82;
      }
    }
    invalidateSolar();
    ensureSunlight();
    return world;
  }

  function sample(x, z) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x < -half ||
      x > half ||
      z < -half ||
      z > half
    )
      return null;
    const ix = clamp(Math.round((x + half) / dx), 0, n - 1);
    const iz = clamp(Math.round((z + half) / dx), 0, n - 1);
    const i = iz * n + ix;
    return {
      x: coordinate(ix),
      z: coordinate(iz),
      height: height[i],
      water: water[i],
      temperature: temperature[i],
      waterTemperature: waterTemperature[i],
      fuel: fuel[i],
      moisture: moisture[i],
      fire: fire[i],
      sunlight: sunlight[i],
      speed: Math.hypot(flowX[i], flowZ[i]),
    };
  }

  function stats() {
    let waterVolume = 0;
    let burningCells = 0;
    let maxTemperature = -Infinity;
    let temperatureSum = 0;
    let solarPower = 0;
    for (let i = 0; i < count; i++) {
      waterVolume += water[i] * cellArea;
      if (fire[i] > 0.035 && burnRate[i] > 1e-8) burningCells++;
      maxTemperature = Math.max(maxTemperature, temperature[i]);
      temperatureSum += temperature[i];
      solarPower += sunlight[i] * cellArea;
    }
    return {
      time: world.time,
      waterVolume,
      burningCells,
      maxTemperature,
      meanTemperature: temperatureSum / count,
      burnedMass: counters.burnedMass,
      evaporatedVolume: counters.evaporatedVolume,
      inflowVolume: counters.inflowVolume,
      outflowVolume: counters.outflowVolume,
      rainVolume: counters.rainVolume,
      solarPower,
      firePower: currentFirePower,
      userAddedVolume: counters.userAddedVolume,
      userIgnitionEnergy: counters.userIgnitionEnergy,
    };
  }

  return reset('valley');
}
