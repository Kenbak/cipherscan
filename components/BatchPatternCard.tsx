'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PrivacyEventRail } from '@/components/PrivacyEventRail';
import { PrivacyLinkGraph } from '@/components/PrivacyLinkGraph';

export interface BatchPattern {
  patternType: string;
  clusterHash?: string;
  perTxAmountZec: number;
  batchCount: number;
  totalAmountZec: number;
  txids: string[];
  heights: number[];
  times: number[];
  addresses?: string[];
  addressCount?: number;
  sameAddressRatio?: number;
  firstTime: number;
  lastTime: number;
  timeSpanHours: number;
  isRoundNumber: boolean;
  matchingShield: {
    txid: string;
    amountZec: number;
    blockHeight: number;
    blockTime: number;
  } | null;
  score: number;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  ambiguityScore?: number;
  confidenceMargin?: number;
  explanation: string;
  breakdown: {
    batchCount: { count: number; points: number };
    roundNumber: { amountZec: number; isRound: boolean; points: number };
    matchingShield: { found: boolean; txid: string | null; points: number };
    timeClustering: { hours: number; points: number };
    addressAnalysis?: { totalAddresses: number; uniqueAddresses: number; sameAddressRatio: number; topAddresses: string[]; points: number };
    shieldTiming?: { hoursAfterShield: number | null; points: number };
  };
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BatchPatternCard({ pattern }: { pattern: BatchPattern }) {
  const [showGraph, setShowGraph] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isHigh = pattern.warningLevel === 'HIGH';

  const clusterPanel = useMemo(() => {
    const graphNodes = [
      ...(pattern.matchingShield
        ? [{
            id: pattern.matchingShield.txid,
            type: 'transaction' as const,
            label: 'Anchor shield',
            amountZec: pattern.matchingShield.amountZec,
            blockTime: pattern.matchingShield.blockTime,
            subtitle: `${pattern.matchingShield.amountZec.toLocaleString()} ZEC`,
          }]
        : []),
      {
        id: `cluster:${pattern.clusterHash || pattern.txids[0]}`,
        type: 'cluster' as const,
        label: `${pattern.batchCount} withdrawals`,
        subtitle: `${pattern.perTxAmountZec.toFixed(4)} ZEC each in ${pattern.timeSpanHours < 24 ? `${Math.round(pattern.timeSpanHours)}h` : `${Math.round(pattern.timeSpanHours / 24)}d`}`,
      },
      ...(pattern.breakdown.addressAnalysis?.topAddresses || []).slice(0, 3).map((address) => ({
        id: `address:${address}`,
        type: 'address' as const,
        label: address,
        subtitle: 'Destination address',
      })),
    ];

    const graphEdges = [
      ...(pattern.matchingShield ? [{
            id: `${pattern.matchingShield.txid}-cluster`,
            source: pattern.matchingShield.txid,
            target: `cluster:${pattern.clusterHash || pattern.txids[0]}`,
            type: 'BATCH_LINK',
            confidence: pattern.score,
            label: `${pattern.totalAmountZec.toLocaleString()} ZEC`,
          }] : []),
      ...((pattern.breakdown.addressAnalysis?.topAddresses || []).slice(0, 3).map((address, index) => ({
            id: `cluster-${address}`,
            source: `cluster:${pattern.clusterHash || pattern.txids[0]}`,
            target: `address:${address}`,
            type: 'transparent_output',
            confidence: pattern.score,
            label: index === 0 ? 'Recipients' : undefined,
          }))),
    ];

    return {
      graphNodes,
      graphEdges,
    };
  }, [pattern]);

  const burstPoints = useMemo(() => (
    pattern.txids.slice(0, 8).map((txid, index) => ({
      id: txid,
      title: index === 0 ? 'Burst Starts' : index === pattern.txids.length - 1 ? 'Burst Ends' : `Tx ${index + 1}`,
      subtitle: `${pattern.perTxAmountZec.toFixed(4)} ZEC`,
      timestamp: pattern.times[index],
      tone: 'deshield' as const,
    }))
  ), [pattern]);

  const evidenceChips = useMemo(() => {
    const chips = [];
    if (pattern.matchingShield) chips.push('Anchor shield found');
    if (pattern.timeSpanHours <= 2) chips.push('Tight burst window');
    if (pattern.isRoundNumber) chips.push('Round repeated amount');
    if ((pattern.sameAddressRatio || 0) >= 50) chips.push('Recipient reuse');
    if ((pattern.ambiguityScore ?? 0) >= 50) chips.push('Competing explanations');
    return chips.slice(0, 4);
  }, [pattern]);

  return (
    <article className="card card-compact">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 ${isHigh ? 'text-red-400' : 'text-cipher-yellow'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className={`text-xs font-mono font-semibold tracking-wide uppercase ${isHigh ? 'text-red-400' : 'text-cipher-yellow'}`}>
            {isHigh ? 'High' : 'Med'}
            <span className="opacity-30 mx-1">·</span>
            {pattern.score}/100
          </span>
          {pattern.ambiguityScore !== undefined && (
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
              ambiguity {pattern.ambiguityScore}
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted font-mono">
          {pattern.timeSpanHours < 24
            ? `${Math.round(pattern.timeSpanHours)}h span`
            : `${Math.round(pattern.timeSpanHours / 24)}d span`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg font-bold font-mono text-primary shrink-0">{pattern.batchCount}×</span>
          <div className="min-w-0">
            <span className="font-mono text-sm font-semibold text-primary">
              {pattern.perTxAmountZec.toFixed(4)} ZEC
            </span>
            <span className="text-xs text-muted ml-1.5">each</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono text-sm font-semibold text-primary tabular-nums">
            {pattern.totalAmountZec.toLocaleString()} ZEC
          </span>
          <span className="text-[10px] text-muted block">total</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {evidenceChips.map((chip) => (
          <span key={chip} className="rounded-full border border-cipher-border bg-cipher-surface/40 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-secondary">
            {chip}
          </span>
        ))}
      </div>

      <div className="mb-4 rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4">
        <p className="text-base font-medium leading-relaxed text-primary text-balance">
          A large shielded amount appears to have been unpacked into {pattern.batchCount} withdrawals of roughly {pattern.perTxAmountZec.toFixed(4)} ZEC.
        </p>
        <p className="mt-2 text-sm text-secondary">
          This is the classic “split the pattern into chunks” move. The model scores whether the chunk size, burst timing, and matching shield still make the sequence attributable.
        </p>
      </div>

      {pattern.matchingShield && (
        <div className="grid gap-3 mb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cipher-green">Anchor Shield</p>
            <p className="mt-1 text-sm text-primary">
              {pattern.matchingShield.amountZec.toLocaleString()} ZEC entered the pool before this burst.
            </p>
            <p className="mt-1 text-xs text-secondary">
              That conservation match is one of the strongest reasons this pattern stays suspicious.
            </p>
          </div>
          <Link
            href={`/tx/${pattern.matchingShield.txid}`}
            className="font-mono text-cipher-cyan hover:underline truncate text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/60 rounded-sm"
          >
            {pattern.matchingShield.txid.slice(0, 16)}…
          </Link>
        </div>
      )}

      <div className="mb-3">
        <div className="rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted">Burst Window</p>
              <p className="mt-1 text-sm text-primary">
                {pattern.batchCount} withdrawals over {pattern.timeSpanHours < 24 ? `${pattern.timeSpanHours.toFixed(1)} hours` : `${(pattern.timeSpanHours / 24).toFixed(1)} days`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
              {[
                { label: 'Score', value: `${pattern.score}` },
                { label: 'Ambiguity', value: `${pattern.ambiguityScore ?? 0}` },
                { label: 'Margin', value: `${pattern.confidenceMargin ?? 0}` },
                { label: 'Recipients', value: `${pattern.addressCount ?? 0}` },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-cipher-border bg-cipher-surface/20 px-3 py-2">
                  <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted">{metric.label}</p>
                  <p className="mt-1 text-lg font-mono tabular-nums text-primary">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <PrivacyEventRail points={burstPoints} mode="relative" layout="stacked" />
          <p className="mt-3 text-xs leading-relaxed text-secondary">{pattern.explanation}</p>
        </div>
      </div>

      <div className="pt-2">
        <div className="h-px bg-glass-4 mb-2" aria-hidden />
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setShowGraph(!showGraph)}
            aria-label={showGraph ? 'Hide cluster graph' : 'Show cluster graph'}
            className="text-xs text-cipher-cyan hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/60 rounded-sm"
          >
            {showGraph ? 'Hide' : 'Show'} cluster graph
            <svg className={`w-3 h-3 transition-transform ${showGraph ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className="flex flex-wrap gap-3 text-[10px] font-mono text-muted/60">
            <span>batch +{pattern.breakdown.batchCount.points}</span>
            <span>round +{pattern.breakdown.roundNumber.points}</span>
            <span>shield +{pattern.breakdown.matchingShield.points}</span>
            <span>time +{pattern.breakdown.timeClustering.points}</span>
          </div>
        </div>
      </div>

      {showGraph && (
        <div className="mt-3">
          <PrivacyLinkGraph
            nodes={clusterPanel.graphNodes}
            edges={clusterPanel.graphEdges}
            focusNodeId={`cluster:${pattern.clusterHash || pattern.txids[0]}`}
            height={340}
          />
        </div>
      )}

      <div className="pt-2 mt-2">
        <div className="h-px bg-glass-4 mb-2" aria-hidden />
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Hide member transactions' : 'Show member transactions'}
          className="text-xs text-cipher-cyan hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/60 rounded-sm"
        >
          {expanded ? 'Hide' : 'Show'} member transactions
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3">
          <div className="h-px bg-glass-4 mb-3" aria-hidden />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
            {pattern.txids.slice(0, 20).map((txid, index) => (
              <Link
                key={txid}
                href={`/tx/${txid}`}
                className="font-mono text-xs text-muted hover:text-cipher-cyan flex items-center gap-2 py-0.5 transition-colors"
              >
                <span className="text-muted/50 w-5 text-right tabular-nums">{index + 1}.</span>
                <span className="truncate">{txid.slice(0, 16)}…</span>
                <span className="text-[10px] text-muted/50 shrink-0">{formatTime(pattern.times[index])}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
