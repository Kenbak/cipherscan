'use client';
import { PageLoadingBody } from '@/components/ui/PageLoading';

import { useState } from 'react';
import Link from 'next/link';
import { useApiQuery } from '@/hooks/useApiQuery';
import { categoryColor } from '@/lib/category-colors';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Legend,
} from 'recharts';
import { ChartTooltip as RechartsTooltip } from '@/components/charts/ChartTooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/SectionHeader';
import { PageSectionNav } from '@/components/PageSectionNav';

const SECTIONS = [
  { id: 'fee-lanes', label: 'Fee Lanes' },
  { id: 'usage', label: 'Pattern matches' },
  { id: 'fingerprints', label: 'Wallet signals' },
  { id: 'methodology', label: 'Methodology' },
] as const;

const PERIODS = ['7d', '30d', '90d', '1y'] as const;
type Period = (typeof PERIODS)[number];

interface FeeLaneData {
  period: string;
  totalShieldedTxs: number;
  buckets: {
    standard: { count: number; pct: number };
    priority: { count: number; pct: number };
    non_standard: { count: number; pct: number };
  };
  history: { date: string; standard: number; priority: number; non_standard: number }[];
}

interface WalletSignal {
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  matchCount?: number;
}

interface WalletFingerprint {
  name: string;
  description?: string;
  note?: string;
  familyMembers?: string[];
  nym?: 'supported' | 'partial' | 'none';
  nymNote?: string;
  signals: {
    fee: WalletSignal;
    expiry: WalletSignal;
    locktime: WalletSignal;
    actionPadding: WalletSignal;
  };
}

