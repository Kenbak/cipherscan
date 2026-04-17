'use client';

import { useState, useEffect, useCallback } from 'react';
import { STAKING_DAY_PERIOD, STAKING_DAY_WINDOW } from '@/lib/config';
import { Tooltip } from '@/components/Tooltip';

interface StakingDayInfo {
  tipHeight: number;
  positionInPeriod: number;
  isStakingOpen: boolean;
  blocksRemaining: number;
  blocksUntilNextWindow: number;
  periodNumber: number;
}

function computeStakingDay(tipHeight: number): StakingDayInfo {
  const periodNumber = Math.floor(tipHeight / STAKING_DAY_PERIOD);
  const positionInPeriod = tipHeight % STAKING_DAY_PERIOD;
  const isStakingOpen = positionInPeriod < STAKING_DAY_WINDOW;

  return {
    tipHeight,
    positionInPeriod,
    isStakingOpen,
    blocksRemaining: isStakingOpen ? STAKING_DAY_WINDOW - positionInPeriod : 0,
    blocksUntilNextWindow: isStakingOpen ? 0 : STAKING_DAY_PERIOD - positionInPeriod,
    periodNumber,
  };
}

export function StakingDayBanner() {
  const [staking, setStaking] = useState<StakingDayInfo | null>(null);

  const fetchTip = useCallback(async () => {
    try {
      const res = await fetch('/api/crosslink');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.tipHeight != null) {
        setStaking(computeStakingDay(data.tipHeight));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchTip();
    const interval = setInterval(fetchTip, 15000);
    return () => clearInterval(interval);
  }, [fetchTip]);

  if (!staking) return null;

  // When the window is open the bar shows progress within the window
  // (e.g. 69/70 = ~99%). When closed it shows how far through the
  // cooldown until the next window opens.
  const progressPercent = staking.isStakingOpen
    ? (staking.positionInPeriod / STAKING_DAY_WINDOW) * 100
    : ((staking.positionInPeriod - STAKING_DAY_WINDOW) / (STAKING_DAY_PERIOD - STAKING_DAY_WINDOW)) * 100;

  return (
    <div className={`card p-4 border ${
      staking.isStakingOpen
        ? 'border-cipher-green/30 bg-cipher-green/5'
        : 'border-cipher-border'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {staking.isStakingOpen ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cipher-green"></span>
            </span>
          ) : (
            <span className="inline-flex rounded-full h-2.5 w-2.5 bg-gray-500/50"></span>
          )}
          <span className="text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1">
            {staking.isStakingOpen ? (
              <span className="text-cipher-green">Staking Window Open</span>
            ) : (
              <span className="text-muted">Staking Window Closed</span>
            )}
            <Tooltip content={`Staking actions (stake, unstake, withdraw) are only allowed during "Staking Day" windows. Every ${STAKING_DAY_PERIOD} blocks, a ${STAKING_DAY_WINDOW}-block window opens for staking operations.`} />
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted">
          Period #{staking.periodNumber}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 rounded-full bg-cipher-border/50 overflow-hidden mb-2">
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
            staking.isStakingOpen ? 'bg-cipher-green' : 'bg-gray-500'
          }`}
          style={{ width: `${Math.min(progressPercent, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-muted">
        <span>
          Block {staking.positionInPeriod}/{staking.isStakingOpen ? STAKING_DAY_WINDOW : STAKING_DAY_PERIOD}
        </span>
        {staking.isStakingOpen ? (
          <span className="text-cipher-green">
            {staking.blocksRemaining} blocks remaining
          </span>
        ) : (
          <span>
            Next window in {staking.blocksUntilNextWindow} blocks
          </span>
        )}
      </div>
    </div>
  );
}
