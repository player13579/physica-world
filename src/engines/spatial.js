import * as CANNON from 'cannon-es';

// Small, deterministic 3D lab engines.  They deliberately return renderer-agnostic
// primitives so the Three.js view can be replaced without changing simulation code.
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, (a[2] || 0) * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const unit = (a) => {
  const l = len(a) || 1;
  return vmul(a, 1 / l);
};
const hex = (r, g, b) =>
  '#' +
  [r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0'))
    .join('');
const tempColor = (t) => {
  const stops = [
    [0, [62, 104, 245]],
    [20, [31, 74, 98]],
    [40, [62, 166, 150]],
    [65, [230, 185, 67]],
    [90, [248, 109, 58]],
    [120, [255, 229, 158]],
  ];
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i][0]) {
      const f = Math.max(
        0,
        (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]),
      );
      return hex(
        ...stops[i][1].map((v, j) => stops[i - 1][1][j] * (1 - f) + v * f),
      );
    }
  return '#ffe59e';
};
const pointOf = (x) =>
  x.position ||
  (x.body && [x.body.position.x, x.body.position.y, x.body.position.z]) || [
    0, 0, 0,
  ];
const closest = (items, p) =>
  items.reduce(
    (best, x) =>
      !best || len(vsub(pointOf(x), p)) < len(vsub(pointOf(best), p))
        ? x
        : best,
    null,
  );

