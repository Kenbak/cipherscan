'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { API_CONFIG, getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { CURRENCY, isCrosslink } from '@/lib/config';
import { SlidersIcon } from '@/components/icons/common';

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

type StatId =
  | 'block'
  | 'blockTime'
  | 'hashrate'
  | 'mempool'
  | 'totalTxs'
  | 'shieldedPool'
  | 'shieldedPct'
  | 'privacyScore'
  | 'price';

// Canonical display order — filtering by selection never reorders the bar,
// so toggling one stat off and back on doesn't shuffle the others.
const STAT_ORDER: StatId[] = [
  'block',
  'blockTime',
  'hashrate',
  'mempool',
  'totalTxs',
  'shieldedPool',
  'shieldedPct',
  'privacyScore',
  'price',
];

const STAT_MENU_LABELS: Record<StatId, string> = {
  block: 'Block',
  blockTime: 'Block Time',
  hashrate: 'Hashrate',
  mempool: 'Mempool',
  totalTxs: 'Total TXs',
  shieldedPool: 'Shielded Pool',
  shieldedPct: '% TXs Shielded',
  privacyScore: 'Privacy Score',
  price: `${CURRENCY} Price`,
};

// Measured (not guessed) against the bar's real available width — see the
// widths comment on MAX_STATS. Shielded Pool + % Shielded both stay in the
// default set deliberately: cutting either undersells the one thing that
// actually differentiates this explorer from a generic chain scanner.
const DEFAULT_STATS: StatId[] = ['block', 'mempool', 'hashrate', 'shieldedPool', 'shieldedPct', 'price'];

// Hard cap, not a soft target. The bar's content area caps at ~1216px on
// any viewport ≥ the `lg` breakpoint (it lives in the same max-w-7xl
// container as everything else, so a bigger monitor doesn't buy more room).
// Measured real widths at 1440px: Block 123 / Block Time 107 / Hashrate 139
// / Mempool 76 / Total TXs 115 / Shielded Pool 170 / % Shielded 154 /
// Privacy Score 154 / Price 143 — 8 of the 9 already overflowed that budget
// by 96px there, and by 287px at 1920px once Privacy Score also appeared.
// 6 items lands around ~950px including gaps/separators: comfortable margin
// even as block heights/prices grow more digits over time.
const MAX_STATS = 6;
const STORAGE_KEY = 'cipherscan-stats-bar-selection';

function isValidStatId(value: unknown): value is StatId {
  return typeof value === 'string' && (STAT_ORDER as string[]).includes(value);
}

function formatCompact(num: number): string {
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return num.toLocaleString();
}

function StatItem({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-xs sm:text-[13px] font-mono text-muted hover:text-primary transition-colors whitespace-nowrap">
      <span className="text-muted/50">{label}</span>
      <span className="text-secondary">{children}</span>
    </Link>
  );
}

