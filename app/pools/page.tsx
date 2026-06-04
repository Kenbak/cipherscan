'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { Card, CardBody } from '@/components/ui/Card';
import { PoolDistributionChart } from '@/components/network/PoolDistributionChart';
import { FlowVolumeChart } from '@/components/pools/FlowVolumeChart';
import { TurnstileTracker } from '@/components/pools/TurnstileTracker';

// ─── Section Nav ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'supply', label: 'Supply' },
  { id: 'flows', label: 'Flows' },
  { id: 'turnstile', label: 'Held vs. Moved' },
] as const;

function SectionNav({ active }: { active: string }) {
  return (
    <nav className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 backdrop-blur-xl"
      style={{ backgroundColor: 'var(--glass-3)' }}
    >
      <div className="flex gap-1 max-w-7xl mx-auto">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-full transition-colors ${
              active === s.id
                ? 'bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30'
                : 'text-muted hover:text-secondary'
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ─── Pool Overview Hero ─────────────────────────────────────────────────────

interface PoolOverview {
  current: {
    sprout: number;
    sapling: number;
    orchard: number;
    transparent: number;
    shielded: number;
    chainSupply: number;
    updatedAt: string;
  };
  deltas: Record<string, Record<string, number | null>>;
}

function PoolOverviewHero({ data }: { data: PoolOverview }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const { current, deltas } = data;
  const supply = current.chainSupply / 1e8 || 1;
  const shieldedZec = current.shielded / 1e8;
  const shieldedPct = (shieldedZec / supply) * 100;

  const pools = [
    { key: 'orchard', label: 'Orchard', zat: current.orchard, color: colors.orchard },
    { key: 'sapling', label: 'Sapling', zat: current.sapling, color: colors.sapling },
    { key: 'sprout', label: 'Sprout', zat: current.sprout, color: colors.sprout },
    { key: 'transparent', label: 'Transparent', zat: current.transparent, color: colors.transparent },
  ];

  const totalForBar = pools.reduce((s, p) => s + (p.zat / 1e8), 0) || 1;

  function formatDelta(pool: string, period: string) {
    const d = deltas[pool]?.[period];
    if (d == null) return null;
    const zec = d / 1e8;
    const sign = zec >= 0 ? '+' : '';
    return `${sign}${formatZecCompact(zec)}`;
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">POOL_OVERVIEW</h2>
        </div>
        <p className="text-[10px] font-mono text-muted mb-2">Where all ZEC lives right now — split between public (transparent) and private (shielded) pools.</p>

        {/* Hero number */}
        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Total Shielded</p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-cipher-cyan">
              {formatZecCompact(shieldedZec)}
            </span>
            <span className="text-sm font-mono text-muted">ZEC</span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/20">
              {shieldedPct.toFixed(1)}% of supply
            </span>
          </div>
        </div>

        {/* Composition bar */}
        <div className="h-3 rounded-full overflow-hidden flex mb-5" style={{ backgroundColor: 'var(--color-bg)' }}>
          {pools.map(p => {
            const pct = ((p.zat / 1e8) / totalForBar) * 100;
            if (pct < 0.1) return null;
            return (
              <div
                key={p.key}
                className="transition-all duration-1000"
                style={{ width: `${pct}%`, backgroundColor: p.color, opacity: p.key === 'transparent' ? 0.35 : 0.7 }}
              />
            );
          })}
        </div>

        {/* Per-pool stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {pools.map(p => {
            const zec = p.zat / 1e8;
            const pct = (zec / supply) * 100;
            const delta7d = p.key !== 'transparent' ? formatDelta(p.key, '7d') : null;
            return (
              <div key={p.key} className="bg-glass-3 rounded-lg p-3 border-l-2" style={{ borderLeftColor: p.color }}>
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">{p.label}</p>
                <p className="text-lg font-bold font-mono tabular-nums text-primary">{formatZecCompact(zec)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono text-muted">{pct.toFixed(1)}%</span>
                  {delta7d && (
                    <span className={`text-[9px] font-mono ${
                      delta7d.startsWith('+') ? 'text-cipher-green' : delta7d.startsWith('-') ? 'text-cipher-orange' : 'text-muted'
                    }`}>
                      {delta7d} 7d
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Recent Flows Table ─────────────────────────────────────────────────────

interface RecentFlow {
  txid: string;
  flowType: string;
  amountZec: number;
  pool: string;
  blockTime: number;
}

function RecentFlows() {
  const [flows, setFlows] = useState<RecentFlow[]>([]);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/shielded/list?limit=10&min_amount=10000000000`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.flows) setFlows(data.flows);
        else if (data?.data) setFlows(data.data);
      })
      .catch(() => {});
  }, []);

  if (flows.length === 0) return null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">RECENT_LARGE_FLOWS</h2>
          </div>
          <Link href="/txs/shielded" className="text-[10px] font-mono text-cipher-cyan hover:underline">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted text-[10px] uppercase tracking-wider">
                <th className="text-left pb-2 pr-4">Type</th>
                <th className="text-left pb-2 pr-4">Pool</th>
                <th className="text-right pb-2 pr-4">Amount</th>
                <th className="text-right pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f, i) => (
                <tr key={`${f.txid}-${i}`} className="border-t border-glass-4">
                  <td className="py-2 pr-4">
                    <span className={`text-[10px] uppercase ${
                      f.flowType === 'shield' ? 'text-cipher-cyan' : 'text-cipher-yellow'
                    }`}>
                      {f.flowType === 'shield' ? 'Shield' : 'Deshield'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted capitalize">{f.pool}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-primary">
                    {(f.amountZec || 0).toFixed(2)} ZEC
                  </td>
                  <td className="py-2 text-right text-muted">
                    {f.blockTime ? formatTimeAgo(f.blockTime) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function formatTimeAgo(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PoolsPage() {
  const [overview, setOverview] = useState<PoolOverview | null>(null);
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    fetch(`${getApiUrl()}/api/pools/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.current) setOverview(data);
      })
      .catch(() => {});
  }, []);

  // Intersection observer for section nav
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 }
    );

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> POOL_ANALYTICS
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">Shielded Pools</h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          Track how ZEC moves between transparent and shielded pools. Where it goes, and whether it stays.
        </p>
      </div>

      <SectionNav active={activeSection} />

      {/* Section 1: Overview */}
      <section id="overview" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        {overview ? (
          <PoolOverviewHero data={overview} />
        ) : (
          <Card>
            <CardBody>
              <div className="flex items-center justify-center h-40">
                <span className="text-xs text-muted font-mono">Loading pool data...</span>
              </div>
            </CardBody>
          </Card>
        )}
      </section>

      {/* Section 2: Supply History */}
      <section id="supply" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-mono text-primary uppercase tracking-wider">Supply History</h2>
          </div>
          <p className="text-xs text-muted mt-1">How the balance of each pool has changed over time. A rising shielded share means more ZEC is being held privately.</p>
        </div>
        <PoolDistributionChart />
      </section>

      {/* Section 3: Flow Volume */}
      <section id="flows" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-mono text-primary uppercase tracking-wider">Flow Volume</h2>
          </div>
          <p className="text-xs text-muted mt-1">
            Shielding means moving ZEC into a private pool. Deshielding means moving it back to a public address. Bars up = ZEC going private. Bars down = ZEC going public. The white line shows net flow.
          </p>
        </div>
        <FlowVolumeChart />
      </section>

      {/* Section 4: Turnstile Tracker */}
      <section id="turnstile" className="scroll-mt-36 mb-12 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-mono text-primary uppercase tracking-wider">Turnstile Tracker</h2>
          </div>
          <p className="text-xs text-muted mt-1">
            When ZEC leaves a shielded pool, it lands on a public transparent address. We track what happens next — does it stay there (held), or get sent somewhere else (moved)? A high &quot;held&quot; percentage suggests users aren&apos;t selling.
          </p>
        </div>
        <TurnstileTracker />
      </section>

      {/* Section 5: Recent Large Flows */}
      <section className="mb-12 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
        <RecentFlows />
      </section>
    </div>
  );
}
