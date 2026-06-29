'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

type Category = 'all' | 'privacy' | 'mining' | 'pools' | 'network' | 'fees';

interface MiniChartData {
  [key: string]: number | string;
}

interface ChartEntry {
  id: string;
  title: string;
  description: string;
  category: Category;
  href: string;
  isNew?: boolean;
}

const CHART_DEFS: ChartEntry[] = [
  { id: 'privacy-adoption', title: 'Shielded Tx Adoption', description: 'Daily shielded transaction share (%)', category: 'privacy', href: '/privacy' },
  { id: 'pool-growth', title: 'Shielded Pool Growth', description: 'Total ZEC in shielded pools over time', category: 'privacy', href: '/privacy' },
  { id: 'daily-activity', title: 'Daily Activity', description: 'Shielded vs transparent transaction counts', category: 'privacy', href: '/privacy' },
  { id: 'anonymity-set', title: 'Anonymity Set', description: 'How many txs could be your source at each amount', category: 'privacy', href: '/privacy', isNew: true },
  { id: 'shielding-dist', title: 'Shielding Distribution', description: 'Shield/deshield histogram by amount bucket', category: 'privacy', href: '/privacy', isNew: true },
  { id: 'privacy-risks', title: 'Privacy Risk Scanner', description: 'Round-trip and batch pattern detection', category: 'privacy', href: '/privacy-risks' },
  { id: 'pool-balances', title: 'Pool Balances', description: 'Sprout, Sapling, Orchard pool sizes over time', category: 'pools', href: '/pools' },
  { id: 'flow-volume', title: 'Shield/Deshield Flows', description: 'Daily ZEC flowing in/out of shielded pools', category: 'pools', href: '/pools' },
  { id: 'turnstile', title: 'Turnstile Tracker', description: 'Where deshielded ZEC goes after leaving pools', category: 'pools', href: '/turnstile' },
  { id: 'mining-dist', title: 'Pool Distribution', description: 'Mining pool block share', category: 'mining', href: '/mining' },
  { id: 'hashrate-share', title: 'Hashrate Share', description: 'Per-pool network share over time', category: 'mining', href: '/mining' },
  { id: 'miner-behavior', title: 'Miner Behavior', description: 'Block rewards: earned vs moved vs held', category: 'mining', href: '/mining' },
  { id: 'mining-metrics', title: 'Mining Metrics', description: 'Solrate, difficulty, block time (rolling avg)', category: 'mining', href: '/mining' },
  { id: 'supply-emission', title: 'Supply Emission', description: 'ZEC circulating supply toward 21M cap', category: 'network', href: '/network' },
  { id: 'chain-size', title: 'Chain Size', description: 'Blockchain disk size growth (GB)', category: 'network', href: '/network' },
  { id: 'protocol-stats', title: 'Protocol Stats', description: 'Monthly Sapling/Orchard commitments & nullifiers', category: 'network', href: '/network' },
  { id: 'node-map', title: 'Node Map', description: 'Geographic Zcash node distribution', category: 'network', href: '/network' },
  { id: 'mempool', title: 'Mempool Bubbles', description: 'Live unconfirmed transactions (physics sim)', category: 'network', href: '/mempool' },
  { id: 'fee-dist', title: 'Fee Distribution', description: 'Daily fee percentile bands (p10–p90)', category: 'fees', href: '/network', isNew: true },
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'pools', label: 'Pools' },
  { key: 'mining', label: 'Mining' },
  { key: 'network', label: 'Network' },
  { key: 'fees', label: 'Fees' },
];

const CATEGORY_ACCENT: Record<string, string> = {
  privacy: '#a78bfa',
  pools: '#56D4C8',
  mining: '#E8C48D',
  network: '#5B9CF6',
  fees: '#f97316',
};

function formatCompact(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  if (val >= 100) return Math.round(val).toString();
  if (val >= 1) return val.toFixed(1);
  if (val === 0) return '0';
  return val.toFixed(2);
}

function MiniChart({ data, dataKey, color, type = 'line' }: {
  data: MiniChartData[];
  dataKey: string;
  color: string;
  type?: 'line' | 'area' | 'bar';
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[10px] text-muted/30 font-mono">
        No data
      </div>
    );
  }

  const margin = { top: 8, right: 8, bottom: 20, left: 36 };

  const xAxisProps = {
    dataKey: 'label',
    tick: { fontSize: 9, fill: '#64748b' },
    tickLine: false,
    axisLine: { stroke: '#1e293b' },
    interval: ('preserveStartEnd' as const),
  };

  const yAxisProps = {
    tick: { fontSize: 9, fill: '#64748b' },
    tickLine: false,
    axisLine: false,
    tickFormatter: formatCompact,
    width: 32,
  };

  const tooltipProps = {
    contentStyle: {
      backgroundColor: '#0f1419',
      border: '1px solid #1e293b',
      borderRadius: 6,
      fontSize: 11,
      fontFamily: 'monospace',
      padding: '6px 10px',
    },
    labelStyle: { color: '#94a3b8', fontSize: 10, marginBottom: 2 },
    itemStyle: { color: '#e2e8f0', padding: 0 },
    cursor: { stroke: '#374151', strokeWidth: 1 },
  };

  const gridProps = {
    strokeDasharray: '3 3',
    stroke: '#1e293b',
    vertical: false,
  };

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={margin}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey={dataKey} fill={color} opacity={0.8} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'area') {
    const gradId = `grad-${dataKey}-${color.replace('#', '')}`;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={margin}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip {...tooltipProps} />
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        <CartesianGrid {...gridProps} />
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip {...tooltipProps} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: color }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartGridCard({ chart, chartData, accent }: { chart: ChartEntry; chartData: MiniChartData[] | null; accent: string }) {
  const chartConfig = getChartConfig(chart.id);

  return (
    <Link
      href={chart.href}
      className="group block rounded-xl border border-cipher-border/40 bg-card overflow-hidden transition-all duration-200 hover:border-white/15 hover:shadow-lg hover:shadow-black/10"
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[11px] font-bold font-mono text-secondary group-hover:text-primary transition-colors uppercase tracking-wider truncate">
            {chart.title}
          </h3>
          {chart.isNew && (
            <span className="px-1 py-0.5 rounded text-[8px] font-mono font-bold bg-cipher-green/10 text-cipher-green uppercase flex-shrink-0">
              New
            </span>
          )}
        </div>
        <span className="text-[9px] text-muted/40 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          open →
        </span>
      </div>
      <div className="h-[180px] px-2 pb-3">
        <MiniChart
          data={chartData || []}
          dataKey={chartConfig.dataKey}
          color={accent}
          type={chartConfig.type}
        />
      </div>
      <div className="px-4 pb-3 border-t border-cipher-border/20 pt-2">
        <p className="text-[10px] text-muted leading-relaxed line-clamp-1">
          {chart.description}
        </p>
      </div>
    </Link>
  );
}

