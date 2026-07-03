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

// Orchard sunsets (violet), Ironwood grows (warm gold — the brand emphasis color).
const ORCHARD = '#A78BFA';
const IRONWOOD = '#E8C48D';

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

  // Refresh client-side against the network-appropriate API (testnet vs mainnet).
  useEffect(() => {
    let cancelled = false;
    const base = getApiUrl();
    Promise.all([
      fetch(`${base}/api/migration/overview`).then((r) => r.json()).catch(() => null),
      fetch(`${base}/api/migration/cohorts`).then((r) => r.json()).catch(() => null),
      fetch(`${base}/api/migration/denominations`).then((r) => r.json()).catch(() => null),
    ]).then(([o, c, d]) => {
      if (cancelled) return;
      if (o) setOverview(o);
      if (c) setCohorts(c);
      if (d) setDenoms(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activated = overview?.activated ?? false;
  const hasMigrations = (overview?.migration.txCount ?? 0) > 0;

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
        <StatusBadge activated={activated} network={overview?.network} />
      </div>

      {/* Activation countdown (pre-activation) */}
      {!activated && overview && (
        <ActivationCountdown overview={overview} />
      )}

      {/* Supply audit — the headline */}
      <SupplyAudit overview={overview} hasMigrations={hasMigrations} />

      {/* Cohort waves */}
      <CohortWaves cohorts={cohorts} activated={activated} />

      {/* Denomination histogram + anonymity set */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <DenominationHistogram denoms={denoms} activated={activated} />
        <AnonymitySet cohorts={cohorts} activated={activated} />
      </div>

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
  const BLOCK_TIME_SECS = 75;
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
  const orchard = overview?.poolSizes.orchardZat ?? 0;
  const ironwood = overview?.poolSizes.ironwoodZat ?? 0;
  const total = orchard + ironwood;
  const migratedPct = total > 0 ? (ironwood / total) * 100 : 0;
  const audit = overview?.supplyAudit;

  return (
    <div className="mt-4 rounded-xl border border-cipher-border bg-cipher-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-primary">Supply audit &amp; migration progress</h2>
        {audit && (
          <span
            className={`text-[10px] font-mono px-2 py-1 rounded-md border ${
              audit.balanced
                ? 'text-cipher-cyan border-cipher-cyan/30 bg-cipher-cyan/10'
                : 'text-red-400 border-red-400/30 bg-red-400/10'
            }`}
            title="Ironwood inflow must never exceed Orchard outflow through the turnstile."
          >
            {audit.balanced ? 'TURNSTILE BALANCED' : 'IMBALANCE DETECTED'}
          </span>
        )}
      </div>

      {/* % migrated bar */}
      <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
        <span style={{ color: ORCHARD }}>Orchard {fmtZec(orchard)} ZEC</span>
        <span style={{ color: IRONWOOD }}>Ironwood {fmtZec(ironwood)} ZEC</span>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden bg-glass-3">
        {total > 0 ? (
          <>
            <div style={{ width: `${100 - migratedPct}%`, backgroundColor: ORCHARD }} />
            <div style={{ width: `${migratedPct}%`, backgroundColor: IRONWOOD }} />
          </>
        ) : (
          <div className="w-full flex items-center justify-center text-[10px] text-muted font-mono">
            no pool data yet
          </div>
        )}
      </div>
      <div className="text-center text-[11px] font-mono text-muted mt-1.5">
        {migratedPct.toFixed(migratedPct < 1 ? 3 : 1)}% of shielded value migrated to Ironwood
      </div>

      {/* audit numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
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
              contentStyle={{
                background: '#12121a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 11,
              }}
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
              contentStyle={{
                background: '#12121a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 11,
              }}
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

function EmptyPanel({ activated, label }: { activated: boolean; label: string }) {
  return (
    <div className="h-[160px] flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-cipher-border/70 bg-glass-3">
      <p className="text-xs text-secondary font-mono">
        {activated ? `No migrations indexed yet` : `Awaiting NU6.3 activation`}
      </p>
      <p className="text-[10px] text-muted mt-1 max-w-[220px]">
        The {label} will populate automatically once migration transactions appear on-chain.
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
