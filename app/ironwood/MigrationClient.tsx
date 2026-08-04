'use client';

import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { ParentSize } from '@visx/responsive';
import { PrivacyScatterChart, type ScatterPoint } from './PrivacyScatterChart';
import { VolumeAreaChart } from './VolumeAreaChart';
import { ShareableCard } from '@/components/ShareableCard';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
type ChartColors = ReturnType<typeof getChartColors>;

import { NETWORK_LABEL, NETWORK_COLOR } from '@/lib/config';
import { useCurrencyToggle, fmtValue, type CurrencyMode } from '@/hooks/useCurrencyToggle';
import { TurnstileHero } from './TurnstileHero';
import { InflowFlow, inflowPathDescription } from './InflowFlow';


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
    migratedTodayZat?: number;
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
  supplyVerification?: {
    chainSupplyZat: number;
    verifiedZat: number;
    unverifiedZat: number;
    verifiedPct: number;
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
  ironwoodActions?: number;
  orchardActions?: number;
  paddedBundle?: boolean;
  anchorCompliant?: boolean;
}
interface ScatterData {
  success?: boolean;
  network?: string;
  total: number;
  denominatedCount: number;
  distinctiveCount: number;
  denominatedPercent: number;
  denominatedVolumeZat?: number;
  distinctiveVolumeZat?: number;
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
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const { mode: currencyMode, toggle: toggleCurrency, price: zecPrice } = useCurrencyToggle();

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

  const orchardToIronwoodZat = overview?.inflowSources?.fromOrchardZat ?? 0;
  const originalOrchard = (overview?.poolSizes.orchardZat ?? 0) + orchardToIronwoodZat;
  const migratedPct = originalOrchard > 0
    ? (orchardToIronwoodZat / originalOrchard) * 100
    : 0;
  const fmt = (zat: number) => fmtValue(zat, currencyMode, zecPrice);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Zcash <span className="text-cipher-yellow-bright">Ironwood</span> Migration Tracker
          </h1>
          <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
            Live tracking of the NU6.3 Orchard-to-Ironwood migration — pool balances, supply verification, cohort privacy, and migration velocity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCurrency}
            className="flex items-center rounded-full border border-cipher-border bg-glass-3 text-[11px] font-mono overflow-hidden"
          >
            <span className={`px-2.5 py-1 transition-colors ${currencyMode === 'zec' ? 'bg-cipher-yellow-bright/15 text-cipher-yellow-bright' : 'text-muted'}`}>ZEC</span>
            <span className={`px-2.5 py-1 transition-colors ${currencyMode === 'usd' ? 'bg-cipher-yellow-bright/15 text-cipher-yellow-bright' : 'text-muted'}`}>USD</span>
          </button>
          <span className={`text-[10px] font-mono ${NETWORK_COLOR} border border-current/20 rounded-full px-3 py-1`}>
            {NETWORK_LABEL}
          </span>
        </div>
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
              colors={colors}
            />
          ) : (
            /* Post-activation: full dashboard */
            <>
              <MetricsRow
                overview={overview}
                activated={activated}
                hasMigrations={hasMigrations}
                activationHeight={knownActivationHeight}
                tipHeight={knownTip}
                migratedPct={migratedPct}
                deploymentNetwork={deploymentNetwork}
                colors={colors}
                currencyMode={currencyMode}
                zecPrice={zecPrice}
              />
              <SupplyVerification overview={overview} colors={colors} currencyMode={currencyMode} zecPrice={zecPrice} />
              {overview && (
                <TurnstileHero
                  activated={activated}
                  migratedPct={migratedPct}
                  blockPulseKey={overview.tipHeight}
                  activationHeight={knownActivationHeight}
                  tipHeight={knownTip}
                  cohorts={cohorts?.cohorts ?? null}
                  originalOrchardZat={originalOrchard}
                  currencyMode={currencyMode}
                  zecPrice={zecPrice}
                />
              )}
              {hasMigrations && overview?.inflowSources && overview.poolSizes && (
                <IronwoodInflowCard
                  sources={overview.inflowSources}
                  pools={overview.poolSizes}
                  colors={colors}
                  currencyMode={currencyMode}
                  zecPrice={zecPrice}
                />
              )}
              <MigrationActivity cohorts={cohorts} scatter={scatter} activated={activated} colors={colors} tipHeight={knownTip} currencyMode={currencyMode} zecPrice={zecPrice} />
              <PrivacyScore scatter={scatter} activated={activated} colors={colors} tipHeight={knownTip} />
              <MigrationTiers activated={activated} colors={colors} tipHeight={knownTip} currencyMode={currencyMode} zecPrice={zecPrice} />
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
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  overview: Overview | null;
  activated: boolean;
  hasMigrations: boolean;
  activationHeight: number;
  tipHeight: number;
  migratedPct: number;
  deploymentNetwork: string;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
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
      <div className="mt-4 rounded-xl border border-cipher-border bg-gradient-to-b from-cipher-surface to-cipher-elevated p-6 sm:p-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${colors.ironwoodPool}22 0%, transparent 60%)` }}
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
            <div className="h-2.5 rounded-full bg-glass-6 overflow-hidden border border-cipher-border/30">
              <div
                className="h-full rounded-full transition-all duration-1000 relative"
                style={{
                  width: `${progressPct.toFixed(2)}%`,
                  background: `linear-gradient(90deg, ${colors.orchardPool}, ${colors.ironwoodPool})`,
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
            <span className="text-muted/60 mx-1.5">·</span>
            {targetDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })} UTC
          </div>

          {/* Brand footer */}
          <div className="mt-6 flex items-center justify-center gap-2.5 border-t border-cipher-border/20 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
            <span className="text-[11px] font-bold font-mono text-cipher-cyan-bright tracking-tight">CIPHERSCAN</span>
            <span className="text-[10px] font-mono text-muted/55">cipherscan.app</span>
          </div>

        </div>
      </div>
    );
  }

  const blocksSince = (tipHeight - activationHeight) || 0;
  const velocityValue = overview?.migration?.velocityZatPerHour
    ? `${fmtValue(overview.migration.velocityZatPerHour, currencyMode, zecPrice)}/hr`
    : '—';
  const txValue = overview?.migration?.txCount
    ? overview.migration.txCount.toLocaleString()
    : '—';
  const todayZat = overview?.migration?.migratedTodayZat ?? 0;
  const todayValue = todayZat > 0 ? `+${fmtValue(todayZat, currencyMode, zecPrice)}` : '—';

  const orchardPct = hasMigrations ? `${migratedPct.toFixed(1)}%` : '0%';

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface">
      <div className="flex items-center gap-2 border-b border-cipher-border-subtle px-4 py-2.5 sm:px-5">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-secondary">Ironwood live</span>
      </div>

      {/* Mobile — hero + full-width rows */}
      <div className="sm:hidden">
        <a href="#supply" className="block border-b border-cipher-border-subtle px-4 py-4 transition-colors active:bg-cipher-hover">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">Migrated today</div>
          <div
            className="mt-1 text-2xl font-bold font-mono tabular-nums tracking-tight"
            style={{ color: colors.ironwoodPool }}
          >
            {todayValue}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted/60">Into Ironwood pool</div>
        </a>
        <div className="divide-y divide-cipher-border-subtle">
          <KpiRow
            label="Orchard → Ironwood"
            value={orchardPct}
            hint="Pool supply migrated"
            scrollTo="#supply"
            toneColor={colors.ironwoodPool}
          />
          <KpiRow
            label="Migration velocity"
            value={velocityValue}
            hint="Rolling hourly rate"
            scrollTo="#migration-activity"
            toneColor={colors.ironwoodPool}
          />
          <KpiRow
            label="Transactions"
            value={txValue}
            hint="Since activation"
            scrollTo="#migration-activity"
          />
          <KpiRow
            label="Since activation"
            value={`${blocksSince.toLocaleString()} blocks`}
            hint={`Block #${activationHeight.toLocaleString()}`}
            href={`/block/${activationHeight}`}
          />
        </div>
      </div>

      {/* Desktop — 5-column strip */}
      <div className="hidden divide-x divide-cipher-border-subtle sm:grid sm:grid-cols-5">
        <KpiCell
          label="Since activation"
          value={`${blocksSince.toLocaleString()} blocks`}
          hint={`Block #${activationHeight.toLocaleString()}`}
          href={`/block/${activationHeight}`}
        />
        <KpiCell
          label="Migrated today"
          value={todayValue}
          hint="Into Ironwood pool"
          scrollTo="#supply"
          toneColor={colors.ironwoodPool}
        />
        <KpiCell
          label="Orchard → Ironwood"
          value={orchardPct}
          hint="Pool supply"
          scrollTo="#supply"
          toneColor={colors.ironwoodPool}
        />
        <KpiCell
          label="Migration velocity"
          value={velocityValue}
          hint="Activity chart"
          scrollTo="#migration-activity"
          toneColor={colors.ironwoodPool}
        />
        <KpiCell
          label="Transactions"
          value={txValue}
          hint="Activity chart"
          scrollTo="#migration-activity"
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

