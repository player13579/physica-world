/** Nondimensional 2D heat equation. Temperature is displayed in Celsius; the
 * diffusion rate is deliberately scaled for an interactive teaching model. */
export function createHeat({ width = 1000, height = 650 } = {}) {
  const cols = Math.max(24, Math.round(width / 10)),
    rows = Math.max(18, Math.round(height / 10)),
    n = cols * rows;
  const temp = new Float32Array(n),
    next = new Float32Array(n),
    solid = new Uint8Array(n),
    sources = new Int8Array(n);
  let time = 0,
    dragging = false,
    selectedTool = 'hot';
  const options = { conductivity: 1, sourceTemperature: 90 };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)),
    id = (x, y) => y * cols + x;
  const valid = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const clear = () => {
    temp.fill(20);
    next.fill(20);
    solid.fill(0);
    sources.fill(0);
    time = 0;
  };
  const disk = (x, y, r, fn) => {
    const gx = (x / width) * (cols - 1),
      gy = (y / height) * (rows - 1),
      gr = (r * cols) / width;
    for (
      let yy = Math.max(0, Math.floor(gy - gr));
      yy <= Math.min(rows - 1, Math.ceil(gy + gr));
      yy++
    )
      for (
        let xx = Math.max(0, Math.floor(gx - gr));
        xx <= Math.min(cols - 1, Math.ceil(gx + gr));
        xx++
      )
        if ((xx - gx) ** 2 + (yy - gy) ** 2 <= gr * gr) fn(id(xx, yy));
  };
  function reset(preset = 'empty') {
    clear();
    if (preset === 'conduction') {
      for (let y = (rows * 0.25) | 0; y < rows * 0.75; y++)
        for (let x = 1; x < 7; x++) {
          const k = id(x, y);
          sources[k] = 1;
          temp[k] = options.sourceTemperature;
        }
      for (let y = (rows * 0.25) | 0; y < rows * 0.75; y++)
        for (let x = cols - 7; x < cols - 1; x++) {
          const k = id(x, y);
          sources[k] = -1;
          temp[k] = 0;
        }
    }
    if (preset === 'insulation') {
      const wx = cols >> 1,
        gap0 = rows * 0.43,
        gap1 = rows * 0.57;
      for (let y = 1; y < rows - 1; y++)
        if (y < gap0 || y > gap1) solid[id(wx, y)] = 1;
      for (let y = (rows * 0.3) | 0; y < rows * 0.7; y++)
        for (let x = 2; x < 7; x++) {
          sources[id(x, y)] = 1;
          temp[id(x, y)] = options.sourceTemperature;
        }
    }
    return api;
  }
  function setOptions(o = {}) {
    if (Number.isFinite(o.conductivity))
      options.conductivity = clamp(o.conductivity, 0.1, 2);
    if (Number.isFinite(o.sourceTemperature))
      options.sourceTemperature = clamp(o.sourceTemperature, 30, 120);
    return api;
  }
  function neighbor(k, x, y, dx, dy) {
    const xx = x + dx,
      yy = y + dy;
    if (!valid(xx, yy)) return temp[k];
    const q = id(xx, yy);
    return solid[q] ? temp[k] : temp[q];
  }
  function step(seconds = 1 / 60) {
    let remaining = clamp(Number.isFinite(seconds) ? seconds : 0, 0, 0.05);
    // This is a visual, nondimensional time scale: 10 makes conduction apparent
    // in a few seconds. CFL-limited substeps retain explicit-scheme stability.
    const maxDt = 0.24 / (options.conductivity * 10);
    while (remaining > 1e-7) {
      const dt = Math.min(remaining, maxDt),
        alpha = options.conductivity * dt * 10;
      remaining -= dt;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const k = id(x, y);
          if (solid[k]) {
            next[k] = temp[k];
            continue;
          }
          if (sources[k] === 1) {
            next[k] = options.sourceTemperature;
            continue;
          }
          if (sources[k] === -1) {
            next[k] = 0;
            continue;
          }
          const c = temp[k];
          next[k] = clamp(
            c +
              alpha *
                (neighbor(k, x, y, -1, 0) +
                  neighbor(k, x, y, 1, 0) +
                  neighbor(k, x, y, 0, -1) +
                  neighbor(k, x, y, 0, 1) -
                  4 * c),
            0,
            120,
          );
        }
      temp.set(next);
      time += dt;
    }
    return api;
  }
  function pointerDown(x, y, tool = 'hot') {
    selectedTool = tool;
    dragging = true;
    pointerMove(x, y, tool);
    return api;
  }
  function pointerMove(x, y, tool = selectedTool) {
    if (!dragging) return api;
    selectedTool = tool;
    disk(x, y, 18, (k) => {
      if (tool === 'wall') {
        solid[k] = 1;
        sources[k] = 0;
      } else if (tool === 'erase') {
        solid[k] = 0;
        sources[k] = 0;
        temp[k] = 20;
      } else if (!solid[k]) {
        sources[k] = tool === 'cold' ? -1 : 1;
        temp[k] = tool === 'cold' ? 0 : options.sourceTemperature;
      }
    });
    return api;
  }
  function pointerUp() {
    dragging = false;
    return api;
  }
  function getState() {
    let min = Infinity,
      max = -Infinity,
      sum = 0,
      energy = 0,
      count = 0;
    for (let k = 0; k < n; k++)
      if (!solid[k]) {
        const t = temp[k];
        min = Math.min(min, t);
        max = Math.max(max, t);
        sum += t;
        energy += t - 20;
        count++;
      }
    if (!count) min = max = 0;
    return {
      cols,
      rows,
      temp,
      solid,
      sources,
      stats: { min, max, average: count ? sum / count : 0, energy },
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
