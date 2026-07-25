'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ZAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { TurnstileHero } from './TurnstileHero';

const ORCHARD = '#A78BFA';
const IRONWOOD = '#F4B728';

interface Overview {
  success?: boolean;
  network?: string;
  activationHeight: number | null;
  tipHeight: number;
  activated: boolean;
  blocksUntilActivation: number;
  avgBlockTimeSecs?: number;
  poolSizes: {
    orchardZat: number;
    ironwoodZat: number;
    sproutZat: number;
    saplingZat: number;
    deferredZat: number;
    transparentZat: number | null;
    shieldedTotalZat: number;
    chainSupplyZat: number | null;
    updatedAt: string | null;
    source: 'zebra' | 'privacy_stats';
    sourceHeight: number;
    isLive: boolean;
  };
  migration: {
    totalMigratedZat: number;
    txCount: number;
    firstHeight: number | null;
    lastHeight: number | null;
    migratedPercent: number;
    velocityZatPerHour?: number;
  };
  supplyAudit: {
    orchardOutZat: number;
    coinbaseInZat: number;
    ironwoodInZat: number;
    ironwoodOutZat: number;
    indexedNetZat: number;
    authoritativePoolZat: number;
    differenceZat: number;
    accountingHeight: number;
    sourceHeight: number;
    status: 'balanced' | 'syncing' | 'stale' | 'mismatch';
    balanced: boolean | null;
  };
  inflowSources?: {
    fromOrchardZat: number;
    fromOrchardTxs: number;
    fromSaplingZat: number;
    fromSaplingTxs: number;
    fromTransparentZat: number;
    fromTransparentTxs: number;
    fromCoinbaseZat: number;
    fromCoinbaseTxs: number;
    totalInZat: number;
    totalOutZat: number;
  };
}
interface Cohort {
  boundary: number;
  boundaryStartHeight: number;
  txCount: number;
  volumeZat: number;
  firstTime: number | null;
}
interface Cohorts {
  success?: boolean;
  network?: string;
  boundaryModulus: number;
  cohortCount: number;
  avgAnonymitySet: number;
  minAnonymitySet: number;
  maxAnonymitySet: number;
  cohorts: Cohort[];
}
interface ScatterTx {
  txid: string;
  height: number;
  timestamp: number | null;
  amountZec: number;
  privacy: 'denominated' | 'distinctive';
  matchedDenomination: number | null;
}
interface ScatterData {
  success?: boolean;
  network?: string;
  total: number;
  denominatedCount: number;
  distinctiveCount: number;
  denominatedPercent: number;
  txs: ScatterTx[];
}

