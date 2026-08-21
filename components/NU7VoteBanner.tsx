'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { isCrosslink, isMainnet } from '@/lib/config';
import { NU7_VOTE } from '@/lib/nu7-vote-config';

const DISMISS_KEY = 'nu7-vote-banner-dismissed';

type VotePhase = 'pre-snapshot' | 'pre-vote' | 'active' | 'ended';

function getPhase(): VotePhase {
  const now = Date.now();
  const snapshot = new Date(NU7_VOTE.snapshotTime).getTime();
  const start = new Date(NU7_VOTE.voteStartTime).getTime();
  const end = new Date(NU7_VOTE.voteEndTime).getTime();
  if (now < snapshot) return 'pre-snapshot';
  if (now < start) return 'pre-vote';
  if (now < end) return 'active';
  return 'ended';
}

function formatCountdown(ms: number) {
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function NU7VoteBanner() {
  const [phase, setPhase] = useState<VotePhase>(getPhase);
  const [remaining, setRemaining] = useState(0);
  const [dismissed, setDismissed] = useState(true);
  const bannerRef = useRef<HTMLAnchorElement>(null);
  const visible = isMainnet && !isCrosslink && !dismissed && phase !== 'ended';

  useEffect(() => {
    if (!isMainnet || isCrosslink) return;
    const stored = sessionStorage.getItem(DISMISS_KEY);
    if (stored) return;
    setDismissed(false);

    function tick() {
      const p = getPhase();
      setPhase(p);
      const target = p === 'pre-snapshot'
        ? new Date(NU7_VOTE.snapshotTime).getTime()
        : p === 'pre-vote'
          ? new Date(NU7_VOTE.voteStartTime).getTime()
          : new Date(NU7_VOTE.voteEndTime).getTime();
      setRemaining(Math.max(0, target - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.setProperty('--app-ironwood-height', '0px');
      return;
    }
    const el = bannerRef.current;
    if (!el) return;
    const syncHeight = () => {
      document.documentElement.style.setProperty('--app-ironwood-height', `${el.offsetHeight}px`);
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  if (!visible) return null;

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  const countdownStr = formatCountdown(remaining);

  const phaseLabel = phase === 'pre-snapshot'
    ? 'Snapshot'
    : phase === 'pre-vote'
      ? 'Voting opens'
      : 'Voting closes';

  return (
    <Link
      ref={bannerRef}
      href="/governance/nu7"
      className="ironwood-banner backdrop-blur-xl group sticky top-[calc(var(--app-nav-height,4rem)+var(--app-stats-height,2.75rem))] z-40 block w-full border-b border-cipher-border/50 transition-all duration-300"
    >
      <div className="relative mx-auto h-9 sm:h-10 max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Mobile */}
        <div className="flex h-full items-center gap-2 pr-8 sm:hidden">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-cyan opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cipher-cyan" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-mono text-muted">
            <span className="text-cipher-cyan font-medium">NU7 Vote</span>
            {countdownStr && (
              <>
                <span className="text-muted/60 mx-1.5">·</span>
                <span>{phaseLabel} in {countdownStr}</span>
              </>
            )}
          </span>
        </div>

        {/* Desktop */}
        <div className="hidden h-full items-center justify-center gap-3 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-cyan opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cipher-cyan" />
          </span>
          <span className="text-xs font-mono text-muted group-hover:text-secondary transition-colors">
            <span className="text-cipher-cyan font-medium">NU7 Coinholder Vote</span>
            {countdownStr && (
              <>
                <span className="text-muted/60 mx-1.5">·</span>
                <span>{phaseLabel} in {countdownStr}</span>
              </>
            )}
            {phase === 'active' && (
              <>
                <span className="text-muted/60 mx-1.5">·</span>
                <span>Cast your vote</span>
              </>
            )}
          </span>
          <span className="text-[11px] text-muted/40 group-hover:text-cipher-cyan/60 transition-colors ml-1">
            Details →
          </span>
        </div>

        <button
          onClick={handleDismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/30 transition-colors hover:text-muted sm:right-6 lg:right-8"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Link>
  );
}
