import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Mountain,
  Droplets,
  Flame,
  Sprout,
  Hand,
  Shovel,
  ArrowUpFromLine,
  CloudRain,
  Sun,
  Wind,
  Play,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  Thermometer,
  Compass,
  X,
  Info,
  ChevronRight,
  Layers3,
  Map,
  Focus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { createNatureWorld } from '../src/engines/nature-engine.js';
import { installGameSurfaceGuards } from '../src/input/game-surface.js';

const TOOLS = [
  {
    id: 'look',
    name: '見わたす',
    icon: Hand,
    tip: '1本指で回転。2本指で移動・拡大。',
    color: '#e4ebd7',
  },
  {
    id: 'water',
    name: '水を注ぐ',
    icon: Droplets,
    tip: '指を置いたところに水を注ぎます。低い場所へ流れていきます。',
    color: '#83dbe8',
  },
  {
    id: 'fire',
    name: '火をつける',
    icon: Flame,
    tip: '乾いた草地に触れて着火。風向きや地面の湿りで広がり方が変わります。',
    color: '#ffc17b',
  },
  {
    id: 'raise',
    name: '土を盛る',
    icon: ArrowUpFromLine,
    tip: '川の途中に土を盛ると、水をせき止めたり流れを変えられます。',
    color: '#d7bc8e',
  },
  {
    id: 'lower',
    name: '地面を掘る',
    icon: Shovel,
    tip: '川から溝を掘って、新しい流路や池を作れます。',
    color: '#cfb497',
  },
  {
    id: 'plant',
    name: '緑を増やす',
    icon: Sprout,
    tip: '地面に草木を増やします。燃えた場所にも植え直せます。',
    color: '#b1d982',
  },
  {
    id: 'rain',
    name: '雨を降らす',
    icon: CloudRain,
    tip: '触れた場所を濡らして冷やします。燃えている場所なら消火できます。',
    color: '#a4c8ef',
  },
];
const INITIAL_SETTINGS = {
  hour: 15,
  sunPower: 1,
  wind: 2,
  windAngle: 30,
  rain: 0,
  spring: 1,
  ambient: 22,
};
const clockLabel = (h) =>
  `${String(Math.floor(h)).padStart(2, '0')}:${Math.round((h % 1) * 60)
    .toString()
    .padStart(2, '0')}`;
