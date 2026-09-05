// A compact, dependency-free geometric optics model for canvas renderers.
const EPS = 1e-4;
const MAX_DISTANCE = 2200;
const MAX_BOUNCES = 12;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const mul = (p, n) => ({ x: p.x * n, y: p.y * n });
const dot = (p, q) => p.x * q.x + p.y * q.y;
const cross = (p, q) => p.x * q.y - p.y * q.x;
const length = (p) => Math.hypot(p.x, p.y);
const unit = (p) => {
  const l = length(p) || 1;
  return { x: p.x / l, y: p.y / l };
};
const radians = (d) => (d * Math.PI) / 180;
const distanceToSegment = (p, a, b) => {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
  return length(sub(p, add(a, mul(ab, t))));
};

/** Specular reflection of normalized (or normalizable) incident vector i around n. */
export function reflect(i, n) {
  const I = unit(i),
    N = unit(n);
  return unit(sub(I, mul(N, 2 * dot(I, N))));
}

/**
 * Snell refraction. normal must point into the incident medium (against I).
 * Returns null for total internal reflection.
 */
export function refract(i, normal, n1, n2) {
  const I = unit(i),
    N = unit(normal);
  const eta = n1 / n2;
  const cosine = clamp(-dot(I, N), -1, 1);
  const k = 1 - eta * eta * (1 - cosine * cosine);
  if (k < 0) return null;
  return unit(add(mul(I, eta), mul(N, eta * cosine - Math.sqrt(k))));
}