interface FingerprintData {
  period: string;
  totalShielded: number;
  totalFullyShieldedOrchard: number;
  wallets: WalletFingerprint[];
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatNumber = (n: number) => n.toLocaleString();

export default function WalletsClient() {
  const { theme } = useTheme();
  const colors = getChartColors(theme as 'dark' | 'light');
  const [period, setPeriod] = useState<Period>('30d');
  const feeQuery = useApiQuery<FeeLaneData>('/api/privacy/fee-lanes', { period });
  const fingerprintQuery = useApiQuery<FingerprintData>('/api/privacy/wallet-fingerprints', { period });
  const feeLanes = feeQuery.data?.period===period && feeQuery.data.buckets ? feeQuery.data : null;
  const fingerprints = fingerprintQuery.data?.period===period && Array.isArray(fingerprintQuery.data.wallets) ? fingerprintQuery.data : null;
  const loading = feeQuery.loading || fingerprintQuery.loading || feeQuery.isRefreshing || fingerprintQuery.isRefreshing;
  const error = feeQuery.error && fingerprintQuery.error ? 'Wallet analysis is temporarily unavailable.' : null;
  const usageData = buildUsageEstimates(fingerprints);

  if (loading && !feeLanes) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <PageHeader eyebrow="WALLET_ANALYSIS" title="Zcash Wallet Signals" subtitle="Fee patterns, observable wallet signals and their limits. Matches describe transaction behavior, not identified users." />
        <PageLoadingBody layout="wallets" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="type-page mb-4">Zcash Wallet Signals</h1>
        <Card variant="standard">
          <CardBody>
            <p className="text-danger">{error}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="WALLET_ANALYSIS"
        title="Zcash Wallet Signals"
        subtitle="Fee patterns, observable wallet signals and their limits. Matches describe transaction behavior, not identified users."
        actions={
          <div className="filter-group">
            {PERIODS.map(p => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`filter-btn ${period === p ? 'filter-btn-active' : ''}`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      <PageSectionNav sections={SECTIONS} ariaLabel="Wallet analysis sections" />

      {/* ================================================================ */}
      {/* COMPONENT 1: FEE LANE ANONYMITY BUCKETS                         */}
      {/* ================================================================ */}
      <section id="fee-lanes" className="mb-12 scroll-mt-36">
        <h2 className="text-sm font-mono font-semibold mb-3">Fee patterns</h2>
        <p className="text-sm text-secondary mb-6">
          ZIP-317 defines a standard fee of 5,000 zat per logical action. Transactions paying this
          rate share a fee pattern. A shared fee is one observable property, not a measured anonymity set.
        </p>

        {feeLanes && (
          <>
            {/* Hero stat row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatCard
                label="Standard Fee"
                value={`${feeLanes.buckets.standard.pct}%`}
                subtext={`${formatNumber(feeLanes.buckets.standard.count)} txs`}
                accent="gold"
              />
              <StatCard
                label="Priority Fee (4x)"
                value={`${feeLanes.buckets.priority.pct}%`}
                subtext={`${formatNumber(feeLanes.buckets.priority.count)} txs`}
                accent="yellow"
              />
              <StatCard
                label="Non-Standard"
                value={`${feeLanes.buckets.non_standard.pct}%`}
                subtext={`${formatNumber(feeLanes.buckets.non_standard.count)} txs`}
                accent="amber"
              />
            </div>

            {/* Battery bar */}
            <Card variant="standard" className="mb-6">
              <CardBody>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-secondary">
                    Fee Lane Distribution
                  </span>
                  <span className="text-xs text-muted">
                    ({formatNumber(feeLanes.totalShieldedTxs)} shielded txs in {period})
                  </span>
                </div>
                <BatteryBar buckets={feeLanes.buckets} />
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-secondary">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-cipher-green" />
                    Standard (5000 zat)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-cipher-yellow-bright" />
                    Priority (20000 zat)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-cipher-orange" />
                    Non-Standard
                  </span>
                </div>
              </CardBody>
            </Card>

            {/* Stacked area chart */}
            <Card variant="standard" className="mb-6">
              <CardBody>
                <h3 className="text-sm font-medium text-secondary mb-4">
                  Fee Lane Evolution Over Time
                </h3>
                <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height={300}>
                  <AreaChart data={feeLanes.history}>
                    <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={colors.axis}
                      tickFormatter={formatDate}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke={colors.axis}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v: number) => v > 999 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: colors.tooltipBg,
                        border: `1px solid ${colors.tooltipBorder}`,
                        borderRadius: 8,
                        color: colors.tooltipText,
                        fontSize: 12,
                      }}
                      labelFormatter={(label) => formatDate(String(label))}
                    />
                    <Area
                      type="monotone"
                      dataKey="standard"
                      stackId="1"
                      stroke={colors.shielding}
                      fill={colors.shielding}
                      fillOpacity={0.6}
                      name="Standard"
                    />
                    <Area
                      type="monotone"
                      dataKey="priority"
                      stackId="1"
                      stroke={colors.gold}
                      fill={colors.gold}
                      fillOpacity={0.6}
                      name="Priority"
                    />
                    <Area
                      type="monotone"
                      dataKey="non_standard"
                      stackId="1"
                      stroke={colors.deshielding}
                      fill={colors.deshielding}
                      fillOpacity={0.6}
                      name="Non-Standard"
                    />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <p className="text-xs text-muted leading-relaxed mb-6">{feeLanes.buckets.standard.pct}% of observed shielded transactions use the standard fee lane. Shared fee patterns describe this sample; they do not measure an anonymity set or identify a wallet on their own.</p>
          </>
        )}
      </section>

      {/* ================================================================ */}
      {/* COMPONENT 2: WALLET FINGERPRINTING MATRIX                       */}
      {/* ================================================================ */}


      {/* ================================================================ */}
      {/* COMPONENT 3: WALLET USAGE DISTRIBUTION                          */}
      {/* ================================================================ */}
      <section id="usage" className="mb-12 scroll-mt-36">
        <h2 className="text-sm font-mono font-semibold mb-3">Observed pattern matches</h2>
        <p className="text-sm text-secondary mb-6">
          Counts of transactions matching known implementation patterns. These are not counts of users or verified wallet market shares; patterns can overlap.
        </p>

        {usageData && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card variant="standard">
                <CardBody>
                  <h3 className="text-sm font-medium text-secondary mb-4">
                    Matching patterns · {period}
                  </h3>
                  <div className="space-y-5">{usageData.map(entry => <div key={entry.name}>
                    <div className="flex justify-between gap-4 mb-2"><span className="text-xs text-secondary">{entry.name}</span><span className="text-xs font-mono text-primary shrink-0">{formatNumber(entry.value)}</span></div>
                    <div className="h-2 rounded-full bg-cipher-hover overflow-hidden"><div className="h-full rounded-full" style={{width:`${Math.min(100, fingerprints?.totalShielded ? entry.value / fingerprints.totalShielded * 100 : 0)}%`,backgroundColor:categoryColor(entry.name,theme)}} /></div>
                    <p className="mt-1 text-caption text-muted">{entry.confidence} confidence · matches / observed shielded transactions</p>
                  </div>)}</div>
                </CardBody>
              </Card>

              <Card variant="standard">
                <CardBody>
                  <h3 className="text-sm font-medium text-secondary mb-4">
                    Observation coverage
                  </h3>
                  {fingerprints && (
                    <div className="space-y-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-secondary">
                          Total shielded txs ({period})
                        </span>
                        <span className="text-2xl font-semibold font-mono">
                          {formatNumber(fingerprints.totalShielded)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-secondary">
                          Fully-shielded Orchard
                        </span>
                        <span className="text-2xl font-semibold font-mono">
                          {formatNumber(fingerprints.totalFullyShieldedOrchard)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-secondary">
                          Pattern matches (may overlap)
                        </span>
                        <span className="text-2xl font-semibold font-mono">
                          {formatNumber(
                            usageData.reduce((s, d) => s + d.value, 0)
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-muted pt-3 border-t border-cipher-border space-y-1.5">
                        <p className="font-medium text-secondary">Why matches cannot identify every wallet</p>
                        <ul className="list-disc list-inside space-y-0.5 text-caption">
                          <li>Sapling-only txs (no Orchard action count to fingerprint)</li>
                          <li>SDK wallets (Edge, Unstoppable, YWallet) identical to ZODL on-chain</li>
                          <li>Transactions with expiry=0 (disabled) or missing data</li>
                          <li>Wallets we haven&apos;t fingerprinted yet</li>
                        </ul>

                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Methodology accordion */}

          </>
        )}
      </section>

      <section id="fingerprints" className="mb-12 scroll-mt-36">
        <h2 className="text-sm font-mono font-semibold mb-3">Wallet implementation signals</h2>
        <p className="text-sm text-secondary mb-6">
          Some wallets share the same transaction patterns. Expand a wallet family to inspect evidence and confidence.
        </p>

        {fingerprints && (
          <div className="space-y-3">
            {fingerprints.wallets.map(wallet => (
              <WalletCard key={wallet.name} wallet={wallet} />
            ))}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-8 h-5 rounded-full bg-cipher-green/20 border border-cipher-green/40" />
                Confirmed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-8 h-5 rounded-full bg-amber-400/20 border border-amber-400/40" />
                Inferred
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-8 h-5 rounded-full bg-slate-500/20 border border-slate-500/40" />
                Unknown
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-8 h-5 rounded-full bg-purple-500/15 border border-purple-500/30" />
                Nym Mixnet
              </span>
            </div>
          </div>
        )}
      </section>
      <section id="methodology" className="scroll-mt-36 mb-8"><MethodologyAccordion /></section>
      <nav aria-label="Related wallet analysis" className="grid sm:grid-cols-3 gap-3">{[{href:"/privacy",label:"Privacy participation"},{href:"/pools",label:"Shielded supply"},{href:"/tools/decode",label:"Decode a transaction"}].map(l=><Link key={l.href} href={l.href} className="border border-cipher-border rounded-lg p-4 text-xs font-mono text-secondary hover:bg-glass-3">{l.label} →</Link>)}</nav>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent: 'gold' | 'yellow' | 'amber';
}) {
  const accentClass = { gold: 'text-cipher-green', yellow: 'text-cipher-gold', amber: 'text-cipher-orange' }[accent];

  return (
    <Card variant="compact">
      <CardBody>
        <p className="text-xs text-secondary mb-1">{label}</p>
        <p className={`text-3xl font-semibold font-mono ${accentClass}`}>
          {value}
        </p>
        <p className="text-xs text-muted mt-1">{subtext}</p>
      </CardBody>
    </Card>
  );
}

function BatteryBar({
  buckets,
}: {
  buckets: FeeLaneData['buckets'];
}) {
  return (
    <div className="relative w-full h-8 rounded-lg overflow-hidden flex" role="img" aria-label={`Fee distribution: ${buckets.standard.pct}% standard, ${buckets.priority.pct}% priority, ${buckets.non_standard.pct}% non-standard`}>
      {buckets.standard.pct > 0 && (
        <div
          className="h-full transition-[width] duration-500 flex items-center justify-center text-xs font-medium text-cipher-bg-dark light:text-white"
          style={{ width: `${buckets.standard.pct}%`, background: 'var(--color-green)' }}
          title={`Standard: ${buckets.standard.pct}%`}
        >
          {buckets.standard.pct > 10 && `${buckets.standard.pct}%`}
        </div>
      )}
      {buckets.priority.pct > 0 && (
        <div
          className="h-full transition-[width] duration-500 flex items-center justify-center text-xs font-medium text-cipher-bg-dark"
          style={{ width: `${buckets.priority.pct}%`, background: 'var(--color-gold)' }}
          title={`Priority: ${buckets.priority.pct}%`}
        >
          {buckets.priority.pct > 5 && `${buckets.priority.pct}%`}
        </div>
      )}
      {buckets.non_standard.pct > 0 && (
        <div
          className="h-full transition-[width] duration-500 flex items-center justify-center text-xs font-medium text-cipher-bg-dark light:text-white"
          style={{ width: `${buckets.non_standard.pct}%`, background: 'var(--color-orange)' }}
          title={`Non-Standard: ${buckets.non_standard.pct}%`}
        >
          {buckets.non_standard.pct > 5 && `${buckets.non_standard.pct}%`}
        </div>
      )}
    </div>
  );
}

function WalletCard({ wallet }: { wallet: WalletFingerprint }) {
  const [expanded, setExpanded] = useState(false);
  const signals = Object.entries(wallet.signals) as [string, WalletSignal][];
  const signalLabels: Record<string, string> = {
    fee: 'Fee',
    expiry: 'Expiry',
    locktime: 'Lock',
    actionPadding: 'Padding',
  };

  return (
    <Card variant="compact" className="overflow-hidden">
      <CardBody className="!p-0">
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="w-full text-left px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-cipher-hover transition-colors"
        >
          <div className="flex items-center gap-2 sm:min-w-[13rem] flex-shrink-0">
            <svg
              className={`w-3 h-3 transition-transform flex-shrink-0 text-muted ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-sm">{wallet.name}</span>
            <NymBadge status={wallet.nym} />
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {signals.map(([key, signal]) => (
              <SignalPill key={key} label={signalLabels[key]} signal={signal} />
            ))}
          </div>
        </button>

        {expanded && (
          <div className="px-5 pb-5 pt-5 border-t border-cipher-border">
            {wallet.description && (
              <p className="text-xs text-secondary mb-3">{wallet.description}</p>
            )}
            {wallet.familyMembers && wallet.familyMembers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="text-caption uppercase tracking-wider text-muted">Includes:</span>
                {wallet.familyMembers.map(m => (
                  <span key={m} className="text-caption px-1.5 py-0.5 rounded bg-cipher-green/10 text-cipher-teal border border-cipher-teal/20">
                    {m}
                  </span>
                ))}
              </div>
            )}
            {wallet.nymNote && (
              <div className="flex items-start gap-2 mb-3 px-2 py-1.5 rounded bg-purple-500/5 border border-purple-500/20">
                <span className="text-caption uppercase tracking-wider text-purple-400 font-medium whitespace-nowrap mt-px">Nym</span>
                <span className="text-xs text-purple-300/80">{wallet.nymNote}</span>
              </div>
            )}
            {wallet.note && (
              <p className="text-xs text-muted italic mb-3">{wallet.note}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {signals.map(([key, signal]) => (
                <div key={key} className="rounded-lg bg-cipher-hover p-2.5">
                  <p className="text-caption uppercase tracking-wider text-muted mb-1">
                    {signalLabels[key]}
                  </p>
                  <p className="font-mono text-xs font-medium mb-1">{signal.value}</p>
                  {signal.matchCount !== undefined && signal.matchCount > 0 && (
                    <p className="text-caption text-cipher-teal font-medium">
                      {formatNumber(signal.matchCount)} matches
                    </p>
                  )}
                  <p className="text-caption text-muted mt-1 leading-tight">
                    {signal.source}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function NymBadge({ status }: { status?: 'supported' | 'partial' | 'none' }) {
  if (!status || status === 'none') return null;

  const styles = status === 'supported'
    ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
    : 'bg-purple-500/10 border-purple-500/20 text-purple-400/70';

  const label = status === 'supported' ? 'Nym' : 'Nym (partial)';

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-caption font-medium uppercase tracking-wider whitespace-nowrap ${styles}`}>
      <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM4.5 7.5a1 1 0 112 0v3a1 1 0 11-2 0v-3zm5 0a1 1 0 112 0v3a1 1 0 11-2 0v-3zM7 5a1 1 0 112 0 1 1 0 01-2 0z" />
      </svg>
      {label}
    </span>
  );
}

function SignalPill({ label, signal }: { label: string; signal: WalletSignal }) {
  const styles = {
    high: 'bg-cipher-green/15 border-cipher-green/30 text-cipher-green',
    medium: 'bg-amber-400/15 border-amber-400/30 text-amber-300',
    low: 'bg-slate-500/15 border-slate-500/30 text-muted',
  }[signal.confidence];

  const shortValue = signal.value === 'Unknown' || signal.value === 'Unknown (custom builder)'
    ? '?'
    : signal.value.length > 12
      ? signal.value.slice(0, 12) + '...'
      : signal.value;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-caption font-mono ${styles}`}>
      <span className="text-caption opacity-60 uppercase">{label}</span>
      {shortValue}
      {signal.matchCount !== undefined && signal.matchCount > 0 && (
        <span className="text-caption opacity-70">({formatNumber(signal.matchCount)})</span>
      )}
    </span>
  );
}

function MethodologyAccordion() {
  const [open, setOpen] = useState(false);

  return (
    <Card variant="dark">
      <CardBody>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center justify-between w-full text-left p-3 rounded-md hover:bg-glass-3"
        >
          <span className="text-sm font-medium">Methodology</span>
          <svg
            className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="mt-5 px-3 pb-3 space-y-3 text-xs text-secondary leading-relaxed">
            <p>
              <strong>On-chain fingerprint matching:</strong> We count transactions matching each
              wallet&apos;s known signature. Signals used: Orchard action count (padding),
              expiry_height delta from block_height, nLockTime value, and fee-per-action rate.
            </p>
            <p>
              <strong>Overlap handling:</strong> Wallets using librustzcash (ZODL, Edge, Unstoppable,
              Vizor) share the same on-chain fingerprint (expiry +40, locktime 0, 2-action padding).
              They are grouped as a single &quot;librustzcash family&quot; bucket because they are
              indistinguishable from one another on-chain.
            </p>
            <p>
              <strong>Brave detection:</strong> Brave&apos;s own C++ implementation uses the old
              zcashd default expiry delta (+20 blocks) and sets nLockTime to the current chain tip.
              Both signals confirmed from brave-core source (PR #32580, #37407).
            </p>
            <p><strong>Limitations:</strong> These matches are implementation clues, not verified wallet identities or user counts. Patterns can overlap and change between releases. Unmatched transactions are not assigned to a fabricated remainder category.</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function buildUsageEstimates(fingerprints: FingerprintData | null) {
  if (!fingerprints) return null;

  const walletMap: { name: string; value: number; confidence: 'high' | 'medium' | 'low' }[] = [];

  const find = (name: string) => fingerprints.wallets.find(w => w.name === name);

  const entries: { name: string; key: string; signal: 'expiry' | 'fee' | 'locktime' | 'actionPadding'; confidence: 'high' | 'medium' | 'low' }[] = [
    { name: 'ZODL / Vizor (Ironwood sends)', key: 'ZODL / Vizor (Ironwood sends)', signal: 'expiry', confidence: 'high' },
    { name: 'ZODL / Vizor (ZIP-318 migration)', key: 'ZODL / Vizor (ZIP-318 migration)', signal: 'expiry', confidence: 'high' },
    { name: 'SDK wallets (cross-pool)', key: 'SDK wallets (cross-pool)', signal: 'expiry', confidence: 'medium' },
    { name: 'SDK wallets (Orchard pool)', key: 'SDK wallets (Orchard pool)', signal: 'actionPadding', confidence: 'medium' },
    { name: 'SDK wallets (shielding/deshielding)', key: 'SDK wallets (shielding/deshielding)', signal: 'expiry', confidence: 'medium' },
    { name: 'Cake Wallet (probable)', key: 'Cake Wallet (probable)', signal: 'expiry', confidence: 'medium' },
    { name: 'Brave', key: 'Brave', signal: 'locktime', confidence: 'medium' },
    { name: 'Nozy', key: 'Nozy', signal: 'fee', confidence: 'high' },
    { name: 'Zkool (historical)', key: 'Zkool (historical)', signal: 'expiry', confidence: 'high' },
  ];

  for (const entry of entries) {
    const wallet = find(entry.key);
    const count = wallet?.signals[entry.signal].matchCount || 0;
    if (count > 0) {
      walletMap.push({ name: entry.name, value: count, confidence: entry.confidence });
    }
  }


  return walletMap;
}
