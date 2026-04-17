'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  const [filter, setFilter] = useState('');
  // pubkey (lowercase) -> participation_pct over the last 500 blocks
  const [participation, setParticipation] = useState<Record<string, number>>({});

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

      // Fan out participation queries for each roster member (13-17 requests,
      // cheap and hitting the indexed bft_signer_keys GIN index server-side).
      const roster = json.roster || [];
      const apiBase = ''; // /api/crosslink shares the same host as participation
      const results = await Promise.allSettled(
        roster.map((m: RosterMember) =>
          fetch(`${apiBase}/api/finalizer/${m.identity}/participation?window=500`).then((r) =>
            r.ok ? r.json() : null
          )
        )
      );
      const next: Record<string, number> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.success) {
          next[roster[i].identity.toLowerCase()] = r.value.participation_pct || 0;
        }
      });
      setParticipation(next);
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
        <div className="card p-0 overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr>
                <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Rank</th>
                <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Public Key</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Stake</th>
                <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Share</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-3 sm:px-4 py-4 border-b border-cipher-border"><div className="h-4 w-8 skeleton-bg rounded" /></td>
                  <td className="px-3 sm:px-4 py-4 border-b border-cipher-border"><div className="h-4 w-32 sm:w-48 skeleton-bg rounded" /></td>
                  <td className="px-3 sm:px-4 py-4 border-b border-cipher-border"><div className="h-4 w-16 sm:w-20 skeleton-bg rounded ml-auto" /></td>
                  <td className="px-3 sm:px-4 py-4 border-b border-cipher-border"><div className="h-4 w-12 skeleton-bg rounded ml-auto" /></td>
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
          {/* Filter input: search by public key prefix */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value.toLowerCase().trim())}
                placeholder="Filter by public key (paste prefix or full hex)"
                className="w-full bg-cipher-bg border border-cipher-border rounded-md px-3 py-2.5 pl-9 text-sm font-mono text-primary placeholder:text-muted/60 focus:outline-none focus:border-cipher-cyan/60 transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2M10 18a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              {filter && (
                <button
                  onClick={() => setFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary text-xs font-mono"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          <div className="card p-0 overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr>
                  <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-12 sm:w-16">Rank</th>
                  <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Public Key</th>
                  <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Stake ({CURRENCY})</th>
                  <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-20 sm:w-24">Share</th>
                  <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-24 sm:w-28">Voting (500)</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = filter
                    ? data.roster
                        .map((m, origIdx) => ({ m, origIdx }))
                        .filter(({ m }) => m.identity.toLowerCase().includes(filter))
                    : data.roster.map((m, origIdx) => ({ m, origIdx }));

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-sm text-muted font-mono border-b border-cipher-border"
                        >
                          No finalizer matches &ldquo;{filter}&rdquo;
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map(({ m: member, origIdx }) => {
                  const i = origIdx;
                  const share = data.totalStakeZec > 0
                    ? ((member.stake_zec || 0) / data.totalStakeZec * 100)
                    : 0;

                  return (
                    <tr
                      key={member.identity}
                      className="group transition-colors duration-100 hover:bg-[var(--color-hover)]"
                    >
                      <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border">
                        <span className="font-mono text-sm text-muted">#{i + 1}</span>
                      </td>
                      <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border">
                        <Link
                          href={`/finalizer/${member.identity}`}
                          className="font-mono text-xs text-primary hover:text-cipher-cyan transition-colors break-all"
                        >
                          <span className="hidden sm:inline">{member.identity}</span>
                          <span className="sm:hidden">
                            {member.identity.slice(0, 12)}...{member.identity.slice(-6)}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right">
                        <span className="font-mono text-sm text-primary">
                          {(member.stake_zec || 0).toFixed(4)}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right">
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
                      <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right">
                        {(() => {
                          const pct = participation[member.identity.toLowerCase()];
                          if (pct === undefined) {
                            return <span className="font-mono text-xs text-muted/60">—</span>;
                          }
                          const color = pct >= 95
                            ? 'bg-cipher-green'
                            : pct >= 70
                            ? 'bg-cipher-cyan'
                            : pct >= 30
                            ? 'bg-cipher-orange'
                            : 'bg-red-500';
                          const textColor = pct >= 95
                            ? 'text-cipher-green'
                            : pct >= 70
                            ? 'text-cipher-cyan'
                            : pct >= 30
                            ? 'text-cipher-orange'
                            : 'text-red-400';
                          return (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-cipher-border/50 overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full rounded-full ${color}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className={`font-mono text-xs ${textColor} w-10 text-right`}>
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                  });
                })()}
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
