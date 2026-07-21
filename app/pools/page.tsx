'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader, SectionHeader, DataTable } from '@/components/ui';
import { PageSectionNav } from '@/components/PageSectionNav';
import { PoolDistributionChart } from '@/components/network/PoolDistributionChart';
import { FlowVolumeChart } from '@/components/pools/FlowVolumeChart';
import { TurnstileTracker } from '@/components/pools/TurnstileTracker';
import { FlowLegend } from '@/components/pools/FlowLegend';
import { MetricWithTooltip } from '@/components/pools/MetricWithTooltip';
import { InteractiveCompositionBar } from '@/components/pools/InteractiveCompositionBar';
import { ShieldFlowBadge } from '@/components/ShieldFlowBadge';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'supply', label: 'Supply' },
  { id: 'flows', label: 'Flows' },
  { id: 'turnstile', label: 'Turnstile' },
] as const;

interface PoolOverview {
  current: {
    sprout: number;
    sapling: number;
    orchard: number;
    ironwood: number;
    transparent: number;
    shielded: number;
    chainSupply: number;
    updatedAt: string;
  };
  deltas: Record<string, Record<string, number | null>>;
}

function PoolOverviewSkeleton() {
  return (
    <Card className="gradient-card-purple">
      <CardBody>
        <div className="space-y-5">
          <div className="h-4 w-32 skeleton-bg rounded animate-pulse" />
          <div className="h-10 w-48 skeleton-bg rounded animate-pulse" />
          <div className="h-3 skeleton-bg rounded-full animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 skeleton-bg rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function PoolOverviewHero({ data }: { data: PoolOverview }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [hoveredPool, setHoveredPool] = useState<string | null>(null);
  const { current, deltas } = data;
  const supply = current.chainSupply / 1e8 || 1;
  const shieldedZec = current.shielded / 1e8;
  const shieldedPct = (shieldedZec / supply) * 100;

  const pools = [
    { key: 'ironwood', label: 'Ironwood', zat: current.ironwood || 0, color: colors.ironwood },
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
    <Card className="gradient-card-purple">
      <CardBody>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">POOL_OVERVIEW</h2>
        </div>
        <p className="text-xs text-secondary font-sans mb-5">
          Where all ZEC lives right now — split between public (transparent) and private (shielded) pools.
        </p>

        <MetricWithTooltip
          label="Total Shielded"
          tooltip="All ZEC currently held in Ironwood, Orchard, Sapling, and Sprout shielded pools"
          className="mb-5"
        >
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-primary">
              {formatZecCompact(shieldedZec)}
            </span>
            <span className="text-sm font-mono text-muted">ZEC</span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded badge-purple">
              {shieldedPct.toFixed(1)}% of supply
            </span>
          </div>
        </MetricWithTooltip>

        <InteractiveCompositionBar
          className="mb-6"
          hoveredKey={hoveredPool}
          onHoverKeyChange={setHoveredPool}
          segments={pools.map(p => {
            const zec = p.zat / 1e8;
            const pct = (zec / totalForBar) * 100;
            return {
              key: p.key,
              label: p.label,
              percent: pct,
              color: p.color,
              opacity: p.key === 'transparent' ? 0.35 : 0.7,
              title: `${p.label}: ${formatZecCompact(zec)} ZEC (${pct.toFixed(1)}% of tracked supply)`,
            };
          })}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {pools.map(p => {
            const zec = p.zat / 1e8;
            const pct = (zec / supply) * 100;
            const delta7d = p.key !== 'transparent' ? formatDelta(p.key, '7d') : null;
            const isHovered = hoveredPool === p.key;
            const isDimmed = hoveredPool != null && !isHovered;
            return (
              <div
                key={p.key}
                className={`bg-glass-3 rounded-lg p-3 border-l-2 transition-all duration-200 ${
                  isHovered ? 'ring-1 ring-glass-12 bg-glass-4' : ''
                } ${isDimmed ? 'opacity-40' : ''}`}
                style={{ borderLeftColor: p.color }}
                onMouseEnter={() => setHoveredPool(p.key)}
                onMouseLeave={() => setHoveredPool(null)}
              >
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">
                  {p.key === 'ironwood' ? (
                    <Link href="/ironwood" className="hover:text-cipher-yellow hover:underline">
                      {p.label}
                    </Link>
                  ) : p.label}
                </p>
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
    fetch(`${getApiUrl()}/api/shielded/list?limit=10&min_zec=10`)
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
        <SectionHeader
          label="RECENT_LARGE_FLOWS"
          actions={
            <Link href="/txs/shielded" className="text-[10px] font-mono text-cipher-cyan hover:underline">
              View All
            </Link>
          }
        />
        <DataTable
          bare
          columns={[
            {
              id: 'type',
              header: 'Type',
              cell: (f: RecentFlow) => (
                <ShieldFlowBadge type={f.flowType === 'shield' ? 'shielding' : 'unshielding'} variant="full" />
              ),
            },
            {
              id: 'pool',
              header: 'Pool',
              cell: (f) => <span className="font-mono text-xs text-muted capitalize">{f.pool}</span>,
            },
            {
              id: 'amount',
              header: 'Amount',
              align: 'right',
              cell: (f) => (
                <span className="font-mono text-xs tabular-nums text-primary">{(f.amountZec || 0).toFixed(2)} ZEC</span>
              ),
            },
            {
              id: 'time',
              header: 'Time',
              align: 'right',
              cell: (f) => (
                <span className="font-mono text-xs text-muted">{f.blockTime ? formatTimeAgo(f.blockTime) : '—'}</span>
              ),
            },
          ]}
          rows={flows}
          rowKey={(f, i) => `${f.txid}-${i}`}
        />
        <FlowLegend className="mt-4 pt-4 border-t border-glass-4" />
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

export default function PoolsPage() {
  const [overview, setOverview] = useState<PoolOverview | null>(null);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/pools/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.current) setOverview(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="POOL_ANALYTICS"
        title="Zcash Shielded Pools"
        subtitle="Track how ZEC moves between transparent and shielded pools. Where it goes, and whether it stays."
      />

      <PageSectionNav sections={SECTIONS} ariaLabel="Pool analytics sections" />

      <section id="overview" className="scroll-mt-36 mb-12 animate-fade-in-up stagger-2">
        {overview ? <PoolOverviewHero data={overview} /> : <PoolOverviewSkeleton />}
      </section>

      <section id="supply" className="scroll-mt-36 mb-12 animate-fade-in-up stagger-3">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-sans text-primary">Supply History</h2>
          </div>
          <p className="text-xs text-secondary mt-1 font-sans">
            How the balance of each pool has changed over time. A rising shielded share means more ZEC is being held privately.
          </p>
        </div>
        <PoolDistributionChart />
      </section>

      <section id="flows" className="scroll-mt-36 mb-12 animate-fade-in-up stagger-4">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-sans text-primary">Flow Volume</h2>
          </div>
          <p className="text-xs text-secondary mt-1 font-sans">
            Shielding means moving ZEC into a private pool. Deshielding means moving it back to a public address.
            Bars up = into privacy. Bars down = out of privacy.
          </p>
        </div>
        <FlowVolumeChart />
      </section>

      <section id="turnstile" className="scroll-mt-36 mb-12 animate-fade-in-up stagger-5">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-lg font-bold font-sans text-primary">Turnstile Tracker</h2>
          </div>
          <p className="text-xs text-secondary mt-1 font-sans">
            When ZEC leaves a shielded pool, it lands on a public transparent address. We track what happens next —
            does it stay there (held), or get sent somewhere else (moved)?
          </p>
        </div>
        <TurnstileTracker />
      </section>

      <section className="mb-12 animate-fade-in-up stagger-6">
        <RecentFlows />
      </section>
    </div>
  );
}
