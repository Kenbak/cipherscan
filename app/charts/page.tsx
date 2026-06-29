'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';

type Category = 'all' | 'privacy' | 'mining' | 'pools' | 'network' | 'fees' | 'market';

interface ChartEntry {
  title: string;
  description: string;
  category: Category;
  href: string;
  tags: string[];
  isNew?: boolean;
}

const CHARTS: ChartEntry[] = [
  // Privacy
  {
    title: 'Privacy Score',
    description: 'Composite score (0–100) from tx adoption, fully shielded usage, and pool size.',
    category: 'privacy',
    href: '/privacy',
    tags: ['score', 'adoption', 'health'],
  },
  {
    title: 'Shielded Tx Adoption',
    description: 'Daily share of non-coinbase transactions that touch Sapling or Orchard.',
    category: 'privacy',
    href: '/privacy',
    tags: ['adoption', 'shielded', 'percentage', 'daily'],
  },
  {
    title: 'Daily Activity (Shielded vs Transparent)',
    description: 'Raw count of shielded vs transparent transactions per day.',
    category: 'privacy',
    href: '/privacy',
    tags: ['transactions', 'daily', 'shielded', 'transparent'],
  },
  {
    title: 'Anonymity Set',
    description: 'How many transactions could be your source at each ZEC threshold. Higher = better privacy.',
    category: 'privacy',
    href: '/privacy',
    tags: ['anonymity', 'crowd', 'threshold', 'amount'],
    isNew: true,
  },
  {
    title: 'Shielding Distribution',
    description: 'Log-bucketed histogram of shield/deshield sizes by count or volume.',
    category: 'privacy',
    href: '/privacy',
    tags: ['histogram', 'distribution', 'amount', 'volume'],
    isNew: true,
  },
  {
    title: 'Privacy Risk Scanner',
    description: 'Round-trip and batch pattern detection with linkability scoring.',
    category: 'privacy',
    href: '/privacy-risks',
    tags: ['risk', 'linkability', 'round-trip', 'batch'],
  },
  {
    title: 'Privacy Link Graph',
    description: 'Interactive node graph showing transaction linkage between addresses and pools.',
    category: 'privacy',
    href: '/privacy-risks',
    tags: ['graph', 'linkage', 'visualization', 'flow'],
  },
  // Pools
  {
    title: 'Shielded Pool Balances',
    description: 'Sprout, Sapling, and Orchard pool sizes over time with % of supply.',
    category: 'pools',
    href: '/pools',
    tags: ['pool', 'balance', 'sapling', 'orchard', 'sprout', 'supply'],
  },
  {
    title: 'Pool Growth (Total Shielded)',
    description: 'Total ZEC held across all shielded pools.',
    category: 'pools',
    href: '/privacy',
    tags: ['growth', 'pool', 'total', 'shielded'],
  },
  {
    title: 'Shield/Deshield Flow Volume',
    description: 'Daily ZEC flowing in and out of shielded pools with net flow line.',
    category: 'pools',
    href: '/pools',
    tags: ['flow', 'shield', 'deshield', 'volume', 'daily', 'net'],
  },
  {
    title: 'Turnstile Tracker',
    description: 'Where deshielded ZEC goes: held, reshielded, moved, exchanged, or bridged.',
    category: 'pools',
    href: '/turnstile',
    tags: ['turnstile', 'deshield', 'destination', 'exchange', 'bridge'],
  },
  // Mining
  {
    title: 'Mining Pool Distribution',
    description: 'Pie chart of block share by mining pool over selectable period.',
    category: 'mining',
    href: '/mining',
    tags: ['pool', 'distribution', 'pie', 'share', 'blocks'],
  },
  {
    title: 'Hashrate Share Over Time',
    description: 'Per-pool network share (%) as area or line chart with clickable legends.',
    category: 'mining',
    href: '/mining',
    tags: ['hashrate', 'share', 'pool', 'time', 'dominance'],
  },
  {
    title: 'Miner Behavior (Earned vs Moved)',
    description: 'Block rewards earned vs ZEC moved/sold by mining pools. Shows accumulation patterns.',
    category: 'mining',
    href: '/mining',
    tags: ['miner', 'behavior', 'earned', 'sold', 'hodl', 'zodl', 'accumulation'],
  },
  {
    title: 'Mining Metrics (5-in-1)',
    description: 'Switchable line chart: solrate, difficulty, block time, fees, or tx count (20-block rolling avg).',
    category: 'mining',
    href: '/mining',
    tags: ['metrics', 'difficulty', 'block time', 'hashrate', 'solrate'],
  },
  // Network
  {
    title: 'Supply Emission Curve',
    description: 'ZEC circulating supply over time approaching the 21M cap.',
    category: 'network',
    href: '/network',
    tags: ['supply', 'emission', 'curve', 'cap', '21m', 'inflation'],
  },
  {
    title: 'Chain Size (Disk Growth)',
    description: 'Blockchain data size on disk (GB) over time.',
    category: 'network',
    href: '/network',
    tags: ['size', 'disk', 'growth', 'storage'],
  },
  {
    title: 'Protocol Stats (Commitments & Nullifiers)',
    description: 'Monthly Sapling/Orchard note commitments or nullifiers with brush selector.',
    category: 'network',
    href: '/network',
    tags: ['commitments', 'nullifiers', 'sapling', 'orchard', 'protocol'],
  },
  {
    title: 'Halving Countdown',
    description: 'Time remaining until the next block reward halving with emission projections.',
    category: 'network',
    href: '/network',
    tags: ['halving', 'countdown', 'reward', 'emission'],
  },
  {
    title: 'Node Map',
    description: 'Geographic distribution of Zcash nodes worldwide.',
    category: 'network',
    href: '/network',
    tags: ['nodes', 'map', 'geography', 'peers', 'decentralization'],
  },
  {
    title: 'Mempool Bubbles',
    description: 'Live mempool transactions as physics-based bubbles sized by fee and colored by type.',
    category: 'network',
    href: '/mempool',
    tags: ['mempool', 'live', 'real-time', 'bubbles', 'unconfirmed'],
  },
  // Fees
  {
    title: 'Fee Distribution (Percentiles)',
    description: 'Daily fee percentile bands (p10–p90) showing fee consensus over time.',
    category: 'fees',
    href: '/network',
    tags: ['fee', 'distribution', 'percentile', 'median', 'zip-317'],
    isNew: true,
  },
  // Market / Cross-chain
  {
    title: 'Cross-chain Volume',
    description: 'Inflow vs outflow USD volume across bridges and NEAR Intents.',
    category: 'market',
    href: '/crosschain',
    tags: ['cross-chain', 'bridge', 'NEAR', 'volume', 'inflow', 'outflow'],
  },
];

