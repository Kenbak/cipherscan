'use client';

import { memo, type ReactNode } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatZecCompact } from '@/lib/format-numbers';

// Pixel-matched to the table-based Customize options' measured rendered
// height (getBoundingClientRect, not eyeballed) — header (SectionHeader,
// outside this component) + 5 rows + footer works out to this exact height.
// This is a stat block, not a table, so nothing here derives that number
// organically; it's pinned explicitly so every homepage card in the grid
// lines up exactly instead of "close enough."
const CARD_HEIGHT_PX = 336.5;

interface MigrationOverview {
  success: boolean;
  activated: boolean;
  blocksUntilActivation: number;
  poolSizes: {
    ironwoodZat: number;
    orchardZat: number;
  };
  migration: {
    migratedPercent: number;
    velocityZatPerHour: number;
    migratedTodayZat: number;
  };
  supplyVerification: {
    verifiedPct: number;
  } | null;
}

// Same endpoint + interval as IronwoodBanner (see the comment there) — this
// exact (path, params, refreshInterval) match is what lets useApiQuery's
// shared-poll registry serve both from one request/timer instead of two.
const OVERVIEW_REFRESH_MS = 30000;

/**
 * Homepage-sized "Ironwood migration progress" widget — a stat block, not a
 * table, since this data is a handful of fixed numbers rather than a
 * variable-length recent-activity list. Reuses the same /api/migration/overview
 * endpoint the site-wide IronwoodBanner already polls, so this always agrees
 * with what that banner says elsewhere on the page.
 */
export const IronwoodProgressCard = memo(function IronwoodProgressCard({ footer }: { footer?: ReactNode } = {}) {
  const { data, loading, error } = useApiQuery<MigrationOverview>(
    '/api/migration/overview',
    undefined,
    { refreshInterval: OVERVIEW_REFRESH_MS },
  );
  const unavailable = !!error || (!loading && (!data || data.success === false));

  if (loading) {
    return (
      <div className="card p-5 animate-pulse" style={{ height: CARD_HEIGHT_PX }}>
        <div className="h-3 w-32 skeleton-bg rounded mb-4" />
        <div className="h-8 w-40 skeleton-bg rounded mb-5" />
        <div className="h-2 w-full skeleton-bg rounded mb-5" />
        <div className="h-3 w-full skeleton-bg rounded mb-5" />
        <div className="h-3 w-full skeleton-bg rounded" />
      </div>
    );
  }

  if (unavailable || !data) {
    return (
      <div className="card p-0 overflow-hidden flex flex-col" style={{ height: CARD_HEIGHT_PX }}>
        <div className="flex-1 flex items-center justify-center px-4 text-center text-sm text-muted font-mono">
          Ironwood migration data unavailable
        </div>
        {footer && <div className="px-4 py-3 border-t border-cipher-border text-center">{footer}</div>}
      </div>
    );
  }

  if (!data.activated) {
    return (
      <div className="card p-0 overflow-hidden flex flex-col" style={{ height: CARD_HEIGHT_PX }}>
        <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
          <p className="text-sm text-secondary font-mono mb-1">Ironwood activates in</p>
          <p className="text-2xl font-bold font-mono text-cipher-yellow tabular-nums">
            {data.blocksUntilActivation.toLocaleString()} blocks
          </p>
        </div>
        {footer && <div className="px-4 py-3 border-t border-cipher-border text-center">{footer}</div>}
      </div>
    );
  }

  const ironwoodZec = data.poolSizes.ironwoodZat / 1e8;
  const orchardZec = data.poolSizes.orchardZat / 1e8;
  const verifiedPct = data.supplyVerification?.verifiedPct ?? null;
  const migratedPercent = data.migration.migratedPercent;
  const velocityZecPerHour = data.migration.velocityZatPerHour / 1e8;
  const migratedTodayZec = data.migration.migratedTodayZat / 1e8;

  return (
    <div className="card p-0 overflow-hidden flex flex-col" style={{ height: CARD_HEIGHT_PX }}>
      <div className="px-5 py-4 flex-1 min-h-0">
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest">ZEC Migrated to Ironwood</span>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-bold font-mono text-cipher-yellow tabular-nums">
            {formatZecCompact(ironwoodZec)}
          </span>
          <span className="text-sm text-muted font-mono">ZEC</span>
        </div>

        {verifiedPct !== null && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono text-muted uppercase tracking-widest">Supply Verified</span>
              <span className="text-xs font-mono text-primary tabular-nums">{verifiedPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-cipher-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-cipher-green transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, verifiedPct))}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-cipher-border/50 grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Orchard → Ironwood</span>
            <span className="text-sm font-mono font-semibold text-primary tabular-nums">{migratedPercent.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Velocity</span>
            <span className="text-sm font-mono font-semibold text-primary tabular-nums">{formatZecCompact(velocityZecPerHour)} ZEC/hr</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Migrated Today</span>
            <span className="text-sm font-mono font-semibold text-primary tabular-nums">{formatZecCompact(migratedTodayZec)} ZEC</span>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted uppercase tracking-widest block mb-1">Orchard Remaining</span>
            <span className="text-sm font-mono font-semibold text-primary tabular-nums">{formatZecCompact(orchardZec)} ZEC</span>
          </div>
        </div>
      </div>
      {footer && <div className="px-4 py-3 border-t border-cipher-border text-center">{footer}</div>}
    </div>
  );
});