function mechanics() {
  const options = { gravity: 9.81, restitution: 0.45, friction: 0.35 };
  let world, bodies, next;
  const reset = (preset = 'pile') => {
    world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -options.gravity, 0),
    });
    world.allowSleep = true;
    world.defaultContactMaterial.restitution = options.restitution;
    world.defaultContactMaterial.friction = options.friction;
    bodies = [];
    next = 1;
    const wall = (p, s) => {
      const b = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(...s.map((x) => x / 2))),
        position: new CANNON.Vec3(...p),
      });
      world.addBody(b);
    };
    wall([0, -0.2, 0], [12.4, 0.4, 8.4]);
    wall([-6.2, 4, 0], [0.4, 8, 8.4]);
    wall([6.2, 4, 0], [0.4, 8, 8.4]);
    wall([0, 4, -4.2], [12.4, 8, 0.4]);
    wall([0, 4, 4.2], [12.4, 8, 0.4]);
    wall([0, 8.2, 0], [12.4, 0.4, 8.4]);
    const add = (shape, pos, size, color, mass = 1) => {
      const b = new CANNON.Body({
        mass,
        material: new CANNON.Material('lab'),
        position: new CANNON.Vec3(...pos),
        shape,
      });
      b.linearDamping = 0.015;
      world.addBody(b);
      bodies.push({
        id: `m${next++}`,
        body: b,
        shape: size.length === 1 ? 'sphere' : 'box',
        size,
        color,
      });
    };
    add(new CANNON.Sphere(0.55), [-1.4, 5, 0], [0.55], '#59b8ff');
    add(new CANNON.Sphere(0.4), [1.4, 7.3, -0.5], [0.4], '#ffd166');
    add(
      new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
      [0.4, 6.3, 0.3],
      [1, 1, 1],
      '#ff7b72',
    );
    for (let i = 0; i < 6; i++)
      add(
        new CANNON.Sphere(0.32),
        [
          -1 + (i % 3) * 0.7,
          1.1 + Math.floor(i / 3) * 0.7,
          (i % 2) * 0.55 - 0.25,
        ],
        [0.32],
        '#8ce99a',
      );
    if (preset === 'tower')
      for (let i = 0; i < 6; i++)
        add(
          new CANNON.Box(new CANNON.Vec3(0.38, 0.38, 0.38)),
          [0, 0.45 + i * 0.78, 0],
          [0.76, 0.76, 0.76],
          '#c792ea',
        );
  };
  reset();
  return {
    reset,
    setOptions(o = {}) {
      Object.assign(
        options,
        ...['gravity', 'restitution', 'friction']
          .filter((k) => Number.isFinite(o[k]))
          .map((k) => ({
            [k]: clamp(o[k], k === 'gravity' ? 0 : 0, k === 'gravity' ? 20 : 1),
          })),
      );
      world.gravity.set(0, -options.gravity, 0);
      world.defaultContactMaterial.restitution = options.restitution;
      world.defaultContactMaterial.friction = options.friction;
    },
    step(dt) {
      for (let t = clamp(dt, 0, 0.05); t > 1e-6; t -= 1 / 120)
        world.step(1 / 120, Math.min(t, 1 / 120), 1);
    },
    interact(p, tool = 'ball') {
      if (!Array.isArray(p)) return;
      const hit = closest(bodies, p);
      if (tool === 'erase' && hit) {
        world.removeBody(hit.body);
        bodies = bodies.filter((x) => x !== hit);
        return;
      }
      if (tool === 'grab' && hit) {
        hit.body.applyImpulse(
          new CANNON.Vec3(
            (p[0] - hit.body.position.x) * 3,
            4,
            (p[2] - hit.body.position.z) * 3,
          ),
          new CANNON.Vec3(0, 0, 0),
        );
        return;
      }
      if (!['ball', 'box', 'platform'].includes(tool) || bodies.length >= 100)
        return;
      const sphere = tool === 'ball',
        platform = tool === 'platform';
      const size = sphere ? [0.38] : platform ? [2, 0.25, 1] : [0.8, 0.8, 0.8];
      const b = new CANNON.Body({
        mass: platform ? 0 : 1,
        position: new CANNON.Vec3(p[0], clamp(p[1], 0.4, 7.5), p[2]),
        shape: sphere
          ? new CANNON.Sphere(size[0])
          : new CANNON.Box(
              new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2),
            ),
      });
      world.addBody(b);
      bodies.push({
        id: `m${next++}`,
        body: b,
        shape: sphere ? 'sphere' : 'box',
        size,
        color: sphere ? '#4cc9f0' : platform ? '#94a3b8' : '#f72585',
      });
    },
    getState() {
      let e = 0;
      const instances = bodies.map((x) => {
        const b = x.body;
        e +=
          0.5 * b.mass * b.velocity.lengthSquared() +
          b.mass * options.gravity * b.position.y;
        return {
          id: x.id,
          shape: x.shape,
          position: [b.position.x, b.position.y, b.position.z],
          quaternion: [
            b.quaternion.x,
            b.quaternion.y,
            b.quaternion.z,
            b.quaternion.w,
          ],
          size: x.size,
          color: x.color,
          opacity: 1,
        };
      });
      return {
        instances,
        lines: [],
        stats: { objects: instances.length, energy: e },
        label: '3D rigid-body dynamics (Cannon-es)',
      };
    },
  };
}