// ─── Shareable card shell — see @/components/ShareableCard ───────────────────

function PoolBalanceRow({
  row,
  currencyMode,
  zecPrice,
}: {
  row: PoolRow;
  currencyMode: CurrencyMode;
  zecPrice: number | null;
}) {
  const rowShell = row.highlight
    ? 'bg-amber-500/[0.07] border border-amber-500/25'
    : 'border border-transparent';
  const nameClass = row.highlight ? 'font-medium' : 'text-secondary';
  const valueStyle = row.highlight ? { color: row.color } : undefined;

  return (
    <>
      {/* Mobile: compact single row — name left, value + % stacked right */}
      <div className={`sm:hidden flex items-center justify-between gap-2 py-1.5 px-2 rounded-md ${rowShell}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
          <span className={`text-xs ${nameClass} truncate`} style={valueStyle}>{row.name}</span>
          {row.name === 'Orchard' && (
            <span
              title="Unverified (Orchard)"
              className="text-[7px] px-1 py-px rounded-full font-mono border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200/80 flex-shrink-0"
            >
              UV
            </span>
          )}
        </div>
        <div className="shrink-0 text-right tabular-nums leading-tight">
          <div
            className={`text-xs font-mono font-semibold ${row.highlight ? '' : 'text-primary'}`}
            style={valueStyle}
          >
            {fmtValue(row.zat, currencyMode, zecPrice)}
          </div>
          <div className="text-[10px] font-mono text-muted">{row.pct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Desktop: single row */}
      <div className={`hidden sm:flex items-center justify-between py-2 px-3 rounded-lg ${rowShell}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
          <span className={`text-sm ${nameClass}`} style={valueStyle}>{row.name}</span>
          {row.name === 'Orchard' && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-mono border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200/80 flex-shrink-0">
              unverified
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 tabular-nums">
          <span
            className={`text-sm font-mono font-semibold ${row.highlight ? '' : 'text-primary'}`}
            style={valueStyle}
          >
            {fmtValue(row.zat, currencyMode, zecPrice)}
          </span>
          <span className="text-[10px] font-mono text-muted w-12 text-right">{row.pct.toFixed(1)}%</span>
        </div>
      </div>
    </>
  );
}

// ─── Section 2: Supply Verification ──────────────────────────────────────────

interface PoolRow {
  name: string;
  zat: number;
  pct: number;
  color?: string;
  highlight?: boolean;
  category: 'transparent' | 'shielded';
}

function SupplyVerification({
  overview,
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  overview: Overview | null;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const audit = overview?.supplyAudit;
  const pools = overview?.poolSizes;
  if (!audit || !pools) return null;

  const totalSupply = pools.chainSupplyZat;

  // Fold deferred/lockbox into transparent (not a separate pool)
  const transparentZat = (pools.transparentZat ?? 0) + (pools.deferredZat ?? 0);

  const poolRows: PoolRow[] = [];
  if (transparentZat > 0) {
    poolRows.push({ name: 'Transparent', zat: transparentZat, pct: 0, color: colors.transparent, category: 'transparent' });
  }
  if (pools.sproutZat > 0) {
    poolRows.push({ name: 'Sprout', zat: pools.sproutZat, pct: 0, color: colors.sprout, category: 'shielded' });
  }
  if (pools.saplingZat > 0) {
    poolRows.push({ name: 'Sapling', zat: pools.saplingZat, pct: 0, color: colors.sapling, category: 'shielded' });
  }
  poolRows.push({ name: 'Orchard', zat: pools.orchardZat, pct: 0, color: colors.orchardPool, category: 'shielded' });
  poolRows.push({ name: 'Ironwood', zat: pools.ironwoodZat, pct: 0, color: colors.ironwoodPool, highlight: true, category: 'shielded' });

  const transparentPools = poolRows.filter((r) => r.category === 'transparent');
  const shieldedPools = poolRows.filter((r) => r.category === 'shielded');

  const computedTotal = poolRows.reduce((sum, r) => sum + r.zat, 0);
  const displayTotal = totalSupply ?? computedTotal;
  poolRows.forEach((r) => { r.pct = displayTotal > 0 ? (r.zat / displayTotal) * 100 : 0; });

  const MAX_SUPPLY_ZAT = 2_100_000_000_000_000;
  const unminedZat = MAX_SUPPLY_ZAT - displayTotal;
  const supplySum = displayTotal + unminedZat;
  const supplyBalanced = supplySum === MAX_SUPPLY_ZAT;

  const poolSum = computedTotal;
  const supplyMatch = totalSupply != null ? poolSum === totalSupply : null;

  // Use server-computed supply verification (single source of truth)
  // When Zebra RPC is unavailable, supplyVerification will be null — show only pool data
  const sv = overview?.supplyVerification;
  const hasSupplyData = sv != null && sv.chainSupplyZat != null;
  const verifiedZat = hasSupplyData ? sv.verifiedZat : 0;
  const unverifiedZat = hasSupplyData ? sv.unverifiedZat : pools.orchardZat;
  const verifiedPct = hasSupplyData ? sv.verifiedPct : null;

  // Donut data: two segments — verified (green) and Orchard/unverified (purple)
  // Use a minimum visual value so the Orchard segment is always clearly visible
  const minVisualPct = 5;
  const orchardVisualPct = verifiedPct != null ? Math.max(100 - verifiedPct, minVisualPct) : 50;
  const ringData = [
    { name: 'Verified', value: 100 - orchardVisualPct },
    { name: 'Orchard', value: orchardVisualPct },
  ];
  const RING_COLORS = [colors.verifiedRing, colors.orchardPool];
  const shareText = verifiedPct != null
    ? `${verifiedPct.toFixed(1)}% of Zcash supply cryptographically verified. No inflation detected.\n\nhttps://cipherscan.app/ironwood`
    : `Zcash Ironwood migration tracker\n\nhttps://cipherscan.app/ironwood`;

  return (
    <div id="supply" className="scroll-mt-20">
      <ShareableCard
        title="Zcash supply verification"
        sourceHeight={pools.sourceHeight}
        isLive={pools.isLive}
        shareText={shareText}
        fileName="cipherscan-supply.png"
      >
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] lg:grid-cols-[5fr_7fr] gap-6 sm:gap-10 lg:gap-14 items-center">
        {/* Left: Ring */}
        <div className="flex flex-col items-center justify-center w-full px-2 sm:px-6 lg:px-10 py-2 sm:py-4">
          <div className="relative w-44 h-44 sm:w-48 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ringData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="95%"
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                  animationDuration={800}
                >
                  {ringData.map((_, i) => (
                    <Cell key={i} fill={RING_COLORS[i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono text-primary leading-none">
                {verifiedPct != null ? `${verifiedPct.toFixed(1)}%` : '—'}
              </span>
              <span className="text-[10px] text-emerald-400/70 mt-1 font-medium">supply verified</span>
            </div>
          </div>

          {/* Legend below ring */}
          <div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap mt-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-muted">Verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.orchardPool }} />
              <span className="text-muted">
                <span className="sm:hidden">Unverified</span>
                <span className="hidden sm:inline">Unverified (Orchard)</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Pool breakdown */}
        <div className="w-full min-w-0 sm:space-y-1 sm:pl-2 lg:pl-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-3 px-0.5">
            <span className="text-xs font-bold text-primary">Pool balances</span>
            {supplyMatch != null && (
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${supplyMatch ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                <span className={`text-[10px] font-mono ${supplyMatch ? 'text-emerald-400/70' : 'text-red-400'}`}>
                  {supplyMatch ? 'No inflation' : 'Mismatch'}
                </span>
              </div>
            )}
          </div>
          <div className="divide-y divide-cipher-border/15 sm:divide-y-0">
            {transparentPools.map((row) => (
              <PoolBalanceRow key={row.name} row={row} currencyMode={currencyMode} zecPrice={zecPrice} />
            ))}
            {transparentPools.length > 0 && shieldedPools.length > 0 && (
              <div className="my-1 border-t border-cipher-border-subtle sm:my-2" aria-hidden="true" />
            )}
            {shieldedPools.map((row) => (
              <PoolBalanceRow key={row.name} row={row} currencyMode={currencyMode} zecPrice={zecPrice} />
            ))}
          </div>
          <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-cipher-border/30 px-2 sm:px-3">
            <span className="text-[11px] sm:text-xs text-secondary">Mined</span>
            <span className="text-[11px] sm:text-sm font-mono text-primary">{fmtValue(displayTotal, currencyMode, zecPrice)}</span>
          </div>
          <div className="flex items-center justify-between px-2 sm:px-3 py-0.5 sm:py-1">
            <span className="text-[11px] sm:text-xs text-secondary">Unmined</span>
            <span className="text-[11px] sm:text-sm font-mono text-primary">{fmtValue(unminedZat, currencyMode, zecPrice)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-cipher-border/30 px-2 sm:px-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-primary">Max supply</span>
              {supplyBalanced && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </div>
            <span className="text-[11px] sm:text-sm font-mono font-bold text-primary">{fmtValue(MAX_SUPPLY_ZAT, currencyMode, zecPrice)}</span>
          </div>
        </div>
      </div>
    </ShareableCard>
    </div>
  );
}

function IronwoodLedgerStat({
  icon,
  label,
  hint,
  value,
  valueColor,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-cipher-border/25 bg-glass-3/20 px-3 py-2 sm:py-2.5">
      <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-stretch sm:gap-0">
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-muted">
          {icon}
          {label}
        </div>
        <div
          className="shrink-0 text-sm font-mono font-semibold tabular-nums text-primary sm:mt-1 sm:shrink"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </div>
      </div>
      <div className="mt-1 text-[9px] leading-snug text-muted/55 sm:mt-0.5">{hint}</div>
    </div>
  );
}

function InflowSources({
  sources,
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  sources: NonNullable<Overview['inflowSources']>;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const rows = [
    { name: 'Orchard (ZIP-318)', zat: sources.fromOrchardZat, txs: sources.fromOrchardTxs, color: colors.orchardPool, group: 'shielded' as const },
    { name: 'Sapling', zat: sources.fromSaplingZat, txs: sources.fromSaplingTxs, color: colors.sapling, group: 'shielded' as const },
    { name: 'Transparent', zat: sources.fromTransparentZat, txs: sources.fromTransparentTxs, color: colors.transparent, group: 'transparent' as const },
    { name: 'Coinbase', zat: sources.fromCoinbaseZat, txs: sources.fromCoinbaseTxs, color: colors.coinbase, group: 'mining' as const },
  ].filter((r) => r.zat > 0 || r.txs > 0);

  if (rows.length === 0) return null;

  const totalIn = sources.totalInZat;
  const netZat = sources.totalInZat - sources.totalOutZat;
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const fmt = (zat: number) => fmtValue(zat, currencyMode, zecPrice);
  const activeName = selected ?? hovered;

  const handleSelect = (name: string) => {
    setSelected((prev) => (prev === name ? null : name));
  };

  return (
    <div>
      <InflowFlow
        rows={rows}
        activeName={activeName}
        onHover={setHovered}
        onSelect={handleSelect}
        formatValue={fmt}
        ironwoodColor={colors.ironwoodPool}
        ironwoodZat={netZat}
      />

      <p className="mb-4 min-h-[1.125rem] text-[11px] font-mono text-secondary">
        {activeName ? (() => {
          const r = rows.find((x) => x.name === activeName);
          if (!r) return null;
          const pct = totalIn > 0 ? (r.zat / totalIn) * 100 : 0;
          const path = inflowPathDescription(r.name);
          return (
            <>
              <span style={{ color: r.color }}>{r.name}</span>
              {' · '}{path}
              {' · '}{fmt(r.zat)} · {r.txs.toLocaleString()} txs · {pct.toFixed(1)}%
              {selected === r.name ? (
                <span className="ml-2 text-[10px] text-muted/50">(pinned)</span>
              ) : null}
            </>
          );
        })() : (
          <span className="text-muted/45">Click a source to pin details · hover to preview</span>
        )}
      </p>

      <div className="grid grid-cols-1 gap-2 border-t border-cipher-border/20 pt-4 sm:grid-cols-3">
        <IronwoodLedgerStat
          icon={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-emerald-400/80">
              <path d="M1 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          label="Into Ironwood"
          hint="Indexed value entering the pool"
          value={fmt(totalIn)}
        />
        {sources.totalOutZat > 0 && (
          <>
            <IronwoodLedgerStat
              icon={
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-muted/70">
                  <path d="M9 5H3M7 2 4 5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              label="Out of Ironwood"
              hint="Indexed value leaving the pool"
              value={fmt(sources.totalOutZat)}
            />
            <IronwoodLedgerStat
              icon={
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ color: colors.ironwoodPool }}>
                  <path d="M2 5h6M5 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              }
              label="Net in pool"
              hint="In minus out (matches pool balance)"
              value={fmt(netZat)}
              valueColor={colors.ironwoodPool}
            />
          </>
        )}
      </div>
    </div>
  );
}

function IronwoodInflowCard({
  sources,
  pools,
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  sources: NonNullable<Overview['inflowSources']>;
  pools: NonNullable<Overview['poolSizes']>;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const netZat = sources.totalInZat - sources.totalOutZat;
  const fmt = (zat: number) => fmtValue(zat, currencyMode, zecPrice);
  const shareText = `Ironwood pool inflows on Zcash: ${fmt(sources.totalInZat)} in, ${fmt(sources.totalOutZat)} out, ${fmt(netZat)} net.\n\nhttps://cipherscan.app/ironwood`;

  return (
    <ShareableCard
      title="Where Ironwood ZEC comes from"
      sourceHeight={pools.sourceHeight}
      isLive={pools.isLive}
      shareText={shareText}
      fileName="cipherscan-ironwood-inflows.png"
      watermark={false}
    >
      <InflowSources sources={sources} colors={colors} currencyMode={currencyMode} zecPrice={zecPrice} />
    </ShareableCard>
  );
}

// ─── Section 3: Migration Activity ───────────────────────────────────────────

type ActivityView = 'cohorts' | 'hourly' | 'daily';

const ACTIVITY_VIEWS: { id: ActivityView; label: string }[] = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'cohorts', label: 'Cohorts' },
  { id: 'daily', label: 'Daily' },
];

interface VelocityBucket {
  label: string;
  ts: number;
  volume: number;
  txCount: number;
}

function bucketTransactions(txs: ScatterTx[], mode: 'hourly' | 'daily'): VelocityBucket[] {
  if (txs.length === 0) return [];

  const msPerBucket = mode === 'hourly' ? 3600_000 : 86400_000;
  const map = new Map<number, { volume: number; txCount: number }>();

  for (const tx of txs) {
    if (tx.timestamp == null) continue;
    const bucket = Math.floor((tx.timestamp * 1000) / msPerBucket) * msPerBucket;
    const existing = map.get(bucket);
    if (existing) {
      existing.volume += tx.amountZec;
      existing.txCount += 1;
    } else {
      map.set(bucket, { volume: tx.amountZec, txCount: 1 });
    }
  }

  const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);

  if (sorted.length >= 2) {
    const [first] = sorted[0];
    const [last] = sorted[sorted.length - 1];
    for (let t = first; t <= last; t += msPerBucket) {
      if (!map.has(t)) sorted.push([t, { volume: 0, txCount: 0 }]);
    }
    sorted.sort((a, b) => a[0] - b[0]);
  }

  const fmtHour = (d: Date) =>
    `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
  const fmtDay = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  return sorted.map(([ts, data]) => ({
    label: mode === 'hourly' ? fmtHour(new Date(ts)) : fmtDay(new Date(ts)),
    ts,
    volume: Math.round(data.volume * 100) / 100,
    txCount: data.txCount,
  }));
}

function MigrationActivity({
  cohorts,
  scatter,
  activated,
  colors,
  tipHeight,
  currencyMode,
  zecPrice,
}: {
  cohorts: Cohorts | null;
  scatter: ScatterData | null;
  activated: boolean;
  colors: ChartColors;
  tipHeight: number;
  currencyMode: CurrencyMode;
  zecPrice: number | null;
}) {
  const [view, setView] = useState<ActivityView>('hourly');

  // Cohort data
  const cohortData = useMemo(
    () =>
      (cohorts?.cohorts ?? []).map((c) => ({
        boundary: c.boundaryStartHeight,
        volume: zec(c.volumeZat),
        txCount: c.txCount,
        firstTime: c.firstTime,
      })),
    [cohorts?.cohorts],
  );

  // Time-bucketed data (hourly/daily)
  const timeBuckets = useMemo(
    () => (view === 'cohorts' ? [] : bucketTransactions(scatter?.txs ?? [], view)),
    [scatter?.txs, view],
  );

  const avgCohort = cohorts?.avgAnonymitySet ?? 0;
  const totalVolumeZec = cohortData.reduce((sum, c) => sum + c.volume, 0);
  const activeCohorts = cohortData.filter((c) => c.volume > 0).length;

  // Stats for time views
  const timeTotalVolume = timeBuckets.reduce((s, b) => s + b.volume, 0);
  const timeTotalTxs = timeBuckets.reduce((s, b) => s + b.txCount, 0);
  const timePeak = timeBuckets.reduce((max, b) => (b.volume > max.volume ? b : max), timeBuckets[0] ?? { volume: 0 });
  const timeAvg = timeBuckets.length > 0 ? timeTotalVolume / timeBuckets.length : 0;

  const periodLabel = view === 'hourly' ? 'hour' : view === 'daily' ? 'day' : 'cohort';

  // Visible chart data + yMax
  const cohortPeak = cohortData.reduce((max, c) => Math.max(max, c.volume), 0);
  const visiblePeak = view === 'cohorts' ? cohortPeak : (timePeak?.volume ?? 0);
  const yMax = Math.max(Math.ceil(visiblePeak * 1.1), 1);

  const shareText =
    view === 'cohorts' && activeCohorts > 0
      ? `${totalVolumeZec.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC migrated across ${activeCohorts} Orchard→Ironwood cohorts. Avg anonymity set: ${avgCohort.toFixed(1)} txs.\n\nhttps://cipherscan.app/ironwood`
      : view !== 'cohorts' && timeTotalTxs > 0
        ? `${timeTotalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC migrated Orchard→Ironwood. Peak ${periodLabel}: ${(timePeak?.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC.\n\nhttps://cipherscan.app/ironwood`
        : `Zcash Orchard → Ironwood migration activity on CipherScan.\n\nhttps://cipherscan.app/ironwood`;

  const subtitle = view === 'cohorts'
    ? (
      <>
        <span className="sm:hidden">Volume per 144-block boundary (~3h). Each bar is one anonymity cohort.</span>
        <span className="hidden sm:inline">
          Volume per 144-block boundary (~3h). Each bar is one anonymity cohort — wallets sharing a boundary mix together.
          {avgCohort > 0 ? <> Avg cohort size: <span className="font-mono text-primary">{avgCohort.toFixed(1)} txs</span>.</> : null}
        </span>
      </>
    )
    : <>ZEC migrated from Orchard to Ironwood per {periodLabel} (UTC).{timeAvg > 0 ? <> Avg: <span className="font-mono text-primary">{fmtValue(Math.round(timeAvg * 1e8), currencyMode, zecPrice)}/{periodLabel}</span>.</> : null}</>;

  const statsRowClass = 'mb-4 flex flex-col gap-2 text-[11px] font-mono leading-snug text-muted sm:mb-3 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-1 sm:text-[10px]';

  const hasData = view === 'cohorts' ? cohortData.length > 0 : timeBuckets.length > 0;

  return (
    <div id="migration-activity" className="scroll-mt-20">
      <ShareableCard
        title="Orchard → Ironwood migration activity"
        sourceHeight={tipHeight}
        isLive={activated}
        shareText={shareText}
        fileName="cipherscan-migration-activity.png"
      >
        <p className="mb-5 max-w-2xl text-xs leading-[1.65] text-muted sm:mb-4 sm:leading-relaxed">{subtitle}</p>

        {/* Stats row */}
        {view === 'cohorts' && activeCohorts > 0 ? (
          <div className={statsRowClass}>
            <span>Total migrated <span className="text-cipher-yellow-bright">{totalVolumeZec.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC</span></span>
            <span>Peak cohort <span className="text-primary">{cohortPeak.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC</span></span>
            <span>Active cohorts <span className="text-primary">{activeCohorts}</span>{avgCohort > 0 ? <span className="text-muted/70 sm:hidden"> · avg {avgCohort.toFixed(1)} txs</span> : null}</span>
          </div>
        ) : view !== 'cohorts' && timeTotalTxs > 0 ? (
          <div className={statsRowClass}>
            <span>Total migrated <span className="text-cipher-yellow-bright">{fmtValue(Math.round(timeTotalVolume * 1e8), currencyMode, zecPrice)}</span></span>
            <span>Peak {periodLabel} <span className="text-primary">{fmtValue(Math.round((timePeak?.volume ?? 0) * 1e8), currencyMode, zecPrice)}</span></span>
            <span>Transactions <span className="text-primary">{timeTotalTxs.toLocaleString()}</span></span>
          </div>
        ) : null}

        {/* View toggle */}
        <div className="mb-4 sm:mb-3 sm:flex sm:justify-end" data-html2canvas-ignore="true">
          <SegmentedControl options={ACTIVITY_VIEWS} value={view} onChange={setView} />
        </div>

        {/* Chart */}
        {hasData ? (
          view === 'cohorts' ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cohortData} margin={{ top: 8, right: 12, bottom: 28, left: 12 }}>
                <XAxis
                  dataKey="boundary"
                  tick={{ fontSize: 10, fill: colors.axis }}
                  tickFormatter={(v: number) => v.toLocaleString()}
                  label={{ value: 'Block height', position: 'insideBottom', offset: -8, style: { fontSize: 10, fill: colors.axis, fontFamily: 'var(--font-mono)' } }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: colors.axis }}
                  width={44}
                  domain={[0, yMax]}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  label={{ value: 'Volume (ZEC)', angle: -90, position: 'insideLeft', dx: -6, style: { textAnchor: 'middle', fontSize: 10, fill: colors.axis, fontFamily: 'var(--font-mono)' } }}
                />
                <Tooltip
                  cursor={{ fill: colors.barCursor }}
                  contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px', fontSize: 12 }}
                  itemStyle={{ color: colors.tooltipText }}
                  labelStyle={{ color: 'var(--color-text-muted, #8b8b9e)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
                  labelFormatter={(v) => `Boundary @ height ${Number(v).toLocaleString()}`}
                  formatter={(val: unknown, name: unknown) =>
                    name === 'volume'
                      ? [`${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })} ZEC`, 'Volume']
                      : [Number(val), 'Txs (anonymity set)']
                  }
                />
                <Bar dataKey="volume" fill={colors.ironwoodPool} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={timeBuckets} margin={{ top: 8, right: 12, bottom: 28, left: 12 }}>
                <defs>
                  <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.ironwoodPool} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={colors.ironwoodPool} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: colors.axis }}
                  interval={view === 'hourly' ? Math.max(0, Math.floor(timeBuckets.length / 12) - 1) : 'preserveStartEnd'}
                  angle={view === 'hourly' ? -35 : 0}
                  textAnchor={view === 'hourly' ? 'end' : 'middle'}
                  height={view === 'hourly' ? 48 : 32}
                  label={{ value: 'Time (UTC)', position: 'insideBottom', offset: view === 'hourly' ? -4 : -8, style: { fontSize: 10, fill: colors.axis, fontFamily: 'var(--font-mono)' } }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: colors.axis }}
                  width={50}
                  domain={[0, yMax]}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                  label={{ value: currencyMode === 'zec' ? 'Volume (ZEC)' : 'Volume (USD)', angle: -90, position: 'insideLeft', dx: -6, style: { textAnchor: 'middle', fontSize: 10, fill: colors.axis, fontFamily: 'var(--font-mono)' } }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px', fontSize: 12 }}
                  itemStyle={{ color: colors.tooltipText }}
                  labelStyle={{ color: 'var(--color-text-muted, #8b8b9e)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
                  formatter={(val: unknown, name: unknown) =>
                    name === 'volume'
                      ? [`${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })} ZEC`, `Volume / ${periodLabel}`]
                      : [Number(val), 'Transactions']
                  }
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke={colors.ironwoodPool}
                  strokeWidth={2}
                  fill="url(#velocityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )
        ) : (
          <EmptyPanel activated={activated} />
        )}
      </ShareableCard>
    </div>
  );
}

// ─── Section 4: Amount privacy ─────────────────────────────────────────────

type PrivacyRange = '24h' | '7d' | '30d' | 'all';

const PRIVACY_RANGES: { id: PrivacyRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All' },
];

type PrivacyView = 'volume' | 'scatter' | 'denoms';

const PRIVACY_VIEWS: { id: PrivacyView; label: string }[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'scatter', label: 'Transactions' },
  { id: 'denoms', label: 'Denomination mix' },
];

const REFERENCE_DENOMS = [
  { value: 0.01, label: '0.01 ZEC' },
  { value: 0.1, label: '0.1 ZEC' },
  { value: 1, label: '1 ZEC' },
  { value: 10, label: '10 ZEC' },
  { value: 100, label: '100 ZEC' },
];

const DENOM_BUCKETS = [
  0.001, 0.002, 0.005,
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];

function formatDenomBucketLabel(denom: number): string {
  if (denom >= 1) return String(denom);
  const s = denom.toString();
  return s.startsWith('0.') ? s.slice(1) : s;
}

const COMPLIANCE_GRADES = [
  {
    key: 'green' as const,
    label: 'ZIP-318 compliant',
    checks: '3/3',
    hint: 'Standard denomination, correct actions (O:2, I:1), boundary-aligned anchor',
  },
  {
    key: 'partial2' as const,
    label: 'Partial',
    checks: '2/3',
    hint: 'Passes two of three ZIP-318 checks',
  },
  {
    key: 'partial1' as const,
    label: 'Partial',
    checks: '1/3',
    hint: 'Passes one of three ZIP-318 checks',
  },
  {
    key: 'weak' as const,
    label: 'Weak',
    checks: '0/3',
    hint: 'Fails all three ZIP-318 checks',
  },
];

function ComplianceSummary({
  stats,
  privacyColors,
  mode,
}: {
  stats: { total: number; green: number; partial2: number; partial1: number; weak: number; greenVol: number; partial2Vol: number; partial1Vol: number; weakVol: number };
  privacyColors: Record<string, string>;
  mode: 'volume' | 'txs';
}) {
  const [hovered, setHovered] = useState<(typeof COMPLIANCE_GRADES)[number]['key'] | null>(null);

  const colorMap = {
    green: privacyColors.best,
    partial2: privacyColors.denomPadded,
    partial1: privacyColors.distinctUnpadded,
    weak: privacyColors.worst,
  };
  const countMap = {
    green: stats.green,
    partial2: stats.partial2,
    partial1: stats.partial1,
    weak: stats.weak,
  };
  const volMap = {
    green: stats.greenVol,
    partial2: stats.partial2Vol,
    partial1: stats.partial1Vol,
    weak: stats.weakVol,
  };

  const segments = COMPLIANCE_GRADES.map((g) => ({
    ...g,
    count: countMap[g.key],
    pct: stats.total > 0 ? (countMap[g.key] / stats.total) * 100 : 0,
    volPct: volMap[g.key],
    color: colorMap[g.key],
  }));

  const greenPct = stats.total > 0 ? (stats.green / stats.total) * 100 : 0;
  const greenVolPct = stats.greenVol;
  const hoveredSegment = hovered ? segments.find((s) => s.key === hovered) : null;

  const headlinePct = hoveredSegment
    ? (mode === 'volume' ? hoveredSegment.volPct : hoveredSegment.pct)
    : (mode === 'volume' ? greenVolPct : greenPct);

  return (
    <div
      className="mb-3 rounded-lg border border-cipher-border/30 bg-glass-3 px-3 py-2"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="text-xl font-semibold tabular-nums leading-none tracking-tight transition-colors"
            style={{ color: hoveredSegment?.color ?? privacyColors.best }}
          >
            {headlinePct.toFixed(hoveredSegment ? 1 : 0)}%
          </div>
          <div className="mt-1 min-h-8 text-[10px] font-mono leading-snug text-muted">
            {hoveredSegment ? (
              <>
                <span className="text-secondary">{hoveredSegment.label} ({hoveredSegment.checks})</span>
                {' · '}
                <span className="text-primary">{hoveredSegment.count.toLocaleString()} txs</span>
                {' · '}
                {hoveredSegment.hint}
                {' · '}
                {hoveredSegment.volPct.toFixed(0)}% by volume
              </>
            ) : (
              <>
                <span className="text-secondary">ZIP-318 compliant ({stats.green}/{stats.total})</span>
                {' · '}
                <span className="text-primary">{stats.green.toLocaleString()} txs</span>
                {' · '}
                Standard denomination, correct actions (O:2, I:1), boundary-aligned anchor
              </>
            )}
          </div>
        </div>

        <span className="shrink-0 text-[10px] font-mono text-muted pt-0.5">{stats.total.toLocaleString()} txs</span>
      </div>

      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-cipher-border/20">
        {segments.filter((s) => s.count > 0).map((s) => (
          <button
            key={s.key}
            type="button"
            className="relative h-full transition-all focus:outline-none"
            style={{
              width: `${mode === 'volume' ? s.volPct : s.pct}%`,
              backgroundColor: s.color,
              minWidth: 4,
              opacity: hovered && hovered !== s.key ? 0.45 : 1,
              boxShadow: hovered === s.key ? `inset 0 0 0 1px ${s.color}, 0 0 0 2px rgba(255,255,255,0.15)` : undefined,
            }}
            onMouseEnter={() => setHovered(s.key)}
            onFocus={() => setHovered(s.key)}
            aria-label={`${s.label} (${s.checks}): ${s.pct.toFixed(1)}%, ${s.count} transactions, ${s.volPct.toFixed(0)}% by volume. ${s.hint}`}
          />
        ))}
      </div>
    </div>
  );
}

function DenomMixChart({
  denomBuckets,
  maxBucketCount,
  maxBucketVolume,
  totalDenomVolume,
  totalTxs,
  barColor,
  mode,
}: {
  denomBuckets: { denom: number; count: number; volume: number }[];
  maxBucketCount: number;
  maxBucketVolume: number;
  totalDenomVolume: number;
  totalTxs: number;
  barColor: string;
  mode: 'volume' | 'txs';
}) {
  const isVolume = mode === 'volume';
  return (
    <div className="min-w-0 w-full">
      <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] sm:overflow-visible">
        <div className="flex h-[200px] min-w-max items-end gap-1 border-b border-cipher-border/25 pb-2 sm:h-[220px] sm:min-w-0 sm:w-full sm:gap-3 sm:px-2">
          {denomBuckets.map(({ denom, count, volume }) => {
            const value = isVolume ? volume : count;
            const max = isVolume ? maxBucketVolume : maxBucketCount;
            const label = isVolume
              ? (totalDenomVolume > 0 ? `${((volume / totalDenomVolume) * 100).toFixed(0)}%` : '0%')
              : String(count);
            return (
              <div
                key={denom}
                className="flex w-6 shrink-0 flex-col items-center gap-1 sm:min-w-0 sm:w-auto sm:max-w-[56px] sm:flex-1 sm:gap-2 sm:min-w-[44px]"
              >
                <span className="text-[9px] font-mono tabular-nums text-primary sm:text-[10px]">{label}</span>
                <div
                  className="w-full min-w-[4px] rounded-t-md"
                  style={{
                    height: `${max > 0 ? Math.max(8, (value / max) * 160) : 8}px`,
                    backgroundColor: barColor,
                    opacity: 0.9,
                  }}
                />
                <span className="max-w-full truncate text-[9px] font-mono text-muted sm:text-[10px]">
                  {formatDenomBucketLabel(denom)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] font-mono text-muted max-sm:px-1">
        {isVolume
          ? `${totalDenomVolume.toLocaleString(undefined, { maximumFractionDigits: 1 })} ZEC across ${totalTxs} txs`
          : `${totalTxs} txs · standard denominations`}
      </p>
    </div>
  );
}

function ComplianceLegend({
  privacyColors,
  denomLineColor,
}: {
  privacyColors: Record<string, string>;
  denomLineColor: string;
}) {
  const colorMap = {
    green: privacyColors.best,
    partial2: privacyColors.denomPadded,
    partial1: privacyColors.distinctUnpadded,
    weak: privacyColors.worst,
  };

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-mono text-muted sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
      {COMPLIANCE_GRADES.map((g) => (
        <span key={g.key} className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorMap[g.key] }} />
          <span className="truncate sm:whitespace-normal">
            {g.key === 'green' ? (
              <>
                <span className="sm:hidden">Compliant ({g.checks})</span>
                <span className="hidden sm:inline">{g.label} ({g.checks})</span>
              </>
            ) : (
              <>
                {g.label} ({g.checks})
              </>
            )}
          </span>
        </span>
      ))}
      <span className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
        <span className="inline-block h-0 w-4 shrink-0 border-t border-dashed" style={{ borderColor: denomLineColor, opacity: 0.75 }} />
        Target denominations
      </span>
    </div>
  );
}

function PrivacyScore({
  scatter,
  activated,
  colors,
  tipHeight,
}: {
  scatter: ScatterData | null;
  activated: boolean;
  colors: ChartColors;
  tipHeight: number;
}) {
  const router = useRouter();
  const [range, setRange] = useState<PrivacyRange>('7d');
  const [view, setView] = useState<PrivacyView>('scatter');

  const filteredTxs = useMemo(() => {
    const txs = scatter?.txs ?? [];
    if (range === 'all') return txs;
    const secs = range === '24h' ? 86400 : range === '7d' ? 7 * 86400 : 30 * 86400;
    const cutoff = Math.floor(Date.now() / 1000) - secs;
    return txs.filter((tx) => tx.timestamp != null && tx.timestamp >= cutoff);
  }, [scatter?.txs, range]);

  const headlineStats = useMemo(() => {
    if (!scatter) {
      return { denomCount: 0, total: 0, txPct: 0, volPct: 0 };
    }
    const denomVol = (scatter.denominatedVolumeZat ?? 0) / 1e8;
    const distVol = (scatter.distinctiveVolumeZat ?? 0) / 1e8;
    const totalVol = denomVol + distVol;
    return {
      denomCount: scatter.denominatedCount,
      total: scatter.total,
      txPct: scatter.total > 0 ? (scatter.denominatedCount / scatter.total) * 100 : 0,
      volPct: totalVol > 0 ? (denomVol / totalVol) * 100 : 0,
    };
  }, [scatter]);

  const PRIVACY_COLORS = {
    best: '#4ade80',
    denomPadded: '#fbbf24',
    distinctUnpadded: '#f97316',
    worst: '#dc2626',
  };

  const allPoints: ScatterPoint[] = useMemo(
    () =>
      filteredTxs.map((tx) => ({
        x: tx.height,
        y: tx.amountZec,
        txid: tx.txid,
        privacy: tx.privacy,
        matched: tx.matchedDenomination,
        iwActions: tx.ironwoodActions,
        orchardActions: tx.orchardActions,
        anchorCompliant: tx.anchorCompliant,
      })),
    [filteredTxs],
  );

  const volumeAreaData = useMemo(
    () =>
      filteredTxs.map((tx) => {
        let checks = 0;
        if (tx.privacy === 'denominated') checks++;
        if ((tx.orchardActions ?? 0) === 2 && (tx.ironwoodActions ?? 0) === 1) checks++;
        if (tx.anchorCompliant) checks++;
        const grade = checks === 3 ? 'green' as const
          : checks === 2 ? 'partial2' as const
          : checks === 1 ? 'partial1' as const
          : 'weak' as const;
        return { height: tx.height, amountZec: tx.amountZec, grade };
      }),
    [filteredTxs],
  );

  const denomBuckets = useMemo(() => {
    const counts = new Map<number, { count: number; volume: number }>();
    for (const tx of filteredTxs) {
      if (tx.privacy === 'denominated' && tx.matchedDenomination != null) {
        const d = tx.matchedDenomination;
        const existing = counts.get(d) ?? { count: 0, volume: 0 };
        existing.count++;
        existing.volume += tx.amountZec;
        counts.set(d, existing);
      }
    }
    return DENOM_BUCKETS.map((denom) => {
      const data = counts.get(denom) ?? { count: 0, volume: 0 };
      return { denom, count: data.count, volume: data.volume };
    }).filter((b) => b.count > 0);
  }, [filteredTxs]);

  const maxBucketCount = denomBuckets.reduce((m, b) => Math.max(m, b.count), 0);
  const maxBucketVolume = denomBuckets.reduce((m, b) => Math.max(m, b.volume), 0);
  const totalDenomVolume = denomBuckets.reduce((s, b) => s + b.volume, 0);

  const complianceStats = useMemo(() => {
    const t = filteredTxs.length;
    if (t === 0) return null;
    let g = 0, p2 = 0, p1 = 0, w = 0;
    let gVol = 0, p2Vol = 0, p1Vol = 0, wVol = 0;
    for (const tx of filteredTxs) {
      let checks = 0;
      if (tx.privacy === 'denominated') checks++;
      if ((tx.orchardActions ?? 0) === 2 && (tx.ironwoodActions ?? 0) === 1) checks++;
      if (tx.anchorCompliant) checks++;
      if (checks === 3) { g++; gVol += tx.amountZec; }
      else if (checks === 2) { p2++; p2Vol += tx.amountZec; }
      else if (checks === 1) { p1++; p1Vol += tx.amountZec; }
      else { w++; wVol += tx.amountZec; }
    }
    const totalVol = gVol + p2Vol + p1Vol + wVol;
    return {
      total: t, green: g, partial2: p2, partial1: p1, weak: w,
      greenVol: totalVol > 0 ? (gVol / totalVol) * 100 : 0,
      partial2Vol: totalVol > 0 ? (p2Vol / totalVol) * 100 : 0,
      partial1Vol: totalVol > 0 ? (p1Vol / totalVol) * 100 : 0,
      weakVol: totalVol > 0 ? (wVol / totalVol) * 100 : 0,
    };
  }, [filteredTxs]);

  const hasData = (scatter?.total ?? 0) > 0;
  const hasFilteredData = filteredTxs.length > 0;
  const shareText =
    hasFilteredData && complianceStats
      ? `ZIP-318 compliance: ${(complianceStats.green / complianceStats.total * 100).toFixed(1)}% fully compliant (${complianceStats.green}/${complianceStats.total} txs). ${headlineStats.txPct.toFixed(0)}% use standard denominations.\n\nhttps://cipherscan.app/ironwood`
      : `Zcash migration privacy on CipherScan.\n\nhttps://cipherscan.app/ironwood`;

  return (
    <div id="privacy-score" className="scroll-mt-20">
      <ShareableCard
        title="Amount privacy"
        sourceHeight={tipHeight}
        isLive={activated}
        shareText={shareText}
        fileName="cipherscan-privacy.png"
      >
        <div className="mb-4">
          <p className="max-w-2xl text-xs leading-relaxed text-muted">
            Each dot is one Orchard → Ironwood migration. Click a dot to open the transaction.
          </p>
        </div>

        {scatter && hasData && complianceStats ? (
          <ComplianceSummary
            stats={complianceStats}
            privacyColors={PRIVACY_COLORS}
            mode={view === 'scatter' ? 'txs' : 'volume'}
          />
        ) : null}

        {hasData && hasFilteredData ? (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-html2canvas-ignore="true">
              <SegmentedControl options={PRIVACY_VIEWS} value={view} onChange={setView} />
              <SegmentedControl options={PRIVACY_RANGES} value={range} onChange={setRange} className="sm:shrink-0" />
            </div>

            {view === 'denoms' ? (
              denomBuckets.length > 0 ? (
                <DenomMixChart
                  denomBuckets={denomBuckets}
                  maxBucketCount={maxBucketCount}
                  maxBucketVolume={maxBucketVolume}
                  totalDenomVolume={totalDenomVolume}
                  totalTxs={filteredTxs.length}
                  barColor={colors.denominated}
                  mode="volume"
                />
              ) : (
                <p className="py-16 text-center text-xs font-mono text-muted">No standard denominations in this range.</p>
              )
            ) : view === 'volume' ? (
            <>
            <div style={{ width: '100%', height: 280 }}>
              <ParentSize debounceTime={100}>
                {({ width: parentWidth }) =>
                  parentWidth > 0 ? (
                    <VolumeAreaChart
                      data={volumeAreaData}
                      width={parentWidth}
                      height={280}
                      colors={colors}
                      privacyColors={PRIVACY_COLORS}
                    />
                  ) : null
                }
              </ParentSize>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-cipher-border/30 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <ComplianceLegend
                privacyColors={PRIVACY_COLORS}
                denomLineColor={colors.denominated}
              />
              <div className="shrink-0 text-[10px] font-mono text-muted">
                {filteredTxs.length} txs in range · stacked volume
              </div>
            </div>
            </>
            ) : (
            <>
            <div style={{ width: '100%', height: 280 }}>
              <ParentSize debounceTime={100}>
                {({ width: parentWidth }) =>
                  parentWidth > 0 ? (
                    <PrivacyScatterChart
                      data={allPoints}
                      width={parentWidth}
                      height={280}
                      colors={colors}
                      privacyColors={PRIVACY_COLORS}
                      referenceLines={REFERENCE_DENOMS}
                      onDotClick={(txid) => router.push(`/tx/${txid}`)}
                    />
                  ) : null
                }
              </ParentSize>
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-cipher-border/30 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <ComplianceLegend
                privacyColors={PRIVACY_COLORS}
                denomLineColor={colors.denominated}
              />
              <div className="shrink-0 text-[10px] font-mono text-muted">
                {filteredTxs.length} txs in range · log scale
              </div>
            </div>
            </>
            )}
          </>
        ) : hasData ? (
          <p className="py-8 text-center text-xs font-mono text-muted">No migrations in this range.</p>
        ) : (
          <EmptyPanel activated={activated} />
        )}
      </ShareableCard>
    </div>
  );
}

// ─── Section 5: Migration Tiers (Who's Migrating?) ──────────────────────────

const TIER_BOUNDARIES_ZAT = [1e8, 10e8, 100e8, 1000e8];
const TIER_LABELS = ['Under 1', '1–10', '10–100', '100–1K', '1K+'];
const TIER_COLORS = ['#94a3b8', '#60a5fa', '#a78bfa', '#f59e0b', '#ef4444'];

function formatTierVolumePct(pct: number): string {
  if (pct < 0.1 && pct > 0) return `${pct.toFixed(2)}%`;
  if (pct < 1 && pct > 0) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

function classifyTierLocal(zat: number): number {
  for (let i = 0; i < TIER_BOUNDARIES_ZAT.length; i++) {
    if (zat < TIER_BOUNDARIES_ZAT[i]) return i;
  }
  return TIER_BOUNDARIES_ZAT.length;
}

interface TierTx { t: number; h: number; a: number }

function MigrationTiers({
  activated,
  colors,
  tipHeight,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  activated: boolean;
  colors: ReturnType<typeof getChartColors>;
  tipHeight: number;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const [allTxs, setAllTxs] = useState<TierTx[]>([]);
  const [mode, setMode] = useState<'live' | 'scrub'>('live');
  const [scrubIdx, setScrubIdx] = useState(1000);
  useEffect(() => {
    if (!activated) return;
    const url = `${getApiUrl()}/api/migration/tiers`;
    fetch(url).then(r => r.json()).then(d => {
      if (d.success && d.txs) setAllTxs(d.txs);
    }).catch(() => {});
  }, [activated]);

  const maxIdx = allTxs.length;
  const visibleTxs = useMemo(() => {
    if (mode === 'live' || scrubIdx >= maxIdx) return allTxs;
    return allTxs.slice(0, scrubIdx);
  }, [allTxs, mode, scrubIdx, maxIdx]);

  const tierData = useMemo(() => {
    const counts = new Array(5).fill(0);
    const volumes = new Array(5).fill(0);
    for (const tx of visibleTxs) {
      const tier = classifyTierLocal(tx.a);
      counts[tier]++;
      volumes[tier] += tx.a;
    }
    const totalVol = volumes.reduce((s: number, v: number) => s + v, 0);
    return TIER_LABELS.map((label, i) => ({
      label,
      count: counts[i],
      volumeZat: volumes[i],
      volumeZec: volumes[i] / 1e8,
      volumePct: totalVol > 0 ? (volumes[i] / totalVol) * 100 : 0,
      fill: TIER_COLORS[i],
    }));
  }, [visibleTxs]);

  const totalTxs = visibleTxs.length;
  const totalVolZat = tierData.reduce((s, t) => s + t.volumeZat, 0);
  const totalVol = totalVolZat / 1e8;
  const maxVol = Math.max(...tierData.map(t => t.volumeZec));
  const scrubDate = useMemo(() => {
    if (mode === 'live' || !visibleTxs.length) return null;
    const last = visibleTxs[visibleTxs.length - 1];
    return last?.t ? new Date(last.t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC' : null;
  }, [mode, visibleTxs]);

  if (!activated) return null;
  if (!allTxs.length) return null;

  return (
    <div id="migration-tiers" className="scroll-mt-20">
      <ShareableCard
        title="Who's migrating?"
        sourceHeight={tipHeight}
        isLive={activated}
        shareText={`Ironwood migration by size: ${tierData.map(t => `${t.label} ZEC: ${t.count} txs (${t.volumePct.toFixed(0)}% vol)`).join(' · ')}\n\nhttps://cipherscan.app/ironwood`}
        fileName="cipherscan-migration-tiers.png"
      >
        <p className="text-xs text-muted mb-5">
          Orchard → Ironwood migration volume by transaction size. Drag the scrubber to see how the distribution evolved.
        </p>

        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-4 text-[10px] font-mono text-muted">
          <span><span className="text-primary font-bold text-sm">{totalTxs.toLocaleString()}</span> transactions</span>
          <span><span className="text-primary font-bold text-sm">{fmtValue(totalVolZat, currencyMode, zecPrice)}</span> total</span>
        </div>

        {/* Mobile — horizontal breakdown (iOS Storage-style) */}
        <div className="flex flex-col gap-3.5 sm:hidden">
          {tierData.map((tier, i) => (
              <div key={tier.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-semibold text-primary">{tier.label}</span>
                    <span className="ml-2 text-[10px] font-mono text-muted">{tier.count.toLocaleString()} txs</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs font-mono font-bold tabular-nums text-primary">
                      {fmtValue(tier.volumeZat, currencyMode, zecPrice)}
                    </span>
                    <span className="ml-1.5 text-[10px] font-mono text-muted">{formatTierVolumePct(tier.volumePct)}</span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-glass-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(tier.volumePct, tier.count > 0 ? 1 : 0)}%`,
                      backgroundColor: TIER_COLORS[i],
                      opacity: tier.count > 0 ? 0.9 : 0.25,
                    }}
                  />
                </div>
              </div>
          ))}
        </div>

        {/* Desktop — vertical column chart */}
        <div className="hidden sm:grid sm:grid-cols-5 sm:gap-3">
          {tierData.map((tier, i) => {
            const barPct = maxVol > 0 ? (tier.volumeZec / maxVol) * 100 : 0;
            return (
              <div key={tier.label} className="flex flex-col items-center">
                <div className="mb-1 text-xs font-mono font-bold text-primary">
                  {fmtValue(tier.volumeZat, currencyMode, zecPrice)}
                </div>
                <div className="mb-2 text-[9px] font-mono text-muted">{formatTierVolumePct(tier.volumePct)}</div>
                <div className="relative flex h-[140px] w-full justify-center">
                  <div className="relative h-full w-10 overflow-hidden rounded-t-md bg-glass-3">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-500"
                      style={{ height: `${Math.max(barPct, 2)}%`, backgroundColor: TIER_COLORS[i], opacity: 0.85 }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-center text-[10px] font-mono text-muted">{tier.label}</div>
                <div className="text-[10px] font-mono text-muted/60">{tier.count} txs</div>
              </div>
            );
          })}
        </div>

        <div className="mb-4 mt-3 hidden text-center text-[10px] font-mono text-muted sm:block">
          Orchard → Ironwood volume by migration size · {totalTxs.toLocaleString()} total txs
        </div>

        {/* Scrubber */}
        <div className="mt-4 rounded-xl border sm:mt-2 border-cipher-border/25 bg-glass-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <div className="group relative py-2">
                <div className="relative h-2 rounded-full ring-1 ring-inset bg-glass-6 ring-cipher-border/30">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cipher-yellow/35 to-cipher-yellow/55 transition-[width] duration-100"
                    style={{ width: `${mode === 'live' ? 100 : (scrubIdx / Math.max(maxIdx, 1)) * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cipher-yellow/80 bg-cipher-yellow shadow-sm"
                    style={{ left: `${mode === 'live' ? 100 : (scrubIdx / Math.max(maxIdx, 1)) * 100}%` }}
                  />
                  <input
                    type="range"
                    min={1}
                    max={maxIdx}
                    value={mode === 'live' ? maxIdx : scrubIdx}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setMode('scrub');
                      setScrubIdx(v);
                    }}
                    className="absolute inset-0 z-[3] h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
                    aria-label="Migration timeline scrubber"
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setMode('live'); setScrubIdx(maxIdx); }}
              className="shrink-0 rounded-full border border-cipher-border/50 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cipher-border transition-all"
            >
              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-current opacity-30'}`} />
              Live
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted mt-1">
            <span>Block {allTxs[0]?.h?.toLocaleString() ?? '—'}</span>
            <span>{mode === 'live' ? `${totalTxs} migrations` : scrubDate ?? `${visibleTxs.length} migrations`}</span>
          </div>
        </div>
      </ShareableCard>
    </div>
  );
}

// ─── Section 6: Wallet Readiness ─────────────────────────────────────────────

type WalletStatus = 'zip318' | 'ready' | 'in_progress' | 'unknown';

const WALLETS: { name: string; status: WalletStatus; detail: string; link: string | null }[] = [
  { name: 'Vizor', status: 'zip318', detail: 'First wallet with full ZIP-318 compliance — standard denominations, correct actions, boundary-aligned anchors', link: 'https://vizor.cash/' },
  { name: 'zcash_pool_migration', status: 'zip318', detail: 'Reference implementation of ZIP-318: canonical 1-2-5 denominations, boundary-aligned anchors, unpadded Ironwood bundles', link: 'https://docs.rs/zcash_pool_migration/latest/zcash_pool_migration/' },
  { name: 'Cake Wallet', status: 'ready', detail: 'Mostly ZIP-318 migration is live on current app stores; automatic mainnet migration is confirmed.', link: 'https://github.com/cake-tech/cake_wallet/releases' },
  { name: 'Zcash iOS SDK', status: 'ready', detail: 'PR #1812 merged. Integrates migration crate.', link: 'https://github.com/zcash/zcash-swift-wallet-sdk/pull/1812' },
  { name: 'Zcash Android SDK', status: 'ready', detail: 'feature-orchard_migration branch. Integrates migration crate.', link: null },
  { name: 'ZODL (iOS)', status: 'ready', detail: 'Basic migration is live in v3.8.0; the private ZIP-318 flow is still in development.', link: 'https://zodl.com/' },
  { name: 'ZODL (Android)', status: 'ready', detail: 'Basic migration is live in v3.8.0; the private ZIP-318 flow is still in development.', link: 'https://zodl.com/' },
  { name: 'Zkool (Desktop)', status: 'ready', detail: 'Private migration, not ZIP-318: separate splitting and migration phases, privacy-first note selection, and a speed slider. Confirmed on mainnet in v6.25.1.', link: 'https://github.com/hhanh00/zkool2/releases' },
  { name: 'Zkool (Android)', status: 'ready', detail: 'Private migration is available in Google Play v6.25.1.', link: 'https://github.com/hhanh00/zkool2/releases' },
  { name: 'Zkool (iOS)', status: 'in_progress', detail: 'App Store v6.23.0 predates Ironwood support; awaiting a current release.', link: 'https://github.com/hhanh00/zkool2/releases' },
  { name: 'Brave', status: 'unknown', detail: 'No Ironwood migration support announced yet', link: null },
  { name: 'Edge', status: 'unknown', detail: 'Uses librustzcash SDK — depends on SDK integration', link: null },
];

const WALLET_STATUS_ORDER: WalletStatus[] = ['zip318', 'ready', 'in_progress', 'unknown'];

const WALLET_STATUS_META: Record<
  WalletStatus,
  { dot: string; short: string; group: string; summary: string }
> = {
  zip318: { dot: 'bg-emerald-400', short: 'Compliant', group: 'ZIP-318 compliant', summary: 'compliant' },
  ready: { dot: 'bg-cyan-400', short: 'Ready', group: 'Migration ready', summary: 'ready' },
  in_progress: { dot: 'bg-amber-300', short: 'Waiting', group: 'Waiting on release', summary: 'waiting' },
  unknown: { dot: 'bg-muted/70', short: 'Unknown', group: 'Unknown', summary: 'unknown' },
};

function WalletReadiness() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const counts = useMemo(() => {
    const tally: Record<WalletStatus, number> = { zip318: 0, ready: 0, in_progress: 0, unknown: 0 };
    for (const w of WALLETS) tally[w.status]++;
    return tally;
  }, []);

  const summaryLine = WALLET_STATUS_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${WALLET_STATUS_META[s].summary}`)
    .join(' · ');

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-4 sm:p-5">
      <h2 className="text-sm font-bold text-primary">Wallet readiness</h2>
      <p className="mt-1 text-xs text-muted sm:mb-4">
        Wallet support for Orchard → Ironwood migration and ZIP-318 compliance.
      </p>

      <p className="mb-3 text-[10px] font-mono text-muted sm:hidden">{summaryLine}</p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-cipher-border/50 text-left text-[10px] font-mono uppercase tracking-wider text-muted">
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

      {/* Mobile — grouped Settings-style list */}
      <div className="overflow-hidden rounded-lg border border-cipher-border/25 sm:hidden">
        {WALLET_STATUS_ORDER.map((status) => {
          const items = WALLETS.filter((w) => w.status === status);
          if (items.length === 0) return null;
          return (
            <div key={status}>
              <div className="border-b border-cipher-border/20 bg-glass-3/40 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted">
                {WALLET_STATUS_META[status].group}
              </div>
              <div className="divide-y divide-cipher-border/20">
                {items.map((w) => {
                  const isOpen = expanded === w.name;
                  const meta = WALLET_STATUS_META[w.status];
                  return (
                    <div key={w.name}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : w.name)}
                        className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors active:bg-cipher-hover"
                        aria-expanded={isOpen}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-mono text-primary">{w.name}</span>
                        <span className="shrink-0 text-[10px] font-mono text-muted">{meta.short}</span>
                        <svg
                          className={`h-3.5 w-3.5 shrink-0 text-muted/50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen ? (
                        <div className="border-t border-cipher-border/15 bg-glass-3/20 px-3 pb-3 pt-2">
                          <p className="text-[11px] leading-relaxed text-muted">{w.detail}</p>
                          {w.link ? (
                            <a
                              href={w.link}
                              target="_blank"
                              rel="noopener"
                              className="mt-2 inline-flex text-[11px] font-mono text-cipher-cyan hover:underline"
                            >
                              Open link →
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WalletStatusBadge({ status }: { status: WalletStatus }) {
  const styles = {
    zip318: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    ready: 'text-cyan-400 border-cyan-400/20 bg-cyan-400/5',
    in_progress: 'text-amber-300 border-amber-300/30 bg-amber-300/10',
    unknown: 'text-muted border-cipher-border/50 bg-glass-3',
  };
  const labels = { zip318: 'ZIP-318 Compliant', ready: 'Migration Ready', in_progress: 'Waiting on Release', unknown: 'Unknown' };
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono ${styles[status]}`}>
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
        denomination. Cohorts are grouped by 144-block anchor boundaries (~3h).
      </p>
      <div className="flex flex-wrap gap-4 mt-4 text-[11px] font-mono">
        <a href="https://zips.z.cash/zip-0258" target="_blank" rel="noopener" className="text-cipher-cyan hover:underline">
          ZIP-258 (NU6.3 Deployment)
        </a>
        <a href="https://zips.z.cash/zip-0318" target="_blank" rel="noopener" className="text-cipher-cyan hover:underline">
          ZIP-318 (Migration Spec)
        </a>
        <Link href="/privacy-risks" className="text-cipher-cyan hover:underline">
          CipherScan Privacy Scanner
        </Link>
      </div>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full rounded-lg border border-cipher-border/35 bg-glass-3/50 p-1 sm:w-auto sm:gap-1.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 ${className}`}
    >
      {options.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 rounded-md py-1.5 text-[11px] font-mono transition-all sm:flex-none sm:rounded-full sm:border sm:px-2.5 sm:py-0.5 sm:text-[10px] ${
            value === id
              ? 'bg-cipher-yellow/15 text-cipher-yellow-bright shadow-sm sm:border-cipher-yellow/40 sm:bg-cipher-yellow/10 sm:shadow-none'
              : 'text-muted hover:text-primary sm:border-cipher-border/50 sm:hover:border-cipher-border'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


function KpiRow({
  label,
  value,
  hint,
  href,
  scrollTo,
  toneColor,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  scrollTo?: string;
  toneColor?: string;
}) {
  const className =
    'group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-cipher-hover active:bg-cipher-hover';

  const body = (
    <>
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-primary">{label}</div>
        {hint ? (
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted/60 group-hover:text-muted/80">{hint}</div>
        ) : null}
      </div>
      <div
        className="shrink-0 text-right font-mono text-sm font-bold tabular-nums text-primary"
        style={toneColor ? { color: toneColor } : undefined}
      >
        {value}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (scrollTo) {
    return (
      <a href={scrollTo} className={className}>
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
}

function KpiCell({
  label,
  value,
  hint,
  href,
  scrollTo,
  toneColor,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  scrollTo?: string;
  toneColor?: string;
}) {
  const className =
    'group min-w-0 px-3 py-3 transition-colors hover:bg-cipher-hover sm:px-4 sm:py-3.5';

  const body = (
    <>
      <div
        className="text-base font-bold font-mono tabular-nums text-primary lg:text-lg"
        style={toneColor ? { color: toneColor } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted">{label}</div>
      {hint ? (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted/60 group-hover:text-muted/80">
          {hint}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (scrollTo) {
    return (
      <a href={scrollTo} className={className}>
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
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
