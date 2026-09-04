'use client';

import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/lib/utils';

function absoluteUtc(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Time unavailable';
  return new Date(timestamp * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/**
 * Renders deterministic UTC text during SSR/hydration, then upgrades to a
 * relative age. Calling Date.now() during the first render caused React
 * hydration mismatches whenever a second boundary changed in transit.
 */
export function RelativeTime({
  timestamp,
  className,
}: {
  timestamp: number;
  className?: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const dateTime = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : undefined;

  return (
    <time className={className} dateTime={dateTime}>
      {hydrated ? formatRelativeTime(timestamp) : absoluteUtc(timestamp)}
    </time>
  );
}
