'use client';

import { useState, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PageHeader, SectionHeader, MetricCard } from '@/components/ui';
import { PageSectionNav } from '@/components/PageSectionNav';
import { Card, CardBody } from '@/components/ui/Card';
import { getChartColors } from '@/lib/chart-theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snapshot {
  date: string;
  priceUsd: number;
  realizedPrice: number;
  mvrv: number;
  sopr: number;
  nupl: number;
  marketCapUsd: number;
  realizedCapUsd: number;
  transparentRealizedCapUsd: number;
  shieldedRealizedCapUsd: number;
}

interface HistoryPoint {
  date: string;
  priceUsd: number | null;
  realizedPrice: number | null;
  mvrv: number | null;
  sopr: number | null;
  nupl: number | null;
  marketCapUsd: number | null;
  realizedCapUsd: number | null;
}

interface HodlPoint {
  date: string;
  lt1m: number;
  b1_3m: number;
  b3_6m: number;
  b6_12m: number;
  b1_2y: number;
  gt2y: number;
  total: number;
}

interface DormancyPoint {
  date: string;
  cdd: number;
  avgDormancy: number;
  spentCount: number;
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'price', label: 'Price vs Realized' },
  { id: 'mvrv', label: 'MVRV' },
  { id: 'sopr', label: 'SOPR' },
  { id: 'nupl', label: 'NUPL' },
  { id: 'hodl-waves', label: 'HODL Waves' },
  { id: 'dormancy', label: 'Dormancy' },
  { id: 'methodology', label: 'Methodology' },
] as const;

const PERIODS = ['90d', '1y', '2y', 'all'] as const;

