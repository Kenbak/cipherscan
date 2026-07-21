'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { feature } from 'topojson-client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
const DOT_RADIUS = 1.5;

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
// Geometry helpers
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
  const stops = [
    [13, 17, 23],
    [22, 48, 58],
    [40, 110, 110],
    [110, 165, 95],
    [244, 183, 40],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

// ---------------------------------------------------------------------------
// Radial 24-hour clock dial
// ---------------------------------------------------------------------------

// viewBox is padded well beyond the outer bars so hour labels and the
// sun/moon anchors at the rim aren't clipped at the edges.
const DIAL = 520;
const CX = DIAL / 2;
const CY = DIAL / 2;
const BAR_INNER = 124;
const BAR_MAX = 74;
const RING_R = 104;
const RING_W = 11;
const HUB_R = 90;

// Noon (12:00) at top, midnight (00:00) at bottom, sunrise (06) right, sunset
// (18) left — the dial follows the sun's arc across the sky.
function polar(r: number, hourFrac: number): { x: number; y: number } {
  const a = (90 - 15 * hourFrac) * (Math.PI / 180);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function ringArc(r: number, h0: number, h1: number): string {
  const s = polar(r, h1);
  const e = polar(r, h0);
  const large = (h1 - h0) / 24 > 0.5 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function tealForShare(t: number): string {
  const a = [18, 32, 48];
  const b = [86, 212, 200];
  const f = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

function goldForLevel(t: number): string {
  const a = [120, 86, 22];   // deep amber (quiet hour)
  const b = [255, 208, 96];  // bright gold (busy hour)
  const f = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

function RadialClock({
  hourly,
  nodeDaylightShare,
  hour,
  currentHour,
  activityPct,
}: {
  hourly: number[];
  nodeDaylightShare: number[];
  hour: number;
  currentHour: number;
  activityPct: number;
}) {
  const sunHand = polar(BAR_INNER + BAR_MAX + 14, hour);
  // Min–max normalize so the daily rhythm (only ~1.6×) is actually visible.
  const minV = Math.min(...hourly);
  const maxV = Math.max(...hourly, 1);
  const span = maxV - minV || 1;
  return (
    <svg viewBox={`0 0 ${DIAL} ${DIAL}`} className="w-full h-auto">
      <defs>
        <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0e151d" />
          <stop offset="100%" stopColor="#070b10" />
        </radialGradient>
        <filter id="barGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* faint guide circles */}
      <circle cx={CX} cy={CY} r={BAR_INNER + BAR_MAX} fill="none" stroke="var(--color-border)" strokeOpacity={0.18} />
      <circle cx={CX} cy={CY} r={BAR_INNER} fill="none" stroke="var(--color-border)" strokeOpacity={0.18} />

      {/* daylight ring — how much of the node network is in sunlight at each hour */}
      {Array.from({ length: 24 }, (_, h) => (
        <path
          key={`ring-${h}`}
          d={ringArc(RING_R, h + 0.12, h + 0.88)}
          stroke={tealForShare(nodeDaylightShare[h] || 0)}
          strokeWidth={RING_W}
          fill="none"
          strokeLinecap="butt"
          opacity={h === currentHour ? 1 : 0.85}
        />
      ))}

      {/* activity bars — length and brightness both encode volume */}
      {hourly.map((v, h) => {
        const norm = (v - minV) / span;
        const len = 16 + norm * (BAR_MAX - 16);
        const p0 = polar(BAR_INNER, h + 0.5);
        const p1 = polar(BAR_INNER + len, h + 0.5);
        const active = h === currentHour;
        return (
          <line
            key={`bar-${h}`}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={active ? '#FFE08A' : goldForLevel(norm)}
            strokeWidth={9}
            strokeLinecap="round"
            opacity={active ? 1 : 0.45 + 0.5 * norm}
            filter={active ? 'url(#barGlow)' : undefined}
          />
        );
      })}

      {/* hour labels */}
      {[0, 6, 12, 18].map((h) => {
        const p = polar(BAR_INNER + BAR_MAX + 18, h);
        return (
          <text
            key={`lbl-${h}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontFamily="monospace"
            fill="var(--color-text-muted)"
          >
            {String(h).padStart(2, '0')}
          </text>
        );
      })}

      {/* sun (noon, top) & moon (midnight, bottom) anchors */}
      {(() => {
        const sun = polar(BAR_INNER + BAR_MAX + 40, 12);
        const moon = polar(BAR_INNER + BAR_MAX + 40, 0);
        return (
          <g>
            <g>
              <circle cx={sun.x} cy={sun.y} r={6} fill="#F4B728" />
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * 2 * Math.PI;
                return (
                  <line
                    key={i}
                    x1={sun.x + Math.cos(a) * 8}
                    y1={sun.y + Math.sin(a) * 8}
                    x2={sun.x + Math.cos(a) * 11}
                    y2={sun.y + Math.sin(a) * 11}
                    stroke="#F4B728"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
            <g>
              <circle cx={moon.x} cy={moon.y} r={6} fill="#9aa6b2" />
              <circle cx={moon.x + 2.6} cy={moon.y - 1.6} r={5} fill="#070b10" />
            </g>
          </g>
        );
      })()}

      {/* sun hand */}
      <line x1={CX} y1={CY} x2={sunHand.x} y2={sunHand.y} stroke="#F4B728" strokeWidth={2} strokeOpacity={0.5} />
      <circle cx={sunHand.x} cy={sunHand.y} r={9} fill="#FFE08A" stroke="#F4B728" strokeWidth={1.5} />

      {/* hub */}
      <circle cx={CX} cy={CY} r={HUB_R} fill="url(#hubGrad)" stroke="var(--color-border)" strokeOpacity={0.4} />
      <text x={CX} y={CY - 22} textAnchor="middle" fontSize={34} fontFamily="monospace" fontWeight={700} fill="#FFD060">
        {String(currentHour).padStart(2, '0')}:00
      </text>
      <text x={CX} y={CY + 2} textAnchor="middle" fontSize={11} fontFamily="monospace" fill="var(--color-text-muted)" letterSpacing="2">
        UTC
      </text>
      <text x={CX} y={CY + 30} textAnchor="middle" fontSize={20} fontFamily="monospace" fontWeight={700} fill="#E5E7EB">
        {activityPct}%
      </text>
      <text x={CX} y={CY + 48} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="var(--color-text-muted)" letterSpacing="1">
        OF PEAK
      </text>
    </svg>
  );
}

function ResidualTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const up = d.residual >= 0;
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface-solid)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '8px 10px',
        fontFamily: 'monospace',
        fontSize: 11,
      }}
    >
      <div className="text-secondary mb-1">{d.label}:00 UTC</div>
      <div className="text-muted">actual {d.actual}% of the day</div>
      <div className="text-muted">expected {d.predicted}% (humans only)</div>
      <div style={{ color: up ? '#FF6B35' : '#5B9CF6', marginTop: 4, fontWeight: 700 }}>
        {up ? '+' : ''}{d.residual} pts · {up ? 'busier than people explain' : 'quieter than expected'}
      </div>
    </div>
  );
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
  const [hour, setHour] = useState(15);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const decl = useMemo(() => declinationDeg(), []);

  useEffect(() => {
    fetch(WORLD_TOPO_URL)
      .then((r) => r.json())
      .then((topology: any) => {
        const land = feature(topology, topology.objects.land) as any;
        const features = land.features ? land.features : [land];
        const dots: { x: number; y: number; lat: number; lon: number }[] = [];
        for (let lat = 82; lat >= -58; lat -= DOT_SPACING) {
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

  // ~10fps sweep keeps the dial smooth without re-rendering the map at 60fps.
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setHour((h) => (h + 0.24) % 24);
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing]);

  const clustered = useMemo(() => clusterNodes(nodes), [nodes]);
  const totalNodeCount = useMemo(() => nodes.reduce((s, n) => s + n.nodeCount, 0), [nodes]);

  const hourly = useMemo(() => {
    const arr = new Array(24).fill(0);
    (data?.hourly || []).forEach((p) => { arr[p.hour] = p.txCount; });
    return arr;
  }, [data]);
  const hourlyTotal = useMemo(() => hourly.reduce((s, v) => s + v, 0) || 1, [hourly]);
  const hourlyFrac = useMemo(() => hourly.map((v) => v / hourlyTotal), [hourly, hourlyTotal]);
  const peakValue = useMemo(() => Math.max(...hourly, 1), [hourly]);

  const nodeDaylightShare = useMemo(() => {
    const out = new Array(24).fill(0);
    if (totalNodeCount === 0) return out;
    for (let h = 0; h < 24; h++) {
      let lit = 0;
      for (const n of nodes) if (isDaylight(n.lat, n.lon, h, decl)) lit += n.nodeCount;
      out[h] = lit / totalNodeCount;
    }
    return out;
  }, [nodes, totalNodeCount, decl]);

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

  const regionMix = useMemo(() => decomposeRegions(hourlyFrac), [hourlyFrac]);
  const correlation = useMemo(() => pearson(hourly, nodeDaylightShare), [hourly, nodeDaylightShare]);

  const predictedFrac = useMemo(() => {
    const out = new Array(24).fill(0);
    if (totalNodeCount === 0) return out;
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

  const heat = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let max = 1;
    (data?.heatmap || []).forEach((c) => {
      const row = (c.dow + 6) % 7;
      grid[row][c.hour] = c.txCount;
      if (c.txCount > max) max = c.txCount;
    });
    return { grid, max };
  }, [data]);

  const peakH = data?.peakHour ?? 15;
  const lowH = data?.lowHour ?? 1;
  const ratio = data?.peakToLowRatio ?? 0;

  const topTimingRegion = regionMix.americas >= regionMix.europe && regionMix.americas >= regionMix.asia
    ? 'the Americas'
    : regionMix.europe >= regionMix.asia ? 'Europe & Africa' : 'Asia–Pacific';
  const topGeoRegion = nodeGeoSplit.europe >= nodeGeoSplit.americas && nodeGeoSplit.europe >= nodeGeoSplit.asia
    ? 'European datacenters'
    : nodeGeoSplit.americas >= nodeGeoSplit.asia ? 'the Americas' : 'Asia–Pacific';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-muted mb-4">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <span className="opacity-40">/</span>
        <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
      </div>

      {/* Header */}
      <h1 className="text-2xl sm:text-3xl font-bold text-primary">The Rhythm of Zcash</h1>
      <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
        Zcash is built to hide <span className="text-primary font-semibold">where</span> you are. But the chain still has a pulse — every block is timestamped, so the network&apos;s daily rhythm is public even when its geography isn&apos;t. We read that rhythm against where the nodes actually run. The mismatch is the interesting part.
      </p>

      {/* Period selector + range */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-5 mb-7">
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

      {/* ===================== HERO: dial + thesis ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 items-stretch">
        {/* Dial */}
        <div className="rounded-2xl border border-cipher-border p-4 sm:p-6 flex flex-col bg-cipher-bg-dark">
          <div className="max-w-[440px] w-full mx-auto">
            <RadialClock
              hourly={hourly}
              nodeDaylightShare={nodeDaylightShare}
              hour={hour}
              currentHour={currentHour}
              activityPct={activityPct}
            />
          </div>

          {/* controls */}
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-cipher-border bg-glass-3 text-secondary hover:text-primary hover:border-cipher-yellow/40 transition-all flex-shrink-0"
            >
              {playing ? (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="3" height="9" rx="1" /><rect x="7" y="1.5" width="3" height="9" rx="1" /></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.8v8.4a.6.6 0 0 0 .92.5l6.6-4.2a.6.6 0 0 0 0-1L3.92 1.3A.6.6 0 0 0 3 1.8z" /></svg>
              )}
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
          <p className="mt-3 text-[11px] font-mono text-muted leading-relaxed">
            Outer ring = transactions per UTC hour. Inner ring = how much of the node network is in sunlight. The hand marks the live hour — right now near <span className="text-secondary">{sunRegionLabel(hour)}</span>, with daylight over <span className="text-secondary">{litRegions.join(' · ') || 'open ocean only'}</span>.
          </p>
        </div>

        {/* Thesis + the headline differentiator */}
        <div className="rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6 flex flex-col">
          <h2 className="text-base font-bold text-primary">People and plumbing don&apos;t live in the same place</h2>
          <p className="text-xs text-secondary leading-relaxed mt-2">
            A plain sun-clock guesses at users from sunlight alone. We can do better: the timing of activity hints at <em>when</em> people are awake, while the node map shows <em>where</em> the infrastructure physically sits. Lined up, they disagree — and that gap is something no sun overlay can show.
          </p>

          <div className="mt-5 space-y-4">
            {[
              { label: 'Americas', timing: regionMix.americas, geo: nodeGeoSplit.americas, color: '#5B9CF6' },
              { label: 'Europe & Africa', timing: regionMix.europe, geo: nodeGeoSplit.europe, color: '#56D4C8' },
              { label: 'Asia–Pacific', timing: regionMix.asia, geo: nodeGeoSplit.asia, color: '#E8C48D' },
            ].map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span className="text-secondary">{r.label}</span>
                  <span className="text-muted">
                    <span style={{ color: r.color }}>{Math.round(r.timing * 100)}%</span> by timing · {Math.round(r.geo * 100)}% of nodes
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-glass-3 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.timing * 100}%`, backgroundColor: r.color }} />
                </div>
                <div className="relative h-1.5 mt-1 rounded-full bg-glass-3 overflow-hidden" title="Share of nodes physically in this region">
                  <div className="absolute inset-y-0 left-0 rounded-full opacity-45" style={{ width: `${r.geo * 100}%`, backgroundColor: r.color }} />
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted leading-relaxed mt-auto pt-4">
            Thick bar: user base inferred from activity timing. Thin bar: where the nodes actually run. The biggest slice of users looks like <span className="text-secondary">{topTimingRegion}</span>, yet the nodes cluster in <span className="text-secondary">{topGeoRegion}</span>.
          </p>
        </div>
      </div>

      {/* ===================== GEOGRAPHIC PANEL (demoted) ===================== */}
      <div className="mt-6 rounded-xl border border-cipher-border overflow-hidden relative bg-cipher-bg-dark">
        <div className="px-4 py-2.5 border-b border-cipher-border/60 flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold text-secondary uppercase tracking-wider">Sun &amp; network · live</span>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cipher-yellow-bright" /> <span className="text-muted">node, lit</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cipher-yellow-bright/30" /> <span className="text-muted">node, dark</span></span>
          </div>
        </div>
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="w-full h-auto block" style={{ maxHeight: 340 }}>
          <defs>
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFD060" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#F4B728" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#F4B728" stopOpacity="0" />
            </radialGradient>
            <filter id="nodeGlow2" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {worldDots.map((d, i) => {
            const lit = isDaylight(d.lat, d.lon, hour, decl);
            return <circle key={i} cx={d.x} cy={d.y} r={DOT_RADIUS} fill={lit ? '#3f8f6a' : '#1c2a33'} opacity={lit ? 0.85 : 0.5} />;
          })}
          <path d={nightPath(hour, decl)} fill="#040d1a" opacity={0.5} />
          <circle cx={sunMarker.x} cy={sunMarker.y} r={42} fill="url(#sunGlow)" />
          <circle cx={sunMarker.x} cy={sunMarker.y} r={6} fill="#FFE08A" stroke="#F4B728" strokeWidth={1.5} />
          {[...clustered].sort((a, b) => b.nodeCount - a.nodeCount).map((n, i) => {
            const p = project(n.lat, n.lon);
            const lit = isDaylight(n.lat, n.lon, hour, decl);
            const r = Math.max(3, Math.min(10, 2.5 + Math.sqrt(n.nodeCount) * 2.2));
            return <circle key={`n${i}`} cx={p.x} cy={p.y} r={r} fill="#F4B728" opacity={lit ? 0.95 : 0.3} filter={lit ? 'url(#nodeGlow2)' : undefined} />;
          })}
        </svg>
      </div>

      {/* ===================== ANALYSIS ROW ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-8">
        {/* Correlation */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5 flex flex-col">
          <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-2">Daylight correlation</h3>
          <div className="text-4xl font-bold font-mono text-cipher-cyan">{correlation >= 0 ? '+' : ''}{correlation.toFixed(2)}</div>
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            How tightly hourly activity tracks the share of nodes in daylight. {correlation > 0.4 ? 'Strongly positive: the network gets busier as it wakes into the sun.' : correlation < -0.2 ? 'Negative: usage runs against the network\'s own daylight.' : 'Weak: timing isn\'t cleanly explained by node geography.'}
          </p>
        </div>

        {/* Residual */}
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider">The machine hours</h3>
            <div className="flex items-center gap-3 text-[9px] font-mono">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#FF6B35' }} /> <span className="text-muted">busier than people</span></span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#5B9CF6' }} /> <span className="text-muted">quieter</span></span>
            </div>
          </div>
          <p className="text-[10px] text-muted mb-2 leading-relaxed">
            We predict each hour&apos;s share of the day assuming people transact in their waking hours, in the timezones where the nodes sit. This shows <span className="text-secondary">actual minus predicted</span>. Orange hours are busier than human routine explains — when exchanges, miners and bots that run on machine time leave their mark. Hover any hour for the breakdown.
          </p>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={residualBars} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <ReferenceLine y={0} stroke="var(--color-text-muted)" strokeOpacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: 'monospace' }} stroke="var(--color-text-muted)" interval={2} tickFormatter={(l) => `${l}h`} />
                <YAxis
                  tick={{ fontSize: 9, fontFamily: 'monospace' }}
                  stroke="var(--color-text-muted)"
                  width={40}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}pt`}
                />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ResidualTooltip />} />
                <Bar dataKey="residual" radius={[2, 2, 0, 0]}>
                  {residualBars.map((d) => (
                    <Cell key={d.hour} fill={d.residual >= 0 ? '#FF6B35' : '#5B9CF6'} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ===================== HEATMAP ===================== */}
      <div className="mt-5 rounded-xl border border-cipher-border bg-cipher-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider">Seven days, twenty-four hours</h3>
          <span className="text-[10px] font-mono text-muted">brighter → busier · UTC</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[460px]">
            <div className="flex pl-9 mb-1">
              {[0, 6, 12, 18].map((h) => (
                <div key={h} className="text-[9px] font-mono text-muted" style={{ width: '25%' }}>{String(h).padStart(2, '0')}h</div>
              ))}
            </div>
            {heat.grid.map((row, ri) => (
              <div key={ri} className="flex items-center gap-1 mb-1">
                <div className="w-8 text-[9px] font-mono text-muted text-right pr-1">{DOW_LABELS[ri]}</div>
                <div className="flex gap-[2px] flex-1">
                  {row.map((v, hi) => (
                    <div
                      key={hi}
                      className="flex-1 rounded-sm"
                      style={{ height: 18, backgroundColor: heatColor(v / heat.max) }}
                      title={`${DOW_LABELS[ri]} ${String(hi).padStart(2, '0')}:00 UTC · ${fmt(v)} txs`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===================== SUMMARY ===================== */}
      <div className="mt-6 rounded-xl border border-cipher-border bg-cipher-surface p-5">
        <p className="text-sm text-secondary leading-relaxed">
          Across this window the network is busiest near{' '}
          <span className="text-primary font-bold font-mono">{String(peakH).padStart(2, '0')}:00 UTC</span> and quietest near{' '}
          <span className="text-primary font-bold font-mono">{String(lowH).padStart(2, '0')}:00 UTC</span>
          {ratio > 0 && <> — a <span className="text-primary font-bold">{ratio}×</span> swing between its loudest and softest hour</>}.
          When it peaks, the sun sits over {sunRegionLabel(peakH)}. The timing leans toward a user base in{' '}
          <span className="text-cipher-cyan font-semibold">{topTimingRegion}</span>, while the machines that carry the network mostly live in <span className="text-secondary">{topGeoRegion}</span>.
        </p>
        <p className="text-xs text-muted leading-relaxed mt-3">
          A note on what this is and isn&apos;t: these are block timestamps, so they show <em>when</em>, never <em>where</em>. Node positions map the infrastructure — frequently datacenters and VPN exits rather than living rooms — and the sun layer is pure astronomy. Put together they sketch a rhythm, not an identity. Nothing here points to a person, and that is the entire point.
        </p>
      </div>
    </div>
  );
}
