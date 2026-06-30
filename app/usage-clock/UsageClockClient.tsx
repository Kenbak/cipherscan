'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { feature } from 'topojson-client';
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  project,
  declinationDeg,
  subsolarLon,
  isDaylight,
  nightPath,
  sunRegionLabel,
  regionsInDaylight,
  decomposeRegions,
  pearson,
} from './solar';

const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const DOT_SPACING = 3;
const DOT_RADIUS = 1.6;

const PERIODS = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'ALL' },
];

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface HeatCell { hour: number; dow: number; txCount: number; blockCount: number; }
interface HourPoint { hour: number; txCount: number; }
interface ClockData {
  period: string;
  dateRange: { from: string | null; to: string | null };
  totalBlocks: number;
  totalTxs: number;
  heatmap: HeatCell[];
  hourly: HourPoint[];
  peakHour: number;
  lowHour: number;
  peakToLowRatio: number;
}
interface NodeLoc { country: string; countryCode: string; city: string; lat: number; lon: number; nodeCount: number; }

// ---------------------------------------------------------------------------
// Geometry helpers (land dot matrix — mirrors NodeMap)
// ---------------------------------------------------------------------------

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointOnLand(lat: number, lon: number, features: any[]): boolean {
  for (const feat of features) {
    const geom = feat.geometry || feat;
    if (geom.type === 'Polygon') {
      if (pointInRing(lon, lat, geom.coordinates[0])) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        if (pointInRing(lon, lat, polygon[0])) return true;
      }
    }
  }
  return false;
}

