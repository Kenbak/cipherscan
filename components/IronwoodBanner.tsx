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

  return (
    <Link
      href="/ironwood"
      className="ironwood-banner group sticky top-[6rem] z-40 block w-full border-b border-cipher-border/50 transition-all duration-300"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-center gap-3 relative">
        {state.activated ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-yellow opacity-60"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cipher-yellow"></span>
            </span>
            <span className="text-[11px] font-mono text-muted group-hover:text-secondary transition-colors">
              <span className="text-cipher-yellow font-medium">Ironwood is live</span>
              <span className="text-muted/60 mx-1.5">·</span>
              <span className="hidden sm:inline">
                {state.ironwoodZec.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC migrated
              </span>
              <span className="text-muted/60 mx-1.5 hidden sm:inline">·</span>
              {state.verifiedPct != null && (
                <span>
                  {state.verifiedPct.toFixed(1)}% supply verified
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted/40 group-hover:text-cipher-yellow/60 transition-colors ml-1">
              View →
            </span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-cipher-yellow/50 animate-pulse"></span>
            <span className="text-[11px] font-mono text-muted group-hover:text-secondary transition-colors">
              <span className="text-cipher-yellow font-medium">Ironwood</span>
              <span className="text-muted/60 mx-1.5">·</span>
              {days > 0 ? `${days}d ${hours}h` : `${hours}h`} remaining
              <span className="hidden sm:inline text-muted/40 ml-1.5">
                ({state.blocksRemaining.toLocaleString()} blocks)
              </span>
            </span>
            <span className="text-[10px] text-muted/40 group-hover:text-cipher-yellow/60 transition-colors ml-1">
              Details →
            </span>
          </>
        )}

        <button
          onClick={handleDismiss}
          className="absolute right-4 sm:right-6 lg:right-8 text-muted/30 hover:text-muted transition-colors"
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
