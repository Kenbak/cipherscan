'use client';

import { useState, useEffect, useCallback } from 'react';
import { StakingDayBanner } from '@/components/StakingDayBanner';
import { CURRENCY } from '@/lib/config';

interface RosterMember {
  identity: string;
  stake_zats: number;
  stake_zec?: number;
}

interface ValidatorData {
  roster: RosterMember[];
  finalizerCount: number;
  totalStakeZec: number;
  finalizedHeight: number;
  tipHeight: number;
}

export default function ValidatorsPage() {
  const [data, setData] = useState<ValidatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/crosslink');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown error');

      setData({
        roster: json.roster || [],
        finalizerCount: json.finalizerCount || 0,
        totalStakeZec: json.totalStakeZec || 0,
        finalizedHeight: json.finalizedHeight || 0,
        tipHeight: json.tipHeight || 0,
      });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold font-mono text-primary flex items-center gap-3">
          <svg className="w-6 h-6 text-cipher-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Finalizer Roster
        </h1>
        <p className="text-sm text-muted mt-2 font-mono">
          Active validators securing the Crosslink PoS finality layer
        </p>
      </div>

      {/* Staking Day Banner */}
      <div className="mb-6">
        <StakingDayBanner />
      </div>

      {/* Summary Stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Finalizers</span>
            <span className="text-2xl font-mono font-bold text-cipher-purple">{data.finalizerCount}</span>
          </div>
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Total Stake</span>
            <span className="text-2xl font-mono font-bold text-primary">{data.totalStakeZec.toFixed(2)}</span>
            <span className="text-[10px] font-mono text-muted block">{CURRENCY}</span>
          </div>
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Finalized</span>
            <span className="text-2xl font-mono font-bold text-cipher-green">{data.finalizedHeight.toLocaleString()}</span>
          </div>
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">PoW Tip</span>
            <span className="text-2xl font-mono font-bold text-cipher-cyan">{data.tipHeight.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Roster Table */}
      {loading ? (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Rank</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Public Key</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Stake</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Share</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-8 skeleton-bg rounded" /></td>
                  <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-48 skeleton-bg rounded" /></td>
                  <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-20 skeleton-bg rounded ml-auto" /></td>
                  <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-12 skeleton-bg rounded ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted font-mono">Crosslink RPC unavailable</p>
          <p className="text-xs text-muted mt-2">{error}</p>
        </div>
      ) : data && data.roster.length > 0 ? (
        <>
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-16">Rank</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Public Key</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Stake ({CURRENCY})</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-24">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.roster.map((member, i) => {
                  const share = data.totalStakeZec > 0
                    ? ((member.stake_zec || 0) / data.totalStakeZec * 100)
                    : 0;

                  return (
                    <tr
                      key={member.identity}
                      className="group transition-colors duration-100 hover:bg-[var(--color-hover)]"
                    >
                      <td className="px-4 h-[52px] border-b border-cipher-border">
                        <span className="font-mono text-sm text-muted">#{i + 1}</span>
                      </td>
                      <td className="px-4 h-[52px] border-b border-cipher-border">
                        <span className="font-mono text-xs text-primary break-all">
                          <span className="hidden sm:inline">{member.identity}</span>
                          <span className="sm:hidden">
                            {member.identity.slice(0, 16)}...{member.identity.slice(-8)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 h-[52px] border-b border-cipher-border text-right">
                        <span className="font-mono text-sm text-primary">
                          {(member.stake_zec || 0).toFixed(4)}
                        </span>
                      </td>
                      <td className="px-4 h-[52px] border-b border-cipher-border text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 rounded-full bg-cipher-border/50 overflow-hidden hidden sm:block">
                            <div
                              className="h-full rounded-full bg-cipher-purple"
                              style={{ width: `${Math.min(share, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-muted w-12 text-right">
                            {share.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Voting Power Distribution */}
          <div className="card p-4 mt-6">
            <h3 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider mb-3">
              Voting Power Distribution
            </h3>
            <div className="flex rounded-full overflow-hidden h-4">
              {data.roster.map((member, i) => {
                const share = data.totalStakeZec > 0
                  ? (member.stake_zec || 0) / data.totalStakeZec * 100
                  : 0;
                const colors = [
                  'bg-cipher-purple',
                  'bg-cipher-cyan',
                  'bg-cipher-green',
                  'bg-cipher-yellow',
                  'bg-cipher-orange',
                  'bg-blue-500',
                  'bg-pink-500',
                  'bg-teal-500',
                ];
                return (
                  <div
                    key={member.identity}
                    className={`${colors[i % colors.length]} transition-all duration-300`}
                    style={{ width: `${share}%` }}
                    title={`${member.identity.slice(0, 12)}... — ${share.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {data.roster.map((member, i) => {
                const share = data.totalStakeZec > 0
                  ? (member.stake_zec || 0) / data.totalStakeZec * 100
                  : 0;
                const colors = [
                  'bg-cipher-purple',
                  'bg-cipher-cyan',
                  'bg-cipher-green',
                  'bg-cipher-yellow',
                  'bg-cipher-orange',
                  'bg-blue-500',
                  'bg-pink-500',
                  'bg-teal-500',
                ];
                return (
                  <div key={member.identity} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
                    <span className="text-[10px] font-mono text-muted">
                      {member.identity.slice(0, 8)}... ({share.toFixed(1)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted font-mono">No active finalizers</p>
        </div>
      )}
    </div>
  );
}