const CHART_HEIGHT = 380;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function mvrvLabel(v: number): { text: string; color: string } {
  if (v >= 3.0) return { text: 'Extremely Overvalued', color: '#ef4444' };
  if (v >= 2.0) return { text: 'Overvalued', color: '#f97316' };
  if (v >= 1.0) return { text: 'Fair Value', color: '#22c55e' };
  if (v >= 0.5) return { text: 'Undervalued', color: '#3b82f6' };
  return { text: 'Deeply Undervalued', color: '#8b5cf6' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ValuationPage() {
  const { theme } = useTheme();
  const colors = getChartColors((theme as 'dark' | 'light') || 'dark');

  const [period, setPeriod] = useState<string>('1y');

  const { data: snapshot } = useApiQuery<Snapshot>('/api/valuation/snapshot');
  const { data: histRes, loading: histLoading } = useApiQuery<{ points: HistoryPoint[] }>(
    '/api/valuation/history', { period },
  );
  const { data: hodlRes, loading: hodlLoading } = useApiQuery<{ points: HodlPoint[] }>(
    '/api/valuation/hodl-waves', { period },
  );
  const { data: dormRes, loading: dormLoading } = useApiQuery<{ points: DormancyPoint[] }>(
    '/api/valuation/dormancy', { period },
  );
  const history = histRes?.points ?? [];
  const hodlWaves = hodlRes?.points ?? [];
  const dormancy = dormRes?.points ?? [];
  const loading = histLoading || hodlLoading || dormLoading;

  const mvrvInfo = snapshot ? mvrvLabel(snapshot.mvrv) : null;

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '8px',
    fontSize: '12px',
    color: colors.tooltipText,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="ON_CHAIN_VALUATION"
        title="Zcash Valuation Metrics"
        subtitle="Realized price, MVRV ratio, SOPR, and NUPL — derived from transparent UTXO data and shielded flow approximations."
      />

      <PageSectionNav sections={SECTIONS} ariaLabel="Valuation sections" className="mb-10" />

      {/* ─── Overview ──────────────────────────────────────────────────── */}
      <section id="overview" className="scroll-mt-36 mb-14">
        <SectionHeader label="OVERVIEW" />
        {snapshot ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <MetricCard
              label="Market Price"
              value={`$${snapshot.priceUsd.toFixed(2)}`}
            />
            <MetricCard
              label="Realized Price"
              value={`$${snapshot.realizedPrice.toFixed(2)}`}
            />
            <MetricCard
              label="MVRV Ratio"
              value={snapshot.mvrv.toFixed(3)}
            />
            <MetricCard
              label="SOPR"
              value={snapshot.sopr.toFixed(4)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-cipher-surface animate-pulse" />
            ))}
          </div>
        )}

        {snapshot && mvrvInfo && (
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <Card className="flex-1 min-w-[260px]">
              <CardBody className="flex items-center gap-4">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: mvrvInfo.color }}
                />
                <div>
                  <p className="text-sm font-medium text-cipher-text-secondary">
                    Valuation Zone
                  </p>
                  <p className="text-lg font-semibold" style={{ color: mvrvInfo.color }}>
                    {mvrvInfo.text}
                  </p>
                  <p className="text-xs text-cipher-text-muted mt-1">
                    MVRV {snapshot.mvrv.toFixed(3)} · NUPL {(snapshot.nupl * 100).toFixed(1)}%
                  </p>
                </div>
              </CardBody>
            </Card>
            <Card className="flex-1 min-w-[260px]">
              <CardBody>
                <p className="text-sm text-cipher-text-secondary">Realized Cap</p>
                <p className="text-lg font-semibold text-cipher-text-primary">
                  {fmtUsd(snapshot.realizedCapUsd)}
                </p>
                <p className="text-xs text-cipher-text-muted mt-1">
                  Transparent {fmtUsd(snapshot.transparentRealizedCapUsd)} · Shielded {fmtUsd(snapshot.shieldedRealizedCapUsd)}
                </p>
              </CardBody>
            </Card>
          </div>
        )}
      </section>

      {/* ─── Period selector (shared across all charts) ────────────── */}
      <div className="mb-8 flex items-center gap-2">
        <span className="text-xs text-cipher-text-muted font-mono mr-2">PERIOD</span>
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
              period === p
                ? 'bg-cipher-cyan/15 text-cipher-cyan border border-cipher-cyan/30'
                : 'text-cipher-text-muted hover:text-cipher-text-secondary border border-transparent'
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ─── Price vs Realized Price ───────────────────────────────── */}
      <section id="price" className="scroll-mt-36 mb-14">
        <SectionHeader label="MARKET_PRICE_VS_REALIZED_PRICE" />
        <Card className="mt-6">
          <CardBody>
            {loading ? (
              <div className="h-[380px] flex items-center justify-center text-cipher-text-muted">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={history}>
                  <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `$${v}`}
                    domain={['auto', 'auto']}
                    scale="log"
                    allowDataOverflow
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                    formatter={(v, name) => [
                      `$${Number(v)?.toFixed(2)}`,
                      name === 'priceUsd' ? 'Market Price' : 'Realized Price',
                    ]}
                  />
                  <Legend
                    formatter={v => (v === 'priceUsd' ? 'Market Price' : 'Realized Price')}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="priceUsd"
                    stroke={colors.cyan}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="realizedPrice"
                    stroke={colors.yellow}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                    strokeDasharray="6 3"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-cipher-text-muted mt-3">
          When market price is above realized price, the average holder is in profit.
          Crossovers often mark cycle transitions.
        </p>
      </section>

      {/* ─── MVRV Ratio ────────────────────────────────────────────── */}
      <section id="mvrv" className="scroll-mt-36 mb-14">
        <SectionHeader label="MVRV_RATIO" />
        <Card className="mt-6">
          <CardBody>
            {loading ? (
              <div className="h-[380px] flex items-center justify-center text-cipher-text-muted">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={history}>
                  <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                    formatter={(v) => [Number(v)?.toFixed(3), 'MVRV']}
                  />
                  <ReferenceLine y={1} stroke={colors.referenceLine} strokeDasharray="4 4" label={{ value: 'Fair Value (1.0)', fill: colors.axis, fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="mvrv"
                    stroke={colors.cyan}
                    fill={`${colors.cyan}15`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-cipher-text-muted mt-3">
          MVRV = Market Cap / Realized Cap. Above 1.0 means the average holder is in profit.
          Extreme values (above 3 or below 0.5) historically signal over/undervaluation.
        </p>
      </section>

      {/* ─── SOPR ──────────────────────────────────────────────────── */}
      <section id="sopr" className="scroll-mt-36 mb-14">
        <SectionHeader label="SOPR" />
        <Card className="mt-6">
          <CardBody>
            {loading ? (
              <div className="h-[380px] flex items-center justify-center text-cipher-text-muted">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={history}>
                  <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                    formatter={(v) => [Number(v)?.toFixed(4), 'SOPR']}
                  />
                  <ReferenceLine y={1} stroke={colors.referenceLine} strokeDasharray="4 4" label={{ value: 'Break-even (1.0)', fill: colors.axis, fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="sopr"
                    stroke="#34D399"
                    fill="rgba(52,211,153,0.1)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-cipher-text-muted mt-3">
          Spent Output Profit Ratio. Above 1.0 means coins are moving at a profit on average;
          below 1.0 means at a loss. Sustained SOPR below 1 signals capitulation.
        </p>
      </section>

      {/* ─── NUPL ──────────────────────────────────────────────────── */}
      <section id="nupl" className="scroll-mt-36 mb-14">
        <SectionHeader label="NUPL" />
        <Card className="mt-6">
          <CardBody>
            {loading ? (
              <div className="h-[380px] flex items-center justify-center text-cipher-text-muted">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={history}>
                  <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                    formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, 'NUPL']}
                  />
                  <ReferenceLine y={0} stroke={colors.referenceLine} strokeDasharray="4 4" label={{ value: 'Break-even', fill: colors.axis, fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="nupl"
                    stroke="#A78BFA"
                    fill="rgba(167,139,250,0.1)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-cipher-text-muted mt-3">
          Net Unrealized Profit/Loss. Positive means the network is in aggregate profit.
          Extreme positive values signal euphoria; negative values signal capitulation.
        </p>
      </section>

      {/* ─── HODL Waves ──────────────────────────────────────────── */}
      <section id="hodl-waves" className="scroll-mt-36 mb-14">
        <SectionHeader label="HODL_WAVES" />
        <Card className="mt-6">
          <CardBody>
            {loading || hodlWaves.length === 0 ? (
              <div className="h-[380px] flex items-center justify-center text-cipher-text-muted">
                {loading ? 'Loading...' : 'HODL wave data not yet available. Run compute-utxo-age.js to populate.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={hodlWaves}>
                  <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${(v / 1e6).toFixed(1)}M`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                    formatter={(v, name) => {
                      const labels: Record<string, string> = {
                        lt1m: '< 1 month',
                        b1_3m: '1–3 months',
                        b3_6m: '3–6 months',
                        b6_12m: '6–12 months',
                        b1_2y: '1–2 years',
                        gt2y: '2+ years',
                      };
                      return [`${Number(v).toLocaleString()} ZEC`, labels[String(name)] || String(name)];
                    }}
                  />
                  <Legend
                    formatter={v => {
                      const labels: Record<string, string> = {
                        lt1m: '< 1m',
                        b1_3m: '1–3m',
                        b3_6m: '3–6m',
                        b6_12m: '6–12m',
                        b1_2y: '1–2y',
                        gt2y: '2y+',
                      };
                      return labels[v] || v;
                    }}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="gt2y" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="b1_2y" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="b6_12m" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.6} />
                  <Area type="monotone" dataKey="b3_6m" stackId="1" stroke="#56D4C8" fill="#56D4C8" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="b1_3m" stackId="1" stroke="#34d399" fill="#34d399" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="lt1m" stackId="1" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.5} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-cipher-text-muted mt-3">
          Distribution of unspent transparent ZEC by age of the UTXO.
          Growing older bands indicate long-term holding; growing younger bands indicate fresh activity.
          Transparent pool only — shielded note ages are not publicly visible.
        </p>
      </section>

      {/* ─── Dormancy / CDD ────────────────────────────────────────── */}
      <section id="dormancy" className="scroll-mt-36 mb-14">
        <SectionHeader label="COIN_DAYS_DESTROYED" />
        <Card className="mt-6">
          <CardBody>
            {loading || dormancy.length === 0 ? (
              <div className="h-[380px] flex items-center justify-center text-cipher-text-muted">
                {loading ? 'Loading...' : 'Dormancy data not yet available. Run compute-utxo-age.js to populate.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={dormancy}>
                  <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="cdd"
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)}
                  />
                  <YAxis
                    yAxisId="dormancy"
                    orientation="right"
                    tick={{ fill: colors.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${Number(v).toFixed(0)}d`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={d => new Date(d).toLocaleDateString()}
                    formatter={(v, name) => {
                      if (name === 'cdd') return [Number(v).toLocaleString(), 'Coin Days Destroyed'];
                      return [`${Number(v).toFixed(1)} days`, 'Avg Dormancy'];
                    }}
                  />
                  <Legend
                    formatter={v => v === 'cdd' ? 'Coin Days Destroyed' : 'Avg Dormancy'}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Area
                    yAxisId="cdd"
                    type="monotone"
                    dataKey="cdd"
                    stroke={colors.cyan}
                    fill={`${colors.cyan}15`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="dormancy"
                    type="monotone"
                    dataKey="avgDormancy"
                    stroke="#E8C48D"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls
                    strokeDasharray="4 3"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
        <p className="text-xs text-cipher-text-muted mt-3">
          Coin Days Destroyed measures the total age of coins moved on a given day (value × days held).
          Spikes indicate old coins moving — often a sign of long-term holders selling.
          Transparent pool only.
        </p>
      </section>

      {/* ─── Methodology ───────────────────────────────────────────── */}
      <section id="methodology" className="scroll-mt-36 mb-14">
        <SectionHeader label="METHODOLOGY" />
        <Card className="mt-6">
          <CardBody className="prose prose-sm prose-invert max-w-none">
            <h3 className="text-cipher-text-primary text-base font-semibold mb-3">
              How these metrics are calculated
            </h3>
            <div className="space-y-4 text-sm text-cipher-text-secondary leading-relaxed">
              <div>
                <p className="font-medium text-cipher-text-primary">Realized Price &amp; Realized Cap</p>
                <p>
                  Each transparent UTXO is valued at the ZEC price on the day it was created
                  (i.e., last moved on-chain). This is the standard methodology used by
                  CoinMetrics, Glassnode, and all major on-chain analytics platforms — a
                  transparent move resets the cost basis because it represents a new economic
                  event. The sum of all UTXOs valued this way gives the transparent realized cap.
                </p>
                <p className="mt-2">
                  Shielded pools (Sapling, Orchard, Ironwood) use actual pool entry dates:
                  each shield/deshield event is priced at the day it occurred, accumulated into
                  a per-pool running cost basis. This is more granular than the CoinMetrics
                  approach, which scales a single average price to all shielded supply.
                </p>
                <p className="mt-2 text-cipher-text-muted">
                  Note: Other Zcash explorers may use alternative approaches (e.g., tracing
                  transparent UTXOs back to their original mining or deshielding event and not
                  repricing on subsequent transparent moves). This produces a lower realized cap
                  figure. Neither method is incorrect — they reflect different definitions of
                  &quot;cost basis.&quot; CipherScan follows the industry-standard UTXO creation
                  date method for cross-chain comparability.
                </p>
              </div>
              <div>
                <p className="font-medium text-cipher-text-primary">MVRV (Market Value to Realized Value)</p>
                <p>
                  Market cap divided by realized cap. Values above 1.0 imply the average coin
                  holder is in profit; below 1.0 implies aggregate loss. Historically, extreme
                  MVRV values have coincided with cycle tops and bottoms.
                </p>
              </div>
              <div>
                <p className="font-medium text-cipher-text-primary">SOPR (Spent Output Profit Ratio)</p>
                <p>
                  For each transparent UTXO spent on a given day, SOPR = current price / price at
                  creation. Averaged over all spent outputs. Above 1.0 means coins are moving in
                  profit; below 1.0 means at a loss.
                </p>
              </div>
              <div>
                <p className="font-medium text-cipher-text-primary">NUPL (Net Unrealized Profit/Loss)</p>
                <p>
                  (Market Cap − Realized Cap) / Market Cap. Ranges from -1 to 1. Positive values
                  mean the network holds unrealized profit; negative means unrealized loss.
                </p>
              </div>
              <div>
                <p className="font-medium text-cipher-text-primary">HODL Waves</p>
                <p>
                  Transparent UTXOs are bucketed by age (&lt;1m, 1–3m, 3–6m, 6–12m, 1–2y, 2y+)
                  based on the time since the output was created. Each bucket shows the total
                  ZEC held in UTXOs of that age, stacked to show the full transparent supply.
                </p>
              </div>
              <div>
                <p className="font-medium text-cipher-text-primary">Coin Days Destroyed (CDD)</p>
                <p>
                  For each transparent UTXO spent on a given day, CDD = (ZEC value) × (days
                  since creation). High CDD indicates old coins moving, which historically
                  correlates with distribution phases by long-term holders.
                </p>
              </div>
              <div className="border-t border-cipher-border/30 pt-4">
                <p className="text-xs text-cipher-text-muted">
                  HODL waves and dormancy cover the transparent pool only. Shielded note ages
                  are not publicly visible. Shielded pool realized cap uses actual pool entry
                  dates (not scaled from transparent average). Transparent UTXO data is fully
                  backfilled from genesis. Data updates daily.
                </p>
                <p className="text-xs text-cipher-text-muted mt-2">
                  Transparent realized cap methodology: UTXO creation date pricing (CoinMetrics
                  standard). ~27.5M unspent UTXOs holding ~12.4M ZEC are priced individually.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
