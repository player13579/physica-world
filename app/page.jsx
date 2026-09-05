import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Atom,
  Circle,
  Square,
  MousePointer2,
  Eraser,
  Minus,
  Play,
  Pause,
  RotateCcw,
  Droplets,
  Thermometer,
  Lightbulb,
  Box,
  Move3D,
  Wind,
  Snowflake,
  Flame,
  Layers3,
  ArrowUpRight,
  Check,
  Activity,
  HelpCircle,
  ArrowRight,
  StepForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { createMechanics } from '../src/engines/mechanics';
import { createFluid } from '../src/engines/fluid';
import { createHeat } from '../src/engines/heat';
import { createOptics } from '../src/engines/optics';
import { createCanvas2D } from '../src/render/canvas2d';

const LABS = {
  mechanics: {
    name: '力学',
    en: 'MECHANICS',
    title: '動きの実験室',
    icon: Box,
    color: '#c0f783',
    formula: 'F = ma',
    presets: [
      ['playground', '自由な実験場'],
      ['domino', 'ドミノの連鎖'],
      ['pendulum', '二重振り子'],
      ['challenge', 'ボールをゴールへ'],
    ],
    tools: [
      ['grab', 'つかむ', MousePointer2],
      ['ball', 'ボール', Circle],
      ['box', 'ブロック', Square],
      ['platform', '足場', Minus],
      ['erase', '消す', Eraser],
    ],
    description:
      '重力・衝突・摩擦・反発を計算。2Dは剛体、3Dは奥行きもある剛体運動です。空気抵抗を簡略化しています。',
    tip: 'ボールをつかんで離す。重力を月の値にすると、落ち方はどう変わる？',
  },
  fluid: {
    name: '流体',
    en: 'FLUID DYNAMICS',
    title: '流れの実験室',
    icon: Droplets,
    color: '#78d5f5',
    formula: '∇ · u ≈ 0',
    presets: [
      ['vortex', '渦とインク'],
      ['channel', '障害物のある流れ'],
      ['empty', '空の流体槽'],
    ],
    tools: [
      ['dye', 'インク', Droplets],
      ['stir', 'かき混ぜる', Wind],
      ['wall', '壁', Square],
      ['erase', '消す', Eraser],
    ],
    description:
      '2Dは非圧縮流の格子近似、3Dは密度・圧力・粘性を計算する粒子近似です。厳密な水面や乱流の再現は対象外です。',
    tip: 'インクを引くように描いて流れを作り、粘性を変えて広がり方を観察しよう。',
  },
  heat: {
    name: '熱',
    en: 'THERMODYNAMICS',
    title: '熱の実験室',
    icon: Thermometer,
    color: '#ffb47b',
    formula: '∂T/∂t = α∇²T',
    presets: [
      ['conduction', '熱源と冷却源'],
      ['insulation', '断熱壁とすき間'],
      ['empty', '室温の空間'],
    ],
    tools: [
      ['hot', '熱源', Flame],
      ['cold', '冷却源', Snowflake],
      ['wall', '断熱壁', Square],
      ['erase', '消す', Eraser],
    ],
    description:
      '熱力学のうち熱伝導を扱います。2Dは面、3Dは体積内の温度拡散を計算。対流・放射・相変化は含まず、時間と熱拡散率は学習用の相対値です。',
    tip: '熱源の近くに断熱壁を置こう。熱はすき間を通って、どこまで伝わる？',
  },
  optics: {
    name: '光',
    en: 'OPTICS',
    title: '光の実験室',
    icon: Lightbulb,
    color: '#c8b9ff',
    formula: 'n₁sinθ₁ = n₂sinθ₂',
    presets: [
      ['prism', 'プリズム'],
      ['mirrors', '鏡と反射'],
      ['lens', 'ガラスのレンズ'],
    ],
    tools: [
      ['move', '移動', MousePointer2],
      ['mirror', '鏡', Minus],
      ['glass', 'ガラス', Circle],
      ['erase', '消す', Eraser],
    ],
    description:
      'スネルの法則に従う屈折・鏡面反射・全反射を計算する幾何光学です。2Dでは簡易分散も表示。干渉・回折などの波動現象は含みません。',
    tip: 'ガラスの屈折率や光の角度を変えよう。鏡を置くと光の道はどこへ伸びる？',
  },
};
const DEFAULTS = {
  gravity: 9.81,
  restitution: 0.28,
  friction: 0.52,
  viscosity: 0.18,
  force: 1,
  conductivity: 1,
  sourceTemperature: 90,
  angle: 0,
  refractiveIndex: 1.5,
  rayCount: 3,
  dispersion: true,
  objectAngle: 45,
};
const factories = {
  mechanics: createMechanics,
  fluid: createFluid,
  heat: createHeat,
  optics: createOptics,
};
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
function Choice({ label, value, options, onChange }) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      items={Object.fromEntries(options)}
    >
      <SelectTrigger className="choice" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="choice-popup">
        {options.map(([v, n]) => (
          <SelectItem value={v} key={v}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Range({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <div className="range">
      <div className="field-line">
        <label>{label}</label>
        <output>
          {fmt(value, step < 0.1 ? 2 : step < 1 ? 1 : 0)} <small>{unit}</small>
        </output>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
    </div>
  );
}
function Toggle({ label, checked, onChange }) {
  return (
    <div className="field-line toggle">
      <span>{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('mechanics'),
    [dimension, setDimension] = useState('2d'),
    [tool, setTool] = useState('grab'),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [options, setOptions] = useState(DEFAULTS),
    [visual, setVisual] = useState({ grid: true, vectors: false }),
    [material, setMaterial] = useState('rubber'),
    [preset, setPreset] = useState('playground'),
    [metrics, setMetrics] = useState({}),
    [fps, setFps] = useState(60),
    [elapsed, setElapsed] = useState(0),
    [help, setHelp] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [height, setHeight] = useState(3),
    [interactions, setInteractions] = useState(0),
    [complete, setComplete] = useState(false);
  const canvas = useRef(),
    viewport = useRef(),
    engine = useRef(null),
    view = useRef(null),
    timer = useRef(0),
    latest = useRef({}),
    simState = useRef(null),
    pointer = useRef(null),
    stepOnce = useRef(false);
  useLayoutEffect(() => {
    latest.current = {
      mode,
      dimension,
      tool,
      playing,
      speed,
      options,
      visual,
      material,
      height,
      interactions,
      preset,
    };
  });
  const lab = LABS[mode],
    Icon = lab.icon;
  const change = (key, value) => setOptions((o) => ({ ...o, [key]: value }));
  function prepareLab() {
    setError('');
    setLoading(true);
    setElapsed(0);
    setMetrics({});
  }
  function selectLab(value) {
    if (!LABS[value]) return;
    prepareLab();
    setMode(value);
    setTool(dimension === '3d' ? 'orbit' : LABS[value].tools[0][0]);
    setPreset(LABS[value].presets[0][0]);
    setComplete(false);
    setInteractions(0);
  }
  function selectDimension(value) {
    prepareLab();
    setDimension(value);
    setTool(value === '3d' ? 'orbit' : lab.tools[0][0]);
    setPreset(value === '3d' ? 'default' : lab.presets[0][0]);
    setComplete(false);
    setInteractions(0);
  }
  function reset(name = preset) {
    engine.current?.pointerUp?.();
    engine.current?.reset(name);
    engine.current?.setOptions(options);
    setPreset(name);
    timer.current = 0;
    setElapsed(0);
    setComplete(false);
    setInteractions(0);
    setError('');
  }
  useEffect(() => {
    engine.current?.setOptions(options);
  }, [options]);
  useEffect(() => {
    let alive = true,
      raf,
      renderer,
      sim,
      last = performance.now(),
      acc = 0,
      sample = 0;
    timer.current = 0;
    simState.current = null;
    async function start() {
      try {
        if (dimension === '3d') {
          const [s, r] = await Promise.all([
            import('../src/engines/spatial.js'),
            import('../src/render/spatial-view.js'),
          ]);
          if (!alive) return;
          sim = s.createSpatial({ mode });
          renderer = r.createSpatialView(canvas.current);
        } else {
          sim = factories[mode]();
          sim.reset(LABS[mode].presets[0][0]);
          renderer = createCanvas2D(canvas.current);
        }
        sim.setOptions(latest.current.options);
        engine.current = sim;
        view.current = renderer;
        setLoading(false);
        function frame(now) {
          if (!alive) return;
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          const c = latest.current;
          try {
            if (c.playing && !document.hidden) {
              acc = Math.min(acc + dt * c.speed, 0.075);
              while (acc >= 1 / 60) {
                sim.step(1 / 60);
                timer.current += 1 / 60;
                acc -= 1 / 60;
              }
            } else acc = 0;
            if (stepOnce.current) {
              sim.step(1 / 60);
              timer.current += 1 / 60;
              stepOnce.current = false;
            }
            const s = sim.getState();
            simState.current = s;
            if (dimension === '3d') {
              renderer.setInteraction(c.tool);
              renderer.draw(s, c.visual);
            } else renderer.draw(mode, s, c.visual);
            sample += dt;
            if (sample > 0.25) {
              setMetrics(s.stats || {});
              setElapsed(timer.current);
              setFps(Math.min(60, Math.round(1 / Math.max(dt, 0.001))));
              sample = 0;
              let won = s.goal?.complete;
              if (c.interactions > 0) {
                if (mode === 'fluid')
                  won =
                    dimension === '3d'
                      ? s.stats.particles >= 400
                      : s.stats.dye >= 0.15;
                if (mode === 'heat') won = s.stats.average >= 30;
                if (mode === 'optics') won = s.stats.reflections >= 1;
                if (mode === 'mechanics' && dimension === '3d')
                  won = s.stats.objects >= 15;
              }
              if (won) setComplete(true);
            }
          } catch (e) {
            setError(
              '計算を続けられませんでした。「リセット」で実験をやり直せます。',
            );
            setPlaying(false);
            console.error(e);
          }
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
      } catch (e) {
        if (alive) {
          setLoading(false);
          setError(
            dimension === '3d'
              ? '3Dを開始できませんでした。WebGLに対応したブラウザで開くか、2Dに切り替えてください。'
              : '実験室を読み込めませんでした。ページを再読み込みしてください。',
          );
        }
        console.error(e);
      }
    }
    void start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      sim?.pointerUp?.();
      renderer?.dispose();
      if (engine.current === sim) engine.current = null;
      if (view.current === renderer) view.current = null;
    };
  }, [mode, dimension]);
  useEffect(() => {
    const key = (e) => {
      if (
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName) ||
        e.target.closest('[role="slider"],[role="combobox"]')
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key.toLowerCase() === 'r') reset();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  // A small optional WebMCP surface, routed through the same visible actions.
  useEffect(() => {
    const ctx = document.modelContext;
    if (!ctx?.registerTool) return;
    const abort = new AbortController();
    const register = (t) => {
      try {
        Promise.resolve(ctx.registerTool(t, { signal: abort.signal })).catch(
          () => {},
        );
      } catch {}
    };
    register({
      name: 'read_physics_world',
      description:
        'Read active lab, dimension, controls and measured simulation values.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        lab: latest.current.mode,
        dimension: latest.current.dimension,
        playing: latest.current.playing,
        parameters: latest.current.options,
        measurements: simState.current?.stats || {},
      }),
    });
    register({
      name: 'set_physics_parameters',
      description: 'Change physical parameters in the currently visible lab.',
      inputSchema: {
        type: 'object',
        properties: {
          gravity: { type: 'number', minimum: 0, maximum: 20 },
          refractiveIndex: { type: 'number', minimum: 1, maximum: 2 },
          sourceTemperature: { type: 'number', minimum: 30, maximum: 120 },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        if (!input || typeof input !== 'object') throw Error('Object required');
        const limits = {
          gravity: [0, 20],
          refractiveIndex: [1, 2],
          sourceTemperature: [30, 120],
        };
        for (const [k, v] of Object.entries(input))
          if (
            !limits[k] ||
            !Number.isFinite(v) ||
            v < limits[k][0] ||
            v > limits[k][1]
          )
            throw Error('Invalid parameter');
        setOptions((o) => ({ ...o, ...input }));
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return { parameters: latest.current.options };
      },
    });
    return () => abort.abort();
  }, []);
  function point(e) {
    const r = canvas.current.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * 1000,
      ((e.clientY - r.top) / r.height) * 650,
    ];
  }
  function down(e) {
    if (e.button !== 0 || !engine.current || loading) return;
    canvas.current.focus({ preventScroll: true });
    pointer.current = { x: e.clientX, y: e.clientY };
    canvas.current.setPointerCapture(e.pointerId);
    if (dimension === '2d') {
      const [x, y] = point(e);
      engine.current.pointerDown(x, y, tool, material);
      setInteractions((v) => v + 1);
    }
  }
  function move(e) {
    if (dimension === '2d' && pointer.current) {
      engine.current?.pointerMove(...point(e), tool);
    }
  }
  function up(e) {
    if (
      dimension === '3d' &&
      pointer.current &&
      tool !== 'orbit' &&
      Math.hypot(e.clientX - pointer.current.x, e.clientY - pointer.current.y) <
        12
    ) {
      const p = view.current?.pick(
        e.clientX,
        e.clientY,
        height,
        ['erase', 'grab', 'move', 'stir'].includes(tool),
      );
      if (p) {
        engine.current?.interact(p, tool);
        setInteractions((v) => v + 1);
      }
    }
    engine.current?.pointerUp?.();
    pointer.current = null;
    if (canvas.current?.hasPointerCapture(e.pointerId))
      canvas.current.releasePointerCapture(e.pointerId);
  }
  const tools =
    dimension === '3d'
      ? [
          ['orbit', '視点', Move3D],
          ...lab.tools.map((t) =>
            t[0] === 'grab' ? ['grab', '押す', ArrowUpRight] : t,
          ),
        ]
      : lab.tools;
  const tip =
    dimension === '3d'
      ? '視点ツールでドラッグして回転。ホイール・ピンチで拡大。配置ツールはクリックで追加します。'
      : tool === 'grab' || tool === 'move'
        ? '物体をドラッグして動かす'
        : '実験エリアをクリック、またはドラッグして配置';
  const mission =
    mode === 'mechanics'
      ? dimension === '3d'
        ? '物体を15個に増やして衝突を観察しよう。'
        : preset === 'challenge'
          ? '白い輪のボールを TARGET の枠内で止めよう。'
          : '「ボールをゴールへ」を選んで、運ぶ仕掛けを作ろう。'
      : mode === 'fluid'
        ? dimension === '3d'
          ? '水の粒子を400個まで増やしてみよう。'
          : 'インクを広げ、平均濃度を15%以上にしよう。'
        : mode === 'heat'
          ? '熱源を配置して平均温度を30°Cにしよう。'
          : '光の経路に鏡を置き、1回以上反射させよう。';
  return (
    <div className="app" style={{ '--lab-color': lab.color }}>
      <header className="masthead">
        <a className="brand" href="./" aria-label="PHYSICA ホーム">
          <span className="brand-mark">
            <Atom />
          </span>
          <span>
            PHYSICA<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="masthead-label">物理を遊ぶ、実験世界。</div>
        <Button
          variant="ghost"
          className="help-button"
          onClick={() => setHelp((h) => !h)}
          aria-expanded={help}
        >
          <HelpCircle size={18} />
          <span>遊び方</span>
        </Button>
      </header>
      <main>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">YOUR PERSONAL PHYSICS LAB</div>
            <h1>法則を変える。世界が動く。</h1>
          </div>
          <Tabs
            className="dimension-tabs"
            value={dimension}
            onValueChange={selectDimension}
          >
            <TabsList aria-label="シミュレーションの次元">
              <TabsTrigger value="2d">
                <Square />
                2D<span>断面で実験</span>
              </TabsTrigger>
              <TabsTrigger value="3d">
                <Box />
                3D<span>空間で実験</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Tabs className="lab-tabs" value={mode} onValueChange={selectLab}>
          <TabsList aria-label="物理の実験室">
            {Object.entries(LABS).map(([id, l], i) => {
              const I = l.icon;
              return (
                <TabsTrigger key={id} value={id}>
                  <span className="lab-number">0{i + 1}</span>
                  <I />
                  <span>
                    {l.name}
                    <small>{l.en}</small>
                  </span>
                  <ArrowUpRight className="tab-arrow" />
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        {help && (
          <div className="help-panel">
            <div>
              <strong>2D：現象を見渡して描く</strong>
              <p>
                道具を選び、エリア内をクリックまたはドラッグ。Spaceで一時停止、Rでリセット。
              </p>
            </div>
            <div>
              <strong>3D：奥行きを使って試す</strong>
              <p>
                視点ツールで回転、ピンチ・ホイールでズーム。配置の高さを選んでクリック。次元・実験室の切替は新しい実験を開きます。
              </p>
            </div>
            <Button variant="ghost" onClick={() => setHelp(false)}>
              閉じる
            </Button>
          </div>
        )}
        <div className="workbench">
          <section className="simulation-panel" aria-label={lab.title}>
            <div className="scene-heading">
              <div>
                <span className="live-dot" />
                <strong>{lab.title}</strong>
                <span className="scene-tag">
                  {dimension.toUpperCase()} WORLD
                </span>
              </div>
              <span className="formula">{lab.formula}</span>
            </div>
            <div className="viewport" ref={viewport}>
              <canvas
                key={dimension + mode}
                ref={canvas}
                tabIndex={0}
                aria-label={`${dimension} ${lab.name}の実験エリア。${tip}`}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={() => {
                  engine.current?.pointerUp?.();
                  pointer.current = null;
                }}
                style={{
                  cursor:
                    tool === 'orbit'
                      ? 'grab'
                      : tool === 'grab' || tool === 'move'
                        ? 'grab'
                        : tool === 'erase'
                          ? 'not-allowed'
                          : 'crosshair',
                }}
              />
              <div className="canvas-top">
                <span className="dimension-label">
                  {dimension === '2d' ? 'XY / 断面' : 'XYZ / 立体'}
                </span>
                <span
                  className={'run-label ' + (playing ? 'running' : 'paused')}
                >
                  <i />
                  {playing ? 'SIMULATING' : 'PAUSED'}
                </span>
              </div>
              <div className="canvas-bottom">
                <span>
                  {dimension === '2d' ? '1 m ━━━━━' : '12 × 8 × 8 / WORLD'}
                </span>
                <span>
                  {fmt(elapsed, 1)} <small>s</small>
                </span>
              </div>
              {loading && (
                <div className="canvas-message">実験室を開いています…</div>
              )}
              {error && (
                <div className="canvas-message error" role="alert">
                  {error}
                </div>
              )}
              {!loading && dimension === '2d' && (
                <div className="axis">
                  <span>y</span>
                  <ArrowRight />
                  <span>x</span>
                </div>
              )}
            </div>
            <div
              className="tool-deck"
              role="toolbar"
              aria-label="配置・操作ツール"
            >
              {tools.map(([id, name, I]) => (
                <button
                  key={id}
                  className={'tool ' + (tool === id ? 'selected' : '')}
                  aria-pressed={tool === id}
                  onClick={() => {
                    engine.current?.pointerUp?.();
                    setTool(id);
                  }}
                  title={name}
                >
                  <I />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <div className="playback">
              <div className="transport">
                <Button
                  className="play-button"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? '一時停止' : '再生'}
                >
                  {playing ? <Pause /> : <Play />}
                  <span>{playing ? '一時停止' : '再生'}</span>
                </Button>
                <Button
                  variant="ghost"
                  className="step-button"
                  aria-label="1フレーム進める"
                  title="1フレーム進める"
                  onClick={() => {
                    setPlaying(false);
                    stepOnce.current = true;
                  }}
                >
                  <StepForward />
                </Button>
                <Button
                  variant="ghost"
                  className="reset-button"
                  onClick={() => reset()}
                  title="この実験をリセット"
                >
                  <RotateCcw />
                  <span>リセット</span>
                </Button>
              </div>
              <div className="speed-control">
                <span>時間の速さ</span>
                <Choice
                  label="時間倍率"
                  value={String(speed)}
                  options={[
                    ['0.25', '0.25×'],
                    ['0.5', '0.5×'],
                    ['1', '1×'],
                    ['2', '2×'],
                  ]}
                  onChange={(v) => setSpeed(Number(v))}
                />
              </div>
            </div>
            <div className="interaction-hint">
              <MousePointer2 size={14} />
              {tip}
            </div>
          </section>
          <aside className="inspector" aria-label="実験の設定">
            <div className="inspector-title">
              <Activity />
              <h2>ワールド設定</h2>
              <span>LIVE</span>
            </div>
            <div className="control-section">
              <div className="section-label">実験シーン</div>
              {dimension === '2d' ? (
                <Choice
                  label="実験シーン"
                  value={preset}
                  options={lab.presets}
                  onChange={(p) => reset(p)}
                />
              ) : (
                <div className="spatial-scene">
                  <Layers3 size={18} />
                  <span>3D {lab.name}シミュレーション</span>
                </div>
              )}
            </div>
            <div className="control-section parameter-section">
              <div className="section-label">
                物理パラメータ <span>01</span>
              </div>
              {mode === 'mechanics' && (
                <>
                  <Range
                    label="重力"
                    value={options.gravity}
                    min={0}
                    max={20}
                    step={0.01}
                    unit="m/s²"
                    onChange={(v) => change('gravity', v)}
                  />
                  <div className="gravity-presets">
                    {[
                      ['無重力', 0],
                      ['月', 1.62],
                      ['地球', 9.81],
                    ].map(([l, v]) => (
                      <button
                        key={l}
                        className={options.gravity === v ? 'active' : ''}
                        onClick={() => change('gravity', v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <Range
                    label="反発の強さ"
                    value={options.restitution}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => change('restitution', v)}
                  />
                  <Range
                    label="摩擦"
                    value={options.friction}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => change('friction', v)}
                  />
                  {dimension === '2d' && (
                    <>
                      <div className="field-label">追加する物体の素材</div>
                      <Choice
                        label="物体の素材"
                        value={material}
                        options={[
                          ['rubber', 'ゴム · よく弾む'],
                          ['wood', '木 · 標準'],
                          ['steel', '鋼 · 重い'],
                        ]}
                        onChange={setMaterial}
                      />
                    </>
                  )}
                </>
              )}
              {mode === 'fluid' && (
                <>
                  <Range
                    label="粘性"
                    value={options.viscosity}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => change('viscosity', v)}
                  />
                  <div className="range-caption">
                    <span>さらさら</span>
                    <span>ねばねば</span>
                  </div>
                  <Range
                    label="かき混ぜる強さ"
                    value={options.force}
                    min={0}
                    max={2}
                    step={0.1}
                    onChange={(v) => change('force', v)}
                  />
                  <div className="micro-note">
                    {dimension === '2d'
                      ? 'インクは流れを見せる染料です。流体自体は、最初から槽全体を満たしています。'
                      : '青い粒子が流体。インクツールで色付きの粒子を追加できます（最大600個）。'}
                  </div>
                </>
              )}
              {mode === 'heat' && (
                <>
                  <Range
                    label="熱の伝わりやすさ"
                    value={options.conductivity}
                    min={0.1}
                    max={2}
                    step={0.1}
                    unit="×"
                    onChange={(v) => change('conductivity', v)}
                  />
                  <Range
                    label="熱源の温度"
                    value={options.sourceTemperature}
                    min={30}
                    max={120}
                    step={1}
                    unit="°C"
                    onChange={(v) => change('sourceTemperature', v)}
                  />
                  <div className="heat-scale" />
                  <div className="range-caption">
                    <span>0°C 冷たい</span>
                    <span>120°C 熱い</span>
                  </div>
                  <div className="micro-note">
                    冷却源は0°C、初期温度は20°C。
                    {dimension === '2d'
                      ? '白い点は温度を保つ熱源・冷却源です。'
                      : '色付きの立方体が温度。室温に近い領域は観察のため非表示です。'}
                  </div>
                </>
              )}
              {mode === 'optics' && (
                <>
                  <Range
                    label="光源の角度"
                    value={options.angle}
                    min={-60}
                    max={60}
                    step={1}
                    unit="°"
                    onChange={(v) => change('angle', v)}
                  />
                  <Range
                    label="ガラスの屈折率"
                    value={options.refractiveIndex}
                    min={1}
                    max={2}
                    step={0.01}
                    onChange={(v) => change('refractiveIndex', v)}
                  />
                  <Range
                    label="光線の束数"
                    value={options.rayCount}
                    min={1}
                    max={9}
                    step={1}
                    onChange={(v) => change('rayCount', v)}
                  />
                  {dimension === '2d' && (
                    <>
                      <Range
                        label="選択した鏡の角度"
                        value={options.objectAngle}
                        min={-90}
                        max={90}
                        step={1}
                        unit="°"
                        onChange={(v) => change('objectAngle', v)}
                      />
                      <Toggle
                        label="色ごとの分散"
                        checked={options.dispersion}
                        onChange={(v) => change('dispersion', v)}
                      />
                    </>
                  )}
                </>
              )}
              {dimension === '3d' && (
                <Range
                  label="配置する高さ"
                  value={height}
                  min={0.4}
                  max={7.2}
                  step={0.1}
                  unit="m"
                  onChange={setHeight}
                />
              )}
            </div>
            <div className="control-section">
              <div className="section-label">
                見え方 <span>02</span>
              </div>
              <Toggle
                label="座標グリッド"
                checked={visual.grid}
                onChange={(v) => setVisual((s) => ({ ...s, grid: v }))}
              />
              {dimension === '2d' && ['mechanics', 'fluid'].includes(mode) && (
                <Toggle
                  label="速度ベクトル"
                  checked={visual.vectors}
                  onChange={(v) => setVisual((s) => ({ ...s, vectors: v }))}
                />
              )}
            </div>
            <div className={'mission ' + (complete ? 'complete' : '')}>
              <div className="mission-label">
                {complete ? <Check size={16} /> : <ArrowUpRight size={16} />}{' '}
                {complete ? '実験達成！' : 'MINI CHALLENGE'}
              </div>
              <p>{mission}</p>
              {mode === 'mechanics' &&
                dimension === '2d' &&
                preset !== 'challenge' && (
                  <button onClick={() => reset('challenge')}>
                    挑戦する <ArrowRight size={14} />
                  </button>
                )}
            </div>
          </aside>
        </div>
        <div className="observation-bar">
          <div className="observation-label">
            <Icon />
            <span>
              観測データ<small>REALTIME DATA</small>
            </span>
          </div>
          {mode === 'mechanics' ? (
            <>
              <Metric label="物体数" value={metrics.objects ?? '—'} unit="個" />
              <Metric
                label="力学的エネルギー*"
                value={fmt(metrics.energy, 1)}
                unit="J"
              />
              {dimension === '2d' && (
                <Metric
                  label="最大速度"
                  value={fmt(metrics.speed, 2)}
                  unit="m/s"
                />
              )}
            </>
          ) : mode === 'fluid' ? (
            <>
              <Metric
                label={dimension === '2d' ? '平均インク濃度' : '流体の粒子数'}
                value={
                  dimension === '2d'
                    ? fmt(metrics.dye * 100, 1)
                    : (metrics.particles ?? '—')
                }
                unit={dimension === '2d' ? '%' : '個'}
              />
              <Metric
                label={dimension === '2d' ? '流れの強さ' : '障害物'}
                value={
                  dimension === '2d'
                    ? fmt(metrics.motion, 2)
                    : (metrics.obstacles ?? 0)
                }
                unit={dimension === '2d' ? '相対値' : '個'}
              />
            </>
          ) : mode === 'heat' ? (
            <>
              <Metric label="平均温度" value={fmt(metrics.average)} unit="°C" />
              <Metric label="最低温度" value={fmt(metrics.min)} unit="°C" />
              <Metric label="最高温度" value={fmt(metrics.max)} unit="°C" />
            </>
          ) : (
            <>
              <Metric label="光線の数" value={metrics.rays ?? '—'} unit="本" />
              <Metric label="反射" value={metrics.reflections ?? 0} unit="回" />
              <Metric label="屈折" value={metrics.refractions ?? 0} unit="回" />
            </>
          )}
          <div className="fps">
            <i />
            {fps} <span>FPS</span>
          </div>
        </div>
        <div className="lab-note">
          <div>
            <span className="note-icon">
              <Lightbulb size={18} />
            </span>
            <p>{lab.tip}</p>
          </div>
          <details>
            <summary>このシミュレーションについて</summary>
            <p>
              {lab.description} 各実験室は独立したモデルです。
              {mode === 'mechanics'
                ? ' *並進の運動エネルギーと重力位置エネルギーの概算。回転分を含みません。'
                : ''}
            </p>
            <p>
              2Dは断面全体を見渡せる操作性と計算効率、3Dは奥行きのある配置と観察を優先しています。
            </p>
          </details>
        </div>
      </main>
      <footer>
        <span>
          PHYSICA <span className="footer-dot">/</span> OPEN EXPERIMENT WORLD
        </span>
        <span>
          触れて、変えて、発見しよう。 <span className="footer-dot">↗</span>
        </span>
      </footer>
    </div>
  );
}
function Metric({ label, value, unit }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <div>
        {value}
        <small>{unit}</small>
      </div>
    </div>
  );
}
