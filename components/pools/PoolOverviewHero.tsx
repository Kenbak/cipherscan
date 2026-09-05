'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact, zatToZec } from '@/lib/format-numbers';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ShareableCard } from '@/components/ShareableCard';
import { SupplyTreemap } from './SupplyTreemap';
import { SupplyTimelineScrubber } from './SupplyTimelineScrubber';
import {
  MAX_SUPPLY_ZAT,
  buildShieldedPoolSegments,
  buildTopLevelSegments,
  isShieldedPoolKey,
  SHIELDED_POOL_KEYS,
  type ShieldedPoolKey,
  type SupplyPoolKey,
} from './supply-treemap-layout';

export interface PoolOverviewData {
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

const EMPTY_HISTORY: HistoryPoint[] = [];

interface HistoryPoint {
  date: string;
  sprout: number;
  sapling: number;
  orchard: number;
  ironwood: number;
  transparent: number;
  shielded: number;
  chainSupply: number | null;
  shieldedSupplyPct: number | null;
}

type ScrubMode = 'live' | 'scrub';

const CAP_ZEC = zatToZec(MAX_SUPPLY_ZAT);

function formatDeltaZec(deltas: PoolOverviewData['deltas'], pool: string, period: string) {
  const d = deltas[pool]?.[period];
  if (d == null) return null;
  const zec = zatToZec(d);
  const sign = zec >= 0 ? '+' : '';
  return { text: `${sign}${formatZecCompact(zec)}`, zec };
}

function formatUpdated(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatHistoryDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function zatFromHistory(value: number) {
  return Math.round(value * 1e8);
}

function SupplyLegendStat({
  label,
  color,
  zec,
  capPct,
  active,
  dimmed,
  hatched,
  footnote,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string;
  color: string;
  zec: number;
  capPct: number;
  active?: boolean;
  dimmed?: boolean;
  hatched?: boolean;
  footnote?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 transition duration-150 sm:px-4 sm:py-3.5 ${
        active
          ? 'border-cipher-yellow/40 bg-glass-4 ring-1 ring-cipher-yellow/20'
          : dimmed
            ? 'border-cipher-border/15 bg-glass-2/15 opacity-40'
            : 'border-cipher-border/25 bg-glass-2/30'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center gap-2">
        {hatched ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm border border-white/10"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(148,163,184,0.35) 0 1px, transparent 1px 4px)',
              backgroundColor: 'rgba(148,163,184,0.12)',
            }}
          />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        )}
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight text-primary sm:text-2xl">
        {formatZecCompact(zec)}
        <span className="ml-1.5 text-sm font-normal text-muted">ZEC</span>
      </p>
      <p className="mt-1 text-sm font-mono tabular-nums text-secondary">{capPct.toFixed(1)}% of 21M</p>
      {footnote ? <p className="mt-1 text-[10px] font-mono text-muted">{footnote}</p> : null}
    </div>
  );
}

