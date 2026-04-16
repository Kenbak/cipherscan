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
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> FINALIZER_ROSTER
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          Finalizer Roster
        </h1>
        <p className="text-sm text-secondary mt-2">
          Active validators securing the Crosslink PoS finality layer
        </p>
      </div>

      <div className="mb-6">
        <StakingDayBanner />
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Finalizers</span>
            <span className="text-2xl font-mono font-bold text-primary">{data.finalizerCount}</span>
          </div>
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Total Stake</span>
            <span className="text-2xl font-mono font-bold text-primary">{data.totalStakeZec.toFixed(2)}</span>
            <span className="text-[10px] font-mono text-muted block">{CURRENCY}</span>
          </div>
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">Finalized</span>
            <span className="text-2xl font-mono font-bold text-primary">{data.finalizedHeight.toLocaleString()}</span>
          </div>
          <div className="card p-4 text-center">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">PoW Tip</span>
            <span className="text-2xl font-mono font-bold text-primary">{data.tipHeight.toLocaleString()}</span>
          </div>
        </div>
      )}

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
                              className="h-full rounded-full bg-cipher-cyan"
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
            <div className="flex rounded-full overflow-hidden h-3 bg-cipher-border/30">
              {data.roster.map((member) => {
                const share = data.totalStakeZec > 0
                  ? (member.stake_zec || 0) / data.totalStakeZec * 100
                  : 0;
                return (
                  <div
                    key={member.identity}
                    className="bg-cipher-cyan/70 transition-all duration-300 border-r border-cipher-bg last:border-r-0"
                    style={{ width: `${share}%` }}
                    title={`${member.identity.slice(0, 12)}... — ${share.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {data.roster.map((member) => {
                const share = data.totalStakeZec > 0
                  ? (member.stake_zec || 0) / data.totalStakeZec * 100
                  : 0;
                return (
                  <div key={member.identity} className="flex items-center gap-1.5">
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