function zec(zat: number): number {
  return zat / 1e8;
}
function fmtZec(zat: number): string {
  const z = zec(zat);
  if (Math.abs(z) >= 1000) return Math.round(z).toLocaleString();
  return z.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function MigrationClient({
  initialOverview,
  initialCohorts,
  initialDenominations: _initialDenominations,
  deploymentNetwork,
  fallbackActivationHeight,
}: {
  initialOverview: Overview | null;
  initialCohorts: Cohorts | null;
  initialDenominations: unknown;
  deploymentNetwork: 'mainnet' | 'testnet' | 'crosslink-testnet';
  fallbackActivationHeight: number;
}) {
  const [overview, setOverview] = useState<Overview | null>(initialOverview);
  const [cohorts, setCohorts] = useState<Cohorts | null>(initialCohorts);
  const [scatter, setScatter] = useState<ScatterData | null>(null);
  const [loaded, setLoaded] = useState(!!initialOverview);

  useEffect(() => {
    let cancelled = false;
    const base = getApiUrl();
    const fetchJson = (path: string) =>
      fetch(`${base}${path}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    const loadOverview = () => {
      fetchJson('/api/migration/overview').then((result) => {
        if (cancelled) return;
        if (result?.success && result.network === deploymentNetwork) setOverview(result);
        setLoaded(true);
      });
    };

    const loadAnalytics = () => {
      Promise.all([
        fetchJson('/api/migration/cohorts'),
        fetchJson('/api/migration/scatter'),
      ]).then(([c, s]) => {
        if (cancelled) return;
        if (c?.success && c.network === deploymentNetwork) setCohorts(c);
        if (s?.success && s.network === deploymentNetwork) setScatter(s);
      });
    };

    loadOverview();
    loadAnalytics();
    const overviewId = setInterval(loadOverview, 10000);
    const analyticsId = setInterval(loadAnalytics, 60000);
    return () => {
      cancelled = true;
      clearInterval(overviewId);
      clearInterval(analyticsId);
    };
  }, [deploymentNetwork]);

  const activated = overview?.activated ?? false;
  const hasMigrations = (overview?.migration?.txCount ?? 0) > 0;
  const noData = loaded && (!overview || !overview.migration);

  const knownActivationHeight = overview?.activationHeight ?? fallbackActivationHeight;
  const knownTip = overview?.tipHeight || 0;

  const migratedPct =
    overview && (overview.poolSizes.orchardZat + overview.poolSizes.ironwoodZat) > 0
      ? (overview.poolSizes.ironwoodZat /
          (overview.poolSizes.orchardZat + overview.poolSizes.ironwoodZat)) * 100
      : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-muted mb-4">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <span className="opacity-40">/</span>
        <Link href="/pools" className="hover:text-primary transition-colors">Pools</Link>
        <span className="opacity-40">/</span>
        <span className="text-secondary">Ironwood</span>
      </div>

      {/* Header — single sentence, no duplication */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Zcash <span className="text-cipher-yellow-bright">Ironwood</span> Migration Tracker
          </h1>
          <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
            Live tracking of the NU6.3 Orchard-to-Ironwood migration — pool balances, supply verification, cohort privacy, and migration velocity.
          </p>
        </div>
        {overview?.network && (
          <span className="text-[10px] font-mono text-muted bg-glass-3 border border-cipher-border/50 rounded-full px-3 py-1">
            {overview.network}
          </span>
        )}
      </div>

      {!loaded && !initialOverview ? (
        <div className="mt-8 h-80 sm:h-[420px] rounded-2xl border border-cipher-border bg-cipher-surface flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cipher-border border-t-cipher-yellow rounded-full animate-spin" />
            <span className="text-xs font-mono text-muted">Loading migration data…</span>
          </div>
        </div>
      ) : noData ? (
        <div className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-6 text-center">
          <h2 className="text-sm font-bold text-primary">Migration data unavailable</h2>
          <p className="text-xs text-muted mt-2">
            CipherScan could not load Ironwood data for this network. Try again shortly.
          </p>
        </div>
      ) : (
        <>
          {!activated ? (
            /* Pre-activation: countdown only */
            <MetricsRow
              overview={overview}
              activated={false}
              hasMigrations={false}
              activationHeight={knownActivationHeight}
              tipHeight={knownTip}
              migratedPct={0}
              deploymentNetwork={deploymentNetwork}
            />
          ) : (
            /* Post-activation: full dashboard */
            <>
              {overview && (
                <TurnstileHero
                  activated={activated}
                  balanced={overview.supplyAudit?.balanced ?? true}
                  migratedPct={migratedPct}
                  blockPulseKey={overview.tipHeight}
                />
              )}
              <MetricsRow
                overview={overview}
                activated={activated}
                hasMigrations={hasMigrations}
                activationHeight={knownActivationHeight}
                tipHeight={knownTip}
                migratedPct={migratedPct}
                deploymentNetwork={deploymentNetwork}
              />
              <SupplyVerification overview={overview} hasMigrations={hasMigrations} />
              <MigrationActivity cohorts={cohorts} overview={overview} activated={activated} />
              <PrivacyScore scatter={scatter} activated={activated} />
              <WalletReadiness />
              <Resources />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Section 1b: Metrics Row ─────────────────────────────────────────────────

function MetricsRow({
  overview,
  activated,
  hasMigrations,
  activationHeight,
  tipHeight,
  migratedPct,
  deploymentNetwork,
}: {
  overview: Overview | null;
  activated: boolean;
  hasMigrations: boolean;
  activationHeight: number;
  tipHeight: number;
  migratedPct: number;
  deploymentNetwork: string;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (activated) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activated]);

  const blocksLeft = Math.max(0, activationHeight - tipHeight);
  const blockTime = overview?.avgBlockTimeSecs || 75;
  const etaSecs = blocksLeft * blockTime;
  const progressPct = tipHeight > 0 && activationHeight > 0
    ? Math.min(100, (tipHeight / activationHeight) * 100)
    : 0;

  const days = Math.floor(etaSecs / 86400);
  const hours = Math.floor((etaSecs % 86400) / 3600);
  const minutes = Math.floor((etaSecs % 3600) / 60);

  const targetDate = new Date(Date.now() + etaSecs * 1000);
  const networkLabel = deploymentNetwork === 'mainnet' ? 'Mainnet' : 'Testnet';

  if (!activated && blocksLeft > 0) {
    return (
      <div className="mt-4 rounded-xl border border-cipher-border bg-gradient-to-b from-cipher-surface to-cipher-bg-dark p-6 sm:p-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${IRONWOOD}22 0%, transparent 60%)` }}
        />
        <div className="relative z-10">
          {/* Badge */}
          <div className="flex items-center justify-center mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cipher-border/50 bg-glass-3 px-4 py-1.5">
              <span className="w-2 h-2 rounded-full animate-pulse bg-cipher-yellow-bright" />
              <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
                NU6.3 Ironwood {networkLabel}
              </span>
            </div>
          </div>

          {/* Countdown */}
          <div className="flex items-center justify-center gap-3 sm:gap-5">
            <CountdownUnit value={days} label="days" />
            <span className="text-2xl sm:text-3xl font-bold text-muted/30 -mt-6">:</span>
            <CountdownUnit value={hours} label="hours" />
            <span className="text-2xl sm:text-3xl font-bold text-muted/30 -mt-6">:</span>
            <CountdownUnit value={minutes} label="min" />
          </div>

          {/* Blocks remaining */}
          <div className="text-center mt-6">
            <div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight text-cipher-yellow-bright">
              {blocksLeft.toLocaleString()}
            </div>
            <div className="text-xs font-mono text-muted mt-1">blocks remaining</div>
          </div>

          {/* Progress bar */}
          <div className="mt-6 max-w-2xl mx-auto">
            <div className="h-2.5 rounded-full bg-glass-3 overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full transition-all duration-1000 relative"
                style={{
                  width: `${progressPct.toFixed(2)}%`,
                  background: `linear-gradient(90deg, ${ORCHARD}, ${IRONWOOD})`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20 animate-pulse" />
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] font-mono text-muted">
              <span>block {tipHeight.toLocaleString()}</span>
              <span className="text-cipher-yellow-bright">{activationHeight.toLocaleString()}</span>
            </div>
          </div>

          {/* ETA */}
          <div className="text-center mt-4 text-sm font-mono text-secondary">
            est. {targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>

          {/* Pool balances row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-cipher-border/30">
            <Stat label="Orchard pool" value={overview ? `${fmtZec(overview.poolSizes.orchardZat)} ZEC` : '—'} tone="orchard" />
            <Stat label="Ironwood pool" value={overview ? `${fmtZec(overview.poolSizes.ironwoodZat)} ZEC` : '—'} tone="ironwood" />
            <Stat label="Migrated" value={hasMigrations ? `${migratedPct.toFixed(1)}%` : '—'} tone="ironwood" />
            <Stat label="Progress" value={`${progressPct.toFixed(1)}%`} />
          </div>
        </div>
      </div>
    );
  }

  // Post-activation: compact metrics
  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-mono text-secondary uppercase tracking-wider">IRONWOOD LIVE</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Since activation"
          value={`${((tipHeight - activationHeight) || 0).toLocaleString()} blocks`}
        />
        <Stat
          label="Orchard pool"
          value={overview ? `${fmtZec(overview.poolSizes.orchardZat)} ZEC` : '—'}
          tone="orchard"
        />
        <Stat
          label="Ironwood pool"
          value={overview ? `${fmtZec(overview.poolSizes.ironwoodZat)} ZEC` : '—'}
          tone="ironwood"
        />
        <Stat
          label="Migrated"
          value={hasMigrations ? `${migratedPct.toFixed(1)}%` : '0%'}
          tone="ironwood"
        />
      </div>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-16 sm:w-20 h-16 sm:h-20 rounded-xl border border-cipher-border/50 bg-glass-3 flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold font-mono text-primary">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] font-mono text-muted mt-1.5 uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ─── Section 2: Supply Verification ──────────────────────────────────────────

interface PoolRow {
  name: string;
  zat: number;
  pct: number;
  color?: string;
  highlight?: boolean;
}

function SupplyVerification({
  overview,
  hasMigrations,
}: {
  overview: Overview | null;
  hasMigrations: boolean;
}) {
  const audit = overview?.supplyAudit;
  const pools = overview?.poolSizes;
  if (!audit || !pools) return null;

  const totalSupply = pools.chainSupplyZat;

  // Fold deferred/lockbox into transparent (not a separate pool)
  const transparentZat = (pools.transparentZat ?? 0) + (pools.deferredZat ?? 0);

  const poolRows: PoolRow[] = [];
  if (transparentZat > 0) {
    poolRows.push({ name: 'Transparent', zat: transparentZat, pct: 0, color: '#94a3b8' });
  }
  if (pools.sproutZat > 0) {
    poolRows.push({ name: 'Sprout', zat: pools.sproutZat, pct: 0, color: '#6b7280' });
  }
  if (pools.saplingZat > 0) {
    poolRows.push({ name: 'Sapling', zat: pools.saplingZat, pct: 0, color: '#60a5fa' });
  }
  poolRows.push({ name: 'Orchard', zat: pools.orchardZat, pct: 0, color: ORCHARD });
  poolRows.push({ name: 'Ironwood', zat: pools.ironwoodZat, pct: 0, color: IRONWOOD, highlight: true });

  const computedTotal = poolRows.reduce((sum, r) => sum + r.zat, 0);
  const displayTotal = totalSupply ?? computedTotal;
  poolRows.forEach((r) => { r.pct = displayTotal > 0 ? (r.zat / displayTotal) * 100 : 0; });

  const poolSum = computedTotal;
  const supplyMatch = totalSupply != null ? poolSum === totalSupply : null;

  // Verified = everything except Orchard (vulnerable circuit)
  const verifiedZat = displayTotal - (pools.orchardZat ?? 0);
  const unverifiedZat = pools.orchardZat ?? 0;
  const verifiedPct = displayTotal > 0 ? (verifiedZat / displayTotal) * 100 : 0;

  // SVG ring params
  const ringSize = 200;
  const strokeWidth = 18;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const verifiedArc = (verifiedPct / 100) * circumference;

  return (
    <div className="mt-4 rounded-2xl border border-cipher-border bg-cipher-surface p-6 sm:p-8">
      {/* Ring + center stat */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative" style={{ width: ringSize, height: ringSize }}>
          <svg width={ringSize} height={ringSize} className="transform -rotate-90">
            {/* Background ring */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(167, 139, 250, 0.25)"
              strokeWidth={strokeWidth}
            />
            {/* Verified arc */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="url(#verifiedGradient)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${verifiedArc} ${circumference}`}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="verifiedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
          </svg>
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl sm:text-4xl font-bold font-mono text-primary leading-none">
              {verifiedPct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-muted mt-1">verified</span>
          </div>
        </div>

        {/* Labels below ring */}
        <div className="flex items-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-muted">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1.5 rounded-full bg-[#A78BFA]/40" />
            <span className="text-muted">Orchard (unverified)</span>
          </div>
        </div>
      </div>

      {/* Pool tiles — bento grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {poolRows.map((row) => (
          <div
            key={row.name}
            className={`relative rounded-xl p-3.5 border transition-all ${
              row.name === 'Orchard'
                ? 'border-amber-400/20 bg-amber-400/[0.03]'
                : row.highlight
                  ? 'border-cipher-yellow/30 bg-cipher-yellow/[0.03]'
                  : 'border-cipher-border/50 bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
              <span className={`text-[11px] ${row.highlight ? 'text-cipher-yellow-bright' : row.name === 'Orchard' ? 'text-amber-300' : 'text-muted'}`}>
                {row.name}
              </span>
            </div>
            <div className={`text-lg font-mono font-bold leading-tight ${
              row.highlight ? 'text-cipher-yellow-bright' : row.name === 'Orchard' ? 'text-amber-200' : 'text-primary'
            }`}>
              {fmtZec(row.zat)}
            </div>
            <div className="text-[10px] font-mono text-muted mt-0.5">{row.pct.toFixed(1)}%</div>
            {row.name === 'Orchard' && (
              <div className="absolute top-2.5 right-2.5 text-[8px] px-1.5 py-0.5 rounded-full bg-amber-300/10 text-amber-300 font-mono">
                unverified
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ironwood inflow sources */}
      {hasMigrations && overview.inflowSources && (
        <InflowSources sources={overview.inflowSources} />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-cipher-border/20 text-[10px] text-muted font-mono">
        <span>{pools.isLive ? 'LIVE' : 'SNAPSHOT'} · {pools.source.toUpperCase()} · block {pools.sourceHeight.toLocaleString()}</span>
        {supplyMatch != null && (
          <span className={supplyMatch ? 'text-emerald-400/60' : 'text-red-400'}>
            {supplyMatch ? 'No inflation' : 'Supply mismatch'}
          </span>
        )}
      </div>
    </div>
  );
}

function InflowSources({ sources }: { sources: NonNullable<Overview['inflowSources']> }) {
  const rows = [
    { name: 'Orchard (ZIP-318)', zat: sources.fromOrchardZat, txs: sources.fromOrchardTxs, color: ORCHARD },
    { name: 'Transparent', zat: sources.fromTransparentZat, txs: sources.fromTransparentTxs, color: '#94a3b8' },
    { name: 'Sapling', zat: sources.fromSaplingZat, txs: sources.fromSaplingTxs, color: '#60a5fa' },
    { name: 'Coinbase', zat: sources.fromCoinbaseZat, txs: sources.fromCoinbaseTxs, color: IRONWOOD },
  ].filter((r) => r.zat > 0 || r.txs > 0);

  if (rows.length === 0) return null;

  const totalIn = sources.totalInZat;

  return (
    <div className="pt-5 border-t border-cipher-border/30">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold text-primary">Where Ironwood ZEC comes from</span>
        <span className="text-[10px] font-mono text-muted">
          {fmtZec(totalIn)} ZEC total inflow
        </span>
      </div>

      {/* Stacked bar — tall and bold */}
      <div className="h-8 rounded-lg overflow-hidden flex mb-4 border border-cipher-border/30">
        {rows.map((row) => {
          const pct = totalIn > 0 ? (row.zat / totalIn) * 100 : 0;
          return (
            <div
              key={row.name}
              className="h-full relative flex items-center justify-center transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: row.color }}
            >
              {pct > 12 && (
                <span className="text-[10px] font-mono font-bold text-white/90 mix-blend-normal">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Source legend grid */}
      <div className="grid grid-cols-2 gap-3">
        {rows.map((row) => {
          const pct = totalIn > 0 ? (row.zat / totalIn) * 100 : 0;
          return (
            <div key={row.name} className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
              <div className="min-w-0">
                <div className="text-xs text-secondary truncate">{row.name}</div>
                <div className="text-xs font-mono text-primary font-semibold">
                  {fmtZec(row.zat)} ZEC
                  <span className="text-muted font-normal ml-1.5">{row.txs.toLocaleString()} txs</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sources.totalOutZat > 0 && (
        <div className="flex items-center justify-between text-xs font-mono mt-4 pt-3 border-t border-cipher-border/20">
          <span className="text-muted">Outflows from Ironwood</span>
          <span className="text-primary font-semibold">{fmtZec(sources.totalOutZat)} ZEC</span>
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Migration Activity ───────────────────────────────────────────

function MigrationActivity({
  cohorts,
  overview,
  activated,
}: {
  cohorts: Cohorts | null;
  overview: Overview | null;
  activated: boolean;
}) {
  const data = (cohorts?.cohorts ?? []).map((c) => ({
    boundary: c.boundaryStartHeight,
    volume: zec(c.volumeZat),
    txCount: c.txCount,
  }));

  const velocityZec = overview?.migration?.velocityZatPerHour
    ? zec(overview.migration.velocityZatPerHour)
    : 0;
  const avgCohort = cohorts?.avgAnonymitySet ?? 0;

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Migration activity</h2>
      <p className="text-xs text-muted mt-1 mb-4 max-w-2xl leading-relaxed">
        Volume per 256-block boundary (~5.3h). Each bar is one anonymity cohort — wallets sharing a boundary mix together.
      </p>

      {/* Headline stats */}
      {(velocityZec > 0 || avgCohort > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <Stat
            label="Velocity"
            value={velocityZec > 0 ? `${velocityZec.toLocaleString(undefined, { maximumFractionDigits: 1 })} ZEC/hr` : '—'}
            tone="ironwood"
          />
          <Stat
            label="Avg cohort size"
            value={avgCohort > 0 ? `${avgCohort.toFixed(1)} txs` : '—'}
          />
          <Stat
            label="Migration txs"
            value={overview?.migration?.txCount ? overview.migration.txCount.toLocaleString() : '—'}
          />
        </div>
      )}

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <XAxis
              dataKey="boundary"
              tick={{ fontSize: 10, fill: '#8b8b9e' }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis tick={{ fontSize: 10, fill: '#8b8b9e' }} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(244, 183, 40, 0.08)' }}
              contentStyle={{
                backgroundColor: 'var(--color-surface-solid)',
                border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                fontSize: 12,
              }}
              itemStyle={{ color: 'var(--color-text-primary, #fff)' }}
              labelStyle={{ color: 'var(--color-text-muted, #8b8b9e)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
              labelFormatter={(v) => `Boundary @ height ${Number(v).toLocaleString()}`}
              formatter={(val: unknown, name: unknown) =>
                name === 'volume'
                  ? [`${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })} ZEC`, 'Volume']
                  : [Number(val), 'Txs (anonymity set)']
              }
            />
            <Bar dataKey="volume" fill={IRONWOOD} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyPanel activated={activated} />
      )}
    </div>
  );
}

// ─── Section 4: Privacy Score ────────────────────────────────────────────────

const DENOMINATED_COLOR = '#34d399';
const DISTINCTIVE_COLOR = '#f97316';

function PrivacyScore({ scatter, activated }: { scatter: ScatterData | null; activated: boolean }) {
  const denominatedData = (scatter?.txs ?? [])
    .filter(tx => tx.privacy === 'denominated')
    .map(tx => ({ x: tx.height, y: tx.amountZec, txid: tx.txid, privacy: tx.privacy, matched: tx.matchedDenomination }));
  const distinctiveData = (scatter?.txs ?? [])
    .filter(tx => tx.privacy === 'distinctive')
    .map(tx => ({ x: tx.height, y: tx.amountZec, txid: tx.txid, privacy: tx.privacy, matched: tx.matchedDenomination }));

  const hasData = (scatter?.total ?? 0) > 0;

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <h2 className="text-sm font-bold text-primary">Privacy score</h2>
          <p className="text-xs text-muted mt-1 mb-4 max-w-2xl leading-relaxed">
            Each dot is one migration. <span style={{ color: DENOMINATED_COLOR }} className="font-semibold">Green</span> = standard denomination (blends in).{' '}
            <span style={{ color: DISTINCTIVE_COLOR }} className="font-semibold">Orange</span> = distinctive amount (weakens privacy).
          </p>
        </div>
        {scatter && hasData && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono px-2 py-1 rounded-md border border-emerald-400/20 bg-emerald-400/5 text-emerald-400">
              {scatter.denominatedPercent}% private
            </span>
            <span className="text-[10px] font-mono text-muted">
              {scatter.denominatedCount} / {scatter.total} txs
            </span>
          </div>
        )}
      </div>

      {hasData ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="x"
                type="number"
                name="Block"
                tick={{ fontSize: 10, fill: '#8b8b9e' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                dataKey="y"
                type="number"
                name="Amount"
                tick={{ fontSize: 10, fill: '#8b8b9e' }}
                scale="log"
                domain={[0.005, 'auto']}
                tickFormatter={(v) => `${v}`}
                label={{ value: 'ZEC', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#8b8b9e' } }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-cipher-surface-solid border border-glass-8 rounded-lg px-3 py-2 text-xs font-mono">
                      <div className="text-muted mb-1">Block #{d.x?.toLocaleString()}</div>
                      <div className="text-primary font-bold">{d.y?.toFixed(8)} ZEC</div>
                      <div className="mt-1" style={{ color: d.privacy === 'denominated' ? DENOMINATED_COLOR : DISTINCTIVE_COLOR }}>
                        {d.privacy === 'denominated' ? `Matches ${d.matched} ZEC denomination` : 'Distinctive amount'}
                      </div>
                      <div className="text-muted/60 mt-1 text-[10px]">{d.txid?.slice(0, 16)}...</div>
                    </div>
                  );
                }}
              />
              {[0.01, 0.1, 1, 10, 100].map(d => (
                <ReferenceLine key={d} y={d} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
              ))}
              <Scatter name="Denominated" data={denominatedData} fill={DENOMINATED_COLOR} fillOpacity={0.8} />
              <Scatter name="Distinctive" data={distinctiveData} fill={DISTINCTIVE_COLOR} fillOpacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-cipher-border/30">
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DENOMINATED_COLOR }} />
                Common denomination
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DISTINCTIVE_COLOR }} />
                Distinctive amount
              </span>
            </div>
            <div className="text-[10px] font-mono text-muted">
              log scale · dashed lines = ideal denominations
            </div>
          </div>
        </>
      ) : (
        <EmptyPanel activated={activated} />
      )}
    </div>
  );
}

// ─── Section 5: Wallet Readiness ─────────────────────────────────────────────

const WALLETS = [
  { name: 'Zcash iOS SDK', status: 'ready' as const, detail: 'PR #1812 merged', link: 'https://github.com/zcash/zcash-swift-wallet-sdk/pull/1812' },
  { name: 'Zcash Android SDK', status: 'ready' as const, detail: 'feature-orchard_migration branch', link: null },
  { name: 'librustzcash', status: 'ready' as const, detail: 'main branch + migration crate', link: 'https://github.com/zcash/librustzcash' },
  { name: 'Zodl (iOS)', status: 'in_progress' as const, detail: 'Integrating SDK', link: null },
  { name: 'Zodl (Android)', status: 'in_progress' as const, detail: 'Integrating SDK', link: null },
  { name: 'YWallet', status: 'unknown' as const, detail: 'Status unconfirmed', link: null },
];

function WalletReadiness() {
  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Wallet readiness</h2>
      <p className="text-xs text-muted mt-1 mb-4">
        SDK and wallet support for ZIP-318 Orchard-to-Ironwood migration.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-mono text-muted uppercase tracking-wider border-b border-cipher-border/50">
              <th className="pb-2 pr-4">Wallet / SDK</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {WALLETS.map((w) => (
              <tr key={w.name} className="border-b border-cipher-border/20 last:border-0">
                <td className="py-2.5 pr-4 font-mono text-primary">
                  {w.link ? (
                    <a href={w.link} target="_blank" rel="noopener" className="text-cipher-cyan hover:underline">{w.name}</a>
                  ) : w.name}
                </td>
                <td className="py-2.5 pr-4">
                  <WalletStatusBadge status={w.status} />
                </td>
                <td className="py-2.5 text-muted">{w.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WalletStatusBadge({ status }: { status: 'ready' | 'in_progress' | 'unknown' }) {
  const styles = {
    ready: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5',
    in_progress: 'text-amber-300 border-amber-300/30 bg-amber-300/10',
    unknown: 'text-muted border-cipher-border/50 bg-glass-3',
  };
  const labels = { ready: 'Ready', in_progress: 'In Progress', unknown: 'Unknown' };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Section 6: Resources ────────────────────────────────────────────────────

function Resources() {
  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Resources</h2>
      <p className="text-xs text-muted mt-2 leading-relaxed max-w-3xl">
        A ZIP-318 migration is a v6 transaction with no transparent I/O whose Orchard value balance is positive
        and Ironwood value balance is negative. The magnitude of the Ironwood value balance equals the output
        denomination. Cohorts are grouped by 256-block anchor boundaries (~5.3h).
      </p>
      <div className="flex flex-wrap gap-4 mt-4 text-[11px] font-mono">
        <a href="https://zips.z.cash/zip-0258" target="_blank" rel="noopener" className="text-cipher-cyan hover:underline">
          ZIP-258 (NU6.3 Deployment)
        </a>
        <a href="https://zips.z.cash/zip-0318" target="_blank" rel="noopener" className="text-cipher-cyan hover:underline">
          ZIP-318 (Migration Spec)
        </a>
        <a
          href="https://docs.google.com/document/u/3/d/1z4Aj7tO34RKk0SXZYkNXtswxdBXKbR_IJ_Xw5EJljkc/edit"
          target="_blank"
          rel="noopener"
          className="text-cipher-cyan hover:underline"
        >
          Security Considerations
        </a>
        <Link href="/privacy-risks" className="text-cipher-cyan hover:underline">
          CipherScan Privacy Scanner
        </Link>
      </div>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

function Stat({ label, value, tone = 'default' }: {
  label: string;
  value: string;
  tone?: 'default' | 'orchard' | 'ironwood' | 'danger';
}) {
  const valueColor = {
    default: 'text-primary',
    orchard: 'text-cipher-purple-bright',
    ironwood: 'text-cipher-yellow-bright',
    danger: 'text-red-400',
  }[tone];
  return (
    <div className="rounded-lg border border-cipher-border/60 bg-glass-3 p-3 min-w-0">
      <div className={`text-base lg:text-lg font-bold font-mono tabular-nums whitespace-nowrap ${valueColor}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5 font-mono truncate">{label}</div>
    </div>
  );
}

function EmptyPanel({ activated }: { activated: boolean }) {
  return (
    <div className="h-[140px] flex items-center justify-center rounded-lg border border-dashed border-cipher-border/50 bg-glass-3">
      <p className="text-xs text-muted font-mono">
        {activated ? 'No migrations indexed yet' : 'Populates at activation'}
      </p>
    </div>
  );
}