const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'text-primary' },
  { key: 'privacy', label: 'Privacy', color: 'text-cipher-purple' },
  { key: 'pools', label: 'Pools', color: 'text-cipher-green' },
  { key: 'mining', label: 'Mining', color: 'text-cipher-yellow' },
  { key: 'network', label: 'Network', color: 'text-cipher-cyan' },
  { key: 'fees', label: 'Fees', color: 'text-cipher-orange' },
  { key: 'market', label: 'Market', color: 'text-blue-400' },
];

const CATEGORY_COLORS: Record<string, string> = {
  privacy: 'border-cipher-purple/20 hover:border-cipher-purple/40',
  pools: 'border-cipher-green/20 hover:border-cipher-green/40',
  mining: 'border-cipher-yellow/20 hover:border-cipher-yellow/40',
  network: 'border-cipher-cyan/20 hover:border-cipher-cyan/40',
  fees: 'border-cipher-orange/20 hover:border-cipher-orange/40',
  market: 'border-blue-400/20 hover:border-blue-400/40',
};

const CATEGORY_BADGES: Record<string, string> = {
  privacy: 'bg-cipher-purple/10 text-cipher-purple',
  pools: 'bg-cipher-green/10 text-cipher-green',
  mining: 'bg-cipher-yellow/10 text-cipher-yellow',
  network: 'bg-cipher-cyan/10 text-cipher-cyan',
  fees: 'bg-cipher-orange/10 text-cipher-orange',
  market: 'bg-blue-400/10 text-blue-400',
};

export default function ChartsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');

  const filtered = useMemo(() => {
    let results = CHARTS;
    if (category !== 'all') {
      results = results.filter(c => c.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some(t => t.includes(q))
      );
    }
    return results;
  }, [search, category]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: CHARTS.length };
    CHARTS.forEach(c => { map[c.category] = (map[c.category] || 0) + 1; });
    return map;
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> CHARTS_HUB
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          Charts & Analytics
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          Every on-chain metric we track, in one place. Privacy adoption, shielded pool flows,
          mining distribution, fee trends, and network activity.
        </p>
        <p className="text-xs text-muted mt-2 font-mono">
          {CHARTS.length} charts across {CATEGORIES.length - 1} categories
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search charts..."
            className="w-full pl-10 pr-4 py-2 text-sm font-mono bg-glass-3 border border-cipher-border rounded-lg text-primary placeholder:text-muted/60 focus:outline-none focus:border-cipher-cyan/40 transition-colors"
          />
        </div>
        <div className="inline-flex gap-0 p-0.5 rounded-lg bg-glass-3 overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded-md transition-all whitespace-nowrap ${
                category === cat.key
                  ? `bg-white/5 ${cat.color} font-bold`
                  : 'text-muted hover:text-secondary'
              }`}
            >
              {cat.label}
              <span className="ml-1 opacity-50">{counts[cat.key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        {filtered.map((chart) => (
          <Link
            key={chart.title}
            href={chart.href}
            className={`group block rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/10 ${CATEGORY_COLORS[chart.category]}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${CATEGORY_BADGES[chart.category]}`}>
                {chart.category}
              </span>
              {chart.isNew && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cipher-green/10 text-cipher-green uppercase">
                  New
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-primary group-hover:text-cipher-cyan transition-colors mt-2">
              {chart.title}
            </h3>
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed line-clamp-2">
              {chart.description}
            </p>
            <div className="mt-3 flex items-center text-[10px] text-muted/60 font-mono">
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              {chart.href}
            </div>
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <Card className="mt-8">
          <CardBody className="py-16 text-center">
            <p className="text-secondary">No charts matching &ldquo;{search}&rdquo;</p>
            <button
              onClick={() => { setSearch(''); setCategory('all'); }}
              className="mt-3 text-xs font-mono text-cipher-cyan hover:underline"
            >
              Clear filters
            </button>
          </CardBody>
        </Card>
      )}

      {/* Footer info */}
      <div className="mt-12 text-center animate-fade-in-up" style={{ animationDelay: '150ms' }}>
        <p className="text-xs text-muted/60 font-mono">
          All charts update automatically. Data sourced from the CipherScan indexer processing every Zcash block in real-time.
        </p>
      </div>
    </div>
  );
}
