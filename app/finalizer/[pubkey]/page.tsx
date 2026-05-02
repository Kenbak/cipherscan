'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StakingActionBadge } from '@/components/StakingActionBadge';
import { CURRENCY } from '@/lib/config';
import { getApiUrl } from '@/lib/api-config';
import { displayPubkey } from '@/lib/utils';
import { getFinalizerLabel, finalizerAvatarStyle, type FinalizerLabel } from '@/lib/finalizer-labels';
import { CopyButton } from '@/components/CopyButton';

function FinalizerHero({
  pubkey,
  label,
  rank,
  isActive,
  isSigningNow,
}: {
  pubkey: string;
  label: FinalizerLabel | null;
  rank: number | null;
  isActive: boolean;
  isSigningNow: boolean;
}) {
  const [showFullPubkey, setShowFullPubkey] = useState(false);
  const truncated = `${pubkey.slice(0, 10)}…${pubkey.slice(-10)}`;

  return (
    <div className="mb-6 animate-fade-in">
      <Link
        href="/validators"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-muted hover:text-cipher-cyan transition-colors mb-3"
      >
        <span>&larr;</span>
        <span>All finalizers</span>
      </Link>
      <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
        <span className="opacity-50">{'>'}</span> FINALIZER
        {rank ? ` · #${rank}` : ''}
      </p>

      <div className="flex items-start gap-4 sm:gap-5">
        {/* Deterministic avatar */}
        <div
          className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl ring-1 ring-white/10 shadow-lg"
          style={finalizerAvatarStyle(pubkey)}
          aria-hidden
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-semibold text-primary tracking-tight">
              {label?.name ?? `Finalizer ${rank ? `#${rank}` : ''}`}
            </h1>
            {isActive ? (
              <Badge color="green">Active</Badge>
            ) : (
              <Badge color="muted">Inactive</Badge>
            )}
            {isSigningNow && <Badge color="orange">Signing now</Badge>}
          </div>

          {label?.description && (
            <p className="text-sm text-secondary mt-1">{label.description}</p>
          )}

          {label?.url && (
            <a
              href={label.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-cipher-cyan hover:underline mt-1.5 font-mono"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              {label.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}

          {/* Pubkey row */}
          <div className="mt-3 flex items-center gap-2 max-w-full">
            <code
              className="font-mono text-xs sm:text-sm text-secondary block-hash-bg px-3 py-1.5 rounded border border-cipher-border min-w-0 truncate sm:break-all sm:whitespace-normal flex-1"
              title={pubkey}
            >
              {showFullPubkey ? pubkey : truncated}
            </code>
            <button
              onClick={() => setShowFullPubkey((v) => !v)}
              className="hidden sm:inline-block text-[10px] font-mono text-muted hover:text-cipher-cyan transition-colors px-2 py-1 rounded border border-cipher-border hover:border-cipher-cyan/40 shrink-0"
            >
              {showFullPubkey ? 'short' : 'full'}
            </button>
            <CopyButton text={pubkey} size="md" label="Copy pubkey" />
          </div>
          <p className="mt-1.5 text-[10px] text-muted font-mono">
            Shown in GUI byte order — matches your Crosslink desktop app.
          </p>
        </div>
      </div>
    </div>
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

interface Participation {
  window_start: number;
  window_end: number;
  window_size: number;
  signed_blocks: number;
  participation_pct: number;
  recent: { height: number; signed: boolean }[];
}

function timeAgo(epochSecs: number | null): string {
  if (!epochSecs) return '—';
  const diff = Math.floor(Date.now() / 1000 - epochSecs);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface CrosslinkStats {
  tipHeight: number;
  finalizedHeight: number;
  totalStakeZec: number;
  finalizerCount: number;
}

interface BftTip {
  votedBlockHash: string | null;
  signatureCount: number;
  signers: { pub_key: string | null }[];
}

export default function FinalizerPage() {
  const params = useParams();
  const pubkey = (params.pubkey as string).toLowerCase();
  const [data, setData] = useState<FinalizerDetail | null>(null);
  const [actions, setActions] = useState<StakeAction[]>([]);
  const [stats, setStats] = useState<CrosslinkStats | null>(null);
  const [bftTip, setBftTip] = useState<BftTip | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [finRes, crossRes, bftRes, partRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/finalizer/${pubkey}`),
        fetch(`${getApiUrl()}/api/crosslink`),
        fetch(`${getApiUrl()}/api/crosslink/bft-tip`),
        fetch(`${getApiUrl()}/api/finalizer/${pubkey}/participation?window=500`),
      ]);
      if (!finRes.ok) {
        if (finRes.status === 404) throw new Error('Finalizer not found');
        throw new Error(`API error: ${finRes.status}`);
      }
      const json: ApiResponse = await finRes.json();
      if (!json.success) throw new Error('API returned failure');
      setData(json.finalizer);
      setActions(json.stakeActions);

      if (crossRes.ok) {
        const j = await crossRes.json();
        if (j.success)
          setStats({
            tipHeight: j.tipHeight,
            finalizedHeight: j.finalizedHeight,
            totalStakeZec: j.totalStakeZec,
            finalizerCount: j.finalizerCount,
          });
      }
      if (bftRes.ok) {
        const j = await bftRes.json();
        if (j.success)
          setBftTip({
            votedBlockHash: j.votedBlockHash,
            signatureCount: j.signatureCount,
            signers: j.signers || [],
          });
      }
      if (partRes.ok) {
        const j = await partRes.json();
        if (j.success) {
          setParticipation({
            window_start: j.window_start,
            window_end: j.window_end,
            window_size: j.window_size,
            signed_blocks: j.signed_blocks,
            participation_pct: j.participation_pct,
            recent: j.recent || [],
          });
        }
      }
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

  const guiPubkey = displayPubkey(data.pub_key);
  const label = getFinalizerLabel(data.pub_key);
  const isSigningNow = bftTip?.signers.some(
    (s) => s.pub_key?.toLowerCase() === pubkey,
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <FinalizerHero
        pubkey={guiPubkey}
        label={label}
        rank={data.rank}
        isActive={data.is_active}
        isSigningNow={!!isSigningNow}
      />

      {/* Key stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <Stat label="Voting Power" value={`${data.voting_power_zec.toFixed(4)}`} sub={CURRENCY} />
        <Stat label="Rank" value={data.rank ? `#${data.rank}` : '—'} />
        <Stat
          label="Share"
          value={
            stats && stats.totalStakeZec > 0
              ? `${((data.voting_power_zec / stats.totalStakeZec) * 100).toFixed(1)}%`
              : '—'
          }
          sub="of total stake"
        />
        <Stat
          label="First Seen"
          value={data.first_seen_height ? `#${data.first_seen_height}` : '—'}
          sub="block"
        />
      </div>

      {/* Activity */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
        <Stat label="Last Updated" value={timeAgo(data.updated_at)} />
        <Stat
          label="Last Seen"
          value={data.last_seen_height ? `#${data.last_seen_height}` : '—'}
          sub="block"
        />
        <Stat
          label="Unique Delegators"
          value={`${new Set(actions.filter((a) => a.bond_key).map((a) => a.bond_key)).size}`}
          sub="bond keys"
        />
      </div>

      {/* BFT voting participation */}
      {participation && participation.window_size > 0 && (
        <ParticipationPanel participation={participation} />
      )}

      {/* Delegators: unique bond keys that have ever staked/retargeted to this finalizer */}
      <DelegatorsPanel actions={actions} />

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
                      className="border-b border-cipher-border-alpha/50 hover:bg-cipher-hover/40 transition-colors"
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

function ParticipationPanel({ participation }: { participation: Participation }) {
  const { participation_pct, signed_blocks, window_size, window_start, window_end, recent } =
    participation;

  const accent = participation_pct >= 95
    ? 'text-cipher-green'
    : participation_pct >= 70
    ? 'text-cipher-cyan'
    : participation_pct >= 30
    ? 'text-cipher-orange'
    : 'text-red-400';

  const barColor = participation_pct >= 95
    ? 'bg-cipher-green'
    : participation_pct >= 70
    ? 'bg-cipher-cyan'
    : participation_pct >= 30
    ? 'bg-cipher-orange'
    : 'bg-red-500';

  // Render `recent` oldest → newest so the timeline reads left-to-right.
  // Each block = ~6-8px wide, stripe color = signed/missed.
  const ordered = [...recent].reverse();

  return (
    <Card className="mb-8">
      <CardBody className="p-4 sm:p-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">
                {'>'}
              </span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                BFT_VOTING_PARTICIPATION
              </h2>
            </div>
            <p className="text-xs text-muted">
              Extracted from each PoW block&apos;s fat_pointer_to_bft_block signer list. Per
              ShieldedLabs, these signatures represent ≥67% stake quorum on the referenced PoW
              block&apos;s finalization.
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-mono font-bold ${accent}`}>
              {participation_pct.toFixed(1)}%
            </div>
            <div className="text-[10px] font-mono text-muted">
              {signed_blocks} / {window_size} blocks
            </div>
          </div>
        </div>

        {/* Participation bar */}
        <div className="h-2 rounded-full bg-cipher-border-alpha/50 overflow-hidden mb-3">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.min(participation_pct, 100)}%` }}
          />
        </div>

        {/* Sparkline of the last ~50 observed BFT-carrying blocks */}
        {ordered.length > 0 && (
          <>
            <div className="flex items-center justify-between text-[10px] font-mono text-muted mb-1">
              <span>
                #{Math.min(...ordered.map((r) => r.height)).toLocaleString()}
              </span>
              <span>last {ordered.length} blocks</span>
              <span>
                #{Math.max(...ordered.map((r) => r.height)).toLocaleString()}
              </span>
            </div>
            <div className="flex items-end gap-[2px] h-6">
              {ordered.map((r) => (
                <span
                  key={r.height}
                  title={`#${r.height.toLocaleString()} — ${r.signed ? 'signed' : 'missed'}`}
                  className={`flex-1 rounded-sm transition-colors ${
                    r.signed
                      ? 'bg-cipher-green/60 hover:bg-cipher-green h-full'
                      : 'bg-red-500/50 hover:bg-red-500 h-2/3'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-muted">
          <span className="flex items-center gap-1.5">
            <span className="block w-2 h-2 rounded-sm bg-cipher-green/60" />
            signed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="block w-2 h-2 rounded-sm bg-red-500/50" />
            missed
          </span>
          <span className="ml-auto text-muted/60">
            window: #{window_start.toLocaleString()} → #{window_end.toLocaleString()}
          </span>
        </div>
      </CardBody>
    </Card>
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

/**
 * Group the staking actions by bond_key to build a "delegators" view.
 * Each bond is a unique delegation; its current status depends on the most
 * recent action for that bond (stake / unstake / withdraw / retarget).
 */
interface DelegatorRow {
  bondKey: string;
  lastAction: string;
  lastActionHeight: number;
  lastActionTime: number | null;
  stakedAmountZec: number; // from the most recent CreateNewDelegationBond we've seen
  lastTxid: string;
}

function DelegatorsPanel({ actions }: { actions: StakeAction[] }) {
  const byBond = new Map<string, DelegatorRow>();

  // Actions come newest-first from the API. Walk newest→oldest; the first
  // action we see for a given bond is its most recent status.
  for (const a of actions) {
    if (!a.bond_key) continue;
    const existing = byBond.get(a.bond_key);
    if (!existing) {
      byBond.set(a.bond_key, {
        bondKey: a.bond_key,
        lastAction: a.action_type,
        lastActionHeight: a.block_height,
        lastActionTime: a.block_time,
        stakedAmountZec: a.amount_zec ?? 0,
        lastTxid: a.txid,
      });
    } else if (a.action_type === 'CreateNewDelegationBond' && existing.stakedAmountZec === 0) {
      // Pull the stake amount from the original CreateNewDelegationBond action
      // if the most recent action didn't have an amount (e.g. a retarget).
      existing.stakedAmountZec = a.amount_zec ?? 0;
    }
  }

  const delegators = Array.from(byBond.values()).sort(
    (a, b) => b.stakedAmountZec - a.stakedAmountZec
  );

  if (delegators.length === 0) return null;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
        <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
          DELEGATORS
        </h2>
        <span className="text-xs text-muted ml-1">({delegators.length} bonds)</span>
      </div>

      <Card className="mb-8">
        <CardBody className="p-0">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-cipher-border text-[10px] text-muted font-mono uppercase tracking-wider">
                  <th className="px-3 sm:px-4 py-3 text-left">Bond Key</th>
                  <th className="px-3 sm:px-4 py-3 text-right">Amount ({CURRENCY})</th>
                  <th className="px-3 sm:px-4 py-3 text-left">Last Action</th>
                  <th className="px-3 sm:px-4 py-3 text-left">Block</th>
                </tr>
              </thead>
              <tbody>
                {delegators.map((d) => (
                  <tr
                    key={d.bondKey}
                    className="border-b border-cipher-border-alpha/50 hover:bg-cipher-hover/40 transition-colors"
                  >
                    <td className="px-3 sm:px-4 py-3">
                      <code className="font-mono text-xs text-secondary">
                        {d.bondKey.slice(0, 12)}…{d.bondKey.slice(-6)}
                      </code>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right font-mono text-primary">
                      {d.stakedAmountZec > 0 ? d.stakedAmountZec.toFixed(4) : '—'}
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <StakingActionBadge type={d.lastAction} compact />
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <Link
                        href={`/block/${d.lastActionHeight}`}
                        className="text-cipher-cyan hover:underline font-mono"
                      >
                        #{d.lastActionHeight.toLocaleString()}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
