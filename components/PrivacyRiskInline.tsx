'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { AddressDisplay } from '@/components/AddressWithLabel';
import { PrivacyLinkGraph } from '@/components/PrivacyLinkGraph';

interface LinkedTransaction {
  txid: string;
  flowType: 'shield' | 'deshield';
  amount: number;
  timeDelta: string;
  linkabilityScore: number;
  transparentAddresses?: string[];
}

interface LinkabilityData {
  success: boolean;
  txid: string;
  flowType: 'shield' | 'deshield' | null;
  amount: number;
  hasShieldedActivity: boolean;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  highestScore: number;
  linkedTransactions: LinkedTransaction[];
  transparentAddresses?: string[];
}

interface PrivacyGraphData {
  success: boolean;
  nodes: Array<{
    id: string;
    type: 'transaction' | 'address';
    label: string;
    amountZec?: number;
    blockTime?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    confidence: number;
    label?: string;
  }>;
}

interface PrivacyRiskInlineProps {
  txid: string;
  variant?: 'compact' | 'full';
  embedded?: boolean;
}

function truncateTxid(txid: string): string {
  return `${txid.slice(0, 8)}...${txid.slice(-6)}`;
}


export function PrivacyRiskInline({ txid, variant = 'full', embedded = false }: PrivacyRiskInlineProps) {
  const [data, setData] = useState<LinkabilityData | null>(null);
  const [graph, setGraph] = useState<PrivacyGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    const fetchLinkability = async () => {
      try {
        const baseUrl = usePostgresApiClient() ? getApiUrl() : '';
        const [linkabilityResponse, graphResponse] = await Promise.all([
          fetch(baseUrl ? `${baseUrl}/api/tx/${txid}/linkability` : `/api/tx/${txid}/linkability`),
          fetch(baseUrl ? `${baseUrl}/api/privacy/graph/${txid}` : `/api/privacy/graph/${txid}`),
        ]);

        if (linkabilityResponse.ok) {
          const result = await linkabilityResponse.json();
          if (result.success) {
            setData(result);
          }
        }

        if (graphResponse.ok) {
          const graphResult = await graphResponse.json();
          if (graphResult.success) {
            setGraph(graphResult);
          }
        }
      } catch (error) {
        console.error('Failed to fetch linkability:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLinkability();
  }, [txid]);

  if (loading || !data || !data.hasShieldedActivity) {
    return null;
  }

  // Compact variant: single-line alert for hero sections
  if (variant === 'compact') {
    const hasRisk = data.linkedTransactions.length > 0 && data.warningLevel !== 'LOW';
    const isHigh = data.warningLevel === 'HIGH';

    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs ${
        hasRisk
          ? isHigh
            ? 'bg-red-500/10 border border-red-500/20'
            : 'bg-cipher-orange/10 border border-cipher-orange/20'
          : 'bg-cipher-green/10 border border-cipher-green/20'
      }`}>
        <svg className={`w-3.5 h-3.5 shrink-0 ${hasRisk ? isHigh ? 'text-red-400' : 'text-cipher-orange' : 'text-cipher-green'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {hasRisk ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          )}
        </svg>
        <span className={hasRisk ? isHigh ? 'text-red-400' : 'text-cipher-orange' : 'text-cipher-green'}>
          {hasRisk
            ? `Privacy: ${data.highestScore}/100 — Round-trip pattern detected`
            : 'Privacy: No round-trip detected'
          }
        </span>
      </div>
    );
  }

  if (data.linkedTransactions.length === 0 || data.warningLevel === 'LOW') {
    const amountZec = (data.amount || 0).toFixed(4);
    const flowVerb = data.flowType === 'shield' ? 'shields' : 'unshields';
    const address = data.transparentAddresses?.[0];

    return (
      <div className={embedded ? 'border-t border-cipher-border pt-3' : 'card card-compact'}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-xs font-mono font-semibold tracking-wide uppercase text-cipher-green">
              Clear
              <span className="opacity-30 mx-1">·</span>
              0/100
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">no round-trip</span>
        </div>

        <p className="text-[11px] text-muted leading-relaxed">
          This transaction {flowVerb}{' '}
          <span className="text-primary font-medium">{amountZec} ZEC</span>
          {address && (
            <>
              {data.flowType === 'shield' ? ' from ' : ' to '}
              <AddressDisplay address={address} className="text-[11px]" />
            </>
          )}.
          No matching {data.flowType === 'shield' ? 'unshield' : 'shield'} with a similar amount was found.
        </p>
      </div>
    );
  }

  const topMatch = data.linkedTransactions[0];
  const linkedAddress = topMatch?.transparentAddresses?.[0];
  const currentAddress = data.transparentAddresses?.[0];
  const isDeshield = data.flowType === 'deshield';
  const isHigh = data.warningLevel === 'HIGH';

  const timeDelta = topMatch?.timeDelta
    ?.replace(' after', ' later')
    ?.replace('1 minutes', '1 minute')
    ?.replace('1 hours', '1 hour')
    ?.replace('1 days', '1 day') || '';

  return (
    <div className={embedded ? 'border-t border-cipher-border pt-3' : 'card card-compact'}>
      {/* Header — same visual language as privacy-risks page */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 ${isHigh ? 'text-red-400' : 'text-cipher-yellow'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className={`text-xs font-mono font-semibold tracking-wide uppercase ${isHigh ? 'text-red-400' : 'text-cipher-yellow'}`}>
            {isHigh ? 'High' : 'Med'}
            <span className="opacity-30 mx-1">·</span>
            {data.highestScore}/100
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted uppercase tracking-wider">round-trip</span>
      </div>

      {/* Human-readable explanation */}
      <div className="space-y-2">
        <p className="text-sm text-secondary leading-relaxed">
          This transaction {isDeshield ? 'unshields' : 'shields'}{' '}
          <span className="text-primary font-medium">{data.amount.toFixed(4)} ZEC</span>
          {currentAddress && (
            <>
              {isDeshield ? ' to ' : ' from '}
              <AddressDisplay address={currentAddress} className="text-xs" />
            </>
          )}.
        </p>

        <p className="text-sm text-secondary leading-relaxed">
          A similar amount was {isDeshield ? 'shielded' : 'unshielded'}
          {linkedAddress && (
            <>
              {isDeshield ? ' from ' : ' to '}
              <AddressDisplay address={linkedAddress} className="text-xs" />
            </>
          )}
          {timeDelta && <span className="text-muted"> ({timeDelta})</span>}.
        </p>

        <p className="text-sm text-secondary italic leading-relaxed">
          → An observer could conclude that{' '}
          <span className="not-italic">{currentAddress ? <AddressDisplay address={currentAddress} className="text-xs" /> : 'address A'}</span>
          {' '}and{' '}
          <span className="not-italic">{linkedAddress ? <AddressDisplay address={linkedAddress} className="text-xs" /> : 'address B'}</span>
          {' '}belong to the same person.
        </p>
      </div>

      {/* Linked TX */}
      <div className="flex items-center gap-2 text-xs text-muted mt-3 flex-wrap">
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <span>Linked transaction:</span>
        <Link href={`/tx/${topMatch.txid}`} className="font-mono text-primary hover:text-cipher-cyan transition-colors break-all">
          {truncateTxid(topMatch.txid)}
        </Link>
      </div>

      {graph && graph.nodes.length > 0 && graph.edges.length > 0 && (
        <div className="mt-4">
          <PrivacyLinkGraph nodes={graph.nodes} edges={graph.edges} focusNodeId={txid} height={220} />
        </div>
      )}

      {/* Why is this a risk — expandable */}
      <div className="pt-2 mt-1">
        <div className="h-px bg-glass-4 mb-2" aria-hidden />
        <button
          onClick={() => setShowWhy(!showWhy)}
          className="text-xs text-muted hover:text-secondary flex items-center gap-1 transition-colors"
        >
          {showWhy ? 'Hide' : 'Why is this a risk?'}
          <svg className={`w-3 h-3 transition-transform ${showWhy ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showWhy && (
          <div className="mt-3 text-xs text-secondary leading-relaxed">
            <p>
              When you shield and then unshield similar amounts within a short time,
              an observer can correlate the transactions and link your transparent addresses.
            </p>
            <p className="mt-2 text-muted">
              The only foolproof way to defeat this is to <strong className="text-primary">ZODL</strong> — hold your ZEC in the shielded pool longer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