function getChartConfig(id: string): { dataKey: string; type: 'line' | 'area' | 'bar' } {
  switch (id) {
    case 'privacy-adoption': return { dataKey: 'shieldedPct', type: 'line' };
    case 'pool-growth': return { dataKey: 'totalShielded', type: 'area' };
    case 'daily-activity': return { dataKey: 'shielded', type: 'bar' };
    case 'anonymity-set': return { dataKey: 'shieldCount', type: 'bar' };
    case 'shielding-dist': return { dataKey: 'count', type: 'bar' };
    case 'pool-balances': return { dataKey: 'orchard', type: 'area' };
    case 'flow-volume': return { dataKey: 'netFlow', type: 'bar' };
    case 'turnstile': return { dataKey: 'held', type: 'area' };
    case 'mining-dist': return { dataKey: 'blocks', type: 'bar' };
    case 'hashrate-share': return { dataKey: 'share', type: 'area' };
    case 'miner-behavior': return { dataKey: 'earned', type: 'bar' };
    case 'mining-metrics': return { dataKey: 'value', type: 'line' };
    case 'supply-emission': return { dataKey: 'supply', type: 'area' };
    case 'chain-size': return { dataKey: 'sizeGb', type: 'line' };
    case 'protocol-stats': return { dataKey: 'commitments', type: 'area' };
    case 'fee-dist': return { dataKey: 'median', type: 'line' };
    default: return { dataKey: 'value', type: 'line' };
  }
}

export function ChartsClient({ initialData }: { initialData: Record<string, MiniChartData[]> }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');

  const filtered = useMemo(() => {
    let results = CHART_DEFS;
    if (category !== 'all') {
      results = results.filter(c => c.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    return results;
  }, [search, category]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: CHART_DEFS.length };
    CHART_DEFS.forEach(c => { map[c.category] = (map[c.category] || 0) + 1; });
    return map;
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> CHARTS
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          Charts & Analytics
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          Every on-chain metric we track. Click any chart to explore the full interactive version.
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search charts..."
            className="w-full pl-10 pr-4 py-2 text-sm font-mono bg-glass-3 border border-cipher-border rounded-lg text-primary placeholder:text-muted/60 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
        <div className="inline-flex gap-0 p-0.5 rounded-lg bg-glass-3 overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 text-[11px] font-mono rounded-md transition-all whitespace-nowrap ${
                category === cat.key
                  ? 'bg-white/5 text-primary font-bold border border-white/10'
                  : 'text-muted hover:text-secondary border border-transparent'
              }`}
            >
              {cat.label}
              <span className="ml-1 opacity-40">{counts[cat.key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Grid */}
      {category === 'all' && !search.trim() ? (
        <div className="space-y-12">
          {(['privacy', 'pools', 'mining', 'network', 'fees'] as Category[]).map(cat => {
            const catCharts = CHART_DEFS.filter(c => c.category === cat);
            if (catCharts.length === 0) return null;
            return (
              <section key={cat}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_ACCENT[cat] }} />
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                    {cat}
                  </h2>
                  <div className="flex-1 h-px bg-cipher-border/30" />
                  <span className="text-[10px] text-muted font-mono">{catCharts.length} charts</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catCharts.map(chart => (
                    <ChartGridCard
                      key={chart.id}
                      chart={chart}
                      chartData={initialData[chart.id] || null}
                      accent={CATEGORY_ACCENT[cat] || '#64748b'}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(chart => (
            <ChartGridCard
              key={chart.id}
              chart={chart}
              chartData={initialData[chart.id] || null}
              accent={CATEGORY_ACCENT[chart.category] || '#64748b'}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="mt-12 py-16 text-center rounded-xl border border-cipher-border/30 bg-card">
          <p className="text-secondary text-sm">No charts matching &ldquo;{search}&rdquo;</p>
          <button
            onClick={() => { setSearch(''); setCategory('all'); }}
            className="mt-3 text-xs font-mono text-secondary hover:text-primary transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="mt-14 text-center">
        <p className="text-[10px] text-muted/50 font-mono">
          Data refreshes every 5 minutes. Click any chart for the full interactive version with period selectors and legends.
        </p>
      </div>
    </div>
  );
}
