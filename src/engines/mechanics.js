import Matter from 'matter-js';

const { Engine, World, Bodies, Body, Constraint, Composite, Query, Vector } =
  Matter;
const PX_PER_METER = 80;
const MAX_BODIES = 100;
const MATERIALS = {
  wood: {
    density: 0.001,
    restitution: 0.28,
    friction: 0.52,
    kgPerSquareMeter: 32,
  },
  rubber: {
    density: 0.00115,
    restitution: 0.82,
    friction: 0.78,
    kgPerSquareMeter: 42,
  },
  steel: {
    density: 0.0045,
    restitution: 0.12,
    friction: 0.32,
    kgPerSquareMeter: 140,
  },
};

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/**
 * A deterministic, DOM-free Matter.js sandbox. Coordinates are pixels, while
 * public velocities and gravity are expressed in metres/second units.
 */
export function createMechanics({ width = 1000, height = 650 } = {}) {
  width = Math.max(200, Number(width) || 1000);
  height = Math.max(180, Number(height) || 650);
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.x = 0;
  engine.gravity.y = 1;
  engine.gravity.scale = (9.81 * PX_PER_METER) / 1_000_000;
  const options = { gravity: 9.81, restitution: 0.28, friction: 0.52 };
  let nextId = 1;
  let pointer = null;
  let dragConstraint = null;
  let goal = null;

  const userBodies = () =>
    Composite.allBodies(engine.world).filter((body) => !body.plugin.boundary);
  const tag = (body, material = 'wood', extra = {}) => {
    body.plugin = { ...body.plugin, material, id: nextId++, ...extra };
    return body;
  };
  const tune = (body) => {
    const m = MATERIALS[body.plugin?.material] || MATERIALS.wood;
    // The controls shift all materials from the wood baseline, retaining their
    // relative character (rubber remains bouncy; steel remains dense/slippery).
    body.restitution = clamp(
      m.restitution + options.restitution - MATERIALS.wood.restitution,
      0,
      1,
    );
    body.friction = clamp(
      m.friction + options.friction - MATERIALS.wood.friction,
      0,
      1,
    );
  };
  const add = (body) => {
    if (userBodies().length >= MAX_BODIES) return null;
    tune(body);
    World.add(engine.world, body);
    return body;
  };
  const materialOptions = (material, overrides = {}) => {
    const m = MATERIALS[material] || MATERIALS.wood;
    return {
      density: m.density,
      restitution: m.restitution,
      friction: m.friction,
      ...overrides,
    };
  };
  const addBall = (x, y, radius = 18, material = 'wood', extra = {}) =>
    add(
      tag(
        Bodies.circle(x, y, radius, materialOptions(material, extra)),
        material,
        { radius, ...extra },
      ),
    );
  const addBox = (x, y, w = 40, h = 40, material = 'wood', extra = {}) =>
    add(
      tag(
        Bodies.rectangle(x, y, w, h, materialOptions(material, extra)),
        material,
        { w, h, ...extra },
      ),
    );
  const addPlatform = (x, y, w = 150, h = 18, material = 'wood', extra = {}) =>
    add(
      tag(
        Bodies.rectangle(x, y, w, h, {
          ...materialOptions(material, extra),
          isStatic: true,
        }),
        material,
        { w, h, ...extra },
      ),
    );
  const addBoundary = (x, y, w, h) => {
    const wall = Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      restitution: 0.2,
      friction: 0.6,
    });
    wall.plugin = { boundary: true, material: 'boundary' };
    World.add(engine.world, wall);
  };
  const addPerimeter = () => {
    const t = 40;
    addBoundary(width / 2, height + t / 2, width + 2 * t, t);
    addBoundary(width / 2, -t / 2, width + 2 * t, t);
    addBoundary(-t / 2, height / 2, t, height + 2 * t);
    addBoundary(width + t / 2, height / 2, t, height + 2 * t);
  };
  const removeBody = (body) => {
    if (!body || body.plugin?.boundary) return;
    for (const c of Composite.allConstraints(engine.world)) {
      if (c.bodyA === body || c.bodyB === body) World.remove(engine.world, c);
    }
    World.remove(engine.world, body);
  };
  const clear = () => {
    Composite.clear(engine.world, false, true);
    nextId = 1;
    pointer = null;
    dragConstraint = null;
    goal = null;
    addPerimeter();
  };
  const setOptions = (changes = {}) => {
    if (changes.gravity !== undefined)
      options.gravity = clamp(changes.gravity, 0, 20);
    if (changes.restitution !== undefined)
      options.restitution = clamp(changes.restitution, 0, 1);
    if (changes.friction !== undefined)
      options.friction = clamp(changes.friction, 0, 1);
    engine.gravity.scale = (options.gravity * PX_PER_METER) / 1_000_000;
    for (const body of userBodies()) {
      tune(body);
    }
  };
  const reset = (preset = 'playground') => {
    clear();
    if (preset === 'domino') {
      addPlatform(width * 0.52, height - 55, width * 0.8, 18);
      for (let i = 0; i < 18; i++)
        addBox(width * 0.24 + i * 29, height - 100, 12, 72, 'wood');
      addBall(width * 0.12, height - 106, 22, 'rubber');
    } else if (preset === 'pendulum') {
      addPlatform(width / 2, 80, 300, 18);
      const a = addBall(width / 2 - 95, 240, 24, 'steel');
      const b = addBall(width / 2 + 95, 270, 24, 'steel');
      World.add(engine.world, [
        Constraint.create({
          pointA: { x: width / 2 - 100, y: 88 },
          bodyB: a,
          length: 152,
          stiffness: 0.95,
        }),
        Constraint.create({ bodyA: a, bodyB: b, length: 190, stiffness: 0.95 }),
      ]);
    } else if (preset === 'challenge') {
      addPlatform(width * 0.2, height - 70, 245, 18);
      addPlatform(width * 0.72, height - 145, 245, 18);
      const ball = addBall(width * 0.16, height - 120, 20, 'rubber', {
        marked: true,
      });
      addPlatform(width * 0.48, height - 290, 190, 18);
      goal = {
        x: width * 0.72 - 70,
        y: height - 215,
        w: 140,
        h: 70,
        complete: false,
        progress: 0,
        ballId: ball?.plugin.id,
      };
    } else {
      addPlatform(width * 0.25, height - 120, 320, 20);
      addPlatform(width * 0.68, height - 260, 250, 20);
      const ramp = addPlatform(width * 0.5, height - 190, 260, 18);
      Body.rotate(ramp, -0.32);
      addBall(width * 0.15, 100, 24, 'rubber');
      addBox(width * 0.3, height - 180, 48, 48, 'wood');
      addBox(width * 0.37, height - 180, 48, 48, 'steel');
    }
    setOptions(options);
  };
  const step = (dtSeconds) => {
    const seconds = clamp(dtSeconds, 0, 0.25);
    let remaining = seconds * 1000;
    while (remaining > 0.0001) {
      const dt = Math.min(remaining, 1000 / 120);
      Engine.update(engine, dt);
      remaining -= dt;
    }
    if (goal && !goal.complete) {
      const ball = userBodies().find((b) => b.plugin?.id === goal.ballId);
      if (ball) {
        const inside =
          ball.position.x >= goal.x &&
          ball.position.x <= goal.x + goal.w &&
          ball.position.y >= goal.y &&
          ball.position.y <= goal.y + goal.h;
        goal.progress = Math.max(
          0,
          Math.min(
            1,
            1 -
              Vector.magnitude(
                Vector.sub(ball.position, {
                  x: goal.x + goal.w / 2,
                  y: goal.y + goal.h / 2,
                }),
              ) /
                Math.max(width, height),
          ),
        );
        if (inside && Vector.magnitude(ball.velocity) < 1.4)
          goal.complete = true;
      }
    }
  };
  const nearest = (x, y, dynamicOnly = false) =>
    Query.point(
      userBodies().filter((body) => !dynamicOnly || !body.isStatic),
      { x, y },
    )[0];
  const pointerDown = (x, y, tool, material = 'wood') => {
    // A new press always owns the drag; this prevents an abandoned constraint
    // when a host forwards pointer-down events without an intervening up.
    if (dragConstraint) pointerUp();
    x = clamp(x, 0, width);
    y = clamp(y, 0, height);
    pointer = { x, y, tool, material };
    if (tool === 'ball') addBall(x, y, 20, material);
    else if (tool === 'box') addBox(x, y, 44, 44, material);
    else if (tool === 'platform') addPlatform(x, y, 150, 18, material);
    else if (tool === 'erase') removeBody(nearest(x, y));
    else if (tool === 'grab') {
      const body = nearest(x, y, true);
      if (body) {
        dragConstraint = Constraint.create({
          pointA: { x, y },
          bodyB: body,
          pointB: Vector.sub({ x, y }, body.position),
          stiffness: 0.22,
          damping: 0.12,
          length: 0,
        });
        World.add(engine.world, dragConstraint);
      }
    }
  };
  const pointerMove = (x, y) => {
    if (!pointer) return;
    pointer.x = clamp(x, 0, width);
    pointer.y = clamp(y, 0, height);
    if (dragConstraint) dragConstraint.pointA = { x: pointer.x, y: pointer.y };
  };
  const pointerUp = () => {
    if (dragConstraint) World.remove(engine.world, dragConstraint);
    dragConstraint = null;
    pointer = null;
  };
  const getState = () => {
    let energy = 0,
      maxSpeed = 0;
    const bodies = userBodies().map((body) => {
      const m = MATERIALS[body.plugin?.material] || MATERIALS.wood;
      const areaM2 = body.area / (PX_PER_METER * PX_PER_METER);
      const kg = Math.max(0.001, areaM2 * m.kgPerSquareMeter);
      // Matter stores velocity as displacement per its 60 Hz base timestep.
      const vx = (body.velocity.x * 60) / PX_PER_METER;
      const vy = (body.velocity.y * 60) / PX_PER_METER;
      const speed = Math.hypot(vx, vy);
      if (!body.isStatic)
        energy +=
          0.5 * kg * speed * speed +
          kg *
            options.gravity *
            Math.max(0, (height - body.position.y) / PX_PER_METER);
      maxSpeed = Math.max(maxSpeed, speed);
      return {
        id: body.plugin?.id,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        vertices: body.vertices.map(({ x, y }) => ({ x, y })),
        radius: body.plugin?.radius ?? null,
        isStatic: body.isStatic,
        material: body.plugin?.material || 'wood',
        marked: Boolean(body.plugin?.marked),
        vx,
        vy,
        mass: kg,
        selected: dragConstraint?.bodyB === body,
      };
    });
    return {
      bodies,
      constraints: Composite.allConstraints(engine.world)
        .filter((c) => c !== dragConstraint)
        .map((c) => ({
          a: c.bodyA
            ? {
                x: c.bodyA.position.x + (c.pointA?.x || 0),
                y: c.bodyA.position.y + (c.pointA?.y || 0),
              }
            : c.pointA,
          b: c.bodyB
            ? {
                x: c.bodyB.position.x + (c.pointB?.x || 0),
                y: c.bodyB.position.y + (c.pointB?.y || 0),
              }
            : c.pointB,
        })),
      stats: { objects: bodies.length, energy, speed: maxSpeed },
      goal: goal ? { ...goal } : null,
    };
  };
  reset('playground');
  return {
    step,
    reset,
    setOptions,
    pointerDown,
    pointerMove,
    pointerUp,
    getState,
  };
}

export { PX_PER_METER, MATERIALS };
