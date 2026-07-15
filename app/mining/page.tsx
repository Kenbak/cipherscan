'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { Card, CardBody } from '@/components/ui/Card';
import { ChartCard } from '@/components/network/ChartCard';
import { PageSectionNav } from '@/components/PageSectionNav';
import { MiningMetricsChart } from '@/components/network/MiningMetricsChart';

const SECTIONS = [
  { id: 'metrics', label: 'Network' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'hashrate', label: 'Hashrate Share' },
  { id: 'behavior', label: 'Miner Behavior' },
] as const;

const PERIODS = ['24h', '3d', '7d', '30d', '90d', '1y'] as const;
type Period = typeof PERIODS[number];

const POOL_COLORS = [
  '#56D4C8', '#E8C48D', '#22c55e', '#a78bfa', '#f59e0b',
  '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#64748b',
  '#84cc16', '#f97316',
];

interface PoolDist {
  address: string;
  name: string;
  blocks: number;
  share: number;
  totalFeesZat: string;
}

interface PoolRank {
  rank: number;
  address: string;
  name: string;
  url: string | null;
  region: string | null;
  blocks: number;
  share: number;
  totalFeesZat: string;
  avgBlockInterval: number | null;
}

interface HashratePoint {
  date: string;
  totalBlocks: number;
  pools: Record<string, number>;
}

interface BehaviorPoint {
  date: string;
  earnedZat: string;
  spentZat: string;
  heldZat: string;
  sellRatio: number;
}

interface BehaviorSummary {
  totalEarnedZat: string;
  totalSpentZat: string;
  totalHeldZat: string;
  overallSellRatio: number;
}

function formatZec(zatStr: string | number): string {
  const zat = typeof zatStr === 'string' ? parseInt(zatStr) : zatStr;
  if (isNaN(zat)) return '0';
  const zec = zat / 1e8;
  if (zec >= 1000) return `${(zec / 1000).toFixed(1)}K`;
  if (zec >= 1) return zec.toFixed(2);
  return zec.toFixed(4);
}