function fluid() {
  const options = { viscosity: 0.18, force: 1 };
  let particles = [],
    obstacles = [],
    next = 1;
  const N = 280,
    h = 0.52,
    restDensity = 7;
  const reset = () => {
    particles = [];
    obstacles = [];
    next = 1;
    for (let i = 0; i < N; i++)
      particles.push({
        id: `f${next++}`,
        position: [
          -2.2 + (i % 10) * 0.35,
          0.5 + Math.floor(i / 80) * 0.36,
          -1.5 + (Math.floor(i / 10) % 8) * 0.38,
        ],
        velocity: [0, 0, 0],
        rho: restDensity,
      });
  };
  reset();
  const addBurst = (p) => {
    for (let i = 0; i < 24 && particles.length < 600; i++)
      particles.push({
        id: `f${next++}`,
        position: vadd(p, [
          ((i % 4) - 1.5) * 0.12,
          (Math.floor(i / 4) % 3) * 0.1,
          (Math.floor(i / 12) - 0.5) * 0.15,
        ]),
        velocity: [0, 0, 0],
        rho: restDensity,
        dye: true,
      });
  };
  return {
    reset,
    setOptions(o = {}) {
      if (Number.isFinite(o.viscosity))
        options.viscosity = clamp(o.viscosity, 0, 2);
      if (Number.isFinite(o.force)) options.force = clamp(o.force, 0, 3);
    },
    step(dt) {
      dt = clamp(dt, 0, 0.025);
      for (const p of particles) {
        p.rho = 0;
        for (const q of particles) {
          const d = len(vsub(p.position, q.position));
          if (d < h) {
            const w = 1 - d / h;
            p.rho += w * w * w * 8;
          }
        }
      }
      const acc = particles.map(() => [0, -7.5, 0]);
      for (let i = 0; i < particles.length; i++)
        for (let j = i + 1; j < particles.length; j++) {
          const r = vsub(particles[j].position, particles[i].position),
            d = len(r);
          if (d >= h || d < 0.001) continue;
          const n = vmul(r, 1 / d),
            q = 1 - d / h,
            pressure =
              options.force *
              (particles[i].rho -
                restDensity +
                (particles[j].rho - restDensity)) *
              0.1;
          const f = vmul(n, pressure * q);
          acc[i] = vsub(acc[i], f);
          acc[j] = vadd(acc[j], f);
          const visc = vmul(
            vsub(particles[j].velocity, particles[i].velocity),
            options.viscosity * q * 0.1,
          );
          acc[i] = vadd(acc[i], visc);
          acc[j] = vsub(acc[j], visc);
        }
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i],
          a = acc[i];
        p.velocity = vadd(p.velocity, vmul(a, dt));
        const speed = len(p.velocity);
        if (speed > 8) p.velocity = vmul(p.velocity, 8 / speed);
        p.position = vadd(p.position, vmul(p.velocity, dt));
        for (let k = 0; k < 3; k++) {
          const lo = k === 1 ? 0.18 : k === 0 ? -5.8 : -3.8,
            hi = k === 1 ? 7.8 : k === 0 ? 5.8 : 3.8;
          if (p.position[k] < lo || p.position[k] > hi) {
            p.position[k] = clamp(p.position[k], lo, hi);
            p.velocity[k] *= -0.35;
          }
        }
        for (const o of obstacles) {
          const d = vsub(p.position, o.position);
          const half = o.size.map((v) => v / 2 + 0.075);
          if (d.every((v, k) => Math.abs(v) < half[k])) {
            const penetration = half.map((v, k) => v - Math.abs(d[k]));
            const axis = penetration.indexOf(Math.min(...penetration));
            const sign = d[axis] >= 0 ? 1 : -1;
            p.position[axis] = o.position[axis] + sign * (half[axis] + 0.001);
            if (p.velocity[axis] * sign < 0) p.velocity[axis] *= -0.2;
          }
        }
      }
    },
    interact(p, tool = 'dye') {
      if (!Array.isArray(p)) return;
      if (tool === 'dye') {
        addBurst(p);
        return;
      }
      if (tool === 'stir') {
        for (const q of particles)
          if (len(vsub(q.position, p)) < 1.5)
            q.velocity = vadd(q.velocity, [
              options.force * 2,
              options.force * 2,
              0,
            ]);
        return;
      }
      if (tool === 'wall') {
        if (obstacles.length < 24)
          obstacles.push({
            id: `o${next++}`,
            position: [
              clamp(p[0], -5, 5),
              clamp(p[1], 0.5, 6),
              clamp(p[2], -3.5, 3.5),
            ],
            size: [1.5, 1.5, 0.3],
          });
        return;
      }
      if (tool === 'erase') {
        const o = closest(obstacles, p);
        if (o) obstacles = obstacles.filter((x) => x !== o);
      }
    },
    getState() {
      const av = particles.reduce((s, p) => s + p.rho, 0) / particles.length;
      return {
        instances: [
          ...particles.map((p) => ({
            id: p.id,
            shape: 'sphere',
            position: p.position,
            size: [0.075],
            color: p.dye ? '#ff4fd8' : '#4fc3f7',
            opacity: 0.72,
          })),
          ...obstacles.map((o) => ({
            id: o.id,
            shape: 'box',
            position: o.position,
            size: o.size,
            color: '#94a3b8',
            opacity: 0.65,
          })),
        ],
        lines: [],
        stats: {
          objects: particles.length,
          particles: particles.length,
          obstacles: obstacles.length,
          averageDensity: av,
        },
        label: '3D SPH particle-fluid demonstration',
      };
    },
  };
}

