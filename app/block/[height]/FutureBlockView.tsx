'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { NETWORK } from '@/lib/config';
import { useApiQuery } from '@/hooks/useApiQuery';
import { readUpgradeSnapshot, getBlockUpgrade, estimateBlockArrival, formatUpgradeTime } from '@/lib/network-upgrades';

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
  const upgrade = getBlockUpgrade(targetHeight, network, lastVerifiedSnapshot);
  const blocksRemaining = Math.max(0, targetHeight - currentHeight);
  const estimate = estimateBlockArrival(snapshot, targetHeight);

  // If the block has been mined while we're on this page, link to it
  if (blocksRemaining <= 0 && !error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Card>
          <CardBody className="text-center py-16">
            <h1 className="type-page font-mono text-primary mb-3">
              Block #{targetHeight.toLocaleString()} has been reached
            </h1>
            {upgrade ? (
              <p className="text-secondary mb-6">
                <span className="text-cipher-yellow-bright font-semibold">{upgrade.name}</span> has reached its scheduled block. Open it to check the latest status.
              </p>
            ) : (
              <p className="text-secondary mb-6">
                The network has reached this block. Open it to see the details.
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
        <span className="text-caption font-mono text-muted tracking-wider">{upgrade ? 'Network upgrade' : 'Upcoming block'} · Zcash {NETWORK === 'testnet' ? 'testnet' : NETWORK === 'crosslink' ? 'Crosslink testnet' : 'mainnet'}</span>
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
          {error ? 'We’re having trouble getting the latest block.' : upgrade ? 'Follow the countdown to the next network upgrade.' : 'This block is still ahead. Follow its progress below.'}
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
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-cipher-yellow-bright hover:text-cipher-ironwood transition-colors"
                >
                  {upgrade.linkText || 'Migration tracker →'}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p role="status" className="mb-4 text-sm text-muted">We can’t update the countdown right now. The block count is from our last update, and the time estimate is paused.</p>}

      <Card className="mb-6">
        <CardBody className="!p-6 sm:!p-8">
          <div className="text-center py-4 sm:py-6">
            <p className="text-sm text-secondary mb-3">{upgrade ? `${upgrade.name === 'NU7 activation' ? 'NU7' : upgrade.name} arrives in` : 'This block is expected in'}</p>
            <div className="text-4xl sm:text-5xl font-semibold tracking-tight text-primary tabular-nums">
              {estimate === null ? 'Time unavailable' : `About ${formatUpgradeTime(estimate.seconds)}`}
            </div>
            <p className="mt-3 text-sm text-secondary"><span className="font-medium text-primary tabular-nums">{blocksRemaining.toLocaleString('en-US')}</span> {blocksRemaining === 1 ? 'block' : 'blocks'} to go</p>
          </div>
          <dl className="mt-6 grid grid-cols-1 gap-5 border-t border-cipher-border pt-6 sm:grid-cols-2 sm:gap-8">
            <div>
              <dt className="text-sm text-secondary mb-2">Latest block</dt>
              <dd className="font-mono text-primary tabular-nums"><Link href={`/block/${currentHeight}`} className="hover:text-cipher-gold transition-colors">#{currentHeight.toLocaleString('en-US')}</Link></dd>
            </div>
            <div>
              <dt className="text-sm text-secondary mb-2">{upgrade ? 'Activation block' : 'Upcoming block'}</dt>
              <dd className="font-mono text-primary tabular-nums">#{targetHeight.toLocaleString('en-US')}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <p className="text-center text-xs sm:text-sm text-muted leading-relaxed">
        {estimate ? `Timing is based on ${estimate.basis} and updates every 30 seconds. ` : ''}
        {upgrade ? 'The upgrade starts at its activation block. ' : ''}The arrival time may change as blocks are mined.
      </p>
    </div>
  );
}