function formatPct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="inline-flex gap-0 p-0.5 rounded-md bg-glass-3 flex-shrink-0">
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all whitespace-nowrap ${
            value === p
              ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold'
              : 'text-muted hover:text-primary'
          }`}
        >
          {p.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function DistributionSection() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<PoolDist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/mining/pool-distribution?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.pools) {
          setData(res.pools);
          setTotal(res.totalBlocks);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  // For pie chart: group smaller pools into "Other"
  const threshold = 0.02;
  const mainPools = data.filter(p => p.share >= threshold);
  const otherBlocks = data.filter(p => p.share < threshold).reduce((s, p) => s + p.blocks, 0);
  const pieData = [
    ...mainPools.map(p => ({ name: p.name, value: p.blocks })),
    ...(otherBlocks > 0 ? [{ name: 'Other', value: otherBlocks }] : []),
  ];

  return (
    <section id="distribution" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
      <ChartCard
        title="MINING_POOL_DISTRIBUTION"
        height={360}
        controls={<PeriodSelector value={period} onChange={setPeriod} />}
      >
        {loading ? (
          <div className="flex items-center justify-center h-[360px]">
            <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={130}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={POOL_COLORS[idx % POOL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.tooltipBg,
                    border: `1px solid ${colors.tooltipBorder}`,
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: colors.tooltipText,
                  }}
                  itemStyle={{ color: colors.tooltipText }}
                  labelStyle={{ color: colors.tooltipText }}
                  formatter={(value, name) => [
                    `${value} blocks (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-2">
              <p className="text-xs text-muted font-mono mb-3">
                {total.toLocaleString()} blocks mined in {period}
              </p>
              {pieData.map((p, idx) => (
                <div key={p.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: POOL_COLORS[idx % POOL_COLORS.length] }}
                  />
                  <span className="text-xs font-mono text-primary flex-1 truncate">{p.name}</span>
                  <span className="text-xs font-mono text-muted tabular-nums">
                    {total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%
                  </span>
                  <span className="text-[10px] font-mono text-muted tabular-nums">
                    {p.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>
    </section>
  );
}

function RankingSection() {
  const [period, setPeriod] = useState<Period>('7d');
  const [ranking, setRanking] = useState<PoolRank[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/mining/pool-ranking?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.ranking) {
          setRanking(res.ranking);
          setTotal(res.totalBlocks);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  return (
    <section id="ranking" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
      <Card>
        <CardBody>
          <div className="flex items-start sm:items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-xs sm:text-sm font-bold font-mono text-secondary uppercase tracking-wider">POOL_RANKING</h2>
            </div>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 skeleton-bg rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted text-[10px] uppercase tracking-wider border-b border-glass-4">
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Pool</th>
                    <th className="text-right py-2 pr-3">Blocks</th>
                    <th className="text-right py-2 pr-3">Share</th>
                    <th className="text-right py-2 pr-3 hidden sm:table-cell">Avg Interval</th>
                    <th className="text-right py-2 hidden md:table-cell">Total Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((pool) => (
                    <tr key={pool.address} className="border-t border-glass-4 hover:bg-glass-3 transition-colors">
                      <td className="py-2.5 pr-3 text-muted">{pool.rank}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: POOL_COLORS[(pool.rank - 1) % POOL_COLORS.length] }}
                          />
                          <span className="text-primary font-medium">{pool.name}</span>
                          {pool.region && (
                            <span className="text-[9px] text-muted px-1 py-0.5 bg-glass-3 rounded">{pool.region}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-primary">
                        {pool.blocks.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-glass-3 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(pool.share * 100, 100)}%`,
                                backgroundColor: POOL_COLORS[(pool.rank - 1) % POOL_COLORS.length],
                              }}
                            />
                          </div>
                          <span className="tabular-nums text-primary">{formatPct(pool.share)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted hidden sm:table-cell">
                        {pool.avgBlockInterval ? `${Math.round(pool.avgBlockInterval)}s` : '—'}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted hidden md:table-cell">
                        {formatZec(pool.totalFeesZat)} ZEC
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-muted font-mono mt-3">
                {total.toLocaleString()} total blocks in {period}
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </section>
  );
}

type ChartMode = 'line' | 'area';

function ChartModeToggle({ mode, onChange }: { mode: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-glass-3 rounded-md p-0.5">
      <button
        onClick={() => onChange('line')}
        className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${
          mode === 'line'
            ? 'bg-accent/20 text-accent font-bold'
            : 'text-muted hover:text-secondary'
        }`}
      >
        Line
      </button>
      <button
        onClick={() => onChange('area')}
        className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${
          mode === 'area'
            ? 'bg-accent/20 text-accent font-bold'
            : 'text-muted hover:text-secondary'
        }`}
      >
        Area
      </button>
    </div>
  );
}

function HashrateShareSection() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [series, setSeries] = useState<HashratePoint[]>([]);
  const [allPools, setAllPools] = useState<string[]>([]);
  const [hiddenPools, setHiddenPools] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/mining/hashrate-share?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.series) {
          setSeries(res.series);
          setAllPools(res.allPools || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const poolOrder = [...allPools].sort((a, b) => {
    const aTotal = series.reduce((s, p) => s + (p.pools[a] || 0), 0);
    const bTotal = series.reduce((s, p) => s + (p.pools[b] || 0), 0);
    return bTotal - aTotal;
  });

  const visiblePools = poolOrder.filter(p => !hiddenPools.has(p));

  const chartData = series.map(point => {
    const entry: Record<string, string | number> = { date: point.date };
    for (const pool of poolOrder) {
      entry[pool] = ((point.pools[pool] || 0) * 100);
    }
    return entry;
  });

  const togglePool = (pool: string) => {
    setHiddenPools(prev => {
      const next = new Set(prev);
      if (next.has(pool)) next.delete(pool);
      else next.add(pool);
      return next;
    });
  };

  const chartControls = (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <ChartModeToggle mode={chartMode} onChange={setChartMode} />
      <PeriodSelector value={period} onChange={setPeriod} />
    </div>
  );

  const cursorStyle = { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.1)' };

  return (
    <section id="hashrate" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
      <ChartCard
        title="POOL_NETWORK_BLOCK_SHARE"
        height={380}
        controls={chartControls}
      >
        {loading ? (
          <div className="flex items-center justify-center h-[380px]">
            <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
          </div>
        ) : chartMode === 'area' ? (
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="date"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                domain={[0, 100]}
              />
              <Tooltip
                cursor={cursorStyle}
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
                itemStyle={{ color: colors.tooltipText }}
                labelStyle={{ color: colors.tooltipText, marginBottom: 4 }}
                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                labelFormatter={(label) => String(label)}
              />
              {visiblePools.map((pool) => {
                const idx = poolOrder.indexOf(pool);
                return (
                  <Area
                    key={pool}
                    type="monotone"
                    dataKey={pool}
                    stackId="1"
                    fill={POOL_COLORS[idx % POOL_COLORS.length]}
                    stroke={POOL_COLORS[idx % POOL_COLORS.length]}
                    fillOpacity={0.7}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="date"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                domain={[0, 'auto']}
              />
              <Tooltip
                cursor={cursorStyle}
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
                itemStyle={{ color: colors.tooltipText }}
                labelStyle={{ color: colors.tooltipText, marginBottom: 4 }}
                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                labelFormatter={(label) => String(label)}
              />
              {visiblePools.map((pool) => {
                const idx = poolOrder.indexOf(pool);
                return (
                  <Line
                    key={pool}
                    type="monotone"
                    dataKey={pool}
                    stroke={POOL_COLORS[idx % POOL_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Clickable legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 px-1">
          {poolOrder.map((pool, idx) => {
            const isHidden = hiddenPools.has(pool);
            return (
              <button
                key={pool}
                onClick={() => togglePool(pool)}
                className={`flex items-center gap-1.5 text-[10px] font-mono transition-opacity ${
                  isHidden ? 'opacity-30' : 'opacity-100'
                } hover:opacity-80`}
              >
                <span
                  className="w-3 h-[3px] rounded-full inline-block"
                  style={{
                    backgroundColor: POOL_COLORS[idx % POOL_COLORS.length],
                    opacity: isHidden ? 0.3 : 1,
                  }}
                />
                <span className={isHidden ? 'text-muted line-through' : 'text-secondary'}>
                  {pool}
                </span>
              </button>
            );
          })}
        </div>
      </ChartCard>
    </section>
  );
}

function MinerBehaviorSection() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('90d');
  const [series, setSeries] = useState<BehaviorPoint[]>([]);
  const [summary, setSummary] = useState<BehaviorSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/mining/miner-behavior?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res) {
          setSeries(res.series || []);
          setSummary(res.summary || null);
          setMessage(res.message || null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const chartData = series.map(p => ({
    date: p.date,
    earned: parseInt(p.earnedZat) / 1e8,
    spent: parseInt(p.spentZat) / 1e8,
    held: parseInt(p.heldZat) / 1e8,
    sellRatio: p.sellRatio * 100,
  }));

  return (
    <section id="behavior" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-sans text-primary">Miner Behavior</h2>
          </div>
          <Link
            href="/zodl"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cipher-border bg-glass-3 text-[11px] font-mono text-secondary hover:text-primary hover:border-cipher-yellow/40 transition-all"
          >
            ZODL leaderboard
            <span className="opacity-60">→</span>
          </Link>
        </div>
        <p className="text-xs text-secondary mt-1 font-sans">
          How much of their block rewards miners move vs hold. A high sell ratio means miners are liquidating quickly;
          a low ratio means they&apos;re accumulating. But &ldquo;moved&rdquo; isn&apos;t the same as &ldquo;sold&rdquo; — the{' '}
          <Link href="/zodl" className="text-cipher-cyan hover:underline">ZODL leaderboard</Link> breaks each pool&apos;s spending down by destination (shielded vs. exchange vs. transparent), and most of it turns out to be shielding, not selling.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardBody className="py-3">
              <p className="text-[10px] font-mono text-muted uppercase mb-1">Total Earned</p>
              <p className="text-lg font-bold font-mono tabular-nums text-primary">
                {formatZec(summary.totalEarnedZat)} ZEC
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <p className="text-[10px] font-mono text-muted uppercase mb-1">Total Moved</p>
              <p className="text-lg font-bold font-mono tabular-nums text-cipher-orange">
                {formatZec(summary.totalSpentZat)} ZEC
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <p className="text-[10px] font-mono text-muted uppercase mb-1">Still Held</p>
              <p className="text-lg font-bold font-mono tabular-nums text-cipher-green">
                {formatZec(summary.totalHeldZat)} ZEC
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <p className="text-[10px] font-mono text-muted uppercase mb-1">Sell Ratio</p>
              <p className="text-lg font-bold font-mono tabular-nums text-primary">
                {(summary.overallSellRatio * 100).toFixed(1)}%
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      <ChartCard
        title="MINER_EARNED_VS_MOVED"
        height={320}
        controls={<PeriodSelector value={period} onChange={setPeriod} />}
      >
        {loading ? (
          <div className="flex items-center justify-center h-[320px]">
            <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
          </div>
        ) : message ? (
          <div className="flex items-center justify-center h-[320px]">
            <div className="text-center">
              <p className="text-sm text-muted font-mono">{message}</p>
              <p className="text-[10px] text-muted mt-2">Run the snapshot job to populate this data.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="date"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}`}
                label={{ value: 'ZEC', angle: -90, position: 'insideLeft', fill: colors.axis, fontSize: 10 }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
                itemStyle={{ color: colors.tooltipText }}
                labelStyle={{ color: colors.tooltipText, marginBottom: 4 }}
                formatter={(value, name) => {
                  const label = name === 'earned' ? 'Earned' : name === 'spent' ? 'Moved/Sold' : 'Held';
                  return [`${Number(value).toFixed(2)} ZEC`, label];
                }}
                labelFormatter={(label) => String(label)}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                formatter={(value) => value === 'earned' ? 'Earned' : value === 'spent' ? 'Moved/Sold' : 'Held'}
              />
              <Bar dataKey="earned" fill={colors.cyan} fillOpacity={0.3} stroke={colors.cyan} />
              <Bar dataKey="spent" fill="#f59e0b" fillOpacity={0.7} />
              <Bar dataKey="held" fill={colors.orchard} fillOpacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </section>
  );
}

export default function MiningPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 overflow-x-hidden">
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> MINING
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary font-sans">Zcash Mining</h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl font-sans">
          Hashrate, difficulty, block economics, pool distribution, and miner behavior.
        </p>
      </div>

      <PageSectionNav sections={SECTIONS} ariaLabel="Mining pool sections" />

      <section id="metrics" className="scroll-mt-36 mb-12 animate-fade-in-up">
        <MiningMetricsChart />
      </section>

      <DistributionSection />
      <RankingSection />
      <HashrateShareSection />
      <MinerBehaviorSection />

      <section className="max-w-3xl pb-12">
        <div className="border-t border-cipher-border pt-8">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Mining Pool Data
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash is secured by Equihash proof-of-work mining with a 75-second block target.
              Pool attribution is derived from coinbase transaction payout addresses. A single
              pool may use multiple addresses; unknown addresses are labeled by region when
              identifiable through peer analysis.
            </p>
            <p>
              Miner behavior tracks whether coinbase outputs (block rewards) have been spent
              or remain unspent. A high sell ratio indicates miners are liquidating rewards
              quickly, while a low ratio suggests accumulation strategies.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
