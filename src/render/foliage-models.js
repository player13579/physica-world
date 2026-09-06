import * as THREE from 'three';

/**
 * Code-native foliage geometry for PHYSICA's streamside scene.
 *
 * Coordinates are Y-up, with every plant rooted at local (0, 0, 0).  The tree
 * is nominally one unit tall (scale it to the desired world height); the fern
 * is also one unit tall; and the grass blade is one unit long.  The factories
 * own positions, normals, UVs and vertex colours only.  Renderer, materials,
 * instancing, shadow policy, placement and simulation remain the caller's
 * responsibility.
 */
export const FOLIAGE_MODEL_INFO = Object.freeze({
  coordinateSystem: 'Y-up; local root at (0, 0, 0)',
  ownership:
    'procedural BufferGeometry only; caller owns materials and scene integration',
  tree: 'nominal height 1, open deciduous canopy radius about 0.35',
  fern: 'nominal height 1, intended for 0.35-0.65m world scaling',
  blade: 'nominal length 1, intended for per-instance bending and scaling',
});

function mulberry32(seed) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function colorFromHex(hex) {
  // setHex with SRGBColorSpace stores the required linear vertex-colour values.
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

function makeBuilder(withUv = false) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  return {
    positions,
    colors,
    uvs,
    indices,
    point(v, color, uv) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
      if (withUv) uvs.push(uv?.x ?? 0, uv?.y ?? 0);
      return positions.length / 3 - 1;
    },
    triangle(a, b, c) {
      indices.push(a, b, c);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      );
      if (withUv)
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

function safeBasis(axis) {
  const helper =
    Math.abs(axis.y) > 0.91
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(axis, helper).normalize();
  return { side, up: new THREE.Vector3().crossVectors(side, axis).normalize() };
}

function addTaperedSegment(
  builder,
  start,
  end,
  radius0,
  radius1,
  colour,
  sides = 7,
) {
  const axis = new THREE.Vector3().subVectors(end, start);
  const length = axis.length();
  if (length < 1e-5) return;
  axis.divideScalar(length);
  const { side, up } = safeBasis(axis);
  const startRing = [];
  const endRing = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const radial = side
      .clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(up, Math.sin(angle));
    startRing.push(
      builder.point(start.clone().addScaledVector(radial, radius0), colour),
    );
    endRing.push(
      builder.point(end.clone().addScaledVector(radial, radius1), colour),
    );
  }
  for (let i = 0; i < sides; i += 1) {
    const next = (i + 1) % sides;
    builder.triangle(startRing[i], endRing[i], endRing[next]);
    builder.triangle(startRing[i], endRing[next], startRing[next]);
  }
}

function addFoldedLeaf(builder, center, forward, width, length, colour) {
  const f = forward.clone().normalize();
  const { side, up } = safeBasis(f);
  // A five-point folded lance creates a visible centre vein and two light-catching planes.
  const base = center.clone().addScaledVector(f, -length * 0.52);
  const tip = center.clone().addScaledVector(f, length * 0.56);
  // `width` is the full blade width, making call sites read like real leaf sizes.
  const left = center
    .clone()
    .addScaledVector(side, width * 0.5)
    .addScaledVector(f, -length * 0.05);
  const right = center
    .clone()
    .addScaledVector(side, -width * 0.5)
    .addScaledVector(f, -length * 0.05);
  const ridge = center.clone().addScaledVector(up, width * 0.17);
  const a = builder.point(base, colour, new THREE.Vector2(0.5, 0));
  const b = builder.point(left, colour, new THREE.Vector2(0, 0.48));
  const c = builder.point(tip, colour, new THREE.Vector2(0.5, 1));
  const d = builder.point(right, colour, new THREE.Vector2(1, 0.48));
  const e = builder.point(ridge, colour, new THREE.Vector2(0.5, 0.5));
  builder.triangle(a, b, e);
  builder.triangle(b, c, e);
  builder.triangle(c, d, e);
  builder.triangle(d, a, e);
}