export function PoolOverviewHero({ data }: { data: PoolOverviewData }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [hoveredKey, setHoveredKey] = useState<SupplyPoolKey | null>(null);
  const [pinnedShielded, setPinnedShielded] = useState(false);
  const [mode, setMode] = useState<ScrubMode>('live');
  const [scrubIndex, setScrubIndex] = useState(0);

  const { current, deltas } = data;

  const { data: historyRes } = useApiQuery<{ points: HistoryPoint[]; coverageStart?: string }>(
    '/api/network/pool-history',
    { period: 'all' },
  );
  const history = historyRes?.points ?? EMPTY_HISTORY;
  const coverageStart = historyRes?.coverageStart ?? null;

  useEffect(() => {
    if (history.length) setScrubIndex(history.length - 1);
  }, [history.length]);

  const liveSnapshot = useMemo(
    () => ({
      sprout: current.sprout,
      sapling: current.sapling,
      orchard: current.orchard,
      ironwood: current.ironwood,
      transparent: current.transparent,
      shielded: current.shielded,
      chainSupply: current.chainSupply,
      updatedAt: current.updatedAt,
    }),
    [current],
  );

  const snapshot = useMemo(() => {
    if (mode === 'live' || history.length === 0) return liveSnapshot;
    const point = history[Math.min(scrubIndex, history.length - 1)];
    const chainSupply = point.chainSupply ? zatFromHistory(point.chainSupply) : liveSnapshot.chainSupply;
    return {
      sprout: zatFromHistory(point.sprout),
      sapling: zatFromHistory(point.sapling),
      orchard: zatFromHistory(point.orchard),
      ironwood: zatFromHistory(point.ironwood ?? 0),
      transparent: zatFromHistory(point.transparent),
      shielded: zatFromHistory(point.shielded),
      chainSupply,
      updatedAt: String(point.date),
    };
  }, [history, liveSnapshot, mode, scrubIndex]);

  const topLevel = useMemo(
    () =>
      buildTopLevelSegments({
        transparent: snapshot.transparent,
        shielded: snapshot.shielded,
        chainSupply: snapshot.chainSupply,
        colors: {
          transparent: colors.transparent,
          shielded: colors.yellow,
          unmined: colors.transparent,
        },
      }),
    [snapshot, colors],
  );

  const shieldedChildren = useMemo(
    () =>
      buildShieldedPoolSegments({
        sprout: snapshot.sprout,
        sapling: snapshot.sapling,
        orchard: snapshot.orchard,
        ironwood: snapshot.ironwood,
        colors: {
          sprout: colors.sprout,
          sapling: colors.sapling,
          orchard: colors.orchard,
          ironwood: colors.ironwood,
        },
      }),
    [snapshot, colors],
  );

  const minedZec = zatToZec(snapshot.chainSupply);
  const shieldedZec = zatToZec(snapshot.shielded);
  const transparentZec = zatToZec(snapshot.transparent);
  const unminedZec = zatToZec(Math.max(0, MAX_SUPPLY_ZAT - snapshot.chainSupply));
  const shieldedPctOfMined = minedZec > 0 ? (shieldedZec / minedZec) * 100 : 0;
  const shieldedDelta7d = formatDeltaZec(deltas, 'shielded', '7d');
  const updatedLabel = formatUpdated(mode === 'live' ? current.updatedAt : snapshot.updatedAt);

  const poolMeta = useMemo(
    () =>
      ({
        transparent: { label: 'Transparent', color: colors.transparent, zat: snapshot.transparent },
        shielded: { label: 'Shielded', color: colors.yellow, zat: snapshot.shielded },
        unmined: { label: 'Unmined', color: colors.transparent, zat: MAX_SUPPLY_ZAT - snapshot.chainSupply },
        sprout: { label: 'Sprout', color: colors.sprout, zat: snapshot.sprout },
        sapling: { label: 'Sapling', color: colors.sapling, zat: snapshot.sapling },
        orchard: { label: 'Orchard', color: colors.orchard, zat: snapshot.orchard },
        ironwood: { label: 'Ironwood', color: colors.ironwood, zat: snapshot.ironwood },
      }) satisfies Record<SupplyPoolKey, { label: string; color: string; zat: number }>,
    [snapshot, colors],
  );

  const handleTogglePinShielded = useCallback(() => {
    setPinnedShielded((prev) => {
      if (prev) setHoveredKey(null);
      return !prev;
    });
  }, []);

  const shieldedBreakdown = useMemo(() => {
    return SHIELDED_POOL_KEYS.filter((key) => poolMeta[key].zat > 0).map((key) => {
      const meta = poolMeta[key];
      const zec = zatToZec(meta.zat);
      return {
        key,
        label: meta.label,
        color: meta.color,
        zec,
        shieldedShare: shieldedZec > 0 ? (zec / shieldedZec) * 100 : 0,
        capPct: (zec / CAP_ZEC) * 100,
        delta7d: mode === 'live' ? formatDeltaZec(deltas, key, '7d') : null,
      };
    });
  }, [poolMeta, shieldedZec, mode, deltas]);

  const focusedPoolKey =
    pinnedShielded && isShieldedPoolKey(hoveredKey) ? hoveredKey : null;

  const showShieldedReadout =
    pinnedShielded || hoveredKey === 'shielded' || focusedPoolKey != null;

  const readout = useMemo(() => {
    const scrubDate = mode === 'scrub' && history.length ? formatHistoryDate(history[scrubIndex].date) : null;

    if (showShieldedReadout) {
      return {
        kind: 'shielded' as const,
        pools: shieldedBreakdown,
        focusedPoolKey,
      };
    }

    if (hoveredKey === 'transparent' || hoveredKey === 'unmined') {
      const meta = poolMeta[hoveredKey];
      const zec = zatToZec(meta.zat);
      return {
        kind: 'segment' as const,
        label: meta.label,
        color: meta.color,
        zec,
        minedPct: minedZec > 0 ? (zec / minedZec) * 100 : 0,
        capPct: (zec / CAP_ZEC) * 100,
      };
    }

    return {
      kind: 'idle' as const,
      shieldedPctOfMined,
      shieldedZec,
      transparentZec,
      unminedZec,
      shieldedDelta7d: mode === 'live' ? shieldedDelta7d : null,
      scrubDate,
    };
  }, [
    showShieldedReadout,
    focusedPoolKey,
    hoveredKey,
    poolMeta,
    shieldedBreakdown,
    shieldedPctOfMined,
    shieldedZec,
    shieldedDelta7d,
    transparentZec,
    unminedZec,
    minedZec,
    mode,
    history,
    scrubIndex,
  ]);

  const maxIndex = Math.max(0, history.length - 1);
  const scrubDate =
    mode === 'scrub' && history.length ? formatHistoryDate(history[scrubIndex].date) : null;
  const historyDates = useMemo(() => history.map((p) => p.date), [history]);

  const handleScrub = useCallback((index: number) => {
    setScrubIndex(index);
    setMode('scrub');
  }, []);

  const handleLive = useCallback(() => {
    setMode('live');
    setScrubIndex(maxIndex);
  }, [maxIndex]);

  const handleLegendPoolHover = useCallback(
    (key: ShieldedPoolKey | null) => {
      if (!pinnedShielded) return;
      setHoveredKey(key ?? 'shielded');
    },
    [pinnedShielded],
  );

  const shareText = `${shieldedPctOfMined.toFixed(1)}% of mined ZEC is shielded (${formatZecCompact(shieldedZec)}). See the live supply map on CipherScan.\n\nhttps://cipherscan.app/pools`;

  return (
    <ShareableCard
      title="Where every ZEC lives"
      sourceHeight={0}
      isLive={mode === 'live'}
      shareText={shareText}
      fileName="cipherscan-pools.png"
      watermark={false}
      className=""
      footerNote={
        updatedLabel
          ? `${mode === 'live' ? 'LIVE' : scrubDate ?? 'SNAPSHOT'} · updated ${updatedLabel}`
          : undefined
      }
    >
      <p className="mb-4 max-w-2xl text-xs leading-relaxed text-secondary font-sans">
        Public, private, and still unmined — mapped against the 21M cap. Hover{' '}
        <span className="text-cipher-yellow">shielded</span> for the pool split · click to pin · hover a pool to
        isolate.
      </p>

      <div
        className="turnstile-hero overflow-hidden rounded-xl border border-cipher-border/30"
        style={{ background: 'var(--turnstile-bg)' }}
      >
        <SupplyTreemap
          topLevel={topLevel}
          shieldedChildren={shieldedChildren}
          hoveredKey={hoveredKey}
          pinnedShielded={pinnedShielded}
          onHover={setHoveredKey}
          onTogglePinShielded={handleTogglePinShielded}
        />
      </div>

      <div className="mt-3 min-h-[1.25rem]">
        {readout.kind === 'idle' ? (
          mode === 'live' && shieldedDelta7d ? (
            <p className="text-[11px] font-mono tabular-nums text-muted">
              <span className={shieldedDelta7d.zec >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}>
                {shieldedDelta7d.text}
              </span>
              {' shielded over 7 days · '}
              {shieldedPctOfMined.toFixed(1)}% of mined supply is private
            </p>
          ) : readout.scrubDate ? (
            <p className="text-[11px] font-mono text-muted">Snapshot · {readout.scrubDate}</p>
          ) : null
        ) : null}

        {readout.kind === 'segment' ? (
          <p className="text-sm font-mono tabular-nums text-secondary">
            <span style={{ color: readout.color }}>{readout.label}</span>
            {' · '}
            {readout.minedPct.toFixed(1)}% of mined supply
            {readout.label === 'Unmined' ? ' · not yet issued' : readout.label === 'Transparent' ? ' · public addresses' : null}
          </p>
        ) : null}

        {readout.kind === 'shielded' ? (
          <>
            <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-muted">
              Inside shielded
              {pinnedShielded ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={handleTogglePinShielded}
                    className="text-cipher-yellow/80 underline-offset-2 hover:text-cipher-yellow hover:underline"
                  >
                    click to unpin
                  </button>
                </>
              ) : null}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {readout.pools.map((pool) => (
                <SupplyLegendStat
                  key={pool.key}
                  label={pool.label}
                  color={pool.color}
                  zec={pool.zec}
                  capPct={pool.capPct}
                  active={readout.focusedPoolKey === pool.key}
                  dimmed={readout.focusedPoolKey != null && readout.focusedPoolKey !== pool.key}
                  footnote={`${pool.shieldedShare.toFixed(1)}% of shielded`}
                  onMouseEnter={
                    pinnedShielded ? () => handleLegendPoolHover(pool.key) : undefined
                  }
                  onMouseLeave={
                    pinnedShielded ? () => handleLegendPoolHover(null) : undefined
                  }
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <SupplyTimelineScrubber
        historyDates={historyDates}
        scrubIndex={scrubIndex}
        mode={mode}
        scrubDateLabel={scrubDate}
        coverageStart={coverageStart}
        onScrub={handleScrub}
        onLive={handleLive}
      />
    </ShareableCard>
  );
}

export function PoolOverviewSkeleton() {
  return (
    <div className="rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6">
      <div className="mb-5 h-4 w-44 skeleton-bg rounded animate-pulse" />
      <div className="h-[220px] sm:h-[280px] skeleton-bg rounded-xl animate-pulse" />
      <div className="mt-3 h-4 w-1/2 skeleton-bg rounded animate-pulse" />
      <div className="mt-4 h-10 skeleton-bg rounded-xl animate-pulse" />
    </div>
  );
}
