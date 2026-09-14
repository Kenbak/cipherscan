'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { formatRelativeTime } from '@/lib/utils';

function absoluteUtc(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Time unavailable';
  return new Date(timestamp * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

const RelativeTimeContext = createContext<number | undefined>(undefined);

/** Share the cached server clock for hydration, then keep all ages ticking. */
export function RelativeTimeProvider({ initialNow, children }: { initialNow: number; children: ReactNode }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setNow(Date.now());
    };
    refresh();
    const timer = setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [initialNow]);

  return <RelativeTimeContext.Provider value={now}>{children}</RelativeTimeContext.Provider>;
}

/** Outside a server-clock provider, retain the deterministic UTC fallback. */
export function RelativeTime({
  timestamp,
  className,
}: {
  timestamp: number;
  className?: string;
}) {
  const now = useContext(RelativeTimeContext);
  const hasServerClock = now !== undefined;
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hasServerClock) setHydrated(true);
  }, [hasServerClock]);

  const dateTime = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : undefined;

  return (
    <time className={className} dateTime={dateTime} title={absoluteUtc(timestamp)}>
      {dateTime && (now !== undefined || hydrated)
        ? formatRelativeTime(timestamp, now)
        : absoluteUtc(timestamp)}
    </time>
  );
}
