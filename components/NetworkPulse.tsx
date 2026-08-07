'use client';

import { useEffect, useState, memo } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';

interface PulseEvent {
  date: string;
  metric: string;
  zscore: number;
  direction: 'up' | 'down';
  description: string;
  severity: 'critical' | 'high' | 'notable';
}

interface PulseSummary {
  totalLast7d: number;
  bySeverity: { critical: number; high: number; notable: number };
  recent: PulseEvent[];
}

const SEVERITY_STYLE: Record<string, { dot: string; text: string }> = {
  critical: { dot: 'bg-red-400', text: 'text-red-400' },
  high: { dot: 'bg-amber-400', text: 'text-amber-400' },
  notable: { dot: 'bg-blue-400', text: 'text-blue-400' },
};

function NetworkPulseInner() {
  const [summary, setSummary] = useState<PulseSummary | null>(null);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/pulse/summary`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.recent) setSummary(d); })
      .catch(() => {});
  }, []);

  if (!summary) {
    return (
      <div className="card p-4">
        <div className="h-32 flex items-center justify-center text-sm text-muted font-mono">
          Loading pulse data...
        </div>
      </div>
    );
  }

  if (summary.totalLast7d === 0) {
    return (
      <div className="card p-4">
        <div className="text-center text-sm text-muted font-mono py-4">
          No anomalies in the last 7 days — network is within normal parameters.
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header stats */}
      <div className="grid grid-cols-3 divide-x divide-cipher-border border-b border-cipher-border">
        {(['critical', 'high', 'notable'] as const).map(sev => {
          const style = SEVERITY_STYLE[sev];
          return (
            <div key={sev} className="flex flex-col items-center justify-center py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{sev}</span>
              </div>
              <span className={`text-lg font-mono font-bold ${style.text}`}>
                {summary.bySeverity[sev] || 0}
              </span>
            </div>
          );
        })}
      </div>

      {/* Recent events */}
      <div className="divide-y divide-cipher-border">
        {summary.recent.map((event, i) => {
          const style = SEVERITY_STYLE[event.severity];
          return (
            <div
              key={`${event.date}-${event.metric}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-cipher-hover animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
              <span className={`text-[10px] font-mono shrink-0 ${event.direction === 'up' ? 'text-red-400' : 'text-blue-400'}`}>
                {event.direction === 'up' ? '▲' : '▼'}
              </span>
              <span className="text-xs text-primary truncate flex-1">{event.description}</span>
              <span className="text-[10px] font-mono text-muted shrink-0">
                z={event.zscore.toFixed(1)}
              </span>
              <span className="text-[10px] text-muted shrink-0">
                {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const NetworkPulse = memo(NetworkPulseInner);
