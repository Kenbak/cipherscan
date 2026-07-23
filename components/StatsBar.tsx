'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_CONFIG, getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { CURRENCY, isCrosslink } from '@/lib/config';

interface StatsData {
  blockHeight: number | null;
  mempoolCount: number | null;
  hashrate: string | null;
  avgBlockTime: number | null;
  price: number | null;
  change24h: number | null;
  privacyScore: number | null;
  shieldedPool: number | null;
  shieldedPct: number | null;
  totalTxs: number | null;
}

function formatCompact(num: number): string {
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return num.toLocaleString();
}

function StatItem({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-xs font-mono text-muted hover:text-primary transition-colors whitespace-nowrap">
      <span className="text-muted/50">{label}</span>
      <span className="text-secondary">{children}</span>
    </Link>
  );
}

function Sep() {
  return <span className="text-muted/60 mx-0.5 sm:mx-0">|</span>;
}

export function StatsBar() {
  const [stats, setStats] = useState<StatsData>({
    blockHeight: null,
    mempoolCount: null,
    hashrate: null,
    avgBlockTime: null,
    price: null,
    change24h: null,
    privacyScore: null,
    shieldedPool: null,
    shieldedPct: null,
    totalTxs: null,
  });

  const usePostgresApi = usePostgresApiClient();

  useEffect(() => {
    const fetchStats = async () => {
      const apiBase = API_CONFIG.POSTGRES_API_URL;

      try {
        const results = await Promise.allSettled([
          fetch(`${apiBase}/api/blocks?limit=1`, { cache: 'no-store' }),
          fetch(usePostgresApi ? `${getApiUrl()}/api/mempool` : '/api/mempool'),
          fetch(`${apiBase}/api/price`),
          ...(!isCrosslink ? [
            fetch(`${apiBase}/api/network/stats`, { cache: 'no-store' }),
            fetch(`${apiBase}/api/privacy-stats`, { next: { revalidate: 30 } }),
          ] : []),
        ]);

        const newStats: StatsData = { ...stats };

        // Blocks
        const blocksRes = results[0];
        if (blocksRes.status === 'fulfilled' && blocksRes.value.ok) {
          const data = await blocksRes.value.json();
          const blocks = data.blocks || [];
          if (blocks.length > 0) newStats.blockHeight = parseInt(blocks[0].height);
        }

        // Mempool
        const mempoolRes = results[1];
        if (mempoolRes.status === 'fulfilled' && mempoolRes.value.ok) {
          const data = await mempoolRes.value.json();
          if (data.success) newStats.mempoolCount = data.count ?? data.transactions?.length ?? 0;
        }

        // Price
        const priceRes = results[2];
        if (priceRes.status === 'fulfilled' && priceRes.value.ok) {
          const data = await priceRes.value.json();
          newStats.price = data.price;
          newStats.change24h = data.change24h;
        }

        // Network stats + Privacy (non-crosslink only)
        if (!isCrosslink) {
          const networkRes = results[3];
          const privacyRes = results[4];

          if (networkRes?.status === 'fulfilled' && networkRes.value.ok) {
            const data = await networkRes.value.json();
            if (data.mining?.networkHashrate) newStats.hashrate = data.mining.networkHashrate;
            if (data.mining?.avgBlockTime) newStats.avgBlockTime = data.mining.avgBlockTime;
            if (data.network?.height && !newStats.blockHeight) newStats.blockHeight = data.network.height;
          }

          if (privacyRes?.status === 'fulfilled' && privacyRes.value.ok) {
            const data = await privacyRes.value.json();
            const d = data.success ? data.data : data;
            if (d?.metrics) {
              newStats.privacyScore = d.metrics.privacyScore;
              newStats.shieldedPct = d.metrics.shieldedPercentage;
            }
            if (d?.shieldedPool) newStats.shieldedPool = d.shieldedPool.currentSize;
            if (d?.totals) newStats.totalTxs = d.totals.totalTx;
          }
        }

        setStats(newStats);
      } catch {
        // Non-critical — silently fail
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePostgresApi]);

  const hasAnyData = stats.blockHeight !== null || stats.price !== null;

  return (
    <div className="stats-bar border-b border-cipher-border/30 sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-8 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Chain state */}
            {stats.blockHeight !== null && (
              <>
                <StatItem href="/blocks" label="Block">
                  #{stats.blockHeight.toLocaleString()}
                </StatItem>
                <Sep />
              </>
            )}

            {stats.avgBlockTime !== null && (
              <span className="hidden xl:contents">
                <StatItem href="/network" label="Block Time">
                  {stats.avgBlockTime}s
                </StatItem>
                <Sep />
              </span>
            )}

            {stats.hashrate && (
              <>
                <StatItem href="/network" label="Hashrate">
                  {stats.hashrate}
                </StatItem>
                <Sep />
              </>
            )}

            {/* Activity */}
            {stats.mempoolCount !== null && (
              <>
                <StatItem href="/mempool" label="Mempool">
                  <span className="flex items-center gap-1">
                    {stats.mempoolCount > 0 && (
                      <span className="relative flex h-1 w-1">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-50"></span>
                        <span className="relative inline-flex rounded-full h-1 w-1 bg-cipher-green"></span>
                      </span>
                    )}
                    {stats.mempoolCount}
                  </span>
                </StatItem>
                <Sep />
              </>
            )}

            {stats.totalTxs !== null && (
              <>
                <StatItem href="/txs" label="Total TXs">
                  {formatCompact(stats.totalTxs)}
                </StatItem>
                <Sep />
              </>
            )}

            {/* Privacy */}
            {stats.shieldedPool !== null && (
              <>
                <StatItem href="/pools" label="Shielded Pool">
                  {formatCompact(stats.shieldedPool)} {CURRENCY}
                </StatItem>
                <Sep />
              </>
            )}

            {stats.shieldedPct !== null && (
              <>
                <StatItem href="/privacy" label="% TXs Shielded">
                  {stats.shieldedPct.toFixed(1)}%
                </StatItem>
                <Sep />
              </>
            )}

            {stats.privacyScore !== null && (
              <span className="hidden 2xl:contents">
                <StatItem href="/privacy" label="Privacy Score">
                  <span className={stats.privacyScore < 30 ? 'text-danger' : stats.privacyScore < 60 ? 'text-warning' : 'text-cipher-green'}>
                    {stats.privacyScore}/100
                  </span>
                </StatItem>
                <Sep />
              </span>
            )}

            {/* Price */}
            {stats.price !== null && (
              <StatItem href="/network" label={CURRENCY}>
                <span className="flex items-center gap-1">
                  <span>${stats.price.toFixed(2)}</span>
                  {stats.change24h !== null && (
                    <span className={stats.change24h >= 0 ? 'text-cipher-green' : 'text-danger'}>
                      [{stats.change24h >= 0 ? '↑' : '↓'}{Math.abs(stats.change24h).toFixed(1)}%]
                    </span>
                  )}
                </span>
              </StatItem>
            )}
          </div>

          {/* Skeleton */}
          {!hasAnyData && (
            <div className="flex items-center gap-4 w-full">
              <div className="h-3 w-24 rounded bg-cipher-hover animate-pulse" />
              <div className="h-3 w-16 rounded bg-cipher-hover animate-pulse" />
              <div className="h-3 w-20 rounded bg-cipher-hover animate-pulse" />
              <div className="h-3 w-16 rounded bg-cipher-hover animate-pulse" />
              <div className="h-3 w-24 rounded bg-cipher-hover animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
