'use client';

import { useEffect, useState } from 'react';

/** API-check age, deliberately independent of the age of the last mined block. */
export function LiveRefreshStatus({ lastCheckedAt, failed }: {
  lastCheckedAt: number | null;
  failed: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const age = lastCheckedAt && now ? Math.max(0, Math.floor((now - lastCheckedAt) / 1000)) : null;
  const stale = failed || (age !== null && age >= 60);
  return (
    <div className="px-4 py-2 text-xs text-muted" role="status">
      {stale ? 'Updates delayed — retrying automatically. ' : 'Auto-updating · '}
      {age === null ? 'Checking latest blocks…' : `Last checked ${age}s ago`}
    </div>
  );
}