function heat() {
  const nx = 18,
    ny = 12,
    nz = 12,
    n = nx * ny * nz;
  const T = new Float32Array(n),
    next = new Float32Array(n),
    walls = new Uint8Array(n),
    sources = new Int8Array(n),
    options = { conductivity: 1, sourceTemperature: 100 };
  const I = (x, y, z) => x + nx * (y + ny * z);
  const xyz = (p) => [
    clamp(Math.round(((p[0] + 6) / 12) * (nx - 1)), 0, nx - 1),
    clamp(Math.round((p[1] / 8) * (ny - 1)), 0, ny - 1),
    clamp(Math.round(((p[2] + 4) / 8) * (nz - 1)), 0, nz - 1),
  ];
  const reset = () => {
    T.fill(20);
    walls.fill(0);
    sources.fill(0);
    for (let z = 3; z < 9; z++)
      for (let y = 3; y < 9; y++) {
        sources[I(1, y, z)] = 1;
        T[I(1, y, z)] = options.sourceTemperature;
        sources[I(nx - 2, y, z)] = -1;
        T[I(nx - 2, y, z)] = 0;
      }
  };
  reset();
  return {
    reset,
    setOptions(o = {}) {
      if (Number.isFinite(o.conductivity))
        options.conductivity = clamp(o.conductivity, 0.1, 2);
      if (Number.isFinite(o.sourceTemperature))
        options.sourceTemperature = clamp(o.sourceTemperature, 30, 120);
    },
    step(dt) {
      let remain = clamp(dt, 0, 0.05);
      while (remain > 1e-7) {
        const d = Math.min(remain, 1 / 120),
          a = Math.min(0.15, options.conductivity * d * 8);
        remain -= d;
        for (let z = 0; z < nz; z++)
          for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) {
              const k = I(x, y, z);
              if (walls[k]) {
                next[k] = T[k];
                continue;
              }
              if (sources[k]) {
                next[k] = sources[k] > 0 ? options.sourceTemperature : 0;
                continue;
              }
              const c = T[k];
              let s = 0;
              for (const [dx, dy, dz] of [
                [1, 0, 0],
                [-1, 0, 0],
                [0, 1, 0],
                [0, -1, 0],
                [0, 0, 1],
                [0, 0, -1],
              ]) {
                const X = x + dx,
                  Y = y + dy,
                  Z = z + dz;
                s +=
                  X < 0 ||
                  Y < 0 ||
                  Z < 0 ||
                  X >= nx ||
                  Y >= ny ||
                  Z >= nz ||
                  walls[I(X, Y, Z)]
                    ? c
                    : T[I(X, Y, Z)];
              }
              next[k] = clamp(c + a * (s - 6 * c), 0, 120);
            }
        T.set(next);
      }
    },
    interact(p, tool = 'hot') {
      const [x, y, z] = xyz(p),
        k = I(x, y, z);
      if (tool === 'wall') {
        walls[k] = 1;
        sources[k] = 0;
      } else if (tool === 'erase') {
        walls[k] = 0;
        sources[k] = 0;
        T[k] = 20;
      } else if (!walls[k]) {
        sources[k] = tool === 'cold' ? -1 : 1;
        T[k] = tool === 'cold' ? 0 : options.sourceTemperature;
      }
    },
    getState() {
      let min = 120,
        max = 0,
        sum = 0,
        count = 0;
      const instances = [];
      for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            const k = I(x, y, z),
              t = T[k];
            if (!walls[k]) {
              min = Math.min(min, t);
              max = Math.max(max, t);
              sum += t;
              count++;
              if (Math.abs(t - 20) > 2)
                instances.push({
                  id: `h${k}`,
                  shape: 'box',
                  position: [
                    (x / (nx - 1)) * 12 - 6,
                    (y / (ny - 1)) * 8,
                    (z / (nz - 1)) * 8 - 4,
                  ],
                  size: [0.55, 0.55, 0.55],
                  color: tempColor(t),
                  opacity: 0.12 + Math.abs(t - 20) / 150,
                });
            } else
              instances.push({
                id: `w${k}`,
                shape: 'box',
                position: [
                  (x / (nx - 1)) * 12 - 6,
                  (y / (ny - 1)) * 8,
                  (z / (nz - 1)) * 8 - 4,
                ],
                size: [0.6, 0.6, 0.6],
                color: '#64748b',
                opacity: 0.7,
              });
          }
      const lines = [];
      for (const z of [-4, 4])
        for (const y of [0, 8])
          lines.push({ a: [-6, y, z], b: [6, y, z], color: '#64748b' });
      return {
        instances,
        lines,
        stats: {
          objects: instances.length,
          min,
          max,
          average: sum / (count || 1),
          energy: sum - count * 20,
        },
        label: '3D six-neighbour heat diffusion',
      };
    },
  };
}

