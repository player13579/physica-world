const W = 1000,
  H = 650;
const colors = { rubber: '#baf477', wood: '#edb781', steel: '#9cbdcc' };
function path(ctx, points) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}
function line(ctx, a, b, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function arrow(ctx, x, y, dx, dy, color) {
  const l = Math.hypot(dx, dy);
  if (l < 2) return;
  const a = Math.atan2(dy, dx);
  line(ctx, { x, y }, { x: x + dx, y: y + dy }, color, 1.4);
  line(
    ctx,
    { x: x + dx, y: y + dy },
    { x: x + dx - 7 * Math.cos(a - 0.5), y: y + dy - 7 * Math.sin(a - 0.5) },
    color,
    1.4,
  );
  line(
    ctx,
    { x: x + dx, y: y + dy },
    { x: x + dx - 7 * Math.cos(a + 0.5), y: y + dy - 7 * Math.sin(a + 0.5) },
    color,
    1.4,
  );
}
export function heatColor(t) {
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
      return stops[i][1].map((v, j) =>
        Math.round(stops[i - 1][1][j] * (1 - f) + v * f),
      );
    }
  return stops.at(-1)[1];
}
export function createCanvas2D(canvas) {
  const ctx = canvas.getContext('2d'),
    buffer = document.createElement('canvas'),
    bctx = buffer.getContext('2d');
  let pixel = null;
  function draw(mode, s, visual = {}) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2),
      rect = canvas.getBoundingClientRect();
    const pw = Math.max(1, Math.round(rect.width * dpr)),
      ph = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0);
    ctx.fillStyle = '#121d24';
    ctx.fillRect(0, 0, W, H);
    if (visual.grid !== false) {
      ctx.strokeStyle = '#26343c';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 50) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = 0; y <= H; y += 50) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#7a8b96';
      ctx.font = '11px ui-monospace, monospace';
      for (let x = 100; x < W; x += 100)
        ctx.fillText((x / 80).toFixed(1), x + 4, H - 12);
    }
    if (mode === 'mechanics') {
      if (s.goal) {
        const g = s.goal;
        ctx.fillStyle = g.complete ? '#baf47735' : '#baf4770c';
        ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#baf477';
        ctx.lineWidth = 2;
        ctx.strokeRect(g.x, g.y, g.w, g.h);
        ctx.setLineDash([]);
        ctx.fillStyle = '#baf477';
        ctx.font = '600 13px ui-monospace,monospace';
        ctx.fillText(g.complete ? 'COMPLETE' : 'TARGET', g.x + 9, g.y - 12);
      }
      for (const c of s.constraints)
        if (c.a && c.b) {
          line(ctx, c.a, c.b, '#a1afba', 3);
          for (const p of [c.a, c.b]) {
            ctx.fillStyle = '#d6e1e5';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      for (const b of s.bodies) {
        ctx.save();
        const color = b.isStatic ? '#53646b' : colors[b.material] || '#baf477';
        if (b.radius) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        } else path(ctx, b.vertices);
        ctx.fillStyle = color;
        ctx.shadowColor = '#0005';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 7;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle =
          b.selected || b.marked
            ? '#f5ffe7'
            : b.isStatic
              ? '#8a9ca4'
              : '#ffffff50';
        ctx.lineWidth = b.selected || b.marked ? 3 : 1.3;
        ctx.stroke();
        ctx.clip();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.strokeStyle = b.isStatic ? '#ffffff18' : '#18262c45';
        ctx.lineWidth = 1;
        if (b.material === 'wood' || b.isStatic) {
          for (let x = -170; x < 170; x += 12)
            line(ctx, { x, y: -70 }, { x: x + 70, y: 70 }, ctx.strokeStyle, 1);
        } else if (b.material === 'rubber') {
          ctx.strokeStyle = '#18262c50';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, (b.radius || 20) * 0.68, 0, Math.PI * 2);
          ctx.stroke();
          line(ctx, { x: -5, y: 0 }, { x: 5, y: 0 }, '#18262c90', 2);
        } else {
          line(ctx, { x: -60, y: -60 }, { x: 60, y: 60 }, '#e2f5ff77', 7);
          line(ctx, { x: -60, y: -48 }, { x: 60, y: 72 }, '#e2f5ff44', 2);
        }
        ctx.restore();
        if (visual.vectors && !b.isStatic)
          arrow(ctx, b.x, b.y, b.vx * 14, b.vy * 14, '#f4fbff');
      }
    }
    if (mode === 'fluid' || mode === 'heat') {
      if (buffer.width !== s.cols || buffer.height !== s.rows) {
        buffer.width = s.cols;
        buffer.height = s.rows;
        pixel = bctx.createImageData(s.cols, s.rows);
      }
      for (let k = 0; k < s.cols * s.rows; k++) {
        let c;
        if (s.solid[k]) c = [111, 131, 142];
        else if (mode === 'heat') c = heatColor(s.temp[k]);
        else {
          const q = Math.max(0, Math.min(1, s.dye[k]));
          c = [
            Math.round(18 + q * 75),
            Math.round(29 + q * 196),
            Math.round(36 + q * 208),
          ];
        }
        pixel.data.set([...c, 255], k * 4);
      }
      bctx.putImageData(pixel, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buffer, 0, 0, W, H);
      if (mode === 'heat') {
        for (let y = 0; y < s.rows; y += 2)
          for (let x = 0; x < s.cols; x += 2) {
            const k = y * s.cols + x;
            if (s.sources[k]) {
              ctx.fillStyle = s.sources[k] > 0 ? '#fff1be' : '#bfd5ff';
              ctx.fillRect((x * W) / s.cols, (y * H) / s.rows, 2.5, 2.5);
            }
          }
      }
      if (mode === 'fluid' && visual.vectors) {
        for (let y = 4; y < s.rows; y += 6)
          for (let x = 4; x < s.cols; x += 6) {
            const k = y * s.cols + x;
            if (!s.solid[k])
              arrow(
                ctx,
                (x * W) / s.cols,
                (y * H) / s.rows,
                s.u[k] * 2,
                s.v[k] * 2,
                '#ffffff88',
              );
          }
      }
      if (visual.grid) {
        ctx.strokeStyle = '#c0dbf50b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < W; x += 50) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
        }
        for (let y = 0; y < H; y += 50) {
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
        }
        ctx.stroke();
      }
    }
    if (mode === 'optics') {
      for (const ray of s.rays) {
        ctx.globalAlpha = ray.intensity ?? 1;
        line(ctx, ray.a, ray.b, ray.color, 2.4);
      }
      ctx.globalAlpha = 1;
      for (const o of s.objects) {
        ctx.fillStyle = '#93dce319';
        ctx.strokeStyle = o.id === s.selectedId ? '#f1ffbe' : '#9bccdc';
        ctx.lineWidth = o.id === s.selectedId ? 3 : 2;
        if (o.type === 'mirror') {
          line(ctx, o.a, o.b, '#d9f1fb', 6);
          const dx = o.b.x - o.a.x,
            dy = o.b.y - o.a.y,
            L = Math.hypot(dx, dy);
          for (let t = 0; t <= 1; t += 0.12)
            line(
              ctx,
              { x: o.a.x + dx * t, y: o.a.y + dy * t },
              {
                x: o.a.x + dx * t - (dy / L) * 10 - 5,
                y: o.a.y + dy * t + (dx / L) * 10 + 5,
              },
              '#81969f',
              1.5,
            );
        } else {
          if (o.type === 'glass') {
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
          } else path(ctx, o.vertices);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#a4cbd4';
          ctx.font = '12px ui-monospace,monospace';
          ctx.fillText(
            'n = ' + (o.refractiveIndex || 1.5).toFixed(2),
            o.x - 25,
            o.y + 20,
          );
        }
      }
      const e = s.emitter;
      ctx.fillStyle = '#efefdc';
      ctx.beginPath();
      ctx.roundRect(e.x - 25, e.y - 13, 36, 26, 5);
      ctx.fill();
      ctx.fillStyle = '#c0ff73';
      ctx.fillRect(e.x + 11, e.y - 7, 7, 14);
      ctx.fillStyle = '#8a9ba3';
      ctx.font = '12px ui-monospace,monospace';
      ctx.fillText('LIGHT', e.x - 25, e.y - 25);
    }
  }
  return {
    draw,
    dispose() {
      buffer.width = buffer.height = 1;
    },
  };
}
