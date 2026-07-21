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
  Cell,
  ZAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { TurnstileHero } from './TurnstileHero';

// Orchard sunsets (violet), Ironwood grows (warm gold — the brand emphasis color).
const ORCHARD = '#A78BFA';
const IRONWOOD = '#F4B728';

interface Overview {
  success?: boolean;
  network?: string;
  activationHeight: number | null;
  tipHeight: number;
  activated: boolean;
  blocksUntilActivation: number;
  poolSizes: {
    orchardZat: number;
    ironwoodZat: number;
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
interface DenomBin {
  power: number;
  denomination: number;
  label: string;
  txCount: number;
  volumeZat: number;
}
interface Denominations {
  success?: boolean;
  network?: string;
  totalTx: number;
  bins: DenomBin[];
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
  initialDenominations,
  deploymentNetwork,
  fallbackActivationHeight,
}: {
  initialOverview: Overview | null;
  initialCohorts: Cohorts | null;
  initialDenominations: Denominations | null;
  deploymentNetwork: 'mainnet' | 'testnet' | 'crosslink-testnet';
  fallbackActivationHeight: number;
}) {
  const [overview, setOverview] = useState<Overview | null>(initialOverview);
  const [cohorts, setCohorts] = useState<Cohorts | null>(initialCohorts);
  const [denoms, setDenoms] = useState<Denominations | null>(initialDenominations);
  const [scatter, setScatter] = useState<ScatterData | null>(null);
  const [loaded, setLoaded] = useState(!!initialOverview);

  // Keep the authoritative pool snapshot near-live without repeatedly running
  // the heavier cohort, denomination, and scatter queries.
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
        fetchJson('/api/migration/denominations'),
        fetchJson('/api/migration/scatter'),
      ]).then(([c, d, s]) => {
        if (cancelled) return;
        if (c?.success && c.network === deploymentNetwork) setCohorts(c);
        if (d?.success && d.network === deploymentNetwork) setDenoms(d);
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
  }, []);

  const activated = overview?.activated ?? false;
  const hasMigrations = (overview?.migration?.txCount ?? 0) > 0;
  const noData = loaded && (!overview || !overview.migration);

  // Keep the fallback aligned with the deployment when its API is temporarily
  // unavailable; a testnet response must never begin with mainnet data.
  const knownActivationHeight = overview?.activationHeight ?? fallbackActivationHeight;
  const knownTip = overview?.tipHeight || 0;
  // Only show countdown after data has loaded and we confirmed pre-activation.
  // Prevents flash of mainnet countdown on testnet while data is loading.
  const showPreActivationCountdown = loaded
    && !activated
    && !hasMigrations
    && knownActivationHeight > 0
    && knownTip > 0;

  const displayOverview = overview;
  const displayCohorts = cohorts;
  const displayDenoms = denoms;

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

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Zcash <span className="text-cipher-yellow-bright">Ironwood</span>{' '}Upgrade &amp; Migration Tracker
          </h1>
          <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
            Zcash Ironwood is the formally-verified shielded pool introduced by NU6.3. CipherScan tracks
            its activation, Orchard migration, verified shielded supply, anonymity cohorts, and trustless
            turnstile activity directly from the chain.
          </p>
          <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
            NU6.3 moves shielded value from Orchard into the formally-verified{' '}
            <span className="font-semibold text-cipher-yellow-bright">Ironwood</span> pool through a
            trustless turnstile. The migration is engineered to be{' '}
            <span className="text-primary font-semibold">uniform on purpose</span> — power-of-ten amounts,
            shared timing cohorts — so that individual moves blend together. This is what that looks like
            from the chain.
          </p>
        </div>
        {displayOverview?.network && (
          <span className="text-[10px] font-mono text-muted bg-glass-3 border border-cipher-border/50 rounded-full px-3 py-1">
            {displayOverview.network}
          </span>
        )}
      </div>

      <section className="mt-6 rounded-xl border border-cipher-border bg-cipher-surface p-5">
        <h2 className="text-sm font-bold text-primary">What the Zcash Ironwood upgrade changes</h2>
        <p className="text-xs text-muted mt-2 leading-relaxed max-w-3xl">
          Ironwood keeps Orchard&apos;s Action and Halo2 proof system while adding its own note commitment
          tree, nullifier set, chain value pool, chain-history metadata, and v6 transaction format. Mainnet
          activation is fixed at block 3,428,143; testnet activation is block 4,134,000.
        </p>
      </section>

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
      ) : showPreActivationCountdown ? (
        /* Pre-activation countdown — big visual display */
        <IronwoodCountdown
          activationHeight={knownActivationHeight}
          tipHeight={knownTip}
          avgBlockTimeSecs={(overview as any)?.avgBlockTimeSecs || 75}
          deploymentNetwork={deploymentNetwork}
        />
      ) : (
        <>
          {/* 3D turnstile hero — falls back to the 2D countdown card */}
          {displayOverview && (
            <TurnstileHero
              activated={activated}
              balanced={displayOverview.supplyAudit?.balanced ?? true}
              migratedPct={
                (displayOverview.poolSizes.orchardZat + displayOverview.poolSizes.ironwoodZat) > 0
                  ? (displayOverview.poolSizes.ironwoodZat /
                      (displayOverview.poolSizes.orchardZat + displayOverview.poolSizes.ironwoodZat)) * 100
                  : 0
              }
              blocksUntilActivation={displayOverview.blocksUntilActivation}
              tipHeight={displayOverview.tipHeight}
              activationHeight={displayOverview.activationHeight}
              orchardZat={displayOverview.poolSizes.orchardZat}
              ironwoodZat={displayOverview.poolSizes.ironwoodZat}
              blockPulseKey={displayOverview.tipHeight}
              avgBlockTimeSecs={(displayOverview as any).avgBlockTimeSecs}
              fallback={!activated ? <ActivationCountdown overview={displayOverview} /> : null}
            />
          )}

          {/* Supply audit — the headline */}
          <SupplyAudit overview={displayOverview} hasMigrations={hasMigrations} />

          {/* Cohort waves */}
          <CohortWaves cohorts={displayCohorts} activated={activated} />

          {/* Denomination histogram + anonymity set */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <DenominationHistogram denoms={displayDenoms} activated={activated} />
            <AnonymitySet cohorts={displayCohorts} activated={activated} />
          </div>

          {/* Migration privacy scatter */}
          <MigrationScatter scatter={scatter} activated={activated} />
        </>
      )}

      <WalletMigrationGuide />

      {/* Methodology */}
      <Methodology />
    </div>
  );
}

