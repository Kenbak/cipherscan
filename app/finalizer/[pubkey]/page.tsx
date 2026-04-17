'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StakingActionBadge } from '@/components/StakingActionBadge';
import { CURRENCY } from '@/lib/config';
import { getApiUrl } from '@/lib/api-config';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-2 text-muted hover:text-cipher-cyan transition-colors shrink-0"
      title={copied ? 'Copied!' : 'Copy'}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

interface FinalizerDetail {
  pub_key: string;
  voting_power_zats: number;
  voting_power_zec: number;
  first_seen_height: number | null;
  last_seen_height: number | null;
  is_active: boolean;
  updated_at: number;
  rank: number | null;
}

interface StakeAction {
  txid: string;
  block_height: number;
  block_time: number | null;
  action_type: string;
  bond_key: string | null;
  amount_zats: number | null;
  amount_zec: number | null;
}

interface ApiResponse {
  success: boolean;
  finalizer: FinalizerDetail;
  stakeActions: StakeAction[];
}

function timeAgo(epochSecs: number | null): string {
  if (!epochSecs) return '—';
  const diff = Math.floor(Date.now() / 1000 - epochSecs);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function FinalizerPage() {
  const params = useParams();
  const pubkey = (params.pubkey as string).toLowerCase();
  const [data, setData] = useState<FinalizerDetail | null>(null);
  const [actions, setActions] = useState<StakeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/finalizer/${pubkey}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Finalizer not found');
        throw new Error(`API error: ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error('API returned failure');
      setData(json.finalizer);
      setActions(json.stakeActions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="h-8 w-64 bg-cipher-border rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-3 w-16 bg-cipher-border rounded mb-2" />
              <div className="h-6 w-20 bg-cipher-border rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="text-center">
          <CardBody className="py-16">
            <h2 className="text-xl font-bold text-primary mb-3">
              {error === 'Finalizer not found' ? 'Finalizer not found' : 'Error'}
            </h2>
            <p className="text-secondary mb-4">{error}</p>
            <p className="text-xs text-muted font-mono break-all max-w-md mx-auto">{pubkey}</p>
            <Link href="/validators" className="mt-6 inline-block text-cipher-cyan hover:underline">
              &larr; View all finalizers
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-6 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> FINALIZER_DETAIL
        </p>
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Finalizer {data.rank ? `#${data.rank}` : ''}
          </h1>
          {data.is_active ? (
            <Badge color="green">Active</Badge>
          ) : (
            <Badge color="muted">Inactive</Badge>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 max-w-full">
          <code className="text-xs sm:text-sm font-mono text-secondary break-all flex-1 block-hash-bg px-3 py-2 rounded border border-cipher-border">
            {data.pub_key}
          </code>
          <CopyButton text={data.pub_key} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <Stat label="Voting Power" value={`${data.voting_power_zec.toFixed(4)}`} sub={CURRENCY} />
        <Stat label="Rank" value={data.rank ? `#${data.rank}` : '—'} />
        <Stat label="First Seen" value={data.first_seen_height ? `#${data.first_seen_height}` : '—'} sub="block" />
        <Stat label="Last Updated" value={timeAgo(data.updated_at)} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
        <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
          STAKING_ACTIONS
        </h2>
        <span className="text-xs text-muted ml-1">({actions.length})</span>
      </div>

      {actions.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-muted text-sm">
            No staking actions have targeted this finalizer yet.
            <br />
            <span className="text-xs">
              Stakes and retargets directed to this finalizer will appear here.
            </span>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-cipher-border text-[10px] text-muted font-mono uppercase tracking-wider">
                    <th className="px-3 sm:px-4 py-3 text-left">Action</th>
                    <th className="px-3 sm:px-4 py-3 text-left">Block</th>
                    <th className="px-3 sm:px-4 py-3 text-right">Amount ({CURRENCY})</th>
                    <th className="px-3 sm:px-4 py-3 text-left">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr
                      key={`${a.txid}-${a.action_type}`}
                      className="border-b border-cipher-border/50 hover:bg-cipher-hover/40 transition-colors"
                    >
                      <td className="px-3 sm:px-4 py-3">
                        <StakingActionBadge type={a.action_type} compact />
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <Link href={`/block/${a.block_height}`} className="text-cipher-cyan hover:underline font-mono">
                          #{a.block_height.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right font-mono text-primary">
                        {a.amount_zec !== null ? a.amount_zec.toFixed(4) : '—'}
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <Link href={`/tx/${a.txid}`} className="text-cipher-cyan hover:underline font-mono text-xs">
                          {a.txid.slice(0, 12)}…{a.txid.slice(-6)}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">
        {label}
      </span>
      <span className="text-lg sm:text-2xl font-mono font-bold text-primary">{value}</span>
      {sub && <span className="ml-1 text-xs text-muted">{sub}</span>}
    </div>
  );
}
