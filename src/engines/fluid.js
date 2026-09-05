/** A compact, nondimensional 2D stable-fluid solver.  Coordinates are in the
 * supplied virtual canvas (default 1000 by 650), not pixels in the grid. */
export function createFluid({ width = 1000, height = 650 } = {}) {
  const cols = Math.max(24, Math.round(width / 10));
  const rows = Math.max(18, Math.round(height / 10));
  const n = cols * rows;
  const dye = new Float32Array(n),
    dyeNext = new Float32Array(n);
  const u = new Float32Array(n),
    v = new Float32Array(n);
  const uNext = new Float32Array(n),
    vNext = new Float32Array(n);
  const pressure = new Float32Array(n),
    pressureNext = new Float32Array(n);
  const divergence = new Float32Array(n),
    solid = new Uint8Array(n);
  let time = 0,
    dragging = false,
    lastX = 0,
    lastY = 0,
    selectedTool = 'dye',
    activePreset = 'empty';
  const options = { viscosity: 0.08, force: 1 };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const id = (x, y) => y * cols + x;
  const inside = (x, y) => x > 0 && y > 0 && x < cols - 1 && y < rows - 1;
  const clear = () => {
    dye.fill(0);
    u.fill(0);
    v.fill(0);
    solid.fill(0);
    time = 0;
  };
  const sample = (field, x, y) => {
    x = clamp(x, 0, cols - 1);
    y = clamp(y, 0, rows - 1);
    const x0 = x | 0,
      y0 = y | 0,
      x1 = Math.min(cols - 1, x0 + 1),
      y1 = Math.min(rows - 1, y0 + 1);
    const tx = x - x0,
      ty = y - y0;
    return (
      (field[id(x0, y0)] * (1 - tx) + field[id(x1, y0)] * tx) * (1 - ty) +
      (field[id(x0, y1)] * (1 - tx) + field[id(x1, y1)] * tx) * ty
    );
  };
  const enforce = () => {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const k = id(x, y);
        if (!inside(x, y) || solid[k]) {
          u[k] = v[k] = 0;
          dye[k] = 0;
        }
      }
  };
  const paintDisk = (x, y, radius, fn) => {
    const gx = (x / width) * (cols - 1),
      gy = (y / height) * (rows - 1),
      r = (radius * cols) / width;
    for (
      let yy = Math.max(1, Math.floor(gy - r));
      yy <= Math.min(rows - 2, Math.ceil(gy + r));
      yy++
    )
      for (
        let xx = Math.max(1, Math.floor(gx - r));
        xx <= Math.min(cols - 2, Math.ceil(gx + r));
        xx++
      )
        if ((xx - gx) ** 2 + (yy - gy) ** 2 <= r * r) fn(id(xx, yy), xx, yy);
  };
  function reset(preset = 'empty') {
    clear();
    activePreset = preset;
    if (preset === 'vortex') {
      const cx = cols * 0.5,
        cy = rows * 0.5;
      for (let y = 1; y < rows - 1; y++)
        for (let x = 1; x < cols - 1; x++) {
          const k = id(x, y),
            dx = x - cx,
            dy = y - cy,
            rr = dx * dx + dy * dy;
          const spin = 16 * Math.exp(-rr / 700);
          u[k] = (-dy * spin) / (Math.sqrt(rr) + 4);
          v[k] = (dx * spin) / (Math.sqrt(rr) + 4);
          const ring = Math.abs(Math.sqrt(rr) - Math.min(cols, rows) * 0.22);
          dye[k] = Math.exp((-ring * ring) / 10) * 0.9;
        }
    } else if (preset === 'channel') {
      const cx = cols * 0.58,
        cy = rows * 0.5,
        r = Math.min(cols, rows) * 0.12;
      for (let y = 1; y < rows - 1; y++)
        for (let x = 1; x < cols - 1; x++) {
          const k = id(x, y);
          u[k] = 5;
          if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) solid[k] = 1;
          if (x < 5 && Math.abs(y - cy) < rows * 0.12) dye[k] = 1;
        }
    }
    enforce();
    return api;
  }
  function setOptions(next = {}) {
    if (Number.isFinite(next.viscosity))
      options.viscosity = clamp(next.viscosity, 0, 1);
    if (Number.isFinite(next.force)) options.force = clamp(next.force, 0, 2);
    return api;
  }
  function step(seconds = 1 / 60) {
    let remain = clamp(Number.isFinite(seconds) ? seconds : 0, 0, 0.05);
    while (remain > 1e-6) {
      const dt = Math.min(remain, 1 / 60);
      remain -= dt;
      // The channel is a driven experiment: its inlet is continuously supplied.
      if (activePreset === 'channel')
        for (let y = 1; y < rows - 1; y++) {
          const k = id(1, y);
          if (Math.abs(y - rows * 0.5) < rows * 0.12 && !solid[k]) {
            u[k] = 5;
            dye[k] = 1;
          }
        }
      // Semi-Lagrangian advection: robust even when the display framerate drops.
      for (let y = 1; y < rows - 1; y++)
        for (let x = 1; x < cols - 1; x++) {
          const k = id(x, y);
          if (solid[k]) continue;
          const bx = x - u[k] * dt,
            by = y - v[k] * dt;
          dyeNext[k] = sample(dye, bx, by) * 0.998;
          uNext[k] = sample(u, bx, by);
          vNext[k] = sample(v, bx, by);
        }
      dye.set(dyeNext);
      u.set(uNext);
      v.set(vNext);
      enforce();
      // Mild viscosity diffusion.
      const visc = options.viscosity * 0.12;
      if (visc > 0)
        for (let pass = 0; pass < 2; pass++) {
          for (let y = 1; y < rows - 1; y++)
            for (let x = 1; x < cols - 1; x++) {
              const k = id(x, y);
              if (solid[k]) continue;
              const au =
                (u[id(x - 1, y)] +
                  u[id(x + 1, y)] +
                  u[id(x, y - 1)] +
                  u[id(x, y + 1)]) *
                0.25;
              const av =
                (v[id(x - 1, y)] +
                  v[id(x + 1, y)] +
                  v[id(x, y - 1)] +
                  v[id(x, y + 1)]) *
                0.25;
              uNext[k] = u[k] + visc * (au - u[k]);
              vNext[k] = v[k] + visc * (av - v[k]);
            }
          u.set(uNext);
          v.set(vNext);
          enforce();
        }
      // Pressure projection enforces nearly incompressible flow.
      for (let y = 1; y < rows - 1; y++)
        for (let x = 1; x < cols - 1; x++) {
          const k = id(x, y);
          if (solid[k]) {
            divergence[k] = 0;
            continue;
          }
          // Remove the normal component next to an obstacle before projection.
          if (solid[id(x - 1, y)] || solid[id(x + 1, y)]) u[k] = 0;
          if (solid[id(x, y - 1)] || solid[id(x, y + 1)]) v[k] = 0;
          divergence[k] =
            -0.5 *
            (u[id(x + 1, y)] -
              u[id(x - 1, y)] +
              v[id(x, y + 1)] -
              v[id(x, y - 1)]);
          pressure[k] = 0;
        }
      for (let pass = 0; pass < 18; pass++) {
        for (let y = 1; y < rows - 1; y++)
          for (let x = 1; x < cols - 1; x++) {
            const k = id(x, y);
            if (!solid[k]) {
              const p = (xx, yy) =>
                solid[id(xx, yy)] ? pressure[k] : pressure[id(xx, yy)];
              pressureNext[k] =
                (divergence[k] +
                  p(x - 1, y) +
                  p(x + 1, y) +
                  p(x, y - 1) +
                  p(x, y + 1)) *
                0.25;
            }
          }
        pressure.set(pressureNext);
      }
      for (let y = 1; y < rows - 1; y++)
        for (let x = 1; x < cols - 1; x++) {
          const k = id(x, y);
          if (!solid[k]) {
            const p = (xx, yy) =>
              solid[id(xx, yy)] ? pressure[k] : pressure[id(xx, yy)];
            u[k] -= 0.5 * (p(x + 1, y) - p(x - 1, y));
            v[k] -= 0.5 * (p(x, y + 1) - p(x, y - 1));
          }
        }
      enforce();
      time += dt;
    }
    return api;
  }
  function pointerDown(x, y, tool = 'dye') {
    selectedTool = tool;
    dragging = true;
    lastX = x;
    lastY = y;
    pointerMove(x, y, tool);
    return api;
  }
  function pointerMove(x, y, tool = selectedTool) {
    if (!dragging) return api;
    selectedTool = tool;
    const dx = x - lastX,
      dy = y - lastY;
    if (tool === 'wall')
      paintDisk(x, y, 18, (k) => {
        solid[k] = 1;
        dye[k] = u[k] = v[k] = 0;
      });
    else if (tool === 'erase')
      paintDisk(x, y, 20, (k) => {
        solid[k] = 0;
        dye[k] = u[k] = v[k] = 0;
      });
    else
      paintDisk(x, y, 22, (k) => {
        if (solid[k]) return;
        if (tool === 'dye') dye[k] = 1;
        u[k] += dx * 0.11 * options.force;
        v[k] += dy * 0.11 * options.force;
      });
    lastX = x;
    lastY = y;
    return api;
  }
  function pointerUp() {
    dragging = false;
    return api;
  }
  function getState() {
    let amount = 0,
      motion = 0,
      div = 0,
      count = 0;
    for (let y = 1; y < rows - 1; y++)
      for (let x = 1; x < cols - 1; x++) {
        const k = id(x, y);
        if (solid[k]) continue;
        amount += dye[k];
        motion += Math.hypot(u[k], v[k]);
        div += Math.abs(
          u[id(x + 1, y)] - u[id(x - 1, y)] + v[id(x, y + 1)] - v[id(x, y - 1)],
        );
        count++;
      }
    const d = count || 1;
    return {
      cols,
      rows,
      dye,
      u,
      v,
      solid,
      stats: { dye: amount / d, motion: motion / d, divergence: div / d },
      time,
    };
  }
  const api = {
    step,
    reset,
    setOptions,
    pointerDown,
    pointerMove,
    pointerUp,
    getState,
  };
  return api;
}