/** Creates wood and leaf meshes for a small, open-grown deciduous tree. */
export function createBroadleafGeometry(seed = 1) {
  const random = mulberry32(seed);
  const wood = makeBuilder();
  const leaves = makeBuilder(true);
  const bark = [0x3d2b1d, 0x493221, 0x563b25].map(colorFromHex);
  const foliage = [0x315b29, 0x467432, 0x5f8737, 0x789443].map(colorFromHex);
  const trunkPoints = [new THREE.Vector3(0, 0, 0)];
  for (let i = 1; i <= 10; i += 1) {
    const previous = trunkPoints[i - 1];
    const sway = (random() - 0.5) * 0.013 * (i / 10);
    trunkPoints.push(
      new THREE.Vector3(
        previous.x + sway,
        i * 0.079,
        previous.z + (random() - 0.5) * 0.01,
      ),
    );
  }
  for (let i = 0; i < trunkPoints.length - 1; i += 1) {
    addTaperedSegment(
      wood,
      trunkPoints[i],
      trunkPoints[i + 1],
      0.034 - i * 0.00215,
      0.032 - i * 0.00215,
      bark[i % bark.length],
      8,
    );
  }

  const terminals = [];
  const branchCount = 25;
  for (let branch = 0; branch < branchCount; branch += 1) {
    const t = branch / branchCount;
    const level = 0.3 + t * 0.52 + random() * 0.035;
    const trunkIndex = Math.min(9, Math.max(3, Math.round(level / 0.079)));
    let start = trunkPoints[trunkIndex].clone();
    const azimuth = branch * 2.3999632297 + random() * 0.8;
    const radial = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const direction = radial
      .clone()
      .multiplyScalar(0.7 + random() * 0.15)
      .add(new THREE.Vector3(0, 0.5 + random() * 0.33, 0))
      .normalize();
    let thickness = 0.0105 - t * 0.0032;
    for (let segment = 0; segment < 4; segment += 1) {
      const span = 0.064 - segment * 0.007 + random() * 0.01;
      direction
        .addScaledVector(radial, 0.08 + random() * 0.05)
        .add(
          new THREE.Vector3(
            (random() - 0.5) * 0.15,
            0.02,
            (random() - 0.5) * 0.15,
          ),
        )
        .normalize();
      const end = start.clone().addScaledVector(direction, span);
      addTaperedSegment(
        wood,
        start,
        end,
        thickness,
        thickness * 0.7,
        bark[(branch + segment) % bark.length],
        6,
      );
      start = end;
      thickness *= 0.7;
      // Leaf clusters grow from several ages of each branch, obscuring the
      // framework while preserving open gaps between individual leaves.
      if (segment > 0)
        terminals.push({
          point: start.clone(),
          radial,
          direction: direction.clone(),
        });
    }
    terminals.push({ point: start, radial, direction });
    // A short upward twig keeps the leaf-bearing structure visibly branched.
    const twig = start
      .clone()
      .addScaledVector(direction, 0.045)
      .add(new THREE.Vector3(0, 0.025, 0));
    addTaperedSegment(
      wood,
      start,
      twig,
      thickness,
      thickness * 0.52,
      bark[branch % bark.length],
      5,
    );
    terminals.push({
      point: twig,
      radial,
      direction: direction
        .clone()
        .add(new THREE.Vector3(0, 0.3, 0))
        .normalize(),
    });
  }

  // Separate leaves retain branch-readable negative space while forming dense,
  // overlapping multi-layered crowns around branch interiors and tips.
  for (let i = 0; i < 2800; i += 1) {
    const terminal = terminals[i % terminals.length];
    const angle = random() * Math.PI * 2;
    const clusterRadius = 0.012 + Math.pow(random(), 0.72) * 0.076;
    const side = new THREE.Vector3(
      Math.cos(angle),
      (random() - 0.48) * 0.68,
      Math.sin(angle),
    );
    const center = terminal.point
      .clone()
      .addScaledVector(terminal.radial, (random() - 0.5) * 0.07)
      .addScaledVector(side, clusterRadius)
      .add(new THREE.Vector3(0, (random() - 0.44) * 0.045, 0));
    const forward = side
      .addScaledVector(terminal.direction, 0.55 + random() * 0.25)
      .normalize();
    addFoldedLeaf(
      leaves,
      center,
      forward,
      0.02 + random() * 0.01,
      0.035 + random() * 0.025,
      foliage[(i + Math.floor(random() * 2)) % foliage.length],
    );
  }
  return { wood: wood.finish(), leaves: leaves.finish() };
}