function IronwoodCountdown({
  activationHeight,
  tipHeight,
  avgBlockTimeSecs,
  deploymentNetwork,
}: {
  activationHeight: number;
  tipHeight: number;
  avgBlockTimeSecs: number;
  deploymentNetwork: 'mainnet' | 'testnet' | 'crosslink-testnet';
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const blocksLeft = Math.max(0, activationHeight - tipHeight);
  const etaSecs = blocksLeft * avgBlockTimeSecs;
  const targetDate = new Date(now + etaSecs * 1000);
  const progressPct = tipHeight > 0
    ? Math.min(100, (tipHeight / activationHeight) * 100)
    : 0;

  const days = Math.floor(etaSecs / 86400);
  const hours = Math.floor((etaSecs % 86400) / 3600);
  const minutes = Math.floor((etaSecs % 3600) / 60);
  const networkLabel = deploymentNetwork === 'mainnet'
    ? 'Mainnet'
    : deploymentNetwork === 'testnet'
      ? 'Testnet'
      : 'Crosslink Testnet';
  const alternateExplorer = deploymentNetwork === 'mainnet'
    ? { href: 'https://testnet.cipherscan.app/ironwood', label: 'Preview on testnet' }
    : { href: 'https://cipherscan.app/ironwood', label: 'View on mainnet' };

  return (
    <div className="mt-8 rounded-2xl border border-cipher-border bg-gradient-to-b from-cipher-surface to-[#0a0a12] p-6 sm:p-10 overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${IRONWOOD}22 0%, transparent 60%)` }}
      />
      <div className="relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cipher-border/50 bg-glass-3 px-4 py-1.5 mb-4">
            <span className="w-2 h-2 rounded-full animate-pulse bg-cipher-yellow-bright" />
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest">
              NU6.3 Ironwood {networkLabel}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-primary">Activation Countdown</h2>
        </div>

        {blocksLeft > 0 ? (
          <>
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              <CountdownUnit value={days} label="days" />
              <span className="text-2xl sm:text-3xl font-bold text-muted/30 -mt-6">:</span>
              <CountdownUnit value={hours} label="hours" />
              <span className="text-2xl sm:text-3xl font-bold text-muted/30 -mt-6">:</span>
              <CountdownUnit value={minutes} label="min" />
            </div>

            <div className="text-center mt-8">
              <div className="text-4xl sm:text-5xl font-bold font-mono tracking-tight text-cipher-yellow-bright">
                {blocksLeft.toLocaleString()}
              </div>
              <div className="text-xs font-mono text-muted mt-1">blocks remaining</div>
            </div>

            <div className="mt-8 max-w-2xl mx-auto">
              <div className="h-3 rounded-full bg-glass-3 overflow-hidden border border-white/5">
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
              <div className="flex justify-between mt-2 text-[10px] font-mono text-muted">
                <span>block {tipHeight > 0 ? tipHeight.toLocaleString() : '...'}</span>
                <span className="font-semibold text-cipher-yellow-bright">
                  {activationHeight.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="text-center mt-6 text-sm font-mono text-secondary">
              est. {targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="text-4xl sm:text-5xl font-bold font-mono text-cipher-yellow-bright">
              ACTIVATED
            </div>
            <div className="text-sm text-secondary mt-2">
              Ironwood is live. Migration transactions will appear below.
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-cipher-border/30">
          <a
            href={alternateExplorer.href}
            className="text-[11px] font-mono text-cipher-cyan hover:underline"
          >
            {alternateExplorer.label}
          </a>
          <span className="text-muted/30">|</span>
          <span className="text-[11px] font-mono text-muted">
            {progressPct.toFixed(1)}% of blocks mined
          </span>
        </div>
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

function StatusBadge({ activated, network }: { activated: boolean; network?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-cipher-border bg-cipher-surface px-3 py-1.5">
      <span
        className={`w-2 h-2 rounded-full ${activated ? 'bg-cipher-cyan animate-pulse' : 'bg-muted/50'}`}
      />
      <span className="text-[11px] font-mono text-secondary">
        {activated ? 'LIVE' : 'AWAITING ACTIVATION'}
        {network ? ` · ${network}` : ''}
      </span>
    </div>
  );
}

function ActivationCountdown({ overview }: { overview: Overview }) {
  const { blocksUntilActivation, activationHeight, tipHeight } = overview;
  const BLOCK_TIME_SECS = (overview as any)?.avgBlockTimeSecs || 75;
  const etaSecs = blocksUntilActivation * BLOCK_TIME_SECS;
  const etaDays = etaSecs / 86400;
  const etaHours = etaSecs / 3600;
  const progressPct = activationHeight
    ? Math.min(100, (tipHeight / activationHeight) * 100)
    : 0;

  const etaLabel = etaDays >= 2
    ? `~${etaDays.toFixed(1)} days`
    : etaHours >= 1
      ? `~${Math.round(etaHours)} hours`
      : `<1 hour`;

  const estimatedDate = blocksUntilActivation > 0
    ? new Date(Date.now() + etaSecs * 1000)
    : null;

  return (
    <div className="mt-6 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[10px] text-muted uppercase tracking-widest font-mono mb-1">
            NU6.3 IRONWOOD ACTIVATION
          </div>
          <div className="text-2xl font-bold font-mono text-primary">
            {blocksUntilActivation > 0
              ? `${blocksUntilActivation.toLocaleString()} blocks to go`
              : activationHeight
                ? 'Activation reached'
                : 'Activation height TBD'}
          </div>
          <div className="text-xs text-muted mt-1 font-mono space-y-0.5">
            <div>
              height {tipHeight.toLocaleString()} / {activationHeight?.toLocaleString() ?? '—'}
              {blocksUntilActivation > 0 && <span className="ml-2 text-secondary">{etaLabel}</span>}
            </div>
            {estimatedDate && (
              <div className="text-muted/70">
                est. {estimatedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        </div>
        <div className="text-right space-y-2">
          <p className="text-xs text-secondary max-w-xs leading-relaxed">
            ZIP-318 migration transactions cannot exist until the network upgrade activates.
            The moment they do, this dashboard fills in automatically.
          </p>
          {blocksUntilActivation > 0 && (
            <div className="text-[11px] font-mono text-cipher-yellow-bright">
              {progressPct.toFixed(1)}% complete
            </div>
          )}
        </div>
      </div>
      {activationHeight && blocksUntilActivation > 0 && (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-glass-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progressPct.toFixed(2)}%`,
                background: `linear-gradient(90deg, ${ORCHARD}, ${IRONWOOD})`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] font-mono text-muted">
            <span>current: {tipHeight.toLocaleString()}</span>
            <span className="text-cipher-yellow-bright">NU6.3 @ {activationHeight.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplyAudit({
  overview,
  hasMigrations,
}: {
  overview: Overview | null;
  hasMigrations: boolean;
}) {
  const audit = overview?.supplyAudit;
  const ironwoodZat = overview?.poolSizes.ironwoodZat ?? 0;
  const auditLabel = audit?.status === 'balanced'
    ? 'RECONCILED'
    : audit?.status === 'syncing'
      ? 'SYNCING'
      : audit?.status === 'stale'
        ? 'STALE SOURCE'
        : 'MISMATCH';
  const auditStyle = audit?.status === 'balanced'
    ? 'text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5'
    : audit?.status === 'syncing' || audit?.status === 'stale'
      ? 'text-amber-300 border-amber-300/30 bg-amber-300/10'
      : 'text-danger border-red-400/30 bg-red-400/10';

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-primary">Turnstile audit</h2>
        {audit && (
          <span
            className={`text-[10px] font-mono px-2 py-1 rounded-md border ${auditStyle}`}
            title="Reconciles indexed Ironwood inflows minus outflows against Zebra's authoritative pool balance."
          >
            {auditLabel}
          </span>
        )}
      </div>

      {/* Verified supply headline */}
      <div className="mb-4 pb-4 border-b border-cipher-border/50">
        <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-1">
          Verified shielded supply
        </div>
        <div className="text-2xl font-bold font-mono text-cipher-yellow-bright">
          {ironwoodZat > 0 ? `${fmtZec(ironwoodZat)} ZEC` : '—'}
        </div>
        <div className="text-[10px] text-muted mt-1 max-w-md leading-relaxed">
          Current net Ironwood pool balance reported by Zebra and independently reconciled
          against indexed inflows and outflows.
        </div>
        {overview?.poolSizes && (
          <div className="text-[10px] text-muted mt-2 font-mono">
            {overview.poolSizes.isLive ? 'LIVE · ZEBRA' : 'FALLBACK SNAPSHOT'}
            {' · '}BLOCK {overview.poolSizes.sourceHeight.toLocaleString()}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Migrated total" value={hasMigrations ? `${fmtZec(overview!.migration.totalMigratedZat)} ZEC` : '—'} />
        <Stat label="Migration txs" value={hasMigrations ? overview!.migration.txCount.toLocaleString() : '—'} />
        <Stat
          label="Orchard out"
          value={audit && hasMigrations ? `${fmtZec(audit.orchardOutZat)} ZEC` : '—'}
          color={ORCHARD}
        />
        <Stat
          label="Ironwood in"
          value={audit && hasMigrations ? `${fmtZec(audit.ironwoodInZat)} ZEC` : '—'}
          color={IRONWOOD}
        />
        <Stat
          label="Ironwood out"
          value={audit && hasMigrations ? `${fmtZec(audit.ironwoodOutZat)} ZEC` : '—'}
        />
        <Stat
          label="Indexed net"
          value={audit && hasMigrations ? `${fmtZec(audit.indexedNetZat)} ZEC` : '—'}
          color={IRONWOOD}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-cipher-border/60 bg-glass-3 p-3">
      <div className="text-lg font-bold font-mono" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[10px] text-muted uppercase tracking-wider mt-0.5 font-mono">{label}</div>
    </div>
  );
}

function CohortWaves({ cohorts, activated }: { cohorts: Cohorts | null; activated: boolean }) {
  const data = (cohorts?.cohorts ?? []).map((c) => ({
    boundary: c.boundaryStartHeight,
    volume: zec(c.volumeZat),
    txCount: c.txCount,
  }));

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Cohort waves</h2>
      <p className="text-xs text-muted mt-1 mb-4 max-w-2xl leading-relaxed">
        Migration volume per shared anchor boundary (~5.3h). Wallets that pick the same boundary mix
        together — each bar is one anonymity cohort.
      </p>
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
                backgroundColor: 'var(--color-bg-card, #12121a)',
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
        <EmptyPanel activated={activated} label="cohort waves" />
      )}
    </div>
  );
}

function DenominationHistogram({
  denoms,
  activated,
}: {
  denoms: Denominations | null;
  activated: boolean;
}) {
  const data = (denoms?.bins ?? []).map((b) => ({
    label: b.label,
    txCount: b.txCount,
  }));

  return (
    <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Denomination collisions</h2>
      <p className="text-xs text-muted mt-1 mb-4 leading-relaxed">
        Every migration output is a canonical power of ten (100 / 10 / 1 / 0.1 …). Amounts collide
        across wallets on purpose — that&apos;s the privacy design working.
      </p>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8b8b9e' }} />
            <YAxis tick={{ fontSize: 10, fill: '#8b8b9e' }} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(244, 183, 40, 0.08)' }}
              contentStyle={{
                backgroundColor: 'var(--color-bg-card, #12121a)',
                border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                fontSize: 12,
              }}
              itemStyle={{ color: 'var(--color-text-primary, #fff)' }}
              labelStyle={{ color: 'var(--color-text-muted, #8b8b9e)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
              formatter={(val: unknown) => [Number(val).toLocaleString(), 'Outputs']}
            />
            <Bar dataKey="txCount" radius={[2, 2, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={IRONWOOD} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <EmptyPanel activated={activated} label="denomination histogram" />
      )}
    </div>
  );
}

function AnonymitySet({ cohorts, activated }: { cohorts: Cohorts | null; activated: boolean }) {
  const has = (cohorts?.cohortCount ?? 0) > 0;
  return (
    <div className="rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">Anonymity set per cohort</h2>
      <p className="text-xs text-muted mt-1 mb-4 leading-relaxed">
        How many migrations share each anchor boundary. Larger cohorts mean a bigger crowd to hide in.
      </p>
      {has ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Avg cohort" value={cohorts!.avgAnonymitySet.toFixed(1)} />
          <Stat label="Smallest" value={String(cohorts!.minAnonymitySet)} />
          <Stat label="Largest" value={String(cohorts!.maxAnonymitySet)} />
        </div>
      ) : (
        <EmptyPanel activated={activated} label="anonymity sets" />
      )}
    </div>
  );
}

const DENOMINATED_COLOR = '#34d399'; // emerald
const DISTINCTIVE_COLOR = '#f97316'; // orange

function MigrationScatter({ scatter, activated }: { scatter: ScatterData | null; activated: boolean }) {
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
          <h2 className="text-sm font-bold text-primary">Migration privacy analysis</h2>
          <p className="text-xs text-muted mt-1 mb-4 max-w-2xl leading-relaxed">
            Each dot is one migration. <span style={{ color: DENOMINATED_COLOR }} className="font-semibold">Green</span> = common denomination
            (blends in with the crowd). <span style={{ color: DISTINCTIVE_COLOR }} className="font-semibold">Orange</span> = distinctive amount
            (unique fingerprint that weakens privacy). The dashed lines show ideal denominations.
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
                tickFormatter={(v) => v >= 1 ? `${v}` : `${v}`}
                label={{ value: 'ZEC', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#8b8b9e' } }}
              />
              <ZAxis range={[40, 40]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.2)' }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono">
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

          {/* Legend + stats */}
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
        <EmptyPanel activated={activated} label="migration scatter" />
      )}
    </div>
  );
}

function EmptyPanel({ activated }: { activated: boolean; label?: string }) {
  return (
    <div className="h-[140px] flex items-center justify-center rounded-lg border border-dashed border-cipher-border/50 bg-glass-3">
      <p className="text-xs text-muted font-mono">
        {activated ? 'No migrations indexed yet' : 'Populates at activation'}
      </p>
    </div>
  );
}

function WalletMigrationGuide() {
  return (
    <section className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h2 className="text-sm font-bold text-primary">How wallets migrate Orchard funds to Ironwood</h2>
      <p className="text-xs text-muted mt-2 leading-relaxed max-w-3xl">
        Wallet teams are implementing ZIP 318 as the production migration plan now. The specification
        reaches its finalized state through the behavior proven in production, so supported wallets can
        ship the migration flow while those operational details are settled.
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 text-xs text-secondary">
        <li className="rounded-lg border border-cipher-border/60 bg-glass-3 p-3">
          <span className="block font-mono text-[10px] text-muted mb-1">01 · PREPARE</span>
          The wallet identifies Orchard funds and can split notes into migration-sized transfers.
        </li>
        <li className="rounded-lg border border-cipher-border/60 bg-glass-3 p-3">
          <span className="block font-mono text-[10px] text-muted mb-1">02 · SCHEDULE</span>
          The user approves a plan that spreads transfers across shared anchor-height windows.
        </li>
        <li className="rounded-lg border border-cipher-border/60 bg-glass-3 p-3">
          <span className="block font-mono text-[10px] text-muted mb-1">03 · BROADCAST</span>
          Supported wallets submit pre-signed transfers in the background when the operating system allows.
        </li>
        <li className="rounded-lg border border-cipher-border/60 bg-glass-3 p-3">
          <span className="block font-mono text-[10px] text-muted mb-1">04 · RECOVER</span>
          If a scheduled window is missed, the wallet prompts on the next open and continues the plan.
        </li>
      </ol>
      <p className="text-xs text-muted mt-4 leading-relaxed">
        Ironwood uses the same address as the user&apos;s Orchard receiver; wallets track it as a distinct
        pool. Follow your wallet&apos;s release notes for availability and migration controls. CipherScan
        observes the resulting chain activity but does not initiate wallet transfers.
      </p>
      <div className="flex flex-wrap gap-4 mt-4 text-[11px] font-mono">
        <a
          href="https://zips.z.cash/zip-0318"
          target="_blank"
          rel="noopener"
          className="text-cipher-cyan hover:underline"
        >
          Read ZIP 318
        </a>
        <a
          href="https://github.com/zcash/zips/issues/1315"
          target="_blank"
          rel="noopener"
          className="text-cipher-cyan hover:underline"
        >
          Review the ZIP 318 implementation plan
        </a>
      </div>
    </section>
  );
}

function Methodology() {
  return (
    <div className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-2">
        How we read it
      </h3>
      <p className="text-xs text-muted leading-relaxed">
        A ZIP-318 migration is a v6 transaction with no transparent inputs or outputs whose Orchard
        value balance is positive (value leaving Orchard) and Ironwood value balance is negative (value
        entering Ironwood). Because a compliant migration creates exactly one Ironwood output and spends
        no Ironwood notes, the magnitude of the Ironwood value balance equals the output denomination —
        which is how we can chart the power-of-ten collisions even though the note itself is shielded.
        Cohorts are grouped by anchor boundary (provisionally every 256 blocks, ~5.3h). Migrations are{' '}
        <span className="text-secondary">best practice, not a linkage risk</span> — our{' '}
        <Link href="/privacy-risks" className="text-cipher-cyan hover:underline">privacy scanner</Link>{' '}
        treats these uniform patterns as intended privacy behavior rather than flagging them.
      </p>
    </div>
  );
}
