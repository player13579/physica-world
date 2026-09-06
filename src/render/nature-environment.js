import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createBroadleafGeometry,
  createFernGeometry,
  createBladeGeometry,
} from './foliage-models.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const hash = (x, z, salt = 0) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453123;
  return v - Math.floor(v);
};

// Every plant is rooted in the same height/fuel/water fields used by the tools.
// Geometry, including individual leaf silhouettes, is the authored visual asset.
export function createEnvironment(scene, world) {
  const root = new THREE.Group();
  root.name = 'procedural-natural-environment';
  scene.add(root);
  const half = world.size / 2;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const geometries = new Set(),
    materials = new Set(),
    dynamicGeometry = new Set();
  const windTime = { value: 0 },
    windStrength = { value: 0.2 };
  let trees = [],
    cover = [],
    disposed = false,
    lastUpdate = -Infinity;
  let builtRevision = -1,
    lastCanopy = -Infinity,
    canopySignature = '',
    canopyStamp = 0;
  const ownGeometry = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const ownMaterial = (material) => {
    materials.add(material);
    return material;
  };

  function cell(x, z) {
    const ix = clamp(Math.round((x + half) / world.dx), 0, world.n - 1);
    const iz = clamp(Math.round((z + half) / world.dx), 0, world.n - 1);
    return iz * world.n + ix;
  }
  function heightAt(x, z) {
    const gx = clamp((x + half) / world.dx, 0, world.n - 1);
    const gz = clamp((z + half) / world.dx, 0, world.n - 1);
    const x0 = Math.min(Math.floor(gx), world.n - 2),
      z0 = Math.min(Math.floor(gz), world.n - 2);
    const tx = gx - x0,
      tz = gz - z0,
      i = z0 * world.n + x0;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(world.height[i], world.height[i + 1], tx),
      THREE.MathUtils.lerp(
        world.height[i + world.n],
        world.height[i + world.n + 1],
        tx,
      ),
      tz,
    );
  }
  function material({
    vertexColors = true,
    roughness = 0.85,
    foliage = false,
    wind = false,
    rock = false,
  } = {}) {
    const m = ownMaterial(
      new THREE.MeshStandardMaterial({
        vertexColors,
        color: 0xffffff,
        roughness,
        metalness: 0,
        side: foliage ? THREE.DoubleSide : THREE.FrontSide,
      }),
    );
    const addWind = (shader) => {
      shader.uniforms.uNatureTime = windTime;
      shader.uniforms.uNatureWind = windStrength;
      shader.vertexShader =
        'uniform float uNatureTime;uniform float uNatureWind;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 plantRoot=vec3(0.);
        #ifdef USE_INSTANCING
          plantRoot=instanceMatrix[3].xyz;
        #endif
        float wave=sin(uNatureTime*1.45+plantRoot.x*.75+plantRoot.z*.53);
        float bend=pow(max(position.y,0.),1.7)*uNatureWind;
        transformed.x+=bend*(wave*.035+sin(uNatureTime*3.1+position.y*9.+plantRoot.x)*.009);
        transformed.z+=bend*cos(uNatureTime*1.1+plantRoot.z*.8)*.018;`,
      );
    };
    m.onBeforeCompile = (shader) => {
      if (wind) addWind(shader);
      if (foliage) {
        shader.vertexShader = 'varying vec2 vLeafUv;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvLeafUv=uv;',
        );
        shader.fragmentShader =
          'varying vec2 vLeafUv;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float centre=1.-smoothstep(.014,.035,abs(vLeafUv.x-.5));
          float veins=1.-smoothstep(.025,.08,abs(fract(vLeafUv.y*12.-abs(vLeafUv.x-.5)*6.)-.5));
          diffuseColor.rgb*=.94+centre*.14+veins*.055;`,
        );
      }
      if (rock) {
        shader.vertexShader = 'varying vec3 vStone;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvStone=position;',
        );
        shader.fragmentShader =
          'varying vec3 vStone;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float grain=fract(sin(dot(floor(vStone*220.),vec3(17.3,31.7,47.1)))*43758.5);
          float veins=sin(vStone.x*24.+sin(vStone.z*18.)+vStone.y*31.);
          diffuseColor.rgb*=.72+grain*.42+smoothstep(.75,1.,veins)*.13;`,
        );
      }
    };
    m.customProgramCacheKey = () => `nature-detail-${wind}-${rock}-${foliage}`;
    if (wind) {
      m.userData.depth = ownMaterial(
        new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          side: m.side,
        }),
      );
      m.userData.depth.onBeforeCompile = addWind;
      m.userData.depth.customProgramCacheKey = () => 'nature-wind-depth';
    }
    return m;
  }

  const treeAssets = [3, 19, 41].map((seed) => {
    const asset = createBroadleafGeometry(seed);
    ownGeometry(asset.wood);
    ownGeometry(asset.leaves);
    return asset;
  });
  const bladeGeometry = ownGeometry(createBladeGeometry());
  const fernGeometry = ownGeometry(createFernGeometry(73));
  const woodMaterial = material({ roughness: 0.97, wind: true });
  const leafMaterial = material({ roughness: 0.73, foliage: true, wind: true });
  const grassMaterial = material({
    vertexColors: Boolean(bladeGeometry.getAttribute('color')),
    roughness: 0.88,
    foliage: true,
    wind: true,
  });
  const fernMaterial = material({ foliage: true, wind: true });
  const rockMaterial = material({
    vertexColors: false,
    rock: true,
    roughness: 0.79,
  });
  const wetRockMaterial = material({
    vertexColors: false,
    rock: true,
    roughness: 0.36,
  });
  const stoneSource = new THREE.IcosahedronGeometry(1, 3);
  stoneSource.deleteAttribute('normal');
  stoneSource.deleteAttribute('uv');
  const stoneGeometry = ownGeometry(mergeVertices(stoneSource));
  stoneSource.dispose();
  const stonePositions = stoneGeometry.attributes.position;
  for (let i = 0; i < stonePositions.count; i++) {
    const x = stonePositions.getX(i),
      y = stonePositions.getY(i),
      z = stonePositions.getZ(i);
    const irregularity =
      1 + 0.12 * Math.sin(x * 7 + z * 5) * Math.cos(y * 6 - z * 4);
    stonePositions.setXYZ(
      i,
      x * irregularity,
      y * irregularity * 0.68,
      z * irregularity,
    );
  }
  stoneGeometry.computeVertexNormals();

  function instances(geometry, mat, count, name) {
    const mesh = new THREE.InstancedMesh(geometry, mat, count);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (mat.userData.depth) mesh.customDepthMaterial = mat.userData.depth;
    root.add(mesh);
    return mesh;
  }
  function matrix(mesh, index, x, y, z, yaw, sx, sy = sx, sz = sx) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  function buildTrees() {
    const candidates = [];
    const target = Math.max(18, Math.min(80, Math.round(world.size * 1.7)));
    for (let k = 0; k < 1200 && candidates.length < target; k++) {
      const x = (hash(k, 9, 1) * 2 - 1) * (half - 0.45);
      const z = (hash(k, 9, 2) * 2 - 1) * (half - 0.5);
      const i = cell(x, z);
      if (world.water[i] > 0.008 || world.fuel[i] < 0.45) continue;
      // Keep the foreground and the flowing channel open to touch and view.
      if (
        Math.abs(x) < world.size * 0.2 ||
        (z > half * 0.35 && Math.abs(x) < half * 0.76)
      )
        continue;
      if (candidates.some((t) => Math.hypot(t.x - x, t.z - z) < 1.3)) continue;
      const h = (z > half * 0.35 ? 1.8 : 2.6) + hash(k, 12, 2) * 1.1;
      candidates.push({
        x,
        z,
        height: h,
        yaw: hash(k, 7, 2) * TAU,
        cell: i,
        base: heightAt(x, z),
        variant: k % 3,
      });
    }
    for (let v = 0; v < 3; v++) {
      const group = candidates.filter((t) => t.variant === v);
      const wood = instances(
        treeAssets[v].wood,
        woodMaterial,
        group.length,
        `tree-trunks-${v}`,
      );
      const leaves = instances(
        treeAssets[v].leaves,
        leafMaterial,
        group.length,
        `tree-leaves-${v}`,
      );
      group.forEach((t, index) => {
        t.wood = wood;
        t.leaves = leaves;
        t.index = index;
        trees.push(t);
      });
    }
  }
  function buildCover() {
    const blades = [],
      ferns = [];
    for (let k = 0; k < 36000; k++) {
      const x = (hash(k, 41, 1) * 2 - 1) * (half - 0.035);
      const z = (hash(k, 41, 2) * 2 - 1) * (half - 0.035);
      const i = cell(x, z);
      if (world.water[i] > 0.012 || world.fuel[i] < 0.13) continue;
      const patch = 0.5 + 0.5 * Math.sin(x * 2.3 + Math.cos(z * 1.7));
      if (hash(k, 42, 1) < 0.2 * (1 - patch)) continue;
      blades.push({
        x,
        z,
        cell: i,
        base: heightAt(x, z),
        height: 0.12 + hash(k, 42, 2) * 0.24,
        yaw: hash(k, 42, 3) * TAU,
        width: 0.65 + hash(k, 42, 4) * 0.8,
      });
    }
    for (let k = 0; k < 350 && ferns.length < 100; k++) {
      const x = (hash(k, 51, 1) * 2 - 1) * (half - 0.3),
        z = (hash(k, 51, 2) * 2 - 1) * (half - 0.3);
      const i = cell(x, z);
      if (
        world.water[i] > 0.006 ||
        world.fuel[i] < 0.38 ||
        Math.abs(x) < world.size * 0.09
      )
        continue;
      if (ferns.some((f) => Math.hypot(f.x - x, f.z - z) < 0.45)) continue;
      ferns.push({
        x,
        z,
        cell: i,
        base: heightAt(x, z),
        height: 0.28 + hash(k, 53, 1) * 0.38,
        yaw: hash(k, 53, 2) * TAU,
        width: 1,
      });
    }
    const grass = instances(
      bladeGeometry,
      grassMaterial,
      blades.length,
      'wind-grass',
    );
    const fern = instances(
      fernGeometry,
      fernMaterial,
      ferns.length,
      'riverbank-ferns',
    );
    blades.forEach((p, index) =>
      cover.push({ ...p, index, mesh: grass, fern: false }),
    );
    ferns.forEach((p, index) =>
      cover.push({ ...p, index, mesh: fern, fern: true }),
    );
  }
  function buildStones() {
    const dry = [],
      wet = [];
    for (let k = 0; k < 1800; k++) {
      const x = (hash(k, 63, 1) * 2 - 1) * (half - 0.1),
        z = (hash(k, 63, 2) * 2 - 1) * (half - 0.1),
        i = cell(x, z);
      const inWater = world.water[i] > 0.005;
      if (!inWater && hash(k, 63, 3) > 0.22) continue;
      const r = inWater
        ? 0.025 + hash(k, 65, 1) * 0.1
        : 0.04 + Math.pow(hash(k, 65, 2), 4) * 0.34;
      (inWater ? wet : dry).push({
        x,
        z,
        r,
        y: heightAt(x, z) + r * 0.18,
        yaw: hash(k, 65, 3) * TAU,
        tone: hash(k, 65, 4),
      });
    }
    for (const [items, mat, name] of [
      [dry, rockMaterial, 'field-stones'],
      [wet, wetRockMaterial, 'river-pebbles'],
    ]) {
      const mesh = instances(stoneGeometry, mat, items.length, name);
      items.forEach((p, index) => {
        matrix(
          mesh,
          index,
          p.x,
          p.y,
          p.z,
          p.yaw,
          p.r,
          p.r,
          p.r * (0.8 + p.tone * 0.4),
        );
        tint.setHex(
          p.tone > 0.6 ? 0x95876d : p.tone > 0.28 ? 0x626b57 : 0x424943,
        );
        mesh.setColorAt(index, tint);
      });
    }
  }
  function buildBoundary() {
    const points = [],
      edge = world.n - 1;
    for (let i = 0; i <= edge; i++)
      points.push([-half + (i / edge) * world.size, -half]);
    for (let i = 1; i <= edge; i++)
      points.push([half, -half + (i / edge) * world.size]);
    for (let i = 1; i <= edge; i++)
      points.push([half - (i / edge) * world.size, half]);
    for (let i = 1; i <= edge; i++)
      points.push([-half, half - (i / edge) * world.size]);
    const bottom = Math.min(...points.map((p) => heightAt(...p))) - 0.35;
    [0x39412a, 0x42372a, 0x302c23].forEach((hex, band) => {
      const positions = [],
        indices = [];
      points.forEach(([x, z], i) => {
        const y = heightAt(x, z);
        positions.push(
          x,
          THREE.MathUtils.lerp(y, bottom, band / 3),
          z,
          x,
          THREE.MathUtils.lerp(y, bottom, (band + 1) / 3),
          z,
        );
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
      dynamicGeometry.add(geometry);
      const mat = ownMaterial(
        new THREE.MeshStandardMaterial({ color: hex, roughness: 1 }),
      );
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = `exposed-stratified-earth-${band}`;
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    });
  }
  function refreshCanopies(force = false) {
    const crowns = trees.map((t) => {
      const live =
        clamp(world.fuel[t.cell] / 0.55, 0, 1) * (1 - world.fire[t.cell]);
      return {
        x: t.x,
        z: t.z,
        base: t.base + t.height * 0.36,
        top: t.base + t.height * 1.06,
        radius: t.height * 0.36,
        opacity: live * 0.63,
      };
    });
    const signature = crowns.map((c) => c.opacity.toFixed(1)).join(',');
    if (force || signature !== canopySignature) {
      world.setCanopies?.(crowns, ++canopyStamp);
      canopySignature = signature;
    }
  }
  function update(time, settings = {}, thermal = false) {
    if (disposed) return;
    windTime.value = time;
    windStrength.value = clamp((settings.wind ?? 2) / 3, 0, 2);
    if (world.revision !== builtRevision) rebuild();
    if (time < lastCanopy || time - lastCanopy >= 1) {
      refreshCanopies();
      lastCanopy = time;
    }
    if (time >= lastUpdate && time - lastUpdate < 0.2) return;
    lastUpdate = time;
    const dirty = new Set();
    trees.forEach((t) => {
      const live =
        clamp(world.fuel[t.cell] / 0.55, 0, 1) * (1 - world.fire[t.cell]);
      if (t.lastLive === live) return;
      t.lastLive = live;
      dirty.add(t.wood);
      dirty.add(t.leaves);
      matrix(t.wood, t.index, t.x, t.base, t.z, t.yaw, t.height);
      matrix(
        t.leaves,
        t.index,
        t.x,
        t.base,
        t.z,
        t.yaw,
        live > 0.06 ? t.height : 0,
      );
      t.wood.setColorAt(
        t.index,
        tint.setRGB(0.6 + live * 0.4, 0.5 + live * 0.5, 0.4 + live * 0.6),
      );
      t.leaves.setColorAt(
        t.index,
        tint.setRGB(
          0.22 + live * 0.78,
          0.13 + live * 0.87,
          0.075 + live * 0.925,
        ),
      );
    });
    cover.forEach((p) => {
      const live =
        clamp(world.fuel[p.cell] / 0.4, 0, 1) * (1 - world.fire[p.cell]);
      const visible =
        world.water[p.cell] < (p.fern ? 0.04 : 0.025) && live > 0.04;
      const visualKey = visible ? live : -1;
      if (p.visualKey === visualKey) return;
      p.visualKey = visualKey;
      dirty.add(p.mesh);
      const h = visible ? p.height * (0.4 + live * 0.6) : 0;
      matrix(
        p.mesh,
        p.index,
        p.x,
        p.base - 0.008,
        p.z,
        p.yaw,
        h * p.width,
        h,
        h,
      );
      if (p.fern)
        tint.setRGB(0.58 + live * 0.42, 0.5 + live * 0.5, 0.3 + live * 0.7);
      else {
        // The blade already owns a green vertex palette. Instance colour is a
        // linear variation multiplier, not a second dark green albedo.
        const variation = 0.72 + p.width * 0.24;
        tint.setRGB(variation, variation, variation * 0.9);
        if (live < 0.8) tint.multiplyScalar(0.2 + live * 0.8);
      }
      p.mesh.setColorAt(p.index, tint);
    });
    dirty.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    void thermal;
  }
  function rebuild() {
    if (disposed) return;
    root.children.forEach((m) => {
      if (m.isInstancedMesh) m.dispose();
      else if (m.name.startsWith('exposed-stratified-earth-')) {
        materials.delete(m.material);
        m.material.dispose();
      }
    });
    root.clear();
    dynamicGeometry.forEach((g) => g.dispose());
    dynamicGeometry.clear();
    trees = [];
    cover = [];
    buildTrees();
    buildCover();
    buildStones();
    buildBoundary();
    builtRevision = world.revision;
    lastUpdate = -Infinity;
    refreshCanopies(true);
    update(world.time, world.settings);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.children.forEach((m) => {
      if (m.isInstancedMesh) m.dispose();
    });
    root.clear();
    scene.remove(root);
    geometries.forEach((g) => g.dispose());
    dynamicGeometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    trees = [];
    cover = [];
  }
  rebuild();
  return { update, rebuild, dispose };
}
