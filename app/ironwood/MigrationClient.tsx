'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ZAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { toPng } from 'html-to-image';
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
              {overview && (
                <TurnstileHero
                  activated={activated}
                  balanced={overview.supplyAudit?.balanced ?? true}
                  migratedPct={migratedPct}
                  blockPulseKey={overview.tipHeight}
                  orchardZec={fmtZec(overview.poolSizes.orchardZat)}
                  ironwoodZec={fmtZec(overview.poolSizes.ironwoodZat)}
                  activationHeight={knownActivationHeight}
                  tipHeight={knownTip}
                  cohorts={cohorts?.cohorts ?? null}
                  totalMigratedZat={overview.migration.totalMigratedZat}
                  originalOrchardZat={originalOrchard}
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
                colors={colors}
                currencyMode={currencyMode}
                zecPrice={zecPrice}
              />
              <SupplyVerification overview={overview} colors={colors} currencyMode={currencyMode} zecPrice={zecPrice} />
              {hasMigrations && overview?.inflowSources && overview.poolSizes && (
                <IronwoodInflowCard
                  sources={overview.inflowSources}
                  pools={overview.poolSizes}
                  colors={colors}
                  currencyMode={currencyMode}
                  zecPrice={zecPrice}
                />
              )}
              <MigrationActivity cohorts={cohorts} activated={activated} colors={colors} />
              <PrivacyScore scatter={scatter} activated={activated} colors={colors} />
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

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface">
      <div className="flex items-center gap-2 border-b border-cipher-border-subtle px-4 py-2.5 sm:px-5">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-secondary">Ironwood live</span>
      </div>
      <div className="grid grid-cols-2 divide-y divide-cipher-border-subtle sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <KpiCell
          label="Since activation"
          value={`${blocksSince.toLocaleString()} blocks`}
          hint={`Block #${activationHeight.toLocaleString()}`}
          href={`/block/${activationHeight}`}
        />
        <KpiCell
          label="Orchard → Ironwood"
          value={hasMigrations ? `${migratedPct.toFixed(1)}%` : '0%'}
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

// ─── Shareable card shell ────────────────────────────────────────────────────

function ShareableCard({
  title,
  children,
  sourceHeight,
  isLive,
  shareText,
  fileName = 'cipherscan.png',
  watermark = true,
}: {
  title: string;
  children: ReactNode;
  sourceHeight: number;
  isLive: boolean;
  shareText: string;
  fileName?: string;
  watermark?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'capturing' | 'copied'>('idle');
  const captureBg = theme === 'light' ? '#ffffff' : '#0f1419';

  const captureCard = useCallback(async () => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      backgroundColor: captureBg,
      pixelRatio: 2,
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.html2canvasIgnore) return false;
        return true;
      },
    });
    return (await fetch(dataUrl)).blob();
  }, [captureBg]);

  const handleCopy = useCallback(async () => {
    setCopyStatus('capturing');
    try {
      const blob = await captureCard();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 3000);
    } catch {
      setCopyStatus('idle');
    }
  }, [captureCard]);

  const handleShare = useCallback(async () => {
    setCopyStatus('capturing');
    try {
      const blob = await captureCard();
      if (!blob) return;
      const file = new File([blob], fileName, { type: 'image/png' });
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text: shareText, files: [file] });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank');
      }
      setCopyStatus('idle');
    } catch {
      setCopyStatus('idle');
    }
  }, [captureCard, fileName, shareText]);

  return (
    <div className="mt-4">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6"
      >
        {watermark ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="-rotate-12 select-none text-5xl font-bold font-mono tracking-[0.2em] text-black/[0.04] dark:text-white/[0.045] sm:text-6xl">
              CIPHERSCAN
            </span>
          </div>
        ) : null}

        <div className="relative">
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className="text-sm font-bold text-primary">{title}</h2>
            <div className="flex shrink-0 items-center gap-2" data-html2canvas-ignore="true">
              <button
                type="button"
                onClick={handleCopy}
                disabled={copyStatus === 'capturing'}
                className="rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
              >
                {copyStatus === 'copied' ? 'Copied!' : 'Copy image'}
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={copyStatus === 'capturing'}
                className="rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
              >
                Share to X
              </button>
            </div>
          </div>
          {children}
          <div className="mt-4 flex items-center justify-between border-t border-cipher-border/20 pt-3">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-bold font-mono text-cipher-cyan-bright tracking-tight">
                  CIPHERSCAN
                </span>
                <span className="text-[10px] font-mono text-muted/55">cipherscan.app</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted/80">
              {isLive ? 'LIVE' : 'SNAPSHOT'} · block {sourceHeight.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PoolBalanceRow({
  row,
  currencyMode,
  zecPrice,
}: {
  row: PoolRow;
  currencyMode: CurrencyMode;
  zecPrice: number | null;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-lg ${
        row.highlight ? 'bg-amber-500/[0.07] border border-amber-500/25' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
        <span
          className={`text-sm truncate ${row.highlight ? 'font-medium' : 'text-secondary'}`}
          style={row.highlight ? { color: row.color } : undefined}
        >
          {row.name}
        </span>
        {row.name === 'Orchard' && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-mono border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200/80 flex-shrink-0">
            unverified
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 tabular-nums">
        <span
          className={`text-sm font-mono font-semibold ${row.highlight ? '' : 'text-primary'}`}
          style={row.highlight ? { color: row.color } : undefined}
        >
          {fmtValue(row.zat, currencyMode, zecPrice)}
        </span>
        <span className="text-[10px] font-mono text-muted w-12 text-right">{row.pct.toFixed(1)}%</span>
      </div>
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
        title="Supply verification"
        sourceHeight={pools.sourceHeight}
        isLive={pools.isLive}
        shareText={shareText}
        fileName="cipherscan-supply.png"
      >
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] lg:grid-cols-[5fr_7fr] gap-8 sm:gap-10 lg:gap-14 items-center">
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
              <span className="text-muted">Unverified (Orchard)</span>
            </div>
          </div>
        </div>

        {/* Right: Pool breakdown */}
        <div className="w-full min-w-0 space-y-1 sm:pl-2 lg:pl-4">
          <div className="flex items-center justify-between mb-3">
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
          <div>
            {transparentPools.map((row) => (
              <PoolBalanceRow key={row.name} row={row} currencyMode={currencyMode} zecPrice={zecPrice} />
            ))}
            {transparentPools.length > 0 && shieldedPools.length > 0 && (
              <div className="my-2 border-t border-cipher-border-subtle" aria-hidden="true" />
            )}
            {shieldedPools.map((row) => (
              <PoolBalanceRow key={row.name} row={row} currencyMode={currencyMode} zecPrice={zecPrice} />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-cipher-border/30 px-3">
            <span className="text-xs text-secondary">Mined</span>
            <span className="text-sm font-mono text-primary">{fmtValue(displayTotal, currencyMode, zecPrice)}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs text-secondary">Unmined</span>
            <span className="text-sm font-mono text-primary">{fmtValue(unminedZat, currencyMode, zecPrice)}</span>
          </div>
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-cipher-border/30 px-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary">Max supply</span>
              {supplyBalanced && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </div>
            <span className="text-sm font-mono font-bold text-primary">{fmtValue(MAX_SUPPLY_ZAT, currencyMode, zecPrice)}</span>
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
    <div className="rounded-lg border border-cipher-border/25 bg-glass-3/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div
        className="mt-1 text-sm font-mono font-semibold tabular-nums text-primary"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-muted/55">{hint}</div>
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

function MigrationActivity({
  cohorts,
  activated,
  colors,
}: {
  cohorts: Cohorts | null;
  activated: boolean;
  colors: ChartColors;
}) {
  const data = (cohorts?.cohorts ?? []).map((c) => ({
    boundary: c.boundaryStartHeight,
    volume: zec(c.volumeZat),
    txCount: c.txCount,
  }));

  const avgCohort = cohorts?.avgAnonymitySet ?? 0;

  return (
    <div id="migration-activity" className="mt-4 scroll-mt-20 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Migration activity</h2>
      <p className="mt-1 mb-4 max-w-2xl text-xs leading-relaxed text-muted">
        Volume per 256-block boundary (~5.3h). Each bar is one anonymity cohort — wallets sharing a boundary mix together.
        {avgCohort > 0 ? (
          <>
            {' '}
            Avg cohort size:{' '}
            <span className="font-mono text-primary">{avgCohort.toFixed(1)} txs</span>.
          </>
        ) : null}
      </p>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <XAxis
              dataKey="boundary"
              tick={{ fontSize: 10, fill: colors.axis }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis tick={{ fontSize: 10, fill: colors.axis }} width={40} />
            <Tooltip
              cursor={{ fill: colors.barCursor }}
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: '8px',
                fontSize: 12,
              }}
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
        <EmptyPanel activated={activated} />
      )}
    </div>
  );
}

// ─── Section 4: Privacy Score ────────────────────────────────────────────────


function PrivacyScore({ scatter, activated, colors }: { scatter: ScatterData | null; activated: boolean; colors: ChartColors }) {
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
            Each dot is one ZIP-318 migration (Orchard → Ironwood). <span style={{ color: colors.denominated }} className="font-semibold">Filled</span> = standard denomination (blends in).{' '}
            <span className="text-muted">Faded</span> = distinctive amount (weakens privacy).
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
              <CartesianGrid strokeDasharray="2 6" stroke={colors.gridStroke} />
              <XAxis
                dataKey="x"
                type="number"
                name="Block"
                tick={{ fontSize: 10, fill: colors.axis }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                domain={['dataMin', 'dataMax']}
              />
              <YAxis
                dataKey="y"
                type="number"
                name="Amount"
                tick={{ fontSize: 10, fill: colors.axis }}
                scale="log"
                domain={[0.005, 'auto']}
                tickFormatter={(v) => `${v}`}
                label={{ value: 'ZEC', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: colors.axis } }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: colors.cursor }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-cipher-surface-solid border border-glass-8 rounded-lg px-3 py-2 text-xs font-mono">
                      <div className="text-muted mb-1">Block #{d.x?.toLocaleString()}</div>
                      <div className="text-primary font-bold">{d.y?.toFixed(8)} ZEC</div>
                      <div className="mt-1" style={{ color: d.privacy === 'denominated' ? colors.denominated : colors.distinctive }}>
                        {d.privacy === 'denominated' ? `Matches ${d.matched} ZEC denomination` : 'Distinctive amount'}
                      </div>
                      <div className="text-muted/60 mt-1 text-[10px]">{d.txid?.slice(0, 16)}...</div>
                    </div>
                  );
                }}
              />
              {[0.01, 0.1, 1, 10, 100].map(d => (
                <ReferenceLine key={d} y={d} stroke={colors.referenceLine} strokeDasharray="4 4" />
              ))}
              <Scatter name="Denominated" data={denominatedData} fill={colors.denominated} fillOpacity={0.85} />
              <Scatter name="Distinctive" data={distinctiveData} fill={colors.distinctive} fillOpacity={0.5} stroke={colors.denominated} strokeOpacity={0.5} />
            </ScatterChart>
          </ResponsiveContainer>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-cipher-border/30">
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.denominated }} />
                Common denomination
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full border" style={{ backgroundColor: colors.distinctive, borderColor: colors.denominated }} />
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
  { name: 'Zodl (iOS)', status: 'ready' as const, detail: 'Ironwood migration supported', link: 'https://zodl.com/' },
  { name: 'Zodl (Android)', status: 'ready' as const, detail: 'Ironwood migration supported', link: 'https://zodl.com/' },
  { name: 'Vizor', status: 'ready' as const, detail: 'Ironwood support', link: 'https://vizor.cash/' },
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
        <Link href="/privacy-risks" className="text-cipher-cyan hover:underline">
          CipherScan Privacy Scanner
        </Link>
      </div>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

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
