'use client';

import { useState } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { PageHeader, SectionHeader } from '@/components/ui';
import { Card, CardBody } from '@/components/ui/Card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PulseEvent {
  date: string;
  metric: string;
  value: number;
  zscore: number;
  direction: 'up' | 'down';
  description: string;
  detail: string;
  severity: 'critical' | 'high' | 'notable';
  createdAt: string;
}

type Severity = 'all' | 'critical' | 'high' | 'notable';

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', label: 'Critical', icon: '!!' },
  high: { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', label: 'High', icon: '!' },
  notable: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', label: 'Notable', icon: '~' },
};

const METRIC_LABELS: Record<string, string> = {
  tx_count_total: 'Transaction Count',
  tx_count_shielded: 'Shielded Txs',
  shielded_pct: 'Shielded %',
  shield_volume_zat: 'Shield Volume',
  deshield_volume_zat: 'Deshield Volume',
  crosschain_inflow_usd: 'Cross-Chain Inflow',
  crosschain_outflow_usd: 'Cross-Chain Outflow',
  daily_fees_zat: 'Fee Market',
  exchange_deposit_zat: 'Exchange Deposits',
  mvrv: 'MVRV Ratio',
  migration_volume_zat: 'Ironwood Migration',
  miner_exchange_ratio: 'Miner Sell Pressure',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PulsePage() {
  const [days, setDays] = useState(30);
  const [severity, setSeverity] = useState<Severity>('all');
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const { data: pulseData, loading } = useApiQuery<{ events: PulseEvent[]; total: number }>(
    '/api/pulse',
    { days, limit: pageSize, offset: page * pageSize },
  );
  const events = pulseData?.events ?? [];
  const total = pulseData?.total ?? 0;

  const filtered = severity === 'all' ? events : events.filter(e => e.severity === severity);

  const counts = events.reduce(
    (acc, e) => { acc[e.severity] = (acc[e.severity] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="NETWORK_PULSE"
        title="Network Pulse"
        subtitle="Auto-detected statistical anomalies across 12 on-chain metrics. Events trigger when a metric deviates more than 2.5 standard deviations from its 90-day rolling average."
      />

      {/* ─── Stats bar ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {(['critical', 'high', 'notable'] as const).map(sev => {
          const cfg = SEVERITY_CONFIG[sev];
          return (
            <Card key={sev} className={`border ${cfg.bg}`}>
              <CardBody className="flex items-center gap-3 py-3">
                <span className={`font-mono text-sm font-bold ${cfg.color}`}>{cfg.icon}</span>
                <div>
                  <p className={`text-lg font-semibold ${cfg.color}`}>{counts[sev] || 0}</p>
                  <p className="text-xs text-cipher-text-muted">{cfg.label}</p>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* ─── Filters ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <span className="text-xs text-cipher-text-muted font-mono mr-1">PERIOD</span>
        {[7, 14, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => { setDays(d); setPage(0); }}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
              days === d
                ? 'bg-cipher-cyan/15 text-cipher-cyan border border-cipher-cyan/30'
                : 'text-cipher-text-muted hover:text-cipher-text-secondary border border-transparent'
            }`}
          >
            {d}D
          </button>
        ))}

        <div className="w-px h-6 bg-cipher-border/30 mx-2" />

        <span className="text-xs text-cipher-text-muted font-mono mr-1">SEVERITY</span>
        {(['all', 'critical', 'high', 'notable'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSeverity(s)}
            className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
              severity === s
                ? 'bg-cipher-cyan/15 text-cipher-cyan border border-cipher-cyan/30'
                : 'text-cipher-text-muted hover:text-cipher-text-secondary border border-transparent'
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ─── Event feed ─────────────────────────────────────── */}
      <SectionHeader label="ANOMALY_FEED" />
      <div className="mt-6 space-y-3">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-cipher-surface animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12 text-cipher-text-muted">
              No anomalies detected in this period. The network is within normal parameters.
            </CardBody>
          </Card>
        ) : (
          filtered.map((event, idx) => {
            const cfg = SEVERITY_CONFIG[event.severity];
            return (
              <Card key={`${event.date}-${event.metric}-${idx}`} className={`border ${cfg.bg}`}>
                <CardBody className="flex items-start gap-4 py-4">
                  {/* Severity indicator */}
                  <div className="flex flex-col items-center gap-1 shrink-0 w-12">
                    <span className={`font-mono text-xs font-bold ${cfg.color}`}>
                      {cfg.label.slice(0, 4).toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-mono ${event.direction === 'up' ? 'text-red-400' : 'text-blue-400'}`}>
                      {event.direction === 'up' ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-cipher-text-primary">
                        {event.description}
                      </h3>
                      <span className="text-xs font-mono text-cipher-text-muted">
                        z={event.zscore.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-cipher-text-secondary mt-1">{event.detail}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-mono text-cipher-text-muted px-2 py-0.5 rounded bg-cipher-surface">
                        {METRIC_LABELS[event.metric] || event.metric}
                      </span>
                      <span className="text-[10px] text-cipher-text-muted">
                        {new Date(event.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>

      {/* ─── Pagination ─────────────────────────────────────── */}
      {total > pageSize && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-xs font-mono rounded-lg border border-cipher-border/30 text-cipher-text-secondary disabled:opacity-30 hover:bg-cipher-surface transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-cipher-text-muted font-mono">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * pageSize >= total}
            className="px-4 py-2 text-xs font-mono rounded-lg border border-cipher-border/30 text-cipher-text-secondary disabled:opacity-30 hover:bg-cipher-surface transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* ─── Methodology ───────────────────────────────────── */}
      <section className="mt-14">
        <SectionHeader label="METHODOLOGY" />
        <Card className="mt-6">
          <CardBody className="text-sm text-cipher-text-secondary space-y-3">
            <p>
              Each metric is computed daily and compared to its 90-day rolling mean and
              standard deviation. An anomaly is flagged when the daily value deviates by
              more than 2.5 standard deviations (|z| ≥ 2.5).
            </p>
            <p>
              <span className="font-medium text-cipher-text-primary">Severity levels:</span>{' '}
              Critical (|z| ≥ 4.0), High (|z| ≥ 3.0), Notable (|z| ≥ 2.5).
            </p>
            <p className="text-xs text-cipher-text-muted">
              12 metrics tracked: transaction counts, shielded adoption, shield/deshield volume,
              cross-chain flows, fee market, exchange deposits, MVRV ratio, Ironwood migrations,
              and miner sell pressure. Updated daily after 21:00 UTC.
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