function optics() {
  const options = { angle: 0, refractiveIndex: 1.5, rayCount: 5 };
  let glass, mirrors, next;
  const reset = () => {
    next = 2;
    glass = [{ id: 'g1', position: [0, 3, 0], radius: 1.05 }];
    mirrors = [];
  };
  reset();
  const raySphere = (p, d, s) => {
    const q = vsub(p, s.position),
      b = dot(q, d),
      c = dot(q, q) - s.radius * s.radius,
      disc = b * b - c;
    if (disc < 0) return null;
    let t = -b - Math.sqrt(disc);
    if (t < 0.001) t = -b + Math.sqrt(disc);
    return t > 0.001
      ? { t, point: vadd(p, vmul(d, t)), kind: 'glass', object: s }
      : null;
  };
  // Each mirror is a finite vertical plane, normal along x, bounded in y and z.
  const rayMirror = (p, d, m) => {
    if (Math.abs(d[0]) < 1e-7) return null;
    const t = (m.position[0] - p[0]) / d[0];
    if (t < 0.001) return null;
    const q = vadd(p, vmul(d, t));
    return Math.abs(q[1] - m.position[1]) <= m.size[1] / 2 &&
      Math.abs(q[2] - m.position[2]) <= m.size[2] / 2
      ? { t, point: q, kind: 'mirror', object: m }
      : null;
  };
  return {
    reset,
    setOptions(o = {}) {
      if (Number.isFinite(o.angle)) options.angle = clamp(o.angle, -60, 60);
      if (Number.isFinite(o.refractiveIndex))
        options.refractiveIndex = clamp(o.refractiveIndex, 1, 2.2);
      if (Number.isFinite(o.rayCount))
        options.rayCount = clamp(Math.round(o.rayCount), 1, 12);
    },
    step() {},
    interact(p, tool = 'glass') {
      if (
        glass.length + mirrors.length >= 30 &&
        ['glass', 'mirror'].includes(tool)
      )
        return;
      if (tool === 'glass')
        glass.push({ id: `g${next++}`, position: p.slice(), radius: 0.8 });
      else if (tool === 'mirror')
        mirrors.push({
          id: `r${next++}`,
          position: p.slice(),
          size: [0.12, 2.5, 3],
        });
      else if (tool === 'erase') {
        const o = closest([...glass, ...mirrors], p);
        glass = glass.filter((x) => x !== o);
        mirrors = mirrors.filter((x) => x !== o);
      } else if (tool === 'move') {
        const o = closest([...glass, ...mirrors], p);
        if (o) o.position = p.slice();
      }
    },
    getState() {
      const instances = [
          ...glass.map((g) => ({
            id: g.id,
            shape: 'sphere',
            position: g.position,
            size: [g.radius],
            color: '#82d7ff',
            opacity: 0.25,
          })),
          ...mirrors.map((m) => ({
            id: m.id,
            shape: 'box',
            position: m.position,
            size: m.size,
            color: '#e2e8f0',
            opacity: 0.9,
          })),
        ],
        lines = [];
      let reflections = 0,
        refractions = 0;
      for (let i = 0; i < options.rayCount; i++) {
        const z = (i - (options.rayCount - 1) / 2) * 0.18;
        let p = [-5, 3, z],
          d = unit([
            Math.cos((options.angle * Math.PI) / 180),
            Math.sin((options.angle * Math.PI) / 180),
            0,
          ]);
        for (let b = 0; b < 7; b++) {
          let hit = null;
          for (const candidate of [
            ...glass.map((g) => raySphere(p, d, g)),
            ...mirrors.map((m) => rayMirror(p, d, m)),
          ])
            if (candidate && (!hit || candidate.t < hit.t)) hit = candidate;
          const end = hit ? hit.point : vadd(p, vmul(d, 12));
          lines.push({ a: p, b: end, color: '#ffe66d' });
          if (!hit) break;
          if (hit.kind === 'mirror') {
            d = [-d[0], d[1], d[2]];
            reflections++;
          } else {
            const n = unit(vsub(hit.point, hit.object.position)),
              entering = dot(d, n) < 0,
              normal = entering ? n : vmul(n, -1),
              eta = entering
                ? 1 / options.refractiveIndex
                : options.refractiveIndex,
              co = -dot(d, normal),
              k = 1 - eta * eta * (1 - co * co);
            d =
              k < 0
                ? vsub(d, vmul(normal, 2 * dot(d, normal)))
                : unit(
                    vadd(vmul(d, eta), vmul(normal, eta * co - Math.sqrt(k))),
                  );
            if (k < 0) reflections++;
            else refractions++;
          }
          p = vadd(hit.point, vmul(d, 0.002));
        }
      }
      return {
        instances,
        lines,
        stats: {
          objects: instances.length,
          rays: options.rayCount,
          refractions,
          reflections,
        },
        label: '3D geometric optics: Snell refraction and finite plane mirrors',
      };
    },
  };
}

