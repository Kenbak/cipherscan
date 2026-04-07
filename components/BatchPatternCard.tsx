'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PrivacyClusterPanel } from '@/components/PrivacyClusterPanel';
import { PrivacyTimelinePoint } from '@/components/PrivacyTimelineChart';

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
  const [expanded, setExpanded] = useState(false);
  const isHigh = pattern.warningLevel === 'HIGH';

  const clusterPanel = useMemo(() => {
    const timelinePoints: PrivacyTimelinePoint[] = [
      ...(pattern.matchingShield
        ? [{
            id: pattern.matchingShield.txid,
            label: 'Anchor shield',
            timestamp: pattern.matchingShield.blockTime,
            value: Number(pattern.matchingShield.amountZec.toFixed(4)),
            score: pattern.score,
            kind: 'shield',
          }]
        : []),
      ...pattern.txids.map((txid, index) => ({
        id: txid,
        label: `Batch member ${index + 1}`,
        timestamp: pattern.times[index],
        value: Number(pattern.perTxAmountZec.toFixed(4)),
        score: pattern.score,
        kind: 'deshield',
      })),
    ];

    const graphNodes = [
      ...(pattern.matchingShield
        ? [{
            id: pattern.matchingShield.txid,
            type: 'transaction' as const,
            label: 'Shield',
            amountZec: pattern.matchingShield.amountZec,
            blockTime: pattern.matchingShield.blockTime,
          }]
        : []),
      ...pattern.txids.map((txid, index) => ({
        id: txid,
        type: 'transaction' as const,
        label: `Deshield ${index + 1}`,
        amountZec: pattern.perTxAmountZec,
        blockTime: pattern.times[index],
      })),
      ...(pattern.breakdown.addressAnalysis?.topAddresses || []).slice(0, 3).map((address) => ({
        id: `address:${address}`,
        type: 'address' as const,
        label: address,
      })),
    ];

    const graphEdges = [
      ...(pattern.matchingShield
        ? pattern.txids.map((txid, index) => ({
            id: `${pattern.matchingShield?.txid}-${txid}`,
            source: pattern.matchingShield!.txid,
            target: txid,
            type: 'BATCH_LINK',
            confidence: pattern.score,
            label: `${pattern.perTxAmountZec.toFixed(4)} ZEC`,
          }))
        : []),
      ...(pattern.breakdown.addressAnalysis?.topAddresses?.[0]
        ? pattern.txids.map((txid) => ({
            id: `${txid}-${pattern.breakdown.addressAnalysis!.topAddresses[0]}`,
            source: txid,
            target: `address:${pattern.breakdown.addressAnalysis!.topAddresses[0]}`,
            type: 'transparent_output',
            confidence: pattern.score,
            label: 'output',
          }))
        : []),
    ];

    return {
      timelinePoints,
      graphNodes,
      graphEdges,
    };
  }, [pattern]);

  return (
    <div className="card card-compact">
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

      <div className="flex items-center justify-between gap-4 mb-3">
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

      {pattern.matchingShield && (
        <div className="flex items-center gap-2 text-xs bg-cipher-surface/50 rounded-lg px-3 py-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-cipher-green shrink-0" />
          <span className="text-secondary">Anchor shield:</span>
          <Link href={`/tx/${pattern.matchingShield.txid}`} className="font-mono text-cipher-cyan hover:underline truncate">
            {pattern.matchingShield.txid.slice(0, 12)}…
          </Link>
          <span className="text-muted shrink-0">
            ({pattern.matchingShield.amountZec.toLocaleString()} ZEC)
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted leading-relaxed mb-3">{pattern.explanation}</p>

      <div className="mb-3">
        <PrivacyClusterPanel
          title="Cluster timeline"
          subtitle="Withdrawals are plotted in time order so split patterns and anchor timing are easier to see."
          metrics={[
            { label: 'Cluster', value: `${pattern.batchCount} txs` },
            { label: 'Score', value: `${pattern.score}/100` },
            { label: 'Ambiguity', value: `${pattern.ambiguityScore ?? 0}` },
            { label: 'Margin', value: `${pattern.confidenceMargin ?? 0}` },
          ]}
          timelinePoints={clusterPanel.timelinePoints}
          graphNodes={clusterPanel.graphNodes}
          graphEdges={clusterPanel.graphEdges}
          focusNodeId={pattern.matchingShield?.txid}
        />
      </div>

      <div className="pt-2">
        <div className="h-px bg-glass-4 mb-2" aria-hidden />
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-cipher-cyan hover:underline flex items-center gap-1"
          >
            {expanded ? 'Hide' : 'Show'} member transactions
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    </div>
  );
}