const elapsedLabel = (t) =>
  `${Math.floor(t / 60)}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;
function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}) {
  return (
    <div className="range-control">
      <div className="range-label">
        <span>{label}</span>
        <output>
          {value}
          {unit}
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

export default function NatureWorld() {
  const canvasRef = useRef(null),
    engineRef = useRef(null),
    viewRef = useRef(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [mode, setMode] = useState('3d'),
    [tool, setTool] = useState('look'),
    [radius, setRadius] = useState(1.2);
  const [paused, setPaused] = useState(false),
    [speed, setSpeed] = useState(1),
    [thermal, setThermal] = useState(false);
  const [settings, setSettings] = useState(INITIAL_SETTINGS),
    [drawer, setDrawer] = useState(false),
    [help, setHelp] = useState(false);
  const [sample, setSample] = useState(null),
    [stats, setStats] = useState(null),
    [tip, setTip] = useState(true),
    [preset, setPreset] = useState('valley');
  const runtime = useRef({ paused, speed });
  useLayoutEffect(() => {
    runtime.current = { paused, speed };
  }, [paused, speed]);
  const selected = TOOLS.find((t) => t.id === tool);

  useLayoutEffect(() => installGameSurfaceGuards(canvasRef.current), []);

  useEffect(() => {
    let cancelled = false,
      raf = 0,
      view = null;
    const world = createNatureWorld({ n: 80, size: 32, seed: 714 });
    engineRef.current = world;
    let last = 0,
      accumulator = 0,
      report = 0,
      lastSample = null;
    import('../src/render/nature-view.js')
      .then(({ createNatureView }) => {
        if (cancelled) return;
        try {
          view = createNatureView(canvasRef.current, world, {
            onSample: (value) => {
              lastSample = value;
            },
            onError: setError,
          });
          viewRef.current = view;
          setSettings({ ...world.settings });
          setReady(true);
          const animate = (timestamp) => {
            if (cancelled) return;
            const dt = last ? Math.min((timestamp - last) / 1000, 0.1) : 0;
            last = timestamp;
            const current = runtime.current;
            let advanced = 0;
            if (!document.hidden && !current.paused) {
              accumulator = Math.min(accumulator + dt * current.speed, 0.5);
              let steps = 0;
              while (accumulator >= 1 / 30 && steps < 12) {
                world.step(1 / 30);
                accumulator -= 1 / 30;
                advanced += 1 / 30;
                steps++;
              }
            } else accumulator = 0;
            view.render(advanced, dt);
            report += dt;
            if (report > 0.35) {
              setStats(world.stats());
              if (lastSample)
                setSample(world.sample(lastSample.x, lastSample.z));
              report = 0;
            }
            raf = requestAnimationFrame(animate);
          };
          raf = requestAnimationFrame(animate);
        } catch (cause) {
          setError(
            `この端末で描画を開始できませんでした。${cause?.message || ''}`,
          );
        }
      })
      .catch(() =>
        setError(
          '世界を読み込めませんでした。ページを再読み込みしてください。',
        ),
      );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      view?.dispose();
      viewRef.current = null;
      engineRef.current = null;
    };
  }, []);
  useEffect(() => {
    viewRef.current?.setMode(mode);
  }, [mode, ready]);
  useEffect(() => {
    viewRef.current?.setTool(tool, radius);
  }, [tool, radius, ready]);
  useEffect(() => {
    viewRef.current?.setThermal(thermal);
  }, [thermal, ready]);
  useEffect(() => {
    if (engineRef.current) Object.assign(engineRef.current.settings, settings);
  }, [settings]);
  useEffect(() => {
    function key(event) {
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest('button,input,[role="slider"],[role="dialog"]') ||
          event.target.isContentEditable)
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setPaused((v) => !v);
      }
      if (event.key === 'Escape') setTool('look');
      const idx = Number(event.key) - 1;
      if (idx >= 0 && idx < TOOLS.length) setTool(TOOLS[idx].id);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    const context = navigator.modelContext;
    if (!context?.registerTool || !ready) return;
    const names = ['read_nature_world', 'change_nature_weather'];
    try {
      context.registerTool({
        name: names[0],
        description:
          'Read live natural-world weather and water/fire statistics.',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                settings: engineRef.current.settings,
                stats: engineRef.current.stats(),
              }),
            },
          ],
        }),
      });
      context.registerTool({
        name: names[1],
        description: 'Change the time of day, wind, rain or spring inflow.',
        inputSchema: {
          type: 'object',
          properties: {
            hour: { type: 'number', minimum: 0, maximum: 23.75 },
            wind: { type: 'number', minimum: 0, maximum: 12 },
            rain: { type: 'number', minimum: 0, maximum: 100 },
            spring: { type: 'number', minimum: 0, maximum: 4 },
          },
        },
        execute: async (values) => {
          const bounds = {
              hour: [0, 23.75],
              wind: [0, 12],
              rain: [0, 100],
              spring: [0, 4],
            },
            patch = {};
          for (const [key, [min, max]] of Object.entries(bounds))
            if (typeof values[key] === 'number' && Number.isFinite(values[key]))
              patch[key] = Math.max(min, Math.min(max, values[key]));
          setSettings((s) => ({ ...s, ...patch }));
          return { content: [{ type: 'text', text: JSON.stringify(patch) }] };
        },
      });
    } catch {
      /* Optional integration; all controls work without it. */
    }
    return () => {
      for (const name of names) {
        try {
          context.unregisterTool?.(name);
        } catch {
          /* already removed */
        }
      }
    };
  }, [ready]);

  function updateSetting(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  function reset(next = preset) {
    const world = engineRef.current;
    if (!world) return;
    world.reset(next);
    setPreset(next);
    setSettings({ ...world.settings });
    setStats(world.stats());
    setSample(null);
  }

  return (
    <main className="nature-app">
      <canvas
        ref={canvasRef}
        className="world-canvas"
        draggable={false}
        aria-label="水と火と太陽が作用する自然の世界。道具を選んで地面に触れてください。"
      />
      <div className="vignette" aria-hidden="true" />
      <header className="world-header">
        <div className="world-brand">
          <Mountain size={24} strokeWidth={1.4} />
          <div>
            <strong>PHYSICA</strong>
            <span>自然の世界</span>
          </div>
        </div>
        <div className="header-center">
          <span className={`live-dot ${paused ? 'paused' : ''}`} />
          {paused ? '時を止めています' : '世界は動いています'}
          <span className="world-clock">{elapsedLabel(stats?.time || 0)}</span>
        </div>
        <div className="header-actions">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="mode-tabs">
              <TabsTrigger value="2d">
                <Map size={16} />
                2D
              </TabsTrigger>
              <TabsTrigger value="3d">
                <Layers3 size={16} />
                3D
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="icon"
            className="glass-button"
            aria-label="自然の設定"
            onClick={() => setDrawer(true)}
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </header>
      <aside className="weather-badge glass-panel">
        <Sun size={18} />
        <span>{clockLabel(settings.hour)}</span>
        <i />
        <Wind size={17} />
        <span>
          {settings.wind} <small>m/s</small>
        </span>
        {settings.rain > 0 && (
          <>
            <i />
            <CloudRain size={17} />
            <span>
              {settings.rain} <small>mm/h</small>
            </span>
          </>
        )}
      </aside>
      <div className="view-actions">
        <Button
          variant="ghost"
          size="icon"
          className={`glass-button ${thermal ? 'enabled' : ''}`}
          aria-label="温度を見る"
          aria-pressed={thermal}
          onClick={() => setThermal((v) => !v)}
        >
          <Thermometer />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="glass-button"
          aria-label="視点を戻す"
          onClick={() => viewRef.current?.resetCamera()}
        >
          <Focus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="glass-button"
          aria-label="操作と世界について"
          onClick={() => setHelp(true)}
        >
          <Info />
        </Button>
      </div>
      {thermal && (
        <div className="thermal-legend glass-panel">
          <span>地表の温度</span>
          <div />
          <small>
            12°C<span>80°C</span>150°C以上
          </small>
        </div>
      )}
      {sample && (
        <aside className="place-reading glass-panel">
          <span className="reading-title">触れた場所</span>
          <strong>
            {(sample.water > 0.01
              ? sample.waterTemperature
              : sample.temperature
            ).toFixed(1)}
            <small>°C</small>
          </strong>
          <div>
            {sample.water > 0.01
              ? `水深 ${(sample.water * 100).toFixed(0)} cm · 流れ ${sample.speed.toFixed(1)} m/s`
              : sample.fire > 0.01
                ? '燃えています'
                : `地面の湿り ${Math.round(sample.moisture * 100)}%`}
          </div>
        </aside>
      )}
      {tip && (
        <div className="welcome-note glass-panel">
          <div>
            <span className="eyebrow">渓流と森</span>
            <p>
              水を流す。火を灯す。
              <br />
              自然に、触れてみよう。
            </p>
            <span className="note-sub">道具を選んで、地面に指を置く。</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="案内を閉じる"
            onClick={() => setTip(false)}
          >
            <X size={18} />
          </Button>
        </div>
      )}
      <footer className="world-footer">
        <div className="tool-context">
          <span style={{ color: selected.color }}>
            <selected.icon size={17} />
            {selected.name}
          </span>
          <p>
            {tool === 'look' && mode === '2d'
              ? '2本指で移動・拡大。3Dに戻しても世界はそのまま。'
              : selected.tip}
          </p>
          {tool !== 'look' && (
            <div className="brush-size">
              <span>広さ</span>
              <Slider
                aria-label="道具の広さ"
                value={[radius]}
                min={0.5}
                max={3}
                step={0.1}
                onValueChange={(v) => setRadius(v[0])}
              />
            </div>
          )}
        </div>
        <div className="bottom-bar">
          <nav
            className="tool-palette glass-panel"
            aria-label="自然に触れる道具"
          >
            {TOOLS.map(({ id, name, icon: Icon, color: toolColor }) => (
              <Button
                key={id}
                variant="ghost"
                className={`tool-button ${tool === id ? 'selected' : ''}`}
                style={{ '--tool-color': toolColor }}
                aria-pressed={tool === id}
                onClick={() => {
                  setTool(id);
                  setTip(false);
                }}
              >
                <Icon size={24} strokeWidth={1.6} />
                <span>{name}</span>
              </Button>
            ))}
          </nav>
          <div className="time-controls glass-panel">
            <Button
              variant="ghost"
              size="icon"
              aria-label={paused ? '時間を進める' : '一時停止'}
              onClick={() => setPaused((v) => !v)}
            >
              {paused ? (
                <Play fill="currentColor" />
              ) : (
                <Pause fill="currentColor" />
              )}
            </Button>
            <Button
              variant="ghost"
              className="speed-button"
              aria-label={`時間の速さ ${speed}倍。押して切り替え`}
              onClick={() =>
                setSpeed((s) => (s === 1 ? 4 : s === 4 ? 0.25 : 1))
              }
            >
              {speed}×
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="世界を作り直す"
              onClick={() => reset()}
            >
              <RotateCcw size={19} />
            </Button>
          </div>
        </div>
        <div className="footer-meta">
          <span>
            <Compass size={13} />
            32 mの小さな自然
          </span>
          <span>
            {mode === '3d' ? '立体の景色' : '上から見る景色'}
            <i />
            {stats?.burningCells
              ? `${stats.burningCells}か所で燃焼`
              : '渓流と森'}
          </span>
        </div>
      </footer>
      {!ready && !error && (
        <div className="loading-world">
          <Mountain size={38} strokeWidth={1} />
          <span>自然の世界をつくっています</span>
          <div className="loading-line" />
        </div>
      )}
      {error && (
        <div role="alert" className="world-error glass-panel">
          <Mountain />
          <p>{error}</p>
          <Button onClick={() => location.reload()}>もう一度開く</Button>
        </div>
      )}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent className="nature-sheet" side="right">
          <SheetHeader>
            <SheetTitle>自然の設定</SheetTitle>
            <SheetDescription>
              太陽、風、水源を変えて、世界の変化を眺める。
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <div className="preset-row">
              {[
                ['valley', '渓流と森'],
                ['dry', '乾いた丘'],
                ['rain', '雨の森'],
              ].map(([id, title]) => (
                <Button
                  key={id}
                  variant="outline"
                  className={preset === id ? 'preset-active' : ''}
                  onClick={() => reset(id)}
                >
                  {title}
                </Button>
              ))}
            </div>
            <div className="setting-section">
              <h3>
                <Sun size={18} />
                太陽
              </h3>
              <RangeControl
                label="時刻"
                value={settings.hour}
                min={0}
                max={23.75}
                step={0.25}
                unit="時"
                onChange={(v) => updateSetting('hour', v)}
              />
              <RangeControl
                label="日差し"
                value={settings.sunPower}
                min={0}
                max={1.5}
                step={0.1}
                unit="倍"
                onChange={(v) => updateSetting('sunPower', v)}
              />
            </div>
            <div className="setting-section">
              <h3>
                <Wind size={18} />
                空気と雨
              </h3>
              <RangeControl
                label="風の強さ"
                value={settings.wind}
                min={0}
                max={12}
                step={0.5}
                unit=" m/s"
                onChange={(v) => updateSetting('wind', v)}
              />
              <RangeControl
                label="風の向き"
                value={settings.windAngle}
                min={0}
                max={360}
                step={15}
                unit="°"
                onChange={(v) => updateSetting('windAngle', v)}
              />
              <RangeControl
                label="雨の強さ"
                value={settings.rain}
                min={0}
                max={100}
                step={5}
                unit=" mm/h"
                onChange={(v) => updateSetting('rain', v)}
              />
            </div>
            <div className="setting-section">
              <h3>
                <Droplets size={18} />
                水源
              </h3>
              <RangeControl
                label="湧き水の量"
                value={settings.spring}
                min={0}
                max={4}
                step={0.25}
                unit="倍"
                onChange={(v) => updateSetting('spring', v)}
              />
            </div>
            <label className="setting-switch" htmlFor="thermal-switch">
              <span>
                <Thermometer size={18} />
                地表の温度を色で見る
              </span>
              <Switch
                id="thermal-switch"
                checked={thermal}
                onCheckedChange={setThermal}
              />
            </label>
            <div className="world-readings">
              <div>
                <span>世界の水</span>
                <strong>{(stats?.waterVolume || 0).toFixed(1)} m³</strong>
              </div>
              <div>
                <span>蒸発した水</span>
                <strong>
                  {((stats?.evaporatedVolume || 0) * 1000).toFixed(1)} L
                </strong>
              </div>
              <div>
                <span>燃えた草木</span>
                <strong>{(stats?.burnedMass || 0).toFixed(1)} kg</strong>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={help} onOpenChange={setHelp}>
        <SheetContent className="nature-sheet" side="right">
          <SheetHeader>
            <SheetTitle>自然に触れる</SheetTitle>
            <SheetDescription>
              水と火と太陽は、同じ地面の上で作用します。
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body help-body">
            <p>
              <Hand />
              「見わたす」で1本指を動かすと回転。2本指で移動し、指を広げると拡大します。道具を選ぶと、1本指で地面に作用します。
            </p>
            <p>
              <Droplets />
              川を土でせき止め、横に溝を掘ってみる。水は高い水面から低い方へ流れ、新しい道を探します。
            </p>
            <p>
              <Flame />
              乾いた草地に火をつける。燃える草木から出た熱が周囲を温めます。水を注ぐと濡れて冷え、火が消えます。
            </p>
            <p>
              <Sun />
              夕方や夜へ時刻を変える。日差しと地形の影が移り、日射で受け取る熱が変わります。火は夜も周囲を照らします。
            </p>
            <p>
              <Layers3 />
              2Dは真上から、3Dは自由な角度から。同じ地形、水、温度、草木を見ているので切り替えても進行は続きます。
            </p>
            <div className="model-note">
              <strong>この世界の再現範囲</strong>
              <p>
                地形上の水の流れ、草木の燃焼と熱放射、日射・地形の影、冷却・蒸発を数値近似しています。水は深さで表すため、空中の滝や砕ける波は扱いません。煙や細かな水面の波は流れ・熱・風に応じた描画で、空気全体の流体計算ではありません。生態系や雲の生成も未対応です。
              </p>
              <p>
                2D・3Dで同じ自然を操作でき、タブレットでも世界を継続して動かせる方式を選んでいます。
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setHelp(false);
                setTool('water');
                setTip(false);
              }}
            >
              水を流してみる
              <ChevronRight size={17} />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
