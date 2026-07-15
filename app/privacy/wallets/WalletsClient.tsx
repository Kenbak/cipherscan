'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { Card, CardBody } from '@/components/ui/Card';
import { PageSectionNav } from '@/components/PageSectionNav';

const SECTIONS = [
  { id: 'fee-lanes', label: 'Fee Lanes' },
  { id: 'fingerprints', label: 'Fingerprints' },
  { id: 'usage', label: 'Usage' },
] as const;

const PERIODS = ['7d', '30d', '90d', '1y'] as const;
type Period = (typeof PERIODS)[number];

interface FeeLaneData {
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
  signals: {
    fee: WalletSignal;
    expiry: WalletSignal;
    locktime: WalletSignal;
    actionPadding: WalletSignal;
  };
}

interface FingerprintData {
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
  const [feeLanes, setFeeLanes] = useState<FeeLaneData | null>(null);
  const [fingerprints, setFingerprints] = useState<FingerprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const api = getApiUrl();

    Promise.all([
      fetch(`${api}/api/privacy/fee-lanes?period=${period}`).then(r => r.json()),
      fetch(`${api}/api/privacy/wallet-fingerprints?period=${period}`).then(r => r.json()),
    ])
      .then(([feeData, fpData]) => {
        if (feeData.success) setFeeLanes(feeData);
        if (fpData.success) setFingerprints(fpData);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load wallet analysis data');
        setLoading(false);
        console.error(err);
      });
  }, [period]);

  const usageData = buildUsageEstimates(fingerprints);

  if (loading && !feeLanes) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-2">Wallet Anonymity Analysis</h1>
        <p className="text-[var(--color-text-secondary)] mb-8">
          Analyzing on-chain wallet fingerprints...
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg animate-pulse bg-[var(--color-bg-tertiary)]" />
          ))}
        </div>
        <div className="h-64 rounded-lg animate-pulse bg-[var(--color-bg-tertiary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-4">Wallet Anonymity Analysis</h1>
        <Card variant="standard">
          <CardBody>
            <p className="text-red-400">{error}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Wallet Anonymity Analysis</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            How distinguishable is your wallet on-chain?
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <PageSectionNav sections={SECTIONS} ariaLabel="Wallet analysis sections" />

      {/* ================================================================ */}
      {/* COMPONENT 1: FEE LANE ANONYMITY BUCKETS                         */}
      {/* ================================================================ */}
      <section id="fee-lanes" className="mb-12 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Do you blend in?</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          ZIP-317 defines a standard fee of 5,000 zat per logical action. Transactions paying this
          rate share the largest anonymity set.
        </p>

        {feeLanes && (
          <>
            {/* Hero stat row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatCard
                label="Standard Fee"
                value={`${feeLanes.buckets.standard.pct}%`}
                subtext={`${formatNumber(feeLanes.buckets.standard.count)} txs`}
                accent="cyan"
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
                  <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                    Fee Lane Distribution
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    ({formatNumber(feeLanes.totalShieldedTxs)} shielded txs in {period})
                  </span>
                </div>
                <BatteryBar buckets={feeLanes.buckets} />
                <div className="flex items-center gap-4 mt-3 text-xs text-[var(--color-text-secondary)]">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#56D4C8' }} />
                    Standard (5000 zat)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#F4B728' }} />
                    Priority (20000 zat)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }} />
                    Non-Standard
                  </span>
                </div>
              </CardBody>
            </Card>

            {/* Stacked area chart */}
            <Card variant="standard" className="mb-6">
              <CardBody>
                <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-4">
                  Fee Lane Evolution Over Time
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={feeLanes.history}>
                    <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={colors.axis}
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke={colors.axis}
                      tick={{ fontSize: 11 }}
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
                      stroke="#56D4C8"
                      fill="#56D4C8"
                      fillOpacity={0.6}
                      name="Standard"
                    />
                    <Area
                      type="monotone"
                      dataKey="priority"
                      stackId="1"
                      stroke="#F4B728"
                      fill="#F4B728"
                      fillOpacity={0.6}
                      name="Priority"
                    />
                    <Area
                      type="monotone"
                      dataKey="non_standard"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.6}
                      name="Non-Standard"
                    />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            {/* Dynamic takeaway */}
            <Card variant="glass" className="mb-6">
              <CardBody>
                <p className="text-sm leading-relaxed">
                  {feeLanes.buckets.standard.pct >= 90 ? (
                    <span>
                      <strong className="text-[#56D4C8]">{feeLanes.buckets.standard.pct}%</strong>{' '}
                      of shielded transactions pay the standard fee — you blend into a large crowd.
                      Non-standard fees account for only{' '}
                      <strong className="text-[#f59e0b]">{feeLanes.buckets.non_standard.pct}%</strong>{' '}
                      of traffic, making them a fingerprinting risk for those users.
                    </span>
                  ) : feeLanes.buckets.standard.pct >= 70 ? (
                    <span>
                      <strong className="text-[#56D4C8]">{feeLanes.buckets.standard.pct}%</strong>{' '}
                      of shielded transactions use the standard fee lane. While this is a decent
                      anonymity set, the{' '}
                      <strong className="text-[#f59e0b]">{feeLanes.buckets.non_standard.pct}%</strong>{' '}
                      using non-standard fees could improve their privacy by switching to ZIP-317 compliant wallets.
                    </span>
                  ) : (
                    <span>
                      Only{' '}
                      <strong className="text-[#f59e0b]">{feeLanes.buckets.standard.pct}%</strong>{' '}
                      of shielded transactions use the standard fee, which means fee-based fingerprinting
                      is currently a significant privacy risk on the network.
                    </span>
                  )}
                </p>
              </CardBody>
            </Card>
          </>
        )}
      </section>

      {/* ================================================================ */}
      {/* COMPONENT 2: WALLET FINGERPRINTING MATRIX                       */}
      {/* ================================================================ */}
      <section id="fingerprints" className="mb-12 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">What your wallet reveals</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Each wallet leaves a unique on-chain signature. Tap a wallet to see details.
        </p>

        {fingerprints && (
          <div className="space-y-3">
            {fingerprints.wallets.map(wallet => (
              <WalletCard key={wallet.name} wallet={wallet} />
            ))}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-8 h-5 rounded-full bg-emerald-400/20 border border-emerald-400/40" />
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
            </div>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* COMPONENT 3: WALLET USAGE DISTRIBUTION                          */}
      {/* ================================================================ */}
      <section id="usage" className="mb-12 scroll-mt-20">
        <h2 className="text-xl font-semibold mb-1">Who uses what</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Estimated wallet usage based on on-chain fingerprint matching. Confidence varies — see
          methodology below.
        </p>

        {usageData && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card variant="standard">
                <CardBody>
                  <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-4">
                    Estimated Distribution (last {period})
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={usageData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {usageData.map((entry, idx) => (
                          <Cell key={entry.name} fill={USAGE_COLORS[idx % USAGE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: colors.tooltipBg,
                          border: `1px solid ${colors.tooltipBorder}`,
                          borderRadius: 8,
                          color: colors.tooltipText,
                          fontSize: 12,
                        }}
                        formatter={(value, name) => [
                          `${formatNumber(Number(value))} txs`,
                          String(name),
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        formatter={(value) => (
                          <span className="text-xs">{String(value)}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>

              <Card variant="standard">
                <CardBody>
                  <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-4">
                    On-Chain Ceiling
                  </h3>
                  {fingerprints && (
                    <div className="space-y-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[var(--color-text-secondary)]">
                          Total shielded txs ({period})
                        </span>
                        <span className="text-2xl font-bold font-mono">
                          {formatNumber(fingerprints.totalShielded)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[var(--color-text-secondary)]">
                          Fully-shielded Orchard
                        </span>
                        <span className="text-2xl font-bold font-mono">
                          {formatNumber(fingerprints.totalFullyShieldedOrchard)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[var(--color-text-secondary)]">
                          Identified by fingerprint
                        </span>
                        <span className="text-2xl font-bold font-mono">
                          {formatNumber(
                            usageData
                              .filter(d => d.name !== 'Unknown / Other')
                              .reduce((s, d) => s + d.value, 0)
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)] pt-3 border-t border-[var(--color-border)] space-y-1.5">
                        <p className="font-medium text-[var(--color-text-secondary)]">Why is &quot;Unknown&quot; so large?</p>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                          <li>Sapling-only txs (no Orchard action count to fingerprint)</li>
                          <li>SDK wallets (Edge, Unstoppable, YWallet) identical to ZODL on-chain</li>
                          <li>Transactions with expiry=0 (disabled) or missing data</li>
                          <li>Wallets we haven&apos;t fingerprinted yet</li>
                        </ul>
                        <p className="text-[10px] italic">We prefer honesty over false precision.</p>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Methodology accordion */}
            <MethodologyAccordion />
          </>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const USAGE_COLORS = ['#56D4C8', '#a78bfa', '#F4B728', '#22c55e', '#f59e0b', '#64748b'];

function StatCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent: 'cyan' | 'yellow' | 'amber';
}) {
  const accentColor = {
    cyan: '#56D4C8',
    yellow: '#F4B728',
    amber: '#f59e0b',
  }[accent];

  return (
    <Card variant="compact">
      <CardBody>
        <p className="text-xs text-[var(--color-text-secondary)] mb-1">{label}</p>
        <p className="text-3xl font-bold font-mono" style={{ color: accentColor }}>
          {value}
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{subtext}</p>
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
          className="h-full transition-all duration-500 flex items-center justify-center text-xs font-medium text-slate-900"
          style={{ width: `${buckets.standard.pct}%`, background: '#56D4C8' }}
          title={`Standard: ${buckets.standard.pct}%`}
        >
          {buckets.standard.pct > 10 && `${buckets.standard.pct}%`}
        </div>
      )}
      {buckets.priority.pct > 0 && (
        <div
          className="h-full transition-all duration-500 flex items-center justify-center text-xs font-medium text-slate-900"
          style={{ width: `${Math.max(buckets.priority.pct, 1)}%`, background: '#F4B728' }}
          title={`Priority: ${buckets.priority.pct}%`}
        >
          {buckets.priority.pct > 5 && `${buckets.priority.pct}%`}
        </div>
      )}
      {buckets.non_standard.pct > 0 && (
        <div
          className="h-full transition-all duration-500 flex items-center justify-center text-xs font-medium text-slate-900"
          style={{ width: `${buckets.non_standard.pct}%`, background: '#f59e0b' }}
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
          className="w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          <div className="flex items-center gap-2 sm:w-48 flex-shrink-0">
            <svg
              className={`w-3 h-3 transition-transform flex-shrink-0 text-[var(--color-text-tertiary)] ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-sm">{wallet.name}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {signals.map(([key, signal]) => (
              <SignalPill key={key} label={signalLabels[key]} signal={signal} />
            ))}
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-3 pt-1 border-t border-[var(--color-border)]">
            {wallet.description && (
              <p className="text-xs text-[var(--color-text-secondary)] mb-3">{wallet.description}</p>
            )}
            {wallet.note && (
              <p className="text-xs text-[var(--color-text-tertiary)] italic mb-3">{wallet.note}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {signals.map(([key, signal]) => (
                <div key={key} className="rounded-lg bg-[var(--color-bg-tertiary)] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                    {signalLabels[key]}
                  </p>
                  <p className="font-mono text-xs font-medium mb-1">{signal.value}</p>
                  {signal.matchCount !== undefined && signal.matchCount > 0 && (
                    <p className="text-[10px] text-[#56D4C8] font-medium">
                      {formatNumber(signal.matchCount)} matches
                    </p>
                  )}
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 leading-tight">
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

function SignalPill({ label, signal }: { label: string; signal: WalletSignal }) {
  const styles = {
    high: 'bg-emerald-400/15 border-emerald-400/30 text-emerald-300',
    medium: 'bg-amber-400/15 border-amber-400/30 text-amber-300',
    low: 'bg-slate-500/15 border-slate-500/30 text-slate-400',
  }[signal.confidence];

  const shortValue = signal.value === 'Unknown' || signal.value === 'Unknown (custom builder)'
    ? '?'
    : signal.value.length > 12
      ? signal.value.slice(0, 12) + '...'
      : signal.value;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono ${styles}`}>
      <span className="text-[9px] opacity-60 uppercase">{label}</span>
      {shortValue}
      {signal.matchCount !== undefined && signal.matchCount > 0 && (
        <span className="text-[9px] opacity-70">({formatNumber(signal.matchCount)})</span>
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
          className="flex items-center justify-between w-full text-left"
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
          <div className="mt-4 space-y-3 text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              <strong>On-chain fingerprint matching:</strong> We count transactions matching each
              wallet&apos;s known signature. Signals used: Orchard action count (padding),
              expiry_height delta from block_height, nLockTime value, and fee-per-action rate.
            </p>
            <p>
              <strong>Overlap handling:</strong> Wallets using librustzcash (ZODL, Edge, Unstoppable)
              share the same on-chain fingerprint (expiry +40, locktime 0, 2-action minimum). The
              &quot;ZODL / Edge / Unstoppable&quot; bucket is the expiry+40 count minus uniquely-identified
              Vizor transactions (which also use librustzcash but pad to 4 actions).
            </p>
            <p>
              <strong>Vizor detection:</strong> Vizor always creates exactly 4 Orchard actions with
              no transparent I/O — a strong and unique signal verified from source code review.
            </p>
            <p>
              <strong>Brave detection:</strong> Brave&apos;s own C++ implementation uses the old
              zcashd default expiry delta (+20 blocks) and sets nLockTime to the current chain tip.
              Both signals confirmed from brave-core source (PR #32580, #37407).
            </p>
            <p>
              <strong>Off-chain proxies (not shown in chart):</strong> App store reviews suggest
              relative user base sizes — Brave (~190K iOS reviews, small Zcash fraction), ZODL
              (~5K reviews, Zcash-only), Edge (~50K reviews, multi-coin). These inform plausibility
              but are not used for the on-chain count.
            </p>
            <p>
              <strong>Limitations:</strong> The &quot;Unknown / Other&quot; bucket includes SDK-based
              wallets we cannot distinguish, Sapling-only transactions without Orchard, and any wallet
              not yet fingerprinted. We prefer transparency over false precision.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function buildUsageEstimates(fingerprints: FingerprintData | null) {
  if (!fingerprints) return null;

  const walletMap: { name: string; value: number; confidence: 'high' | 'medium' | 'low' }[] = [];
  let identified = 0;

  const vizorCount = fingerprints.wallets.find(w => w.name === 'Vizor')?.signals.actionPadding.matchCount || 0;
  const braveExpiry = fingerprints.wallets.find(w => w.name === 'Brave')?.signals.expiry.matchCount || 0;
  const braveLocktime = fingerprints.wallets.find(w => w.name === 'Brave')?.signals.locktime.matchCount || 0;
  const referenceExpiry = fingerprints.wallets.find(w => w.name === 'ZODL (librustzcash)')?.signals.expiry.matchCount || 0;
  const zkoolExpiry = fingerprints.wallets.find(w => w.name === 'Zkool')?.signals.expiry.matchCount || 0;

  // Vizor: uniquely identifiable by 4-action padding
  if (vizorCount > 0) {
    walletMap.push({ name: 'Vizor', value: vizorCount, confidence: 'high' });
    identified += vizorCount;
  }

  // Zkool: uniquely identifiable by expiry+100 (pre-March 2026 bug)
  if (zkoolExpiry > 0) {
    walletMap.push({ name: 'Zkool', value: zkoolExpiry, confidence: 'high' });
    identified += zkoolExpiry;
  }

  // Brave: identifiable by expiry+20 combined with non-zero locktime
  const braveCount = Math.max(braveExpiry, braveLocktime);
  if (braveCount > 0) {
    walletMap.push({ name: 'Brave', value: braveCount, confidence: 'medium' });
    identified += braveCount;
  }

  // SDK wallets (ZODL + Edge + Unstoppable): expiry+40 minus Vizor
  // Since Vizor also uses librustzcash (expiry+40), subtract Vizor from the total
  const sdkCount = Math.max(0, referenceExpiry - vizorCount);
  if (sdkCount > 0) {
    walletMap.push({ name: 'ZODL / Edge / Unstoppable', value: sdkCount, confidence: 'medium' });
    identified += sdkCount;
  }

  // Unknown: everything we can't attribute
  const unknown = Math.max(0, fingerprints.totalShielded - identified);
  if (unknown > 0) {
    walletMap.push({ name: 'Unknown / Other', value: unknown, confidence: 'low' });
  }

  return walletMap;
}