export function createSpatial({ mode = 'mechanics' } = {}) {
  let current = mode,
    engine = ({ mechanics, fluid, heat, optics }[mode] || mechanics)();
  return {
    step: (dt) => {
      engine.step(dt);
      return engine.getState();
    },
    reset: (p) => {
      engine.reset(p);
      return engine.getState();
    },
    setOptions: (o) => {
      engine.setOptions(o);
      return engine.getState();
    },
    interact: (p, t) => {
      if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
        throw new TypeError('Finite 3D position required');
      const q = [
        clamp(p[0], -5.5, 5.5),
        clamp(p[1], 0.4, 7.2),
        clamp(p[2], -3.5, 3.5),
      ];
      engine.interact(q, t);
      return engine.getState();
    },
    getState: () => engine.getState(),
    setMode: (m) => {
      if (['mechanics', 'fluid', 'heat', 'optics'].includes(m)) {
        current = m;
        engine = { mechanics, fluid, heat, optics }[m]();
      }
      return engine.getState();
    },
    get mode() {
      return current;
    },
  };
}

export const spatialMath = {
  refract: (i, n, n1, n2) => {
    const I = unit(i),
      N = unit(n),
      eta = n1 / n2,
      c = -dot(I, N),
      k = 1 - eta * eta * (1 - c * c);
    return k < 0
      ? null
      : unit(vadd(vmul(I, eta), vmul(N, eta * c - Math.sqrt(k))));
  },
};
