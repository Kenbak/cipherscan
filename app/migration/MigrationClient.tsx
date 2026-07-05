'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
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
  poolSizes: { orchardZat: number; ironwoodZat: number; updatedAt: string | null };
  migration: {
    totalMigratedZat: number;
    txCount: number;
    firstHeight: number | null;
    lastHeight: number | null;
    migratedPercent: number;
  };
  supplyAudit: { orchardOutZat: number; ironwoodInZat: number; balanced: boolean };
}
interface Cohort {
  boundary: number;
  boundaryStartHeight: number;
  txCount: number;
  volumeZat: number;
  firstTime: number | null;
}
interface Cohorts {
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
  totalTx: number;
  bins: DenomBin[];
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
}: {
  initialOverview: Overview | null;
  initialCohorts: Cohorts | null;
  initialDenominations: Denominations | null;
}) {
  const [overview, setOverview] = useState<Overview | null>(initialOverview);
  const [cohorts, setCohorts] = useState<Cohorts | null>(initialCohorts);
  const [denoms, setDenoms] = useState<Denominations | null>(initialDenominations);
  const [loaded, setLoaded] = useState(!!initialOverview);

  // Refresh client-side against the network-appropriate API (testnet vs mainnet).
  // Polls so the block countdown ticks live as new blocks arrive.
  useEffect(() => {
    let cancelled = false;
    const base = getApiUrl();
    const load = () => {
      Promise.all([
        fetch(`${base}/api/migration/overview`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${base}/api/migration/cohorts`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`${base}/api/migration/denominations`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([o, c, d]) => {
        if (cancelled) return;
        if (o?.success) setOverview(o);
        if (c?.success) setCohorts(c);
        if (d?.success) setDenoms(d);
        setLoaded(true);
      });
    };
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const activated = overview?.activated ?? false;
  const hasMigrations = (overview?.migration?.txCount ?? 0) > 0;
  const noData = loaded && (!overview || !overview.migration);

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
        <span className="text-secondary">Migration</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Orchard <span className="text-muted font-normal">→</span>{' '}
            <span style={{ color: IRONWOOD }}>Ironwood</span> Migration
          </h1>
          <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
            NU6.3 moves shielded value from Orchard into the formally-verified{' '}
            <span style={{ color: IRONWOOD }} className="font-semibold">Ironwood</span> pool through a
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



      {!loaded && !initialOverview && (
        <div className="mt-8 h-80 sm:h-[420px] rounded-2xl border border-cipher-border bg-cipher-surface flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cipher-border border-t-cipher-yellow rounded-full animate-spin" />
            <span className="text-xs font-mono text-muted">Loading migration data…</span>
          </div>
        </div>
      )}

      {/* No data state (mainnet before activation height is set, or API unavailable) */}
      {noData ? (
        <div className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-8 text-center">
          <div className="text-4xl mb-4" style={{ color: IRONWOOD }}>◇</div>
          <h2 className="text-lg font-bold text-primary mb-2">Ironwood is coming to mainnet</h2>
          <p className="text-sm text-secondary max-w-lg mx-auto leading-relaxed">
            NU6.3 (Ironwood) is currently live on testnet. Once the mainnet activation height is announced,
            this dashboard will show the migration countdown and fill with live data the moment the first
            ZIP-318 migration transaction appears on-chain.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cipher-border bg-glass-3 px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-cipher-cyan animate-pulse" />
            <span className="text-xs font-mono text-secondary">
              Live on <a href="https://testnet.cipherscan.app/migration" className="text-cipher-cyan hover:underline">testnet</a> now
            </span>
          </div>
        </div>
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
        </>
      )}

      {/* Methodology */}
      <Methodology />
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
            <div className="text-[11px] font-mono" style={{ color: IRONWOOD }}>
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
            <span style={{ color: IRONWOOD }}>NU6.3 @ {activationHeight.toLocaleString()}</span>
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

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-primary">Turnstile audit</h2>
        {audit && (
          <span
            className={`text-[10px] font-mono px-2 py-1 rounded-md border ${
              audit.balanced
                ? 'text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5'
                : 'text-red-400 border-red-400/30 bg-red-400/10'
            }`}
            title="Ironwood inflow must never exceed Orchard outflow through the turnstile."
          >
            {audit.balanced ? 'BALANCED' : 'IMBALANCE'}
          </span>
        )}
      </div>

      {/* Verified supply headline */}
      <div className="mb-4 pb-4 border-b border-cipher-border/50">
        <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-1">
          Verified shielded supply
        </div>
        <div className="text-2xl font-bold font-mono" style={{ color: IRONWOOD }}>
          {ironwoodZat > 0 ? `${fmtZec(ironwoodZat)} ZEC` : '—'}
        </div>
        <div className="text-[10px] text-muted mt-1 max-w-md leading-relaxed">
          ZEC that has been cryptographically proven valid by passing through the turnstile into Ironwood.
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

function EmptyPanel({ activated }: { activated: boolean; label?: string }) {
  return (
    <div className="h-[140px] flex items-center justify-center rounded-lg border border-dashed border-cipher-border/50 bg-glass-3">
      <p className="text-xs text-muted font-mono">
        {activated ? 'No migrations indexed yet' : 'Populates at activation'}
      </p>
    </div>
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
