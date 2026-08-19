'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, SectionHeader } from '@/components/ui';
import { PageSectionNav } from '@/components/PageSectionNav';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Tooltip } from '@/components/Tooltip';
import { AnonymitySetChart } from '@/components/privacy/AnonymitySetChart';
import { ShieldingDistributionChart } from '@/components/privacy/ShieldingDistributionChart';
import {
  PrivacyTrendsSection,
  type TrendChartView,
} from '@/components/privacy/PrivacyTrendsSection';
import { formatRelativeUpdated } from '@/lib/privacy-trend-dates';
import { type Period } from '@/components/privacy/PeriodSelector';

const SECTIONS = [
  { id: 'score', label: 'Score' },
  { id: 'activity', label: 'Activity' },
  { id: 'trends', label: 'Trends' },
  { id: 'distribution', label: 'Distribution' },
] as const;

const RELATED = [
  {
    href: '/pools',
    title: 'Shielded Pools',
    description: 'Pool balances, supply history, and shield/deshield volume.',
  },
  {
    href: '/turnstile',
    title: 'Turnstile Tracker',
    description: 'Where deshielded ZEC goes after it hits a transparent address.',
  },
  {
    href: '/tools/blend-check',
    title: 'Blend Check',
    description: 'See whether an amount blends into the shielded crowd.',
  },
] as const;

const SCORE_KEYS = ['usage', 'quality', 'depth', 'hygiene'] as const;

const SCORE_TOOLTIPS: Record<(typeof SCORE_KEYS)[number], string> = {
  usage:
    'Share of non-coinbase transactions that touch shielded pools over the last 30 days. Up to 33 points.',
  quality:
    'Among shielded transactions in the last 30 days, the share that are fully shielded (z→z) with no transparent inputs or outputs. Up to 33 points.',
  depth: 'Percentage of total chain supply held in shielded pools. Up to 20 points.',
  hygiene:
    'Of ZEC that left shielded pools over the last 90 days, how much was reshielded instead of staying transparent. Up to 14 points.',
};

function scoreInputLabel(key: (typeof SCORE_KEYS)[number], percent: number) {
  if (key === 'usage') return `${percent.toFixed(1)}% of recent txs`;
  if (key === 'quality') return `${percent.toFixed(1)}% fully shielded`;
  if (key === 'depth') return `${percent.toFixed(1)}% of supply`;
  return `${percent.toFixed(1)}% reshielded`;
}

interface PrivacyStats {
  lastUpdated: string;
  lastBlockScanned: number;
  totals: {
    blocks: number;
    shieldedTx: number;
    transparentTx: number;
    coinbaseTx: number;
    totalTx: number;
    mixedTx: number;
    fullyShieldedTx: number;
  };
  shieldedPool: {
    currentSize: number;
    sprout?: number;
    sapling?: number;
    orchard?: number;
    ironwood?: number;
    transparent?: number;
    chainSupply?: number;
  };
  metrics: {
    shieldedPercentage: number;
    privacyScore: number;
    scoreBreakdown?: Record<
      string,
      { label: string; score: number; max: number; percent: number; detail: string }
    > | null;
    scoreVersion?: number;
    avgShieldedPerDay: number;
    adoptionTrend: 'growing' | 'stable' | 'declining';
  };
  trends: {
    daily: Array<{
      date: string;
      shielded: number;
      transparent: number;
      poolSize: number;
      shieldedPercentage: number;
      privacyScore: number;
    }>;
  };
}

