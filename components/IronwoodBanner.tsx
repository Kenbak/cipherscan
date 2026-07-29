'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { API_CONFIG } from '@/lib/api-config';
import { isCrosslink, isMainnet } from '@/lib/config';

const DISMISS_KEY = 'ironwood-banner-dismissed';
const BLOCK_TIME_SECONDS = 75;
const ACTIVATION_HEIGHT = isMainnet ? 3428143 : 4134000;

interface BannerState {
  activated: boolean;
  blocksRemaining: number;
  ironwoodZec: number;
  verifiedPct: number | null;
}

export function IronwoodBanner() {
  const [state, setState] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isCrosslink) return;
    const stored = sessionStorage.getItem(DISMISS_KEY);
    if (stored) return;
    setDismissed(false);

    async function fetchState() {
      try {
        const res = await fetch(`${API_CONFIG.POSTGRES_API_URL}/api/migration/overview`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success) return;
        const tip = json.tipHeight || 0;
        const activated = tip >= ACTIVATION_HEIGHT;

        setState({
          activated,
          blocksRemaining: activated ? 0 : ACTIVATION_HEIGHT - tip,
          ironwoodZec: (json.poolSizes?.ironwoodZat ?? 0) / 1e8,
          verifiedPct: json.supplyVerification?.verifiedPct ?? null,
        });
      } catch { /* silent */ }
    }
    fetchState();
    const interval = setInterval(fetchState, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (isCrosslink || dismissed || !state) return null;

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  const timeRemaining = state.blocksRemaining * BLOCK_TIME_SECONDS;
  const days = Math.floor(timeRemaining / 86400);
  const hours = Math.floor((timeRemaining % 86400) / 3600);
  const minutes = Math.floor((timeRemaining % 3600) / 60);

  const activatedCopy = (
    <span className="text-[11px] font-mono text-muted group-hover:text-secondary transition-colors">
      <span className="text-cipher-yellow font-medium">Ironwood is live</span>
      <span className="text-muted/60 mx-1.5">·</span>
      <span className="hidden sm:inline">
        {state.ironwoodZec.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC migrated
      </span>
      <span className="text-muted/60 mx-1.5 hidden sm:inline">·</span>
      {state.verifiedPct != null && (
        <span>{state.verifiedPct.toFixed(1)}% supply verified</span>
      )}
    </span>
  );

  const preActivationCopy = (
    <span className="text-[11px] font-mono text-muted group-hover:text-secondary transition-colors">
      <span className="text-cipher-yellow font-medium">Ironwood</span>
      <span className="text-muted/60 mx-1.5">·</span>
      {days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`} remaining
      <span className="hidden sm:inline text-muted/40 ml-1.5">
        ({state.blocksRemaining.toLocaleString()} blocks)
      </span>
    </span>
  );

  const actionLabel = state.activated ? 'View →' : 'Details →';

  return (
    <Link
      href="/ironwood"
      className="ironwood-banner group sticky top-[calc(var(--app-nav-height,4rem)+var(--app-stats-height,2rem))] z-40 block w-full border-b border-cipher-border/50 transition-all duration-300"
    >
      <div className="relative mx-auto h-8 max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Mobile — left-aligned, no separate action label (whole bar is the link) */}
        <div className="flex h-full items-center gap-2 pr-8 sm:hidden">
          {state.activated ? (
            <>
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-yellow opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cipher-yellow" />
              </span>
              <span className="min-w-0 flex-1 truncate">{activatedCopy}</span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cipher-yellow/50 animate-pulse" />
              <span className="min-w-0 flex-1 truncate">{preActivationCopy}</span>
            </>
          )}
        </div>

        {/* Desktop — centered */}
        <div className="hidden h-full items-center justify-center gap-3 sm:flex">
          {state.activated ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-yellow opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cipher-yellow" />
              </span>
              {activatedCopy}
              <span className="text-[10px] text-muted/40 group-hover:text-cipher-yellow/60 transition-colors ml-1">
                {actionLabel}
              </span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-cipher-yellow/50 animate-pulse" />
              {preActivationCopy}
              <span className="text-[10px] text-muted/40 group-hover:text-cipher-yellow/60 transition-colors ml-1">
                {actionLabel}
              </span>
            </>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/30 transition-colors hover:text-muted sm:right-6 lg:right-8"
          aria-label="Dismiss"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Link>
  );
}
