'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { AddressDisplay } from '@/components/AddressWithLabel';
import { PrivacyLinkGraph } from '@/components/PrivacyLinkGraph';

interface RiskyTransaction {
  shieldTxid: string;
  shieldHeight: number;
  shieldTime: number;
  shieldAmount: number;
  shieldPool: string;
  shieldAddresses: string[];
  deshieldTxid: string;
  deshieldHeight: number;
  deshieldTime: number;
  deshieldAmount: number;
  deshieldPool: string;
  deshieldAddresses: string[];
  timeDelta: string;
  timeDeltaSeconds: number;
  score: number;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  scoreBreakdown: {
    amountSimilarity: number;
    timeProximity: number;
    amountRarity: number;
    weirdAmount?: number;
  };
  ambiguityScore?: number;
  confidenceMargin?: number;
}

interface RiskyTxCardProps {
  tx: RiskyTransaction;
}

function truncateTxid(txid: string): string {
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

function TxLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="View transaction"
      className="text-muted hover:text-cipher-cyan transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/60 rounded-sm"
      title="View transaction"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </Link>
  );
}

export function RiskyTxCard({ tx }: RiskyTxCardProps) {
  const [showGraph, setShowGraph] = useState(false);
  const isHigh = tx.warningLevel === 'HIGH';
  const shieldAddress = tx.shieldAddresses?.[0];
  const deshieldAddress = tx.deshieldAddresses?.[0];
  const hasAddresses = shieldAddress && deshieldAddress;

  const timeDeltaDisplay = tx.timeDelta
    ?.replace(' after', ' later')
    ?.replace('1 minutes', '1 minute')
    ?.replace('1 hours', '1 hour')
    ?.replace('1 days', '1 day') || tx.timeDelta;

  const evidenceChips = useMemo(() => {
    const chips = [];
    if (tx.scoreBreakdown.weirdAmount && tx.scoreBreakdown.weirdAmount >= 12) chips.push('Rare weird amount');
    if (tx.scoreBreakdown.timeProximity >= 20) chips.push('Same-session timing');
    else if (tx.scoreBreakdown.timeProximity >= 12) chips.push('Short delay');
    if (tx.ambiguityScore !== undefined && tx.ambiguityScore <= 10) chips.push('Single candidate match');
    else if (tx.ambiguityScore !== undefined && tx.ambiguityScore >= 60) chips.push('High ambiguity');
    if (hasAddresses) chips.push('Address exposure');
    return chips.slice(0, 4);
  }, [tx, hasAddresses]);

  const graphNodes = useMemo(() => ([
    {
      id: tx.shieldTxid,
      type: 'transaction' as const,
      label: shieldAddress || 'Shield tx',
      amountZec: tx.shieldAmount,
      blockTime: tx.shieldTime,
      subtitle: 'Transparent source',
    },
    {
      id: 'pool:shielded',
      type: 'pool' as const,
      label: 'Shielded Pool',
      subtitle: 'Privacy boundary',
    },
    {
      id: tx.deshieldTxid,
      type: 'transaction' as const,
      label: deshieldAddress || 'Deshield tx',
      amountZec: tx.deshieldAmount,
      blockTime: tx.deshieldTime,
      subtitle: 'Transparent destination',
    },
    ...(shieldAddress ? [{
      id: `address:${shieldAddress}`,
      type: 'address' as const,
      label: shieldAddress,
      subtitle: 'Source address',
    }] : []),
    ...(deshieldAddress ? [{
      id: `address:${deshieldAddress}`,
      type: 'address' as const,
      label: deshieldAddress,
      subtitle: 'Destination address',
    }] : []),
  ]), [tx, shieldAddress, deshieldAddress]);

  const graphEdges = useMemo(() => ([
    ...(shieldAddress ? [{
      id: `${shieldAddress}-${tx.shieldTxid}`,
      source: `address:${shieldAddress}`,
      target: tx.shieldTxid,
      type: 'transparent_input',
      confidence: tx.score,
    }] : []),
    {
      id: `${tx.shieldTxid}-pool`,
      source: tx.shieldTxid,
      target: 'pool:shielded',
      type: 'pool_entry',
      confidence: tx.score,
      label: 'shield',
    },
    {
      id: `pool-${tx.deshieldTxid}`,
      source: 'pool:shielded',
      target: tx.deshieldTxid,
      type: 'PAIR_LINK',
      confidence: tx.score,
      label: timeDeltaDisplay,
    },
    ...(deshieldAddress ? [{
      id: `${tx.deshieldTxid}-${deshieldAddress}`,
      source: tx.deshieldTxid,
      target: `address:${deshieldAddress}`,
      type: 'transparent_output',
      confidence: tx.score,
    }] : []),
  ]), [tx, shieldAddress, deshieldAddress]);

  const cardId = `risk-${tx.shieldTxid.slice(0, 8)}-${tx.deshieldTxid.slice(0, 8)}`;

  return (
    <article id={cardId} className="card card-compact scroll-mt-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 ${isHigh ? 'text-red-400' : 'text-cipher-yellow'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className={`text-xs font-mono font-semibold tracking-wide uppercase ${isHigh ? 'text-red-400' : 'text-cipher-yellow'}`}>
            {isHigh ? 'High' : 'Med'}
            <span className="opacity-30 mx-1">·</span>
            {tx.score}/100
          </span>
        </div>
        <span className="text-[11px] text-muted font-mono">
          {formatRelativeTime(tx.deshieldTime)}
        </span>
      </div>

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {evidenceChips.map((chip) => (
            <span key={chip} className="rounded-full border border-cipher-border bg-cipher-surface/40 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-secondary">
              {chip}
            </span>
          ))}
          {tx.confidenceMargin !== undefined && (
            <span className="rounded-full border border-cipher-border bg-cipher-surface/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-muted">
              margin {tx.confidenceMargin}
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4">
          <p className="text-base font-medium leading-relaxed text-primary text-balance">
            {tx.shieldAmount.toFixed(4)} ZEC moved from {shieldAddress ? <AddressDisplay address={shieldAddress} className="text-xs inline" /> : 'a transparent source'} into the shielded pool,
            then {timeDeltaDisplay} reappeared at {deshieldAddress ? <AddressDisplay address={deshieldAddress} className="text-xs inline" /> : 'a transparent destination'}.
          </p>
          <p className="mt-2 text-sm text-secondary">
            The amount pattern is {tx.scoreBreakdown.weirdAmount ? 'distinctive' : 'close enough'} and the timing is tight enough that an observer could plausibly link both sides.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] gap-y-0.5 items-center">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-cipher-purple/70" />
          <span className="text-[10px] font-mono font-medium text-cipher-purple uppercase tracking-wider">Shield</span>
        </div>
        <div />
        <div className="flex items-center gap-1.5 justify-end">
          <span className="text-[10px] font-mono font-medium text-cipher-orange uppercase tracking-wider">Unshield</span>
          <div className="w-1.5 h-1.5 rounded-full bg-cipher-orange/70" />
        </div>

        <span className="font-mono text-sm font-semibold text-primary tabular-nums">
          {tx.shieldAmount.toFixed(4)} ZEC
        </span>
        <div className="flex items-center mx-2 sm:mx-4">
          <div className="risk-connector-line" />
          <span className="text-[10px] font-mono text-muted px-2 sm:px-3 whitespace-nowrap">
            {timeDeltaDisplay}
          </span>
          <div className="risk-connector-line" />
        </div>
        <span className="font-mono text-sm font-semibold text-primary tabular-nums text-right">
          {tx.deshieldAmount.toFixed(4)} ZEC
        </span>

        <div className="flex items-center gap-1 min-w-0">
          {shieldAddress ? (
            <AddressDisplay address={shieldAddress} className="text-[11px]" />
          ) : (
            <span className="font-mono text-[11px] text-muted truncate">{truncateTxid(tx.shieldTxid)}</span>
          )}
          <TxLink href={`/tx/${tx.shieldTxid}`} />
        </div>
        <div />
        <div className="flex items-center gap-1 min-w-0 justify-end">
          <TxLink href={`/tx/${tx.deshieldTxid}`} />
          {deshieldAddress ? (
            <AddressDisplay address={deshieldAddress} className="text-[11px]" />
          ) : (
            <span className="font-mono text-[11px] text-muted truncate">{truncateTxid(tx.deshieldTxid)}</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {[
          { label: 'Amount Match', value: tx.scoreBreakdown.amountSimilarity },
          { label: 'Timing', value: tx.scoreBreakdown.timeProximity },
          { label: 'Rarity', value: tx.scoreBreakdown.amountRarity },
          { label: 'Ambiguity', value: tx.ambiguityScore ?? 0 },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-cipher-border bg-cipher-surface/20 px-3 py-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted">{metric.label}</p>
            <p className="mt-1 text-lg font-mono tabular-nums text-primary">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="pt-2 mt-2">
        <div className="h-px bg-glass-4 mb-2" aria-hidden />
        <button
          onClick={() => setShowGraph(!showGraph)}
          aria-label={showGraph ? 'Hide linkage graph' : 'Show linkage graph'}
          className="text-xs text-cipher-cyan hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/60 rounded-sm"
        >
          {showGraph ? 'Hide' : 'Show'} linkage graph
          <svg className={`w-3 h-3 transition-transform ${showGraph ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {showGraph && (
        <div className="mt-3">
          <PrivacyLinkGraph nodes={graphNodes} edges={graphEdges} focusNodeId={tx.deshieldTxid} height={380} />
        </div>
      )}
    </article>
  );
}
