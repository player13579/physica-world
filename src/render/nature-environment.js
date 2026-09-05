import * as THREE from 'three';

// Natural dressing only.  The terrain, water, fire, lights and cameras deliberately
// remain outside this module so they all use the same simulation owned by the app.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = (v) => v - Math.floor(v);
const hash = (x, z, salt = 0) =>
  fract(Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453123);

function makeMaterial(color = 0xffffff, roughness = 0.9, vertexColors = true) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    vertexColors,
  });
}

function disposeObjects(objects) {
  const geometries = new Set(),
    ownedMaterials = new Set();
  objects.forEach((object) =>
    object.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      const nodeMaterials = node.material
        ? Array.isArray(node.material)
          ? node.material
          : [node.material]
        : [];
      nodeMaterials.forEach((material) => ownedMaterials.add(material));
    }),
  );
  geometries.forEach((geometry) => geometry.dispose());
  ownedMaterials.forEach((material) => material.dispose());
}

/**
 * Creates deterministic, simulation-aware vegetation and geology for a square world.
 * @param {THREE.Scene} scene
 * @param {object} world Nature engine state (height/water/fuel/fire arrays and n/size).
 */
export function createEnvironment(scene, world) {
  const root = new THREE.Group();
  root.name = 'procedural-natural-environment';
  scene.add(root);

  let builtRevision = -1;
  let disposed = false;
  let vegetation = [];
  let grass = null;
  let reeds = null;
  let grassBlades = [];
  let canopySignature = '',
    canopyStamp = 0,
    lastCanopyTime = -Infinity;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  const dimensions = () => ({
    n: world.n || 80,
    size: world.size || 32,
    half: (world.size || 32) * 0.5,
  });
  function read(x, z) {
    const { n, size, half } = dimensions();
    const xi = clamp(Math.round(((x + half) / size) * (n - 1)), 0, n - 1);
    const zi = clamp(Math.round(((z + half) / size) * (n - 1)), 0, n - 1);
    const i = zi * n + xi;
    return {
      height: world.height?.[i] || 0,
      water: Math.max(0, world.water?.[i] || 0),
      fuel: clamp(world.fuel?.[i] ?? 1, 0, 3),
      fire: clamp(world.fire?.[i] || 0, 0, 1),
      moisture: clamp(world.moisture?.[i] || 0, 0, 1),
    };
  }

  function addInstanced(geometry, material, count, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    return mesh;
  }

  function treeMatrices(parts, tree, sway = 0) {
    const bend = sway * (0.045 + tree.height * 0.018);
    const angle = tree.angle + bend;
    const trunkY = tree.base + tree.height * 0.5;
    dummy.position.set(tree.x, trunkY, tree.z);
    dummy.rotation.set(bend * 0.35, angle, bend * 0.2);
    dummy.scale.set(tree.radius, tree.height, tree.radius);
    dummy.updateMatrix();
    parts.trunk.setMatrixAt(tree.index, dummy.matrix);

    // A forked pair of branches gives broadleaf trunks a readable silhouette at close range.
    for (let b = 0; b < 2; b++) {
      const sign = b ? 1 : -1;
      dummy.position.set(tree.x, tree.base + tree.height * 0.63, tree.z);
      dummy.rotation.set(0, angle + sign * 0.72, sign * (0.48 + bend * 0.25));
      dummy.scale.set(
        tree.radius * 0.46,
        tree.height * 0.38,
        tree.radius * 0.46,
      );
      dummy.updateMatrix();
      parts.branch.setMatrixAt(tree.index * 2 + b, dummy.matrix);
    }
  }

  function buildTrees() {
    const { half } = dimensions();
    const candidates = [];
    const target = 300;
    // A jittered grid avoids visible random clumps while preserving deterministic placement.
    for (let gz = 0; gz < 28 && candidates.length < target; gz++)
      for (let gx = 0; gx < 28 && candidates.length < target; gx++) {
        const r1 = hash(gx, gz, 3),
          r2 = hash(gx, gz, 7),
          keep = hash(gx, gz, 11);
        if (keep < 0.49) continue;
        const x = -half + ((gx + 0.15 + r1 * 0.7) / 28) * half * 2;
        const z = -half + ((gz + 0.15 + r2 * 0.7) / 28) * half * 2;
        const field = read(x, z);
        // Dense dry vegetation is plausible forest floor; water and active burn clear it.
        if (field.water > 0.035 || field.fuel < 0.45 || field.fire > 0.16)
          continue;
        candidates.push({
          x,
          z,
          base: field.height,
          height: 1.05 + hash(gx, gz, 15) * 1.9,
          radius: 0.055 + hash(gx, gz, 18) * 0.05,
          angle: hash(gx, gz, 21) * TAU,
          conifer: hash(gx, gz, 26) > 0.43,
          index: candidates.length,
        });
      }
    const count = candidates.length;
    // Instance colours carry the natural variation.  White base material prevents
    // colour multiplication from turning already-dark foliage nearly black.
    const trunkMat = makeMaterial();
    const branchMat = makeMaterial();
    const pineMat = makeMaterial();
    const leafMat = makeMaterial();
    const parts = {
      trunk: addInstanced(
        new THREE.CylinderGeometry(0.68, 1, 1, 7),
        trunkMat,
        count,
        'tree-trunks',
      ),
      branch: addInstanced(
        new THREE.CylinderGeometry(0.42, 0.9, 1, 6),
        branchMat,
        count * 2,
        'tree-branches',
      ),
      pineLow: addInstanced(
        new THREE.ConeGeometry(0.72, 0.82, 7, 2),
        pineMat,
        count,
        'conifer-lower-canopy',
      ),
      pineMid: addInstanced(
        new THREE.ConeGeometry(0.57, 0.74, 7, 2),
        pineMat,
        count,
        'conifer-middle-canopy',
      ),
      pineTop: addInstanced(
        new THREE.ConeGeometry(0.38, 0.65, 7, 2),
        pineMat,
        count,
        'conifer-upper-canopy',
      ),
      leafA: addInstanced(
        new THREE.IcosahedronGeometry(0.62, 1),
        leafMat,
        count,
        'broadleaf-canopy-a',
      ),
      leafB: addInstanced(
        new THREE.IcosahedronGeometry(0.49, 1),
        leafMat,
        count,
        'broadleaf-canopy-b',
      ),
    };
    // Each species owns different canopy meshes.  Zero the unused instances so an
    // uninitialised instance cannot leave a pile of foliage at the world origin.
    Object.values(parts).forEach((mesh) => {
      if (mesh === parts.trunk || mesh === parts.branch) return;
      for (let i = 0; i < count; i++)
        mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    });
    for (const tree of candidates) {
      treeMatrices(parts, tree, 0);
      const tone = 0.76 + hash(tree.x, tree.z, 33) * 0.24;
      parts.trunk.setColorAt(
        tree.index,
        tint.setRGB(0.36 * tone, 0.21 * tone, 0.11 * tone),
      );
      for (let b = 0; b < 2; b++)
        parts.branch.setColorAt(
          tree.index * 2 + b,
          tint.setRGB(0.3 * tone, 0.16 * tone, 0.07 * tone),
        );
      const canopy = tint.setRGB(0.13 * tone, 0.35 * tone, 0.17 * tone);
      if (tree.conifer) {
        [parts.pineLow, parts.pineMid, parts.pineTop].forEach((mesh, layer) => {
          dummy.position.set(
            tree.x,
            tree.base + tree.height * (0.52 + layer * 0.19),
            tree.z,
          );
          dummy.rotation.set(0, tree.angle + layer * 0.4, 0);
          const spread = tree.height * (1.02 - layer * 0.18);
          dummy.scale.set(spread, spread, spread);
          dummy.updateMatrix();
          mesh.setMatrixAt(tree.index, dummy.matrix);
          mesh.setColorAt(tree.index, canopy);
        });
      } else {
        [parts.leafA, parts.leafB].forEach((mesh, layer) => {
          dummy.position.set(
            tree.x + (layer ? 0.18 : -0.13),
            tree.base + tree.height * (0.84 + layer * 0.1),
            tree.z + (layer ? -0.12 : 0.16),
          );
          const spread = tree.height * (0.52 - layer * 0.05);
          dummy.rotation.set(layer * 0.2, tree.angle, layer * 0.16);
          dummy.scale.setScalar(spread);
          dummy.updateMatrix();
          mesh.setMatrixAt(tree.index, dummy.matrix);
          mesh.setColorAt(tree.index, canopy);
        });
      }
    }
    Object.values(parts).forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    vegetation = candidates.map((tree) => ({ ...tree, parts }));
  }

  function buildGroundCover() {
    const { half } = dimensions();
    const grassMat = makeMaterial();
    const reedMat = makeMaterial();
    const bladeGeometry = new THREE.ConeGeometry(0.024, 0.34, 4, 1);
    grass = addInstanced(bladeGeometry, grassMat, 1100, 'wind-grass');
    reeds = addInstanced(
      new THREE.CylinderGeometry(0.012, 0.018, 0.62, 5),
      reedMat,
      260,
      'riverbank-reeds',
    );
    let g = 0,
      r = 0;
    for (let z = 0; z < 44 && g < 1100; z++)
      for (let x = 0; x < 44 && g < 1100; x++) {
        const xx = -half + ((x + hash(x, z, 41)) / 44) * half * 2;
        const zz = -half + ((z + hash(x, z, 43)) / 44) * half * 2;
        const field = read(xx, zz);
        if (field.water > 0.025) continue;
        const h = 0.12 + hash(x, z, 45) * 0.28;
        dummy.position.set(xx, field.height + h * 0.5 - 0.015, zz);
        dummy.rotation.set(
          0,
          hash(x, z, 47) * TAU,
          (hash(x, z, 49) - 0.5) * 0.16,
        );
        dummy.scale.set(0.7, h / 0.34, 0.7);
        dummy.updateMatrix();
        grass.setMatrixAt(g, dummy.matrix);
        const wet = field.moisture;
        grass.setColorAt(
          g,
          tint.setRGB(0.22 + wet * 0.1, 0.28 + wet * 0.25, 0.08 + wet * 0.08),
        );
        grassBlades.push({
          x: xx,
          z: zz,
          height: h,
          yaw: hash(x, z, 47) * TAU,
          index: g++,
        });
      }
    for (let z = 0; z < 38 && r < 260; z++)
      for (let x = 0; x < 38 && r < 260; x++) {
        const xx = -half + ((x + hash(x, z, 51)) / 38) * half * 2;
        const zz = -half + ((z + hash(x, z, 53)) / 38) * half * 2;
        const field = read(xx, zz);
        if (field.water < 0.004 || field.water > 0.13) continue;
        const h = 0.36 + hash(x, z, 55) * 0.5;
        dummy.position.set(
          xx,
          field.height + Math.min(field.water, 0.04) + h * 0.5,
          zz,
        );
        dummy.rotation.set(
          0,
          hash(x, z, 57) * TAU,
          (hash(x, z, 59) - 0.5) * 0.13,
        );
        dummy.scale.setScalar(h / 0.62);
        dummy.updateMatrix();
        reeds.setMatrixAt(r, dummy.matrix);
        reeds.setColorAt(
          r++,
          tint.setRGB(0.25, 0.34 + field.moisture * 0.14, 0.09),
        );
      }
    grass.count = g;
    reeds.count = r;
    grass.instanceMatrix.needsUpdate = reeds.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    if (reeds.instanceColor) reeds.instanceColor.needsUpdate = true;
  }

  function buildRocksAndBoundary() {
    const { half } = dimensions();
    const rockMat = makeMaterial();
    const rocks = addInstanced(
      new THREE.DodecahedronGeometry(0.24, 1),
      rockMat,
      96,
      'field-stones',
    );
    let k = 0;
    for (let z = 0; z < 16 && k < 96; z++)
      for (let x = 0; x < 16 && k < 96; x++) {
        if (hash(x, z, 62) < 0.57) continue;
        const xx = -half + ((x + hash(x, z, 63)) / 16) * half * 2,
          zz = -half + ((z + hash(x, z, 65)) / 16) * half * 2;
        const field = read(xx, zz);
        if (field.water > 0.06) continue;
        const scale = 0.35 + hash(x, z, 68) * 0.85;
        dummy.position.set(xx, field.height + scale * 0.1, zz);
        dummy.rotation.set(
          hash(x, z, 70),
          hash(x, z, 71) * TAU,
          hash(x, z, 72),
        );
        dummy.scale.set(scale, scale * (0.65 + hash(x, z, 73) * 0.45), scale);
        dummy.updateMatrix();
        rocks.setMatrixAt(k, dummy.matrix);
        const c = 0.62 + hash(x, z, 74) * 0.25;
        rocks.setColorAt(k++, tint.setRGB(c, c * 0.95, c * 0.82));
      }
    rocks.count = k;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;

    const points = [];
    const edge = 44;
    for (let i = 0; i <= edge; i++)
      points.push([-half + (i / edge) * half * 2, -half]);
    for (let i = 1; i <= edge; i++)
      points.push([half, -half + (i / edge) * half * 2]);
    for (let i = 1; i <= edge; i++)
      points.push([half - (i / edge) * half * 2, half]);
    for (let i = 1; i <= edge; i++)
      points.push([-half, half - (i / edge) * half * 2]);
    const commonBottom =
      Math.min(...points.map(([x, z]) => read(x, z).height)) - 2.1;
    const colors = [0x6b4930, 0x805638, 0x96734c];
    colors.forEach((color, band) => {
      const positions = [],
        indices = [];
      points.forEach(([x, z], i) => {
        const y = read(x, z).height;
        const top = THREE.MathUtils.lerp(y, commonBottom, band / colors.length);
        const bottom = THREE.MathUtils.lerp(
          y,
          commonBottom,
          (band + 1) / colors.length,
        );
        positions.push(x, top, z, x, bottom, z);
        if (i) {
          const a = (i - 1) * 2,
            b = i * 2;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, makeMaterial(color, 0.96, false));
      mesh.name = `exposed-stratified-earth-${band}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    });
  }

  function refreshCanopies(force = false) {
    if (!world.setCanopies) return;
    const crowns = vegetation.map((tree) => {
      const field = read(tree.x, tree.z);
      const burn = Math.max(
        field.fire,
        clamp(1 - field.fuel / 0.55, 0, 1) * 0.88,
      );
      const scale = Math.max(0.025, 1 - burn * 0.94);
      return {
        x: tree.x,
        z: tree.z,
        base: field.height + tree.height * (tree.conifer ? 0.12 : 0.6),
        top: field.height + tree.height * (1 + 0.12 * scale),
        radius: tree.height * (tree.conifer ? 0.73 : 0.36) * scale,
        opacity: 0.8 * (1 - burn),
      };
    });
    const signature = crowns
      .map(
        (c) =>
          `${c.x.toFixed(1)},${c.z.toFixed(1)},${c.radius.toFixed(1)},${c.opacity.toFixed(1)}`,
      )
      .join(';');
    if (force || signature !== canopySignature) {
      world.setCanopies(crowns, ++canopyStamp);
      canopySignature = signature;
    }
  }

  function rebuild() {
    if (disposed) return;
    const stale = root.children.slice();
    root.remove(...stale);
    disposeObjects(stale);
    vegetation = [];
    grass = reeds = null;
    grassBlades = [];
    buildTrees();
    buildGroundCover();
    buildRocksAndBoundary();
    refreshCanopies(true);
    builtRevision = world.revision ?? 0;
  }

  function update(time, settings = {}, thermal = false) {
    if (disposed) return;
    if ((world.revision ?? 0) !== builtRevision) rebuild();
    if (time < lastCanopyTime || time - lastCanopyTime >= 1) {
      refreshCanopies();
      lastCanopyTime = time;
    }
    const wind = settings.wind ?? world.settings?.wind ?? 2;
    const windAngle =
      ((settings.windAngle ?? world.settings?.windAngle ?? 30) * Math.PI) / 180;
    const swayPhase = time * (0.72 + wind * 0.09);
    vegetation.forEach((tree) => {
      const field = read(tree.x, tree.z);
      const gust =
        Math.sin(swayPhase + tree.x * 0.43 + tree.z * 0.29) *
        clamp(wind / 9, 0, 1);
      treeMatrices(tree.parts, tree, gust * Math.cos(windAngle - tree.angle));
      const burn = Math.max(
        field.fire,
        clamp(1 - field.fuel / 0.55, 0, 1) * 0.88,
      );
      const living = 1 - burn;
      const crownScale = Math.max(0.025, 1 - burn * 0.94);
      if (tree.conifer) {
        [tree.parts.pineLow, tree.parts.pineMid, tree.parts.pineTop].forEach(
          (mesh, layer) => {
            dummy.position.set(
              tree.x + gust * (0.08 + layer * 0.04),
              tree.base + tree.height * (0.52 + layer * 0.19),
              tree.z,
            );
            dummy.rotation.set(
              gust * 0.08,
              tree.angle + layer * 0.4,
              -gust * 0.12,
            );
            const spread = tree.height * (1.02 - layer * 0.18) * crownScale;
            dummy.scale.set(spread, spread, spread);
            dummy.updateMatrix();
            mesh.setMatrixAt(tree.index, dummy.matrix);
          },
        );
      } else {
        [tree.parts.leafA, tree.parts.leafB].forEach((mesh, layer) => {
          dummy.position.set(
            tree.x + (layer ? 0.18 : -0.13) + gust * 0.1,
            tree.base + tree.height * (0.84 + layer * 0.1),
            tree.z + (layer ? -0.12 : 0.16),
          );
          const spread = tree.height * (0.52 - layer * 0.05) * crownScale;
          dummy.rotation.set(
            layer * 0.2,
            tree.angle + gust * 0.1,
            layer * 0.16 - gust * 0.12,
          );
          dummy.scale.setScalar(spread);
          dummy.updateMatrix();
          mesh.setMatrixAt(tree.index, dummy.matrix);
        });
      }
      const green = tint.setRGB(
        0.1 + living * 0.08,
        0.075 + living * 0.28,
        0.055 + living * 0.1,
      );
      [
        tree.parts.pineLow,
        tree.parts.pineMid,
        tree.parts.pineTop,
        tree.parts.leafA,
        tree.parts.leafB,
      ].forEach((mesh) => mesh.setColorAt(tree.index, green));
      tree.parts.trunk.setColorAt(
        tree.index,
        tint.setRGB(
          0.13 + living * 0.22,
          0.07 + living * 0.14,
          0.035 + living * 0.07,
        ),
      );
    });
    if (grass) {
      grassBlades.forEach((blade) => {
        const field = read(blade.x, blade.z);
        const visible = field.water <= 0.025 && field.fuel > 0.035;
        const burn = Math.max(field.fire, clamp(1 - field.fuel / 0.32, 0, 1));
        const scaleY = visible ? ((1 - burn * 0.82) * blade.height) / 0.34 : 0;
        const sway =
          Math.sin(swayPhase * 1.7 + blade.x * 1.3 + blade.z * 0.9) *
          clamp(wind / 10, 0, 1) *
          0.19;
        dummy.position.set(
          blade.x + sway * 0.11,
          field.height + blade.height * 0.5 - 0.015,
          blade.z,
        );
        dummy.rotation.set(sway, blade.yaw, sway * 0.46);
        dummy.scale.set(visible ? 0.7 : 0, scaleY, visible ? 0.7 : 0);
        dummy.updateMatrix();
        grass.setMatrixAt(blade.index, dummy.matrix);
        const wet = field.moisture;
        grass.setColorAt(
          blade.index,
          burn > 0.15
            ? tint.setRGB(
                0.12 + (1 - burn) * 0.12,
                0.055 + (1 - burn) * 0.12,
                0.025,
              )
            : tint.setRGB(
                0.2 + wet * 0.12,
                0.24 + wet * 0.3,
                0.065 + wet * 0.1,
              ),
        );
      });
      grass.instanceMatrix.needsUpdate = true;
      if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    }
    if (vegetation.length) {
      const parts = vegetation[0].parts;
      Object.values(parts).forEach((mesh) => {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      });
    }
    // `thermal` is accepted for the shared renderer API.  Fire coloration remains
    // field-driven above, avoiding a second decorative heat visualization.
    void thermal;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const owned = root.children.slice();
    root.remove(...owned);
    disposeObjects(owned);
    scene.remove(root);
    vegetation = [];
    grass = reeds = null;
    grassBlades = [];
  }

  rebuild();
  return { update, rebuild, dispose };
}