function clusterNodes(nodes: NodeLoc[]): NodeLoc[] {
  const clusters = new Map<string, NodeLoc>();
  for (const loc of nodes) {
    const key = `${Math.round(loc.lat / 8) * 8},${Math.round(loc.lon / 8) * 8}`;
    const existing = clusters.get(key);
    if (existing) {
      const total = existing.nodeCount + loc.nodeCount;
      clusters.set(key, {
        ...existing,
        lat: (existing.lat * existing.nodeCount + loc.lat * loc.nodeCount) / total,
        lon: (existing.lon * existing.nodeCount + loc.lon * loc.nodeCount) / total,
        nodeCount: total,
      });
    } else {
      clusters.set(key, { ...loc });
    }
  }
  return Array.from(clusters.values());
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function heatColor(t: number): string {
  // t in [0,1] → deep navy to cipher-yellow
  const stops = [
    [13, 17, 23],     // #0d1117
    [30, 58, 64],     // teal-ish
    [56, 130, 120],
    [120, 170, 90],
    [244, 183, 40],   // cipher-yellow
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

export function UsageClockClient({
  initialData,
  initialPeriod,
  initialNodes,
}: {
  initialData: ClockData | null;
  initialPeriod: string;
  initialNodes: NodeLoc[];
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState<ClockData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [nodes] = useState<NodeLoc[]>(initialNodes || []);
  const [worldDots, setWorldDots] = useState<{ x: number; y: number; lat: number; lon: number }[]>([]);
  const [hour, setHour] = useState(15); // start at the global peak
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef<number | null>(null);

  const decl = useMemo(() => declinationDeg(), []);

  // Load land geometry once for the dot-matrix continents.
  useEffect(() => {
    fetch(WORLD_TOPO_URL)
      .then((r) => r.json())
      .then((topology: any) => {
        const land = feature(topology, topology.objects.land) as any;
        const features = land.features ? land.features : [land];
        const dots: { x: number; y: number; lat: number; lon: number }[] = [];
        for (let lat = 84; lat >= -60; lat -= DOT_SPACING) {
          for (let lon = -180; lon < 180; lon += DOT_SPACING) {
            if (isPointOnLand(lat, lon, features)) {
              const p = project(lat, lon);
              dots.push({ x: p.x, y: p.y, lat, lon });
            }
          }
        }
        setWorldDots(dots);
      })
      .catch(() => {});
  }, []);

  // Re-fetch aggregates when the period changes (skip the SSR-provided default).
  useEffect(() => {
    if (period === initialPeriod && initialData) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${getApiUrl()}/api/analytics/usage-clock?period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // Animation loop — sweep the terminator across the planet.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setHour((h) => (h + dt * 2.4) % 24); // ~10s per full day
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  const clustered = useMemo(() => clusterNodes(nodes), [nodes]);
  const totalNodeCount = useMemo(() => nodes.reduce((s, n) => s + n.nodeCount, 0), [nodes]);

  // Hourly activity normalized to a fraction (sums to 1).
  const hourly = useMemo(() => {
    const arr = new Array(24).fill(0);
    (data?.hourly || []).forEach((p) => { arr[p.hour] = p.txCount; });
    return arr;
  }, [data]);
  const hourlyTotal = useMemo(() => hourly.reduce((s, v) => s + v, 0) || 1, [hourly]);
  const hourlyFrac = useMemo(() => hourly.map((v) => v / hourlyTotal), [hourly, hourlyTotal]);
  const peakValue = useMemo(() => Math.max(...hourly, 1), [hourly]);

  // Node-daylight share for each UTC hour (weighted by node count).
  const nodeDaylightShare = useMemo(() => {
    const out = new Array(24).fill(0);
    if (totalNodeCount === 0) return out;
    for (let h = 0; h < 24; h++) {
      let lit = 0;
      for (const n of nodes) {
        if (isDaylight(n.lat, n.lon, h, decl)) lit += n.nodeCount;
      }
      out[h] = lit / totalNodeCount;
    }
    return out;
  }, [nodes, totalNodeCount, decl]);

  // Node geography split by macro-longitude band (datacenter footprint).
  const nodeGeoSplit = useMemo(() => {
    let americas = 0, europe = 0, asia = 0;
    for (const n of nodes) {
      if (n.lon < -30) americas += n.nodeCount;
      else if (n.lon < 60) europe += n.nodeCount;
      else asia += n.nodeCount;
    }
    const t = americas + europe + asia || 1;
    return { americas: americas / t, europe: europe / t, asia: asia / t };
  }, [nodes]);

  // Timing-based user-base estimate.
  const regionMix = useMemo(() => decomposeRegions(hourlyFrac), [hourlyFrac]);

  // Correlation between activity and how much of the network is in daylight.
  const correlation = useMemo(
    () => pearson(hourly, nodeDaylightShare),
    [hourly, nodeDaylightShare]
  );

  // Predicted activity from node geography assuming human waking hours.
  const predictedFrac = useMemo(() => {
    const out = new Array(24).fill(0);
    if (totalNodeCount === 0) return out;
    // Each node's users follow the waking profile in that node's local time.
    const WAKING = [
      0.20, 0.14, 0.10, 0.09, 0.09, 0.14, 0.30, 0.50, 0.70, 0.85, 0.95, 1.0,
      1.0, 1.0, 1.0, 1.0, 0.97, 0.95, 1.0, 1.0, 0.90, 0.70, 0.48, 0.30,
    ];
    for (const n of nodes) {
      const offset = Math.round(n.lon / 15);
      for (let h = 0; h < 24; h++) {
        const local = ((h + offset) % 24 + 24) % 24;
        out[h] += n.nodeCount * WAKING[local];
      }
    }
    const t = out.reduce((s, v) => s + v, 0) || 1;
    return out.map((v) => v / t);
  }, [nodes, totalNodeCount]);

  const currentHour = Math.floor(hour) % 24;
  const litRegions = useMemo(() => regionsInDaylight(hour, decl), [hour, decl]);
  const activityPct = peakValue > 0 ? Math.round((hourly[currentHour] / peakValue) * 100) : 0;
  const sunMarker = project(decl, subsolarLon(hour));

  // Chart datasets
  const hourBars = useMemo(
    () => hourly.map((v, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}h`,
      tx: v,
      daylight: Math.round(nodeDaylightShare[h] * 100),
    })),
    [hourly, nodeDaylightShare]
  );

  const residualBars = useMemo(
    () => hourly.map((_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}`,
      actual: +(hourlyFrac[h] * 100).toFixed(2),
      predicted: +(predictedFrac[h] * 100).toFixed(2),
      residual: +((hourlyFrac[h] - predictedFrac[h]) * 100).toFixed(2),
    })),
    [hourly, hourlyFrac, predictedFrac]
  );

  // Heatmap: build [dow 0..6 (Mon-first)][hour 0..23]
  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let max = 1;
    (data?.heatmap || []).forEach((c) => {
      // Postgres DOW: 0=Sunday..6=Saturday → Mon-first index
      const row = (c.dow + 6) % 7;
      grid[row][c.hour] = c.txCount;
      if (c.txCount > max) max = c.txCount;
    });
    return { grid, max };
  }, [data]);

  const peakH = data?.peakHour ?? 15;
  const lowH = data?.lowHour ?? 1;
  const ratio = data?.peakToLowRatio ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-muted mb-4">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <span className="opacity-40">/</span>
        <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap mb-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">When the world uses Zcash</h1>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cipher-yellow/15 text-cipher-yellow-bright mt-1.5">
          Draft
        </span>
      </div>
      <p className="text-sm text-secondary font-mono mb-5">
        Transaction activity by hour of day &amp; day of week — UTC
      </p>

      {/* Period selector + range */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="inline-flex gap-1 p-1 rounded-lg bg-glass-3">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-[11px] font-mono rounded-md transition-all ${
                period === p.key
                  ? 'bg-cipher-yellow/15 text-cipher-yellow-bright font-bold'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {data && (
          <div className="text-[11px] font-mono text-muted">
            {data.dateRange.from} → {data.dateRange.to} · {data.totalBlocks.toLocaleString()} blocks · {fmt(data.totalTxs)} txs
          </div>
        )}
        {loading && <span className="text-[11px] font-mono text-cipher-cyan animate-pulse">updating…</span>}
      </div>

      {/* Intro */}
      <p className="text-sm text-secondary leading-relaxed max-w-3xl mb-6">
        On-chain data has <span className="text-primary font-semibold">no location</span> — that&apos;s the whole point of Zcash. So we can&apos;t show <em>where</em> people are. But every block carries a UTC timestamp, so we can see the <span className="text-primary font-semibold">daily rhythm</span> of usage and line it up with where the sun is. Unlike a plain sun-clock, we also overlay the network&apos;s <span className="text-cipher-yellow-bright font-semibold">real node positions</span> — and where the infrastructure sits versus when people act tells its own story.
      </p>

      {/* ===================== MAP ===================== */}
      <div
        className="rounded-xl border border-cipher-border overflow-hidden relative"
        style={{ backgroundColor: '#070b10' }}
      >
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="w-full h-auto block" style={{ maxHeight: 560 }}>
          <defs>
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFD060" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#F4B728" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#F4B728" stopOpacity="0" />
            </radialGradient>
            <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Land dots — lit when the sun is up at that point */}
          {worldDots.map((d, i) => {
            const lit = isDaylight(d.lat, d.lon, hour, decl);
            return (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={DOT_RADIUS}
                fill={lit ? '#3f8f6a' : '#1c2a33'}
                opacity={lit ? 0.85 : 0.55}
              />
            );
          })}

          {/* Night shading */}
          <path d={nightPath(hour, decl)} fill="#040d1a" opacity={0.55} />

          {/* Sun glow + marker */}
          <circle cx={sunMarker.x} cy={sunMarker.y} r={46} fill="url(#sunGlow)" />
          <circle cx={sunMarker.x} cy={sunMarker.y} r={7} fill="#FFE08A" stroke="#F4B728" strokeWidth={1.5} />

          {/* Node clusters — bright in daylight, dim at night */}
          {[...clustered].sort((a, b) => b.nodeCount - a.nodeCount).map((n, i) => {
            const p = project(n.lat, n.lon);
            const lit = isDaylight(n.lat, n.lon, hour, decl);
            const r = Math.max(3.5, Math.min(11, 2.5 + Math.sqrt(n.nodeCount) * 2.4));
            return (
              <circle
                key={`n${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill="#F4B728"
                opacity={lit ? 0.95 : 0.3}
                filter={lit ? 'url(#nodeGlow)' : undefined}
              />
            );
          })}
        </svg>

        {/* Legend */}
        <div className="absolute top-3 right-3 flex items-center gap-3 text-[10px] font-mono backdrop-blur-sm rounded-md px-2.5 py-1.5" style={{ backgroundColor: 'rgba(7,11,16,0.7)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cipher-yellow-bright" /> <span className="text-secondary">node (lit)</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#F4B728', opacity: 0.3 }} /> <span className="text-muted">node (dark)</span></span>
        </div>
      </div>

      {/* ===================== CONTROLS ===================== */}
      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cipher-green/15 border border-cipher-green/30 text-cipher-green-bright text-xs font-mono font-bold hover:bg-cipher-green/25 transition-all min-w-[96px] justify-center"
        >
          {playing ? '❙❙ Pause' : '▶ Play'}
        </button>
        <input
          type="range"
          min={0}
          max={23.99}
          step={0.25}
          value={hour}
          onChange={(e) => { setPlaying(false); setHour(parseFloat(e.target.value)); }}
          className="flex-1 accent-cipher-yellow-bright cursor-pointer"
          aria-label="Hour of day (UTC)"
        />
      </div>

      {/* Narrative */}
      <div className="mt-3 space-y-1">
        <p className="text-sm font-mono">
          <span className="text-cipher-yellow-bright font-bold">{String(currentHour).padStart(2, '0')}:00 UTC</span>
          <span className="text-secondary"> · sun overhead near {sunRegionLabel(hour)} · activity </span>
          <span className="text-primary font-bold">{activityPct}%</span>
          <span className="text-secondary"> of peak</span>
        </p>
        <p className="text-xs font-mono text-muted">
          In daylight now: <span className="text-secondary">{litRegions.join(' · ') || 'open ocean only'}</span>
        </p>
      </div>

      {/* ===================== ACTIVITY + HEATMAP ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8">
        {/* Activity by hour + node-daylight overlay */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider">Activity by hour (UTC)</h3>
            <span className="text-[10px] font-mono text-muted">bars = txs · line = network in daylight</span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourBars} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: 'monospace' }} stroke="var(--color-text-muted)" interval={2} />
                <YAxis yAxisId="l" tick={{ fontSize: 9, fontFamily: 'monospace' }} stroke="var(--color-text-muted)" tickFormatter={(v) => fmt(v)} width={40} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} hide />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-surface-solid)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                  formatter={(val: any, name: any) => name === 'daylight' ? [`${val}%`, 'network lit'] : [fmt(val as number), 'txs']}
                />
                <Bar yAxisId="l" dataKey="tx" radius={[2, 2, 0, 0]}>
                  {hourBars.map((d) => (
                    <Cell key={d.hour} fill={d.hour === currentHour ? '#FFD060' : '#F4B728'} opacity={d.hour === currentHour ? 1 : 0.45} />
                  ))}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="daylight" stroke="#56D4C8" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmap */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider">By day &amp; hour (UTC)</h3>
            <span className="text-[10px] font-mono text-muted">darker → quieter</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              {/* hour axis */}
              <div className="flex pl-9 mb-1">
                {[0, 6, 12, 18].map((h) => (
                  <div key={h} className="text-[9px] font-mono text-muted" style={{ width: `${(6 / 24) * 100}%` }}>{h}h</div>
                ))}
              </div>
              {heat.grid.map((row, ri) => (
                <div key={ri} className="flex items-center gap-1 mb-1">
                  <div className="w-8 text-[9px] font-mono text-muted text-right pr-1">{DOW_LABELS[ri]}</div>
                  <div className="flex gap-[2px] flex-1">
                    {row.map((v, hi) => (
                      <div
                        key={hi}
                        className="flex-1 rounded-sm transition-colors"
                        style={{ height: 16, backgroundColor: heatColor(v / heat.max) }}
                        title={`${DOW_LABELS[ri]} ${String(hi).padStart(2, '0')}:00 UTC · ${fmt(v)} txs`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== NODE FUSION ===================== */}
      <div className="mt-8 mb-3 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-cipher-cyan" />
        <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">Where the network is vs. when people act</h2>
        <div className="flex-1 h-px bg-cipher-border/40" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Correlation */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5 flex flex-col">
          <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-2">Daylight correlation</h3>
          <div className="text-4xl font-bold font-mono text-cipher-cyan">{correlation >= 0 ? '+' : ''}{correlation.toFixed(2)}</div>
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            Correlation between hourly activity and the share of the node network in daylight. {correlation > 0.4 ? 'Activity rises when more of the network sees the sun — consistent with people transacting in their waking hours.' : correlation < -0.2 ? 'Activity runs counter to network daylight — a sign usage is driven from elsewhere.' : 'Only a weak link — usage timing isn\'t cleanly explained by node geography.'}
          </p>
        </div>

        {/* Region mixture vs node geography */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5">
          <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-3">Implied user base vs. infrastructure</h3>
          {[
            { label: 'Americas', timing: regionMix.americas, geo: nodeGeoSplit.americas, color: '#5B9CF6' },
            { label: 'Europe / Africa', timing: regionMix.europe, geo: nodeGeoSplit.europe, color: '#56D4C8' },
            { label: 'Asia / Pacific', timing: regionMix.asia, geo: nodeGeoSplit.asia, color: '#E8C48D' },
          ].map((r) => (
            <div key={r.label} className="mb-3">
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-secondary">{r.label}</span>
                <span className="text-muted">timing {Math.round(r.timing * 100)}% · nodes {Math.round(r.geo * 100)}%</span>
              </div>
              <div className="relative h-2 rounded-full bg-glass-3 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.timing * 100}%`, backgroundColor: r.color }} />
              </div>
              <div className="relative h-1 mt-0.5 rounded-full bg-glass-3 overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full opacity-50" style={{ width: `${r.geo * 100}%`, backgroundColor: r.color }} />
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted leading-relaxed mt-1">
            Thick bar = user base inferred from <em>timing</em>. Thin bar = where the <em>nodes</em> physically sit. The gap is the story: infrastructure clusters in a few datacenters, but the rhythm of use is spread wider.
          </p>
        </div>

        {/* Predicted vs actual residual */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5">
          <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-1">Subtract the humans</h3>
          <p className="text-[10px] text-muted mb-2">Actual − activity predicted from node geography. Positive hours = more than human rhythm explains (automation, exchanges, miners).</p>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={residualBars} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <ReferenceLine y={0} stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 8, fontFamily: 'monospace' }} stroke="var(--color-text-muted)" interval={3} />
                <YAxis tick={{ fontSize: 8, fontFamily: 'monospace' }} stroke="var(--color-text-muted)" width={28} tickFormatter={(v) => `${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-surface-solid)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                  formatter={(val: any) => [`${val}%`, 'residual']}
                  labelFormatter={(l) => `${l}:00 UTC`}
                />
                <Bar dataKey="residual" radius={[2, 2, 0, 0]}>
                  {residualBars.map((d) => (
                    <Cell key={d.hour} fill={d.residual >= 0 ? '#FF6B35' : '#5B9CF6'} opacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary narrative */}
      <div className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-5">
        <p className="text-sm text-secondary leading-relaxed">
          Over this window, Zcash transactions peak around{' '}
          <span className="text-primary font-bold font-mono">{String(peakH).padStart(2, '0')}:00 UTC</span> and bottom out around{' '}
          <span className="text-primary font-bold font-mono">{String(lowH).padStart(2, '0')}:00 UTC</span>
          {ratio > 0 && <> (about <span className="text-primary font-bold">{ratio}×</span> more activity at the busy hour)</>}.
          At the peak the sun is over {sunRegionLabel(peakH)}. The timing decomposition puts the largest slice of users in{' '}
          <span className="text-cipher-cyan font-semibold">
            {regionMix.americas >= regionMix.europe && regionMix.americas >= regionMix.asia ? 'the Americas' : regionMix.europe >= regionMix.asia ? 'Europe / Africa' : 'Asia / Pacific'}
          </span>
          , even though the nodes themselves are concentrated in {nodeGeoSplit.europe >= nodeGeoSplit.americas && nodeGeoSplit.europe >= nodeGeoSplit.asia ? 'European datacenters' : nodeGeoSplit.americas >= nodeGeoSplit.asia ? 'the Americas' : 'Asia / Pacific'}.
        </p>
        <p className="text-xs text-muted leading-relaxed mt-3">
          <span className="font-bold">Caveat:</span> this is UTC timing of block timestamps — it shows <em>when</em>, not <em>where</em>. Node positions reveal where the <em>infrastructure</em> runs (often datacenters and VPN exits, not homes), and the sun map shows where daylight falls at each hour. None of it pinpoints a user. That&apos;s by design.
        </p>
      </div>
    </div>
  );
}
