'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { NETWORK } from '@/lib/config';
import { useApiQuery } from '@/hooks/useApiQuery';
import { scheduledSeconds } from '@/lib/block-timing';
import { readUpgradeSnapshot, getBlockUpgrade, estimateBlockArrival, formatUpgradeDuration } from '@/lib/network-upgrades';

export function FutureBlockView({
  targetHeight,
  currentHeight: initialCurrentHeight,
  initialStats,
}: {
  targetHeight: number;
  currentHeight: number;
  initialStats?: unknown;
}) {
  const network = NETWORK === 'crosslink' ? 'crosslink-testnet' : NETWORK;
  const { data, error } = useApiQuery<unknown>('/v1/network/stats', undefined, {
    enabled: NETWORK !== 'crosslink', refreshInterval: 30_000,
    initialData: initialStats ?? undefined,
  });
  const lastVerifiedSnapshot = readUpgradeSnapshot(data, network);
  const snapshot = error ? null : lastVerifiedSnapshot;
  const currentHeight = lastVerifiedSnapshot?.height ?? initialCurrentHeight;
  const schedule = snapshot?.schedule ?? null;
  const upgrade = getBlockUpgrade(targetHeight, network, lastVerifiedSnapshot);
  const blocksRemaining = Math.max(0, targetHeight - currentHeight);
  const estimate = estimateBlockArrival(snapshot, targetHeight);
  const progress = currentHeight / targetHeight;

  // If the block has been mined while we're on this page, link to it
  if (blocksRemaining <= 0 && !error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Card>
          <CardBody className="text-center py-16">
            <h1 className="type-page font-mono text-primary mb-3">
              Chain Reached Block #{targetHeight.toLocaleString()}
            </h1>
            {upgrade ? (
              <p className="text-secondary mb-6">
                <span className="text-cipher-yellow-bright font-semibold">{upgrade.name}</span> reached its scheduled height. Open the block to verify its canonical status.
              </p>
            ) : (
              <p className="text-secondary mb-6">
                The latest chain height reached this block. Open it to view its current status.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/block/${targetHeight}`}
                className="btn btn-md btn-primary"
              >
                View Block →
              </Link>
              {upgrade?.link && (
                <Link
                  href={upgrade.link}
                  className="btn btn-md btn-secondary"
                >
                  {upgrade.linkText || 'Migration Tracker →'}
                </Link>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <span className="text-caption font-mono text-muted tracking-wider">&gt; FUTURE_BLOCK</span>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="type-page font-mono text-primary">
            {upgrade?.name === 'NU7 activation' ? 'NU7 Activation' : 'Zcash Block'} #{targetHeight.toLocaleString('en-US')}
          </h1>
          {upgrade ? (
            <Badge color="amber">{upgrade.badge || 'NETWORK UPGRADE'}</Badge>
          ) : (
            <Badge color="muted">UPCOMING</Badge>
          )}
        </div>
        <p className="mt-3 text-xs sm:text-sm text-secondary">
          {error ? 'Live block status is temporarily unavailable.' : 'This block has not been mined yet.'} {estimate ? `Estimated arrival uses ${estimate.basis} and the serving node’s announced spacing changes.` : 'Arrival estimates are currently unavailable.'}
        </p>
      </div>

      {/* Network Upgrade Banner */}
      {upgrade && (
        <div className="mb-6 rounded-xl border border-cipher-yellow-bright/30 bg-gradient-to-r from-cipher-yellow-bright/5 to-transparent p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-cipher-yellow-bright/10 border border-cipher-yellow-bright/20">
                <svg className="w-4 h-4 text-cipher-yellow-bright" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-cipher-yellow-bright">{upgrade.name}</span>
                {upgrade.zip && <Badge color="amber">{upgrade.zip}</Badge>}
              </div>
              <p className="text-xs sm:text-sm text-secondary leading-relaxed">
                {upgrade.description}
              </p>
              {upgrade.link && (
                <Link
                  href={upgrade.link}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-mono text-cipher-yellow-bright hover:text-cipher-ironwood transition-colors"
                >
                  {upgrade.linkText || 'Migration tracker →'}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p role="status" className="mb-4 text-sm text-muted">Live network data is unavailable. The block count shows the last verified network snapshot; the time estimate is paused.</p>}

      {/* Countdown Card */}
      <Card className="mb-6">
        <CardBody>
          <div className="text-center py-6">
            {/* Big countdown */}
            <div className="font-mono text-4xl sm:text-5xl font-semibold text-primary mb-2 tabular-nums">
              {estimate === null ? 'Unavailable' : formatUpgradeDuration(estimate.seconds)}
            </div>
            <div className="text-sm text-muted font-mono">estimated time remaining</div>

            {/* Estimated date */}
            <div className="mt-6 pt-6 border-t border-cipher-border">
              <div className="text-xs text-muted uppercase tracking-wider mb-1">Estimate basis</div>
              <div className="font-mono text-sm text-secondary">
                {estimate === null ? 'Waiting for a verified network schedule' : `Based on ${estimate.basis}; refreshed every 30 seconds`}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Details Card */}
      <Card className="mb-6">
        <CardBody className="space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-cipher-border gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Current Height
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-primary">
              <Link href={`/block/${currentHeight}`} className="text-cipher-gold hover:underline">
                #{currentHeight.toLocaleString()}
              </Link>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-cipher-border gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Target Height
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-primary font-semibold">
              #{targetHeight.toLocaleString()}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-cipher-border gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Blocks Remaining
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-primary">
              {blocksRemaining.toLocaleString()}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center py-3 gap-2 sm:gap-0">
            <div className="flex items-center min-w-[180px] text-secondary text-xs sm:text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Block Interval
            </div>
            <div className="flex-1 font-mono text-xs sm:text-sm text-muted">
              {scheduledSeconds(schedule, currentHeight, currentHeight + 1) != null ? `${scheduledSeconds(schedule, currentHeight, currentHeight + 1)} seconds (target)` : 'Unavailable'}
            </div>
          </div>

          {/* Progress bar */}
          <div className="pt-4 mt-4 border-t border-cipher-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-caption font-mono text-muted uppercase tracking-wider">Chain progress</span>
              <span className="text-caption font-mono text-secondary">{(progress * 100).toFixed(4)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-cipher-border overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cipher-gold to-cipher-purple transition-[width] duration-1000"
                style={{ width: `${Math.min(progress * 100, 100)}%` }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Disclaimer */}
      <div className="text-center text-xs text-muted font-mono space-y-1">
        <p>The block count determines activation. Days and hours are estimates; mining variance and unscheduled upgrades can change arrival times.</p>
        <p>Actual times vary due to mining difficulty adjustments and hash rate fluctuations.</p>
      </div>
    </div>
  );
}