/** Creates a clumping fern with arching rachises and paired pointed leaflets. */
export function createFernGeometry(seed = 1) {
  const random = mulberry32(seed ^ 0x9e3779b9);
  const builder = makeBuilder(true);
  const stemColours = [0x3c5a23, 0x55772d].map(colorFromHex);
  const leafColours = [0x4d7d2d, 0x68983b, 0x376427].map(colorFromHex);
  const fronds = 13;
  for (let frond = 0; frond < fronds; frond += 1) {
    const azimuth = (frond / fronds) * Math.PI * 2 + random() * 0.28;
    const outward = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const points = [];
    for (let step = 0; step <= 12; step += 1) {
      const t = step / 12;
      const reach = (0.42 + random() * 0.055) * Math.sin(t * Math.PI * 0.68);
      points.push(
        outward
          .clone()
          .multiplyScalar(reach)
          .add(new THREE.Vector3(0, t * 1.08 - t * t * 0.14, 0)),
      );
    }
    for (let step = 0; step < points.length - 1; step += 1) {
      addTaperedSegment(
        builder,
        points[step],
        points[step + 1],
        0.006 - step * 0.00032,
        0.0057 - step * 0.00032,
        stemColours[frond % 2],
        5,
      );
    }
    for (let step = 1; step < 12; step += 1) {
      const t = step / 12;
      const axis = new THREE.Vector3()
        .subVectors(points[step + 1], points[step - 1])
        .normalize();
      const left = new THREE.Vector3().crossVectors(axis, outward).normalize();
      const leafletLength =
        (0.085 + random() * 0.025) * Math.sin(t * Math.PI * 0.96);
      for (const sign of [-1, 1]) {
        const forward = left
          .clone()
          .multiplyScalar(sign * 0.88)
          .addScaledVector(axis, 0.24)
          .addScaledVector(outward, 0.16)
          .normalize();
        const center = points[step]
          .clone()
          .addScaledVector(forward, leafletLength * 0.34);
        addFoldedLeaf(
          builder,
          center,
          forward,
          leafletLength * 0.28,
          leafletLength,
          leafColours[(step + frond + (sign > 0 ? 1 : 0)) % leafColours.length],
        );
      }
    }
  }
  return builder.finish();
}

/** Creates a narrow, curved, segmented grass blade, with UVs from root to tip. */
export function createBladeGeometry() {
  const builder = makeBuilder(true);
  const baseColour = colorFromHex(0x517d2b);
  const segments = 10;
  const left = [];
  const right = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const bend = Math.sin(t * Math.PI * 0.72) * 0.16;
    const center = new THREE.Vector3(bend, t, 0.025 * Math.sin(t * Math.PI));
    const width = 0.02 * (1 - t) + 0.0015;
    const shade = baseColour.clone().multiplyScalar(0.82 + t * 0.22);
    left.push(
      builder.point(
        center.clone().add(new THREE.Vector3(0, 0, width)),
        shade,
        new THREE.Vector2(0, t),
      ),
    );
    right.push(
      builder.point(
        center.clone().add(new THREE.Vector3(0, 0, -width)),
        shade,
        new THREE.Vector2(1, t),
      ),
    );
  }
  for (let i = 0; i < segments; i += 1) {
    builder.triangle(left[i], right[i], right[i + 1]);
    builder.triangle(left[i], right[i + 1], left[i + 1]);
  }
  return builder.finish();
}
