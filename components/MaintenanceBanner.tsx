'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api-config';

const STALE_THRESHOLD_SECONDS = 30 * 60; // 30 minutes
const POLL_INTERVAL = 60_000;

export function MaintenanceBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [stale, setStale] = useState(false);
  const [latestAge, setLatestAge] = useState<number | null>(null);

  const checkStaleness = useCallback(async () => {
    try {
      const API_URL = getApiUrl();
      const res = await fetch(`${API_URL}/api/blocks?limit=1`);
      if (!res.ok) return;
      const data = await res.json();
      const latest = data.blocks?.[0];
      if (!latest?.timestamp) return;
      const ageSec = Math.floor(Date.now() / 1000) - latest.timestamp;
      setLatestAge(ageSec);
      setStale(ageSec > STALE_THRESHOLD_SECONDS);
    } catch {}
  }, []);

  useEffect(() => {
    checkStaleness();
    const id = setInterval(checkStaleness, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [checkStaleness]);

  if (!stale || dismissed) return null;

  const ageMin = latestAge ? Math.floor(latestAge / 60) : null;
  const ageStr = ageMin && ageMin >= 60
    ? `${Math.floor(ageMin / 60)}h ${ageMin % 60}m`
    : `${ageMin}m`;

  return (
    <div className="bg-cipher-orange/90 text-black px-4 py-2 text-center text-sm font-medium relative">
      <span>
        Block data is stale — latest block is {ageStr} old. The node may be syncing or undergoing maintenance.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-1/2 -translate-y-1/2 hover:text-amber-900 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