function raySegment(p, d, a, b) {
  const e = sub(b, a);
  const den = cross(d, e);
  if (Math.abs(den) < EPS) return null;
  const ap = sub(a, p),
    t = cross(ap, e) / den,
    u = cross(ap, d) / den;
  return t > EPS && u >= -EPS && u <= 1 + EPS
    ? { t, point: add(p, mul(d, t)) }
    : null;
}
function rayCircle(p, d, c, r) {
  const pc = sub(p, c),
    b = 2 * dot(pc, d),
    cc = dot(pc, pc) - r * r;
  const disc = b * b - 4 * cc;
  if (disc < 0) return null;
  const root = Math.sqrt(disc),
    candidates = [(-b - root) / 2, (-b + root) / 2].filter((t) => t > EPS);
  if (!candidates.length) return null;
  const t = Math.min(...candidates);
  return { t, point: add(p, mul(d, t)) };
}
function polygonArea(v) {
  return v.reduce((s, p, i) => s + cross(p, v[(i + 1) % v.length]), 0) / 2;
}
function pointInPolygon(p, vs) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const a = vs[i],
      b = vs[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function createOptics({ width = 1000, height = 650 } = {}) {
  let nextId = 1;
  const makePrism = () => ({
    id: `prism-${nextId++}`,
    type: 'prism',
    x: width * 0.55,
    y: height * 0.5,
    vertices: [
      { x: width * 0.48, y: height * 0.68 },
      { x: width * 0.48, y: height * 0.32 },
      { x: width * 0.7, y: height * 0.5 },
    ],
    refractiveIndex: 1.5,
  });
  const options = {
    angle: 0,
    refractiveIndex: 1.5,
    rayCount: 3,
    dispersion: true,
    objectAngle: 45,
  };
  let emitter = { x: width * 0.12, y: height * 0.5, angle: 0 };
  let objects = [makePrism()],
    selectedId = null,
    dragging = null;
  const cached = {
    rays: [],
    stats: { rays: 0, reflections: 0, refractions: 0 },
    selectedId: null,
    objects: [],
    emitter: clone(emitter),
  };

  function normalForPrism(vertices, i) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      edge = sub(b, a);
    // clockwise polygons have exterior to the left; counter-clockwise to the right.
    return unit(
      polygonArea(vertices) < 0
        ? { x: -edge.y, y: edge.x }
        : { x: edge.y, y: -edge.x },
    );
  }
  function closestHit(p, d) {
    let best = null;
    for (const object of objects) {
      if (object.type === 'mirror') {
        const hit = raySegment(p, d, object.a, object.b);
        if (hit && (!best || hit.t < best.t))
          best = {
            ...hit,
            object,
            normal: unit({
              x: -(object.b.y - object.a.y),
              y: object.b.x - object.a.x,
            }),
          };
      } else if (object.type === 'glass') {
        const hit = rayCircle(p, d, object, object.radius);
        if (hit && (!best || hit.t < best.t))
          best = { ...hit, object, normal: unit(sub(hit.point, object)) };
      } else if (object.type === 'prism') {
        object.vertices.forEach((a, i) => {
          const hit = raySegment(
            p,
            d,
            a,
            object.vertices[(i + 1) % object.vertices.length],
          );
          if (hit && (!best || hit.t < best.t))
            best = {
              ...hit,
              object,
              normal: normalForPrism(object.vertices, i),
            };
        });
      }
    }
    return best;
  }
  function mediumIndex(object, color) {
    const base = object.refractiveIndex || options.refractiveIndex;
    if (!options.dispersion) return base;
    return (
      base + ({ '#ff5b5b': -0.012, '#64a8ff': 0.012, '#70e07b': 0 }[color] || 0)
    );
  }
  function trace(origin, direction, color) {
    let p = { ...origin },
      d = unit(direction),
      intensity = 1,
      medium = null,
      bounces = 0;
    const result = [];
    while (bounces++ < MAX_BOUNCES && intensity > 0.08) {
      const hit = closestHit(p, d);
      if (!hit) {
        result.push({
          a: p,
          b: add(p, mul(d, MAX_DISTANCE)),
          color,
          intensity,
        });
        break;
      }
      result.push({ a: p, b: hit.point, color, intensity });
      if (hit.object.type === 'mirror') {
        d = reflect(d, hit.normal);
        cached.stats.reflections++;
      } else {
        const inside =
          medium === hit.object ||
          (medium === null &&
            (hit.object.type === 'glass'
              ? length(sub(p, hit.object)) < hit.object.radius - EPS
              : pointInPolygon(p, hit.object.vertices)));
        const nGlass = mediumIndex(hit.object, color),
          n1 = inside ? nGlass : 1,
          n2 = inside ? 1 : nGlass;
        const normal = inside ? mul(hit.normal, -1) : hit.normal;
        const transmitted = refract(d, normal, n1, n2);
        if (transmitted) {
          d = transmitted;
          medium = inside ? null : hit.object;
          cached.stats.refractions++;
        } else {
          d = reflect(d, hit.normal);
          cached.stats.reflections++;
        }
      }
      p = add(hit.point, mul(d, EPS * 20));
      intensity *= 0.94;
    }
    return result;
  }
  function rebuild() {
    cached.stats = { rays: 0, reflections: 0, refractions: 0 };
    const count = options.dispersion
      ? Math.max(1, options.rayCount) * 3
      : options.rayCount;
    const colors = options.dispersion
      ? ['#ff5b5b', '#70e07b', '#64a8ff']
      : ['#fff4c2'];
    const base = radians(emitter.angle + options.angle),
      spread = radians(12);
    cached.rays = [];
    for (let i = 0; i < options.rayCount; i++)
      for (const color of colors) {
        const offset =
          options.rayCount === 1
            ? 0
            : (i / (options.rayCount - 1) - 0.5) * spread;
        cached.rays.push(
          ...trace(
            emitter,
            { x: Math.cos(base + offset), y: Math.sin(base + offset) },
            color,
          ),
        );
      }
    cached.stats.rays = count;
    cached.objects = clone(objects);
    cached.emitter = clone(emitter);
    cached.selectedId = selectedId;
  }
  function addObject(tool, x, y) {
    if (tool === 'mirror') {
      const a = radians(options.objectAngle);
      return {
        id: `mirror-${nextId++}`,
        type: 'mirror',
        x,
        y,
        a: { x: x - Math.cos(a) * 50, y: y - Math.sin(a) * 50 },
        b: { x: x + Math.cos(a) * 50, y: y + Math.sin(a) * 50 },
      };
    }
    if (tool === 'glass')
      return {
        id: `glass-${nextId++}`,
        type: 'glass',
        x,
        y,
        radius: 65,
        refractiveIndex: options.refractiveIndex,
      };
    return null;
  }
  function findObject(x, y) {
    return objects.find((o) =>
      o.type === 'mirror'
        ? distanceToSegment({ x, y }, o.a, o.b) < 18
        : o.type === 'glass'
          ? Math.hypot(x - o.x, y - o.y) < o.radius
          : pointInPolygon({ x, y }, o.vertices),
    );
  }
  function moveObject(o, dx, dy) {
    o.x += dx;
    o.y += dy;
    if (o.a) {
      o.a = add(o.a, { x: dx, y: dy });
      o.b = add(o.b, { x: dx, y: dy });
    }
    if (o.vertices)
      o.vertices = o.vertices.map((v) => add(v, { x: dx, y: dy }));
  }
  function selectedAngle() {
    const o = objects.find((x) => x.id === selectedId);
    return o?.type === 'mirror'
      ? (Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x) * 180) / Math.PI
      : null;
  }

  rebuild();
  return {
    step() {
      rebuild();
      return this.getState();
    },
    reset(preset = 'prism') {
      selectedId = null;
      emitter = { x: width * 0.12, y: height * 0.5, angle: 0 };
      objects =
        preset === 'mirrors'
          ? [
              {
                id: `mirror-${nextId++}`,
                type: 'mirror',
                x: width * 0.48,
                y: height * 0.35,
                a: { x: width * 0.42, y: height * 0.27 },
                b: { x: width * 0.54, y: height * 0.43 },
              },
              {
                id: `mirror-${nextId++}`,
                type: 'mirror',
                x: width * 0.7,
                y: height * 0.52,
                a: { x: width * 0.63, y: height * 0.62 },
                b: { x: width * 0.77, y: height * 0.42 },
              },
            ]
          : preset === 'lens'
            ? [
                {
                  id: `glass-${nextId++}`,
                  type: 'glass',
                  x: width * 0.55,
                  y: height * 0.5,
                  radius: 90,
                  refractiveIndex: options.refractiveIndex,
                },
              ]
            : [makePrism()];
      rebuild();
      return this.getState();
    },
    setOptions(change = {}) {
      if (Number.isFinite(change.angle))
        options.angle = clamp(change.angle, -75, 75);
      if (Number.isFinite(change.refractiveIndex)) {
        options.refractiveIndex = clamp(change.refractiveIndex, 1, 2);
        objects
          .filter((o) => o.type !== 'mirror')
          .forEach((o) => {
            o.refractiveIndex = options.refractiveIndex;
          });
      }
      if (Number.isFinite(change.rayCount))
        options.rayCount = clamp(Math.round(change.rayCount), 1, 9);
      if (typeof change.dispersion === 'boolean')
        options.dispersion = change.dispersion;
      if (Number.isFinite(change.objectAngle)) {
        options.objectAngle = clamp(change.objectAngle, -90, 90);
        const o = objects.find((x) => x.id === selectedId);
        if (o?.type === 'mirror') {
          const a = radians(options.objectAngle),
            half = length(sub(o.b, o.a)) / 2;
          o.a = { x: o.x - Math.cos(a) * half, y: o.y - Math.sin(a) * half };
          o.b = { x: o.x + Math.cos(a) * half, y: o.y + Math.sin(a) * half };
        }
      }
      rebuild();
      return this.getState();
    },
    pointerDown(x, y, tool = 'move') {
      const found = findObject(x, y);
      if (tool === 'erase') {
        if (found) objects = objects.filter((o) => o !== found);
        selectedId = null;
        rebuild();
        return this.getState();
      }
      if (tool === 'move' && Math.hypot(x - emitter.x, y - emitter.y) < 26) {
        dragging = { emitter: true, x, y };
        selectedId = null;
      } else if (found) {
        selectedId = found.id;
        dragging = { object: found, x, y };
      } else if (
        (tool === 'mirror' || tool === 'glass') &&
        objects.length < 30
      ) {
        const created = addObject(tool, x, y);
        objects.push(created);
        selectedId = created.id;
        dragging = { object: created, x, y };
      }
      rebuild();
      return this.getState();
    },
    pointerMove(x, y) {
      if (!dragging) return this.getState();
      const dx = x - dragging.x,
        dy = y - dragging.y;
      if (dragging.emitter) {
        emitter.x += dx;
        emitter.y += dy;
      } else moveObject(dragging.object, dx, dy);
      dragging.x = x;
      dragging.y = y;
      rebuild();
      return this.getState();
    },
    pointerUp() {
      dragging = null;
      rebuild();
      return this.getState();
    },
    getState() {
      return {
        objects: clone(cached.objects),
        rays: clone(cached.rays),
        emitter: clone(cached.emitter),
        stats: { ...cached.stats, selectedAngle: selectedAngle() },
        selectedId,
      };
    },
  };
}
