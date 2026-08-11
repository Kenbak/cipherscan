'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApiQuery } from '@/hooks/useApiQuery';

interface PulseEvent {
  date: string;
  metric: string;
  zscore: number;
  direction: 'up' | 'down';
  description: string;
  severity: 'extreme' | 'strong' | 'mild';
}

interface PulseSummary {
  totalLast7d: number;
  bySeverity: { extreme: number; strong: number; mild: number };
  recent: PulseEvent[];
}

type PulseIntensity = 'calm' | 'medium' | 'active';

function getIntensity(summary: PulseSummary | null): PulseIntensity {
  if (!summary || summary.totalLast7d === 0) return 'calm';
  if (summary.bySeverity.extreme > 0 || summary.totalLast7d >= 4) return 'active';
  return 'medium';
}

const INTENSITY_CONFIG: Record<PulseIntensity, { duration: string; opacity: string; glow: string }> = {
  calm: { duration: '3s', opacity: 'opacity-40', glow: '' },
  medium: { duration: '1.5s', opacity: 'opacity-70', glow: '' },
  active: { duration: '0.8s', opacity: 'opacity-100', glow: 'shadow-[0_0_12px_rgba(86,212,200,0.4)]' },
};

export function PulseWidget() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: summary } = useApiQuery<PulseSummary>('/api/pulse/summary');

  const intensity = getIntensity(summary);
  const config = INTENSITY_CONFIG[intensity];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-4 left-4 z-50 hidden sm:block">
      {/* Popover */}
      <div
        className={`absolute bottom-full left-0 mb-3 w-72 origin-bottom-left transition-all duration-200 ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className="rounded-xl border border-cipher-border bg-cipher-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Intensity counts */}
          <div className="flex items-center gap-3 border-b border-cipher-border-subtle px-4 py-2.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted">7d signals</span>
            <div className="flex items-center gap-3 ml-auto">
              {([
                { key: 'extreme', label: 'E', opacity: 'opacity-100' },
                { key: 'strong', label: 'S', opacity: 'opacity-70' },
                { key: 'mild', label: 'M', opacity: 'opacity-40' },
              ] as const).map(({ key, label, opacity }) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full bg-cipher-cyan ${opacity}`} />
                  <span className="font-mono text-[10px] tabular-nums text-secondary">
                    {summary?.bySeverity[key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent events */}
          <div className="divide-y divide-cipher-border-subtle/50">
            {(!summary || summary.recent.length === 0) ? (
              <div className="px-4 py-4 text-center">
                <p className="text-xs text-muted font-mono">No anomalies in 7 days</p>
                <p className="text-[10px] text-muted/60 mt-0.5">Network within normal parameters</p>
              </div>
            ) : (
              summary.recent.slice(0, 3).map((event, i) => (
                <div key={`${event.date}-${event.metric}`} className="flex items-center gap-2 px-4 py-2">
                  <span className={`font-mono text-[10px] ${event.direction === 'up' ? 'text-cipher-cyan' : 'text-blue-400'}`}>
                    {event.direction === 'up' ? '▲' : '▼'}
                  </span>
                  <span className="text-xs text-primary truncate flex-1">{event.description}</span>
                  <span className="text-[10px] font-mono text-muted shrink-0">
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Footer link */}
          <div className="border-t border-cipher-border-subtle px-4 py-2">
            <Link
              href="/pulse"
              className="flex items-center justify-end gap-1 text-[11px] font-mono text-muted hover:text-cipher-cyan transition-colors"
              onClick={() => setOpen(false)}
            >
              View Pulse <span className="text-[9px]">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Pulse heartbeat icon */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative flex items-center justify-center w-9 h-9 rounded-full border border-cipher-border/60 transition-all hover:border-cipher-cyan/40 ${config.glow}`}
        style={{ background: 'var(--card-glass-bg)', backdropFilter: 'var(--card-glass-blur)' }}
        aria-label="Network Pulse"
        title="Network Pulse"
      >
        <svg
          viewBox="0 0 32 16"
          fill="none"
          className={`w-5 h-2.5 ${config.opacity}`}
          style={{ filter: intensity === 'active' ? 'drop-shadow(0 0 3px rgba(86,212,200,0.6))' : undefined }}
        >
          <path
            d="M0 8 H8 L11 2 L14 14 L17 4 L20 12 L22 8 H32"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-cipher-cyan"
            style={{
              strokeDasharray: '60',
              strokeDashoffset: '60',
              animation: `heartbeat-draw ${config.duration} ease-in-out infinite`,
            }}
          />
        </svg>
      </button>

      {/* CSS keyframes */}
      <style jsx>{`
        @keyframes heartbeat-draw {
          0% {
            stroke-dashoffset: 60;
          }
          50% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -60;
          }
        }
      `}</style>
    </div>
  );
}