export default function PrivacyClient() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [trendHistory, setTrendHistory] = useState<PrivacyStats['trends']['daily']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<TrendChartView>('adoption');
  const [trendPeriod, setTrendPeriod] = useState<Period>('30d');
  const { theme } = useTheme();

  useWebSocket({
    onMessage: (data) => {
      if (data.type === 'privacy_stats') {
        setStats((prev) => {
          const incoming = data.data as PrivacyStats;
          if (!prev?.trends?.daily?.length || incoming.trends.daily.length <= prev.trends.daily.length) {
            return incoming;
          }
          return { ...incoming, trends: prev.trends };
        });
        setLoading(false);
      }
    },
  });

  useEffect(() => {
    const apiBase = usePostgresApiClient()
      ? `${getApiUrl()}/api/privacy-stats`
      : '/api/privacy-stats';

    fetch(apiBase)
      .then((res) => res.json())
      .then((data) => {
        const statsData = data.success ? data.data : data;
        if (statsData && !statsData.error) setStats(statsData);
        else setError(statsData.error || data.error || 'Failed to load privacy stats');
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch privacy stats');
        setLoading(false);
      });

    fetch(`${apiBase}?days=1000`)
      .then((res) => res.json())
      .then((data) => {
        const statsData = data.success ? data.data : data;
        if (statsData?.trends?.daily) setTrendHistory(statsData.trends.daily);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <PageHeader
          eyebrow="PRIVACY SCORE"
          title="Network privacy health"
          subtitle="How well the chain uses shielded pools and private transaction patterns."
        />
        <div className="flex items-center justify-center py-20 text-sm font-mono text-muted">
          <div className="mr-3 h-8 w-8 animate-spin rounded-full border-2 border-cipher-cyan/30 border-t-cipher-cyan" />
          Loading privacy statistics…
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Card>
          <CardBody className="py-16 text-center">
            <h1 className="mb-3 text-xl font-bold text-primary">Privacy stats unavailable</h1>
            <p className="mb-6 text-sm text-secondary">
              {error || 'Statistics are being calculated. Check back soon.'}
            </p>
            <Link href="/" className="text-sm font-mono text-cipher-cyan hover:underline">
              Back to explorer
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const usagePercent = stats.metrics.scoreBreakdown?.usage?.percent;
  const updatedTitle = new Date(stats.lastUpdated).toLocaleString();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="PRIVACY SCORE"
        title="Network privacy health"
        subtitle="One score from recent shielded usage, transaction quality, pool depth, and post-deshield behavior."
        actions={
          <div className="flex flex-col items-end gap-1 text-[10px] font-mono">
            {usagePercent != null ? (
              <span className="inline-flex items-center gap-1 text-secondary tabular-nums">
                {usagePercent.toFixed(1)}% shielded tx share · 30d
                <Tooltip content="Share of non-coinbase transactions that touch shielded pools (Sapling, Orchard, or Ironwood) in the last 30 days. Transaction count — not ZEC volume or pool supply." />
              </span>
            ) : null}
            <span className="text-muted" title={updatedTitle}>
              Updated {formatRelativeUpdated(stats.lastUpdated)}
            </span>
          </div>
        }
      />

      <PageSectionNav sections={SECTIONS} ariaLabel="Privacy dashboard sections" className="mb-10" />

      {/* ── Score ── */}
      <section id="score" className="scroll-mt-36 mb-12">
        <div className="overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface">
          <div className="border-b border-cipher-border/40 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted">Privacy Score</p>
                  <Tooltip content="Composite network privacy health from four rolling inputs: 30-day shielded usage and transaction quality, shielded supply depth, and 90-day turnstile reshield hygiene." />
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-5xl font-bold tabular-nums text-primary sm:text-6xl">
                    {stats.metrics.privacyScore}
                  </span>
                  <span className="text-lg font-mono text-muted">/ 100</span>
                  {stats.metrics.scoreVersion ? (
                    <span className="rounded-full border border-cipher-border/60 px-2 py-0.5 text-[10px] font-mono text-muted">
                      v{stats.metrics.scoreVersion}
                    </span>
                  ) : null}
                </div>
              </div>
              <a
                href="#how-it-works"
                className="text-[11px] font-mono text-cipher-cyan transition-colors hover:text-primary"
              >
                How it works ↓
              </a>
            </div>
          </div>

          {stats.metrics.scoreBreakdown ? (
            <div className="grid gap-px bg-cipher-border/20 sm:grid-cols-2 lg:grid-cols-4">
              {SCORE_KEYS.map((key) => {
                const row = stats.metrics.scoreBreakdown?.[key];
                if (!row) return null;
                return (
                  <div key={key} className="bg-cipher-surface px-5 py-4">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-mono">
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-muted">{row.label}</span>
                        <Tooltip content={SCORE_TOOLTIPS[key]} />
                      </div>
                      <span className="shrink-0 tabular-nums text-primary">
                        {row.score}/{row.max}
                      </span>
                    </div>
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-cipher-border/30">
                      <div
                        className="h-full rounded-full bg-cipher-cyan/80"
                        style={{ width: `${row.max > 0 ? (row.score / row.max) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-mono tabular-nums text-secondary">
                      {scoreInputLabel(key, row.percent)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Activity ── */}
      <section id="activity" className="scroll-mt-36 mb-12">
        <SectionHeader label="RECENT SHIELDED ACTIVITY" live />
        <Card>
          <CardBody>
            <p className="mb-4 text-xs leading-relaxed text-secondary">
              Latest shielded transactions from the index. Click a row to open the transaction.
            </p>
            <RecentShieldedTxs nested limit={10} />
            <div className="mt-4 flex justify-end border-t border-cipher-border/30 pt-4">
              <Link
                href="/txs?type=shielded"
                className="inline-flex items-center gap-2 rounded-lg border border-cipher-border/60 px-3 py-2 text-[11px] font-mono text-primary transition-colors hover:border-cipher-cyan/40 hover:text-primary"
              >
                View all shielded transactions
                <span aria-hidden>→</span>
              </Link>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ── Trends ── */}
      {(trendHistory.length > 0 || stats.trends.daily.length > 0) ? (
        <section id="trends" className="scroll-mt-36 mb-12">
          <SectionHeader label="HISTORICAL TRENDS" />
          <PrivacyTrendsSection
            trendHistory={trendHistory.length > 0 ? trendHistory : stats.trends.daily}
            privacyScore={stats.metrics.privacyScore}
            lastBlockScanned={stats.lastBlockScanned}
            theme={theme}
            view={trendView}
            onViewChange={setTrendView}
            period={trendPeriod}
            onPeriodChange={setTrendPeriod}
          />
        </section>
      ) : null}

      {/* ── Distribution ── */}
      <section id="distribution" className="scroll-mt-36 mb-12">
        <SectionHeader label="ANONYMITY & AMOUNTS" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AnonymitySetChart />
          <ShieldingDistributionChart />
        </div>
      </section>

      {/* ── Related ── */}
      <section className="mb-12">
        <SectionHeader label="RELATED TOOLS" />
        <div className="grid gap-4 sm:grid-cols-3">
          {RELATED.map(({ href, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex h-full flex-col rounded-xl border border-glass-6 bg-glass-3 p-5 transition-colors hover:border-cipher-cyan/30"
            >
              <p className="text-sm font-semibold text-primary group-hover:text-primary transition-colors">
                {title}
              </p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{description}</p>
              <span className="mt-4 text-[10px] font-mono text-cipher-cyan">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <Card variant="glass">
        <CardBody className="text-sm leading-relaxed text-secondary">
          <p>
            <strong className="text-primary">Privacy Score</strong> combines 30-day shielded transaction usage,
            fully-shielded quality, shielded supply depth, and 90-day turnstile reshield hygiene. It measures
            network behavior — not individual wallet privacy.
          </p>
          <p className="mt-3 text-xs text-muted">
            Indexed from {stats.totals.blocks.toLocaleString()} blocks · refreshes with chain activity
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