function Sep() {
  return <span className="text-muted/60 mx-0.5 sm:mx-0">|</span>;
}

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

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

  // Server render + first client paint always show DEFAULT_STATS — no
  // hydration mismatch — then this swaps in the visitor's own saved
  // selection, same pattern as the homepage's HomeFeedCard.
  const [selected, setSelected] = useState<StatId[]>(DEFAULT_STATS);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isValidStatId).slice(0, MAX_STATS);
        if (valid.length > 0) setSelected(valid);
      }
    } catch {
      // localStorage unavailable or corrupted — keep the default.
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStat = (id: StatId) => {
    setSelected((prev) => {
      const isSelected = prev.includes(id);
      let next: StatId[];
      if (isSelected) {
        next = prev.filter((s) => s !== id);
      } else {
        if (prev.length >= MAX_STATS) return prev; // at cap — no-op, checkbox stays disabled
        next = [...prev, id];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Selection just won't persist — still applies for this session.
      }
      return next;
    });
  };

  // Fade whichever edge(s) have more content off-screen — never fade an edge
  // that's already fully at rest (e.g. don't fade "Block" while scrollLeft is 0).
  // Still relevant on narrow/mobile widths even with the 6-stat cap; the cap
  // guarantees no scroll on desktop, not on every phone width.
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Expose measured bar height for sticky offsets below it (Ironwood banner) —
  // the bar's height changes across breakpoints (h-10 sm:h-11), so a static
  // CSS var would drift out of sync the way --app-nav-height would without this.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const syncStatsHeight = () => {
      document.documentElement.style.setProperty('--app-stats-height', `${bar.offsetHeight}px`);
    };

    syncStatsHeight();
    const observer = new ResizeObserver(syncStatsHeight);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollFade();
    el.addEventListener('scroll', updateScrollFade, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollFade);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollFade);
      resizeObserver.disconnect();
    };
    // Re-check once stats finish loading, since that's what changes content width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateScrollFade, stats, selected]);

  const scrollFadeClass = canScrollLeft && canScrollRight
    ? 'stats-bar-fade-both'
    : canScrollLeft
      ? 'stats-bar-fade-left'
      : canScrollRight
        ? 'stats-bar-fade-right'
        : '';

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

  const renderStat = (id: StatId): React.ReactNode => {
    switch (id) {
      case 'block':
        return stats.blockHeight !== null ? (
          <StatItem href="/blocks" label="Block">#{stats.blockHeight.toLocaleString()}</StatItem>
        ) : null;
      case 'blockTime':
        return stats.avgBlockTime !== null ? (
          <StatItem href="/network" label="Block Time">{stats.avgBlockTime}s</StatItem>
        ) : null;
      case 'hashrate':
        return stats.hashrate ? (
          <StatItem href="/network" label="Hashrate">{stats.hashrate}</StatItem>
        ) : null;
      case 'mempool':
        return stats.mempoolCount !== null ? (
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
        ) : null;
      case 'totalTxs':
        return stats.totalTxs !== null ? (
          <StatItem href="/txs" label="Total TXs">{formatCompact(stats.totalTxs)}</StatItem>
        ) : null;
      case 'shieldedPool':
        return stats.shieldedPool !== null ? (
          <StatItem href="/pools" label="Shielded Pool">{formatCompact(stats.shieldedPool)} {CURRENCY}</StatItem>
        ) : null;
      case 'shieldedPct':
        return stats.shieldedPct !== null ? (
          <StatItem href="/privacy" label="% TXs Shielded">{stats.shieldedPct.toFixed(1)}%</StatItem>
        ) : null;
      case 'privacyScore':
        return stats.privacyScore !== null ? (
          <StatItem href="/privacy" label="Privacy Score">
            <span className={stats.privacyScore < 30 ? 'text-danger' : stats.privacyScore < 60 ? 'text-warning' : 'text-cipher-green'}>
              {stats.privacyScore}/100
            </span>
          </StatItem>
        ) : null;
      case 'price':
        return stats.price !== null ? (
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
        ) : null;
      default:
        return null;
    }
  };

  const visibleItems = STAT_ORDER
    .filter((id) => selected.includes(id))
    .map((id) => ({ id, node: renderStat(id) }))
    .filter((item) => item.node !== null);

  return (
    <div ref={barRef} className="stats-bar backdrop-blur-xl sticky top-[var(--app-nav-height,4rem)] z-40 border-b border-cipher-border/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-10 sm:h-11 items-center gap-2">
          <div
            ref={scrollRef}
            className={`${scrollFadeClass} flex-1 min-w-0 flex items-center xl:justify-center overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] no-scrollbar`}
          >
            <div className="flex items-center gap-3 sm:gap-4 pr-4">
              {visibleItems.map(({ id, node }, i) => (
                <span key={id} className="flex items-center gap-3 sm:gap-4">
                  {node}
                  {i < visibleItems.length - 1 && <Sep />}
                </span>
              ))}
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

          {/* Pinned outside the scrollable strip — never scrolls away with the stats. */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Customize stats bar"
              aria-expanded={menuOpen}
              className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                menuOpen ? 'text-primary bg-cipher-hover' : 'text-muted hover:text-primary'
              }`}
            >
              <SlidersIcon className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 dropdown-menu rounded-lg shadow-xl border p-1 z-30 animate-scale-in origin-top-right">
                <div className="px-3 py-2 text-[10px] font-mono text-muted uppercase tracking-widest">
                  Show up to {MAX_STATS} · {selected.length}/{MAX_STATS} selected
                </div>
                {STAT_ORDER.map((id) => {
                  const isChecked = selected.includes(id);
                  const isDisabled = !isChecked && selected.length >= MAX_STATS;
                  return (
                    <button
                      key={id}
                      onClick={() => toggleStat(id)}
                      disabled={isDisabled}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-[13px] dropdown-item ${
                        isDisabled ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                    >
                      {STAT_MENU_LABELS[id]}
                      {isChecked && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
