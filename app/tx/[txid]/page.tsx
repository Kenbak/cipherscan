'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { ExportButton } from '@/components/ExportButton';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { PrivacyRiskInline } from '@/components/PrivacyRiskInline';
import { AddressWithLabel, AddressDisplay } from '@/components/AddressWithLabel';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { TokenChainIcon } from '@/components/TokenChainIcon';

interface BridgeData {
  direction: 'entry' | 'exit';
  sourceChain: string;
  sourceToken: string;
  sourceAmount: number | null;
  destChain: string;
  destToken: string;
  destAmount: number | null;
  otherChain: string;
  otherToken: string;
  otherAmount: number;
  otherAmountUsd: number;
  otherTxHash: string | null;
  explorerUrl: string | null;
  swapTimestamp: string;
  zecAmount?: number;
  zecAddress?: string | null;
}

interface TransactionData {
  txid: string;
  blockHeight: number;
  blockHash: string;
  timestamp: number;
  confirmations: number;
  inputs: any[];
  outputs: any[];
  totalInput: number;
  totalOutput: number;
  fee: number;
  size: number;
  version: number;
  locktime: number;
  shieldedSpends: number;
  shieldedOutputs: number;
  hasShieldedData: boolean;
  isCoinbase?: boolean;
  orchardActions?: number;
  valueBalance?: number;
  valueBalanceSapling?: number;
  valueBalanceOrchard?: number;
  bindingSig?: string;
  bindingSigSapling?: string;
  finality?: string | null;
  bridge?: BridgeData | null;
  bridges?: BridgeData[];
}

// Icon components (same as block page)
const Icons = {
  Hash: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Cube: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Currency: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Code: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
};

export default function TransactionPage() {
  const params = useParams();
  const router = useRouter();
  const txid = params.txid as string;
  const [data, setData] = useState<TransactionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockFallbackChecked, setBlockFallbackChecked] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'io'>('summary');

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const CopyButton = ({ text, label }: { text: string; label: string }) => (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        copyToClipboard(text, label);
      }}
      className="ml-2 p-1 text-muted hover:text-cipher-cyan transition-colors"
      title="Copy to clipboard"
    >
      {copiedText === label ? (
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // For testnet, call Express API directly; for mainnet, use Next.js API
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/tx/${txid}`
          : `/api/tx/${txid}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error('Transaction not found');
        }

        const txData = await response.json();

        // Transform data if coming from Express API
        if (usePostgresApiClient()) {
          // Express API returns snake_case and values in satoshis
          const transformedInputs = (txData.inputs || []).map((input: any) => ({
            ...input,
            value: input.value ? parseFloat(input.value) / 100000000 : 0, // satoshis to ZEC
            txid: input.prev_txid,
            vout: input.prev_vout,
          }));

          const transformedOutputs = (txData.outputs || []).map((output: any) => ({
            value: output.value ? parseFloat(output.value) / 100000000 : 0, // satoshis to ZEC
            n: output.vout_index,
            spent: output.spent || false,
            scriptPubKey: {
              hex: output.script_pubkey || '',
              addresses: output.address ? [output.address] : [],
            },
          }));

          // Calculate transparent totals from inputs/outputs
          const transparentInputSum = transformedInputs.reduce((sum: number, i: any) => sum + (i.value || 0), 0);
          const transparentOutputSum = transformedOutputs.reduce((sum: number, o: any) => sum + (o.value || 0), 0);

          const transformedData = {
            txid: txData.txid,
            blockHeight: txData.blockHeight,
            blockHash: txData.blockHash,
            timestamp: parseInt(txData.blockTime),
            confirmations: parseInt(txData.confirmations),
            inputs: transformedInputs,
            outputs: transformedOutputs,
            // Use API values if available (from Rust indexer), else calculate
            totalInput: txData.totalInput != null ? txData.totalInput : transparentInputSum,
            totalOutput: txData.totalOutput != null ? txData.totalOutput : transparentOutputSum,
            fee: 0, // Will be calculated below
            size: parseInt(txData.size),
            version: parseInt(txData.version),
            locktime: parseInt(txData.locktime),
            shieldedSpends: txData.shieldedSpends || 0,
            shieldedOutputs: txData.shieldedOutputs || 0,
            hasShieldedData: txData.hasSapling || txData.hasShielded || false,
            isCoinbase: txData.isCoinbase || false,
            orchardActions: txData.orchardActions || 0,
            valueBalance: parseFloat(txData.valueBalance || 0),
            valueBalanceSapling: parseFloat(txData.valueBalanceSapling || 0),
            valueBalanceOrchard: parseFloat(txData.valueBalanceOrchard || 0),
            bindingSig: txData.bindingSig,
            bindingSigSapling: txData.bindingSigSapling,
            finality: txData.finality || null,
            bridge: txData.bridge || null,
            bridges: txData.bridges || [],
          };

          // Calculate fee using: fee = inputs - outputs + valueBalance
          if (txData.fee && txData.fee > 0) {
            // Use API-provided fee
            transformedData.fee = txData.fee;
          } else {
            // Fallback: calculate fee = transparentInputs - transparentOutputs + valueBalance
            const shieldedValueBalance = (transformedData.valueBalanceSapling || 0) + (transformedData.valueBalanceOrchard || 0);
            const calculatedFee = transformedData.totalInput - transformedData.totalOutput + shieldedValueBalance;
            transformedData.fee = calculatedFee > 0 ? calculatedFee : 0;
          }

          setData(transformedData);
        } else {
          setData(txData);
        }
      } catch (error) {
        console.error('Error fetching transaction:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [txid]);

  // Fallback: if tx not found, check if this hash is actually a block hash
  useEffect(() => {
    if (loading || data || blockFallbackChecked) return;
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) return;

    setBlockFallbackChecked(true);

    const checkBlock = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/block/${txid}`
          : `/api/block/${txid}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          router.replace(`/block/${txid}`);
        }
      } catch {
        // Not a block hash either — stay on the "not found" view
      }
    };

    checkBlock();
  }, [loading, data, txid, blockFallbackChecked, router]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    let relative = '';
    if (diffDays > 0) {
      relative = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      relative = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      relative = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else {
      relative = 'Just now';
    }

    const absolute = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    return (
      <span>
        {relative} <span className="text-muted">({absolute})</span>
      </span>
    );
  };

  if (loading) {
    const Skeleton = ({ className = '' }: { className?: string }) => (
      <div className={`animate-pulse rounded bg-cipher-border ${className}`} />
    );
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
        <div className="mb-6">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-5 w-48 sm:w-64 mb-4" />
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Card>
            <CardBody>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 py-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-4 w-full max-w-md mt-3" />
              <Skeleton className="h-4 w-3/4 max-w-sm mt-2" />
            </CardBody>
          </Card>
        </div>
        <div className="flex items-center gap-6 border-b border-cipher-border mb-6">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-4 w-28 mb-2" />
        </div>
        <Card>
          <CardBody>
            <div className="space-y-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-cipher-border last:border-0">
                  <Skeleton className="h-4 w-24 sm:w-32" />
                  <Skeleton className="h-4 flex-1 max-w-xs" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!data) {
    const isValidHash = /^[a-fA-F0-9]{64}$/.test(txid);
    const isChecking = isValidHash && !blockFallbackChecked;

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
        <div className="mb-8">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; TX_LOOKUP</span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary mt-1">Transaction Details</h1>
        </div>
        <Card>
          <CardBody>
            <div className="text-center py-12">
              {isChecking ? (
                <>
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-cipher-cyan border-t-transparent mx-auto mb-5"></div>
                  <p className="text-sm text-secondary font-mono">Checking if this is a block hash...</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-cipher-surface border border-white/[0.04] flex items-center justify-center">
                    <svg className="w-7 h-7 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-primary mb-2">Transaction Not Found</h2>
                  <p className="text-sm text-secondary mb-6 max-w-md mx-auto">
                    This transaction doesn&apos;t exist or hasn&apos;t been confirmed yet.
                  </p>
                  <Link href="/" className="text-cipher-cyan hover:text-cipher-yellow transition-colors font-mono text-sm">
                    &larr; Back to Explorer
                  </Link>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Detect coinbase: use API flag if available, otherwise check first input
  const isCoinbase = data.isCoinbase || (data.inputs.length > 0 && data.inputs[0].coinbase);
  const hasOrchard = (data.orchardActions || 0) > 0;
  const hasSapling = data.hasShieldedData;
  const hasTransparentInputs = data.inputs.length > 0 && !isCoinbase;
  const hasTransparentOutputs = data.outputs.some(o => o.scriptPubKey?.addresses);
  const hasTransparent = hasTransparentInputs || hasTransparentOutputs;

  // For Sapling: shieldedSpends = inputs, shieldedOutputs = outputs
  const hasSaplingSpends = data.shieldedSpends > 0;
  const hasSaplingOutputs = data.shieldedOutputs > 0;

  // Determine shielding/unshielding direction using valueBalance
  // valueBalance > 0 = ZEC coming OUT of shielded pool (unshielding)
  // valueBalance < 0 = ZEC going INTO shielded pool (shielding)
  const valueBalance = (data.valueBalanceSapling || 0) + (data.valueBalanceOrchard || 0);

  // Shielding: transparent inputs → shielded (valueBalance < 0)
  const isShielding = hasTransparentInputs && !hasTransparentOutputs && valueBalance < 0;

  // Unshielding: shielded → transparent outputs (valueBalance > 0)
  const isUnshielding = !hasTransparentInputs && hasTransparentOutputs && valueBalance > 0;

  const txType =
    isCoinbase ? 'COINBASE' :
    hasOrchard && !hasTransparent ? 'ORCHARD' :
    (hasSapling || hasOrchard) && hasTransparent && isShielding ? 'SHIELDING' :
    (hasSapling || hasOrchard) && hasTransparent && isUnshielding ? 'UNSHIELDING' :
    (hasSapling || hasOrchard) && hasTransparent ? 'MIXED' :
    hasSapling ? 'SHIELDED' :
    'REGULAR';

  const allBridges = data.bridges && data.bridges.length > 0 ? data.bridges : (data.bridge ? [data.bridge] : []);

  // Build a set of output addresses that correspond to bridge swaps (for highlighting)
  const bridgeOutputAddresses = new Map<string, BridgeData>();
  for (const b of allBridges) {
    if (b.zecAddress) bridgeOutputAddresses.set(b.zecAddress, b);
  }

  // Human-readable transaction explanation
  const generateTxSummary = (): React.ReactNode => {
    if (allBridges.length > 0) {
      if (allBridges.length === 1) {
        const b = allBridges[0];
        if (b.direction === 'entry') {
          return (
            <>
              {b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken} was bridged from {b.otherChain.toUpperCase()} to Zcash via NEAR Intents.
              {b.otherAmountUsd > 0 && (
                <span className="text-muted"> (≈${b.otherAmountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
              )}
            </>
          );
        }
        return (
          <>
            ZEC was bridged out to {b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken} on {b.otherChain.toUpperCase()} via NEAR Intents.
            {b.otherAmountUsd > 0 && (
              <span className="text-muted"> (≈${b.otherAmountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})</span>
            )}
          </>
        );
      }
      return (
        <>
          Batched bridge transaction with {allBridges.length} swaps via NEAR Intents.
        </>
      );
    }

    if (isCoinbase) {
      const recipient = data.outputs[0]?.scriptPubKey?.addresses?.[0];
      if (recipient) {
        return (
          <>
            New {CURRENCY} created as a block reward, sent to the address <AddressWithLabel address={recipient} />.
          </>
        );
      }
      return `New ${CURRENCY} created as a block reward.`;
    }

    if (txType === 'ORCHARD') {
      return 'Fully private transaction. All amounts, senders, and recipients are encrypted and hidden from public view.';
    }

    if (txType === 'SHIELDED') {
      return 'Fully private transaction using Sapling shielded proofs. No amounts or addresses are publicly visible.';
    }

    if (txType === 'SHIELDING') {
      const amount = Math.abs(valueBalance);
      const fromAddr = data.inputs[0]?.address;
      if (fromAddr) {
        return (
          <>
            {amount.toFixed(4)} {CURRENCY} moved from the public address <AddressWithLabel address={fromAddr} /> into the private shielded pool, making future spending invisible.
          </>
        );
      }
      return `${amount.toFixed(4)} ${CURRENCY} moved from a public address into the private shielded pool, making future spending invisible.`;
    }

    if (txType === 'UNSHIELDING') {
      const amount = Math.abs(valueBalance);
      const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
      if (toAddr) {
        return (
          <>
            {amount.toFixed(4)} {CURRENCY} moved out of the private shielded pool to the public address <AddressWithLabel address={toAddr} />.
          </>
        );
      }
      return `${amount.toFixed(4)} ${CURRENCY} moved out of the private shielded pool to a public transparent address.`;
    }

    if (txType === 'MIXED') {
      return 'This transaction combines public and private funds in a single operation. Some inputs or outputs are visible on-chain, while shielded parts remain encrypted.';
    }

    // Regular transparent transaction
    const fromAddr = data.inputs[0]?.address;
    const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];

    if (fromAddr && toAddr) {
      const changeOutputs = data.outputs.filter(
        (out: any) => out.scriptPubKey?.addresses?.[0] === fromAddr
      );
      const recipientOutputs = data.outputs.filter(
        (out: any) => out.scriptPubKey?.addresses?.[0] !== fromAddr
      );

      const primaryOutput = recipientOutputs.length > 0
        ? recipientOutputs.sort((a: any, b: any) => (b.value || 0) - (a.value || 0))[0]
        : data.outputs[0];

      const primaryAddr = primaryOutput?.scriptPubKey?.addresses?.[0];
      const primaryAmount = primaryOutput?.value || 0;
      const otherRecipients = recipientOutputs.length - 1;

      return (
        <>
          The address <AddressWithLabel address={fromAddr} />
          {' sent '}
          <span className="text-primary font-semibold">{primaryAmount.toFixed(4)} {CURRENCY}</span>
          {' to the address '}
          <AddressWithLabel address={primaryAddr || toAddr} />
          {otherRecipients > 0 && (
            <span>
              {' '}and {otherRecipients} other{otherRecipients > 1 ? 's' : ''}
            </span>
          )}
          .
        </>
      );
    }

    return `A transparent transaction with ${data.inputs.length} input${data.inputs.length !== 1 ? 's' : ''} and ${data.outputs.length} output${data.outputs.length !== 1 ? 's' : ''}.`;
  };

  // InfoRow component (same pattern as block page)
  const InfoRow = ({
    icon: Icon,
    label,
    value,
    tooltip,
    valueClass = "text-primary",
  }: {
    icon: React.ComponentType;
    label: string;
    value: React.ReactNode;
    tooltip?: string;
    valueClass?: string;
  }) => (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b block-info-border last:border-0 gap-2 sm:gap-0">
      <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-secondary">
        <span className="mr-2">
          <Icon />
        </span>
        <span className="text-xs sm:text-sm">{label}</span>
        {tooltip && (
          <span className="ml-2">
            <Tooltip content={tooltip} />
          </span>
        )}
      </div>
      <div className={`flex-1 font-mono text-xs sm:text-sm ${valueClass} break-all`}>{value}</div>
    </div>
  );

  // Build the visual flow for the hero section
  const renderHeroFlow = () => {
    if (allBridges.length > 0) {
      const b = allBridges[0];
      if (b.direction === 'entry') {
        return (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <TokenChainIcon token={b.otherToken} chain={b.otherChain} size={24} />
              <span className="text-sm font-mono text-primary">{b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken}</span>
            </div>
            <span className="text-muted hidden sm:inline">→</span>
            <span className="text-muted sm:hidden">↓</span>
            <div className="flex items-center gap-2">
              <TokenChainIcon token="ZEC" chain="zec" size={24} />
              <span className="text-sm font-mono text-primary">{b.zecAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || '?'} ZEC</span>
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <TokenChainIcon token="ZEC" chain="zec" size={24} />
            <span className="text-sm font-mono text-primary">ZEC</span>
          </div>
          <span className="text-muted hidden sm:inline">→</span>
          <span className="text-muted sm:hidden">↓</span>
          <div className="flex items-center gap-2">
            <TokenChainIcon token={b.otherToken} chain={b.otherChain} size={24} />
            <span className="text-sm font-mono text-primary">{b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken}</span>
          </div>
        </div>
      );
    }

    const FlowArrow = () => (
      <span className="text-muted hidden sm:inline">→</span>
    );
    const FlowArrowDown = () => (
      <span className="text-muted sm:hidden">↓</span>
    );

    if (txType === 'ORCHARD' || txType === 'SHIELDED') {
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <Badge color="purple" icon={<Icons.Shield />}>Shielded</Badge>
          <FlowArrow /><FlowArrowDown />
          <span className="text-cipher-purple/40 font-mono text-sm">████████ ZEC</span>
          <FlowArrow /><FlowArrowDown />
          <Badge color="purple" icon={<Icons.Shield />}>Shielded</Badge>
        </div>
      );
    }

    if (txType === 'SHIELDING') {
      const fromAddr = data.inputs[0]?.address;
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          {fromAddr ? <AddressDisplay address={fromAddr} className="text-xs" /> : <span className="text-sm text-secondary font-mono">Transparent</span>}
          <FlowArrow /><FlowArrowDown />
          <span className="text-sm font-mono text-primary">{Math.abs(valueBalance).toFixed(4)} ZEC</span>
          <FlowArrow /><FlowArrowDown />
          <Badge color="purple" icon={<Icons.Shield />}>Shielded Pool</Badge>
        </div>
      );
    }

    if (txType === 'UNSHIELDING') {
      const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <Badge color="purple" icon={<Icons.Shield />}>Shielded Pool</Badge>
          <FlowArrow /><FlowArrowDown />
          <span className="text-sm font-mono text-primary">{Math.abs(valueBalance).toFixed(4)} ZEC</span>
          <FlowArrow /><FlowArrowDown />
          {toAddr ? <AddressDisplay address={toAddr} className="text-xs" /> : <span className="text-sm text-secondary font-mono">Transparent</span>}
        </div>
      );
    }

    if (isCoinbase) {
      const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <Badge color="green" icon={<Icons.Currency />}>Block Reward</Badge>
          <FlowArrow /><FlowArrowDown />
          <span className="text-sm font-mono text-primary">{data.totalOutput.toFixed(4)} ZEC</span>
          <FlowArrow /><FlowArrowDown />
          {toAddr ? <AddressDisplay address={toAddr} className="text-xs" /> : <span className="text-sm text-muted">—</span>}
        </div>
      );
    }

    // Regular transparent
    const fromAddr = data.inputs[0]?.address;
    const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        {fromAddr ? <AddressDisplay address={fromAddr} className="text-xs" /> : <span className="text-sm text-muted">—</span>}
        <FlowArrow /><FlowArrowDown />
        <span className="text-sm font-mono text-primary">{data.totalOutput.toFixed(4)} ZEC</span>
        <FlowArrow /><FlowArrowDown />
        {toAddr ? <AddressDisplay address={toAddr} className="text-xs" /> : <span className="text-sm text-muted">—</span>}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">

      {/* ================================================================
          HERO SECTION
          ================================================================ */}
      <div className="mb-6 animate-fade-in-up">
        {/* Row 1: Header + Export */}
        <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-mono text-muted tracking-wider">&gt; TX_DETAILS</span>
            <h1 className="text-sm sm:text-base md:text-lg font-mono text-primary mt-0.5 break-all">{data.txid.slice(0, 12)}...{data.txid.slice(-8)}</h1>
          </div>
          <ExportButton
            data={{
              txid: data.txid, blockHeight: data.blockHeight, blockHash: data.blockHash,
              timestamp: data.timestamp, confirmations: data.confirmations, fee: data.fee,
              size: data.size, version: data.version, locktime: data.locktime,
              totalInput: data.totalInput, totalOutput: data.totalOutput,
              shieldedSpends: data.shieldedSpends, shieldedOutputs: data.shieldedOutputs,
              orchardActions: data.orchardActions,
              inputs: data.inputs.map((i: any) => ({ address: i.address || 'shielded', value: i.value, coinbase: i.coinbase || false })),
              outputs: data.outputs.map((o: any) => ({ address: o.scriptPubKey?.addresses?.[0] || 'shielded', value: o.value, index: o.n, spent: o.spent || false }))
            }}
            filename={`tx-${data.txid.slice(0, 16)}`}
            type="json"
            label="Export"
          />
        </div>

        {/* Row 2: Status badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <StatusBadge status="confirmed" />
          {txType === 'COINBASE' && <Badge color="green" icon={<Icons.Currency />}>COINBASE</Badge>}
          {(txType === 'ORCHARD' || txType === 'SHIELDED') && <Badge color="purple" icon={<Icons.Shield />}>SHIELDED</Badge>}
          {txType === 'SHIELDING' && <Badge color="green" icon={<Icons.Shield />}>SHIELDING</Badge>}
          {txType === 'UNSHIELDING' && <Badge color="orange" icon={<Icons.Shield />}>UNSHIELDING</Badge>}
          {txType === 'MIXED' && <Badge color="orange" icon={<Icons.Shield />}>MIXED</Badge>}
          {txType === 'REGULAR' && <Badge color="cyan">TRANSFER</Badge>}
          {allBridges.length > 0 && (
            <Badge color="cyan" icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }>
              {allBridges[0].direction === 'entry' ? 'BRIDGE IN' : 'BRIDGE OUT'}
            </Badge>
          )}
        </div>

        {/* Hero card: flow + summary + privacy as one unified block */}
        <Card>
          <CardBody>
            <div className="space-y-3">
              {/* Centered flow */}
              <div className="flex justify-center">
                {renderHeroFlow()}
              </div>

              {/* Human-readable summary */}
              <p className="text-sm text-muted leading-relaxed">
                {generateTxSummary()}
              </p>

              {/* Bridge explorer links */}
              {allBridges.length > 0 && (
                <div>
                  {allBridges.map((b, i) => {
                    if (!b.explorerUrl) return null;
                    const explorerNames: Record<string, string> = {
                      eth: 'Etherscan', sol: 'Solscan', btc: 'Mempool.space',
                      near: 'NearBlocks', doge: 'DogeChain', xrp: 'XRPScan',
                      arb: 'Arbiscan', base: 'BaseScan', pol: 'PolygonScan',
                      avax: 'Snowtrace', bsc: 'BscScan', op: 'Optimism Explorer',
                      tron: 'TronScan',
                    };
                    const explorerName = explorerNames[b.otherChain] || `${b.otherChain.toUpperCase()} Explorer`;
                    return (
                      <a key={i} href={b.explorerUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mr-3 text-xs text-cipher-cyan hover:text-cipher-cyan/80 transition-colors font-mono">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View {b.otherChain.toUpperCase()} tx on {explorerName}
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Privacy verdict */}
              <PrivacyRiskInline txid={data.txid} variant="full" embedded />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ================================================================
          TAB BAR
          ================================================================ */}
      <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <div className="flex items-center gap-6 border-b border-cipher-border">
          {(['summary', 'io'] as const).map((tab) => {
            const labels = { summary: 'Overview', io: 'Inputs / Outputs' };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 font-mono text-xs tracking-wider uppercase transition-colors ${
                  activeTab === tab
                    ? 'text-primary border-b-2 border-cipher-cyan -mb-[1px]'
                    : 'text-muted hover:text-secondary'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================================================================
          SUMMARY TAB
          ================================================================ */}
      {activeTab === 'summary' && (
        <div>
          <Card className="mb-6">
            <CardBody className="space-y-0">
              {/* Transaction Hash */}
              <div className="pb-3 border-b block-info-border">
                <div className="flex items-center mb-2 text-secondary">
                  <span className="mr-2"><Icons.Hash /></span>
                  <span className="text-sm">Transaction Hash</span>
                  <span className="ml-2"><Tooltip content="Unique identifier for this transaction" /></span>
                </div>
                <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border flex items-center max-w-full">
                  <code className="text-xs text-primary break-all block min-w-0 flex-1">{data.txid}</code>
                  <CopyButton text={data.txid} label="txhash" />
                </div>
              </div>

              <InfoRow icon={Icons.Cube} label="Block" tooltip="The block that includes this transaction" value={
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/block/${data.blockHeight}`} className="text-cipher-cyan hover:underline">#{data.blockHeight.toLocaleString()}</Link>
                  <span className="text-muted">({data.confirmations.toLocaleString()} confirmation{data.confirmations !== 1 ? 's' : ''})</span>
                  {data.finality && <Badge color={data.finality === 'Finalized' ? 'green' : 'orange'}>{data.finality === 'Finalized' ? 'Finalized' : 'Pending'}</Badge>}
                </div>
              } />

              <InfoRow icon={Icons.Clock} label="Timestamp" value={formatTimestamp(data.timestamp)} tooltip="When this transaction was mined" />

              <InfoRow icon={Icons.Currency} label="Fee" tooltip="Fee paid to the miner" value={
                <span className="font-semibold text-primary">{data.fee.toFixed(8)} {CURRENCY}</span>
              } />

              <InfoRow icon={Icons.Database} label="Value" tooltip={
                (txType === 'ORCHARD' || txType === 'SHIELDED')
                  ? "Transaction amount is private and encrypted" : "Total amount transferred"
              } value={
                (txType === 'ORCHARD' || txType === 'SHIELDED') && (hasOrchard || hasSapling) ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <svg className="w-3.5 h-3.5 text-cipher-purple shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-cipher-purple/40 font-mono tracking-tight">████████</span>
                      <span className="text-[10px] text-cipher-purple/60 font-mono uppercase">encrypted</span>
                    </div>
                    <Link href={`/decrypt?prefill=${data.txid}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-cipher-purple/20 hover:border-cipher-purple/40 hover:bg-cipher-purple/10 text-cipher-purple text-xs font-medium rounded-md transition-colors w-fit">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                      Decrypt with viewing key
                    </Link>
                  </div>
                ) : txType === 'SHIELDING' ? (
                  <span className="font-semibold text-primary">{Math.abs(valueBalance).toFixed(8)} {CURRENCY}</span>
                ) : txType === 'UNSHIELDING' ? (
                  <span className="font-semibold text-primary">{data.totalOutput.toFixed(8)} {CURRENCY}</span>
                ) : (
                  <span className="font-semibold text-primary">{(data.totalOutput > 0 ? data.totalOutput : data.totalInput).toFixed(8)} {CURRENCY}</span>
                )
              } />

              <InfoRow icon={Icons.Database} label="Size" value={`${data.size.toLocaleString()} bytes (${(data.size / 1024).toFixed(2)} KB)`} tooltip="Transaction size in bytes" />
              <InfoRow icon={Icons.Code} label="Version" value={data.version} tooltip="Transaction version number" />
              <InfoRow icon={Icons.Clock} label="Lock Time" value={data.locktime} tooltip="Block height or timestamp at which this transaction is unlocked" />

              {data.hasShieldedData && (
                <>
                  <InfoRow icon={Icons.Shield} label="Sapling Spends" value={data.shieldedSpends} tooltip="Number of Sapling shielded inputs" valueClass="text-cipher-purple" />
                  <InfoRow icon={Icons.Shield} label="Sapling Outputs" value={data.shieldedOutputs} tooltip="Number of Sapling shielded outputs" valueClass="text-cipher-purple" />
                </>
              )}

              {(data.orchardActions || 0) > 0 && (
                <InfoRow icon={Icons.Shield} label="Orchard Actions" value={data.orchardActions} tooltip="Number of Orchard actions" valueClass="text-cipher-purple" />
              )}

              {data.valueBalanceSapling !== undefined && data.valueBalanceSapling !== 0 && (
                <InfoRow icon={Icons.Currency} label="Sapling Value Balance" value={`${data.valueBalanceSapling.toFixed(8)} ${CURRENCY}`} tooltip="Net value between transparent and Sapling pools" valueClass="text-cipher-purple" />
              )}

              {data.valueBalanceOrchard !== undefined && data.valueBalanceOrchard !== 0 && (
                <InfoRow icon={Icons.Currency} label="Orchard Value Balance" value={`${data.valueBalanceOrchard.toFixed(8)} ${CURRENCY}`} tooltip="Net value between transparent and Orchard pools" valueClass="text-cipher-purple" />
              )}

              {data.bindingSigSapling && (
                <div className="pt-3 border-t block-info-border mt-3">
                  <div className="flex items-center mb-2">
                    <span className="mr-2 text-cipher-purple"><Icons.Shield /></span>
                    <span className="text-sm text-secondary">Sapling Binding Signature</span>
                    <span className="ml-2"><Tooltip content="Cryptographic proof that the transaction is balanced" /></span>
                  </div>
                  <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border">
                    <code className="text-xs text-cipher-purple/60 break-all block">{data.bindingSigSapling}</code>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t block-info-border mt-3">
                <div className="flex items-center mb-2 text-secondary">
                  <span className="mr-2"><Icons.Hash /></span>
                  <span className="text-sm">Block Hash</span>
                  <span className="ml-2"><Tooltip content="Hash of the block containing this transaction" /></span>
                </div>
                <Link href={`/block/${data.blockHeight}`}>
                  <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border hover:border-cipher-cyan transition-colors max-w-full">
                    <code className="text-xs text-secondary hover:text-cipher-cyan break-all block">{data.blockHash}</code>
                  </div>
                </Link>
              </div>
            </CardBody>
          </Card>



        </div>
      )}

      {/* ================================================================
          INPUTS / OUTPUTS TAB
          ================================================================ */}
      {activeTab === 'io' && (
        <div>
          <div className="grid md:grid-cols-2 gap-4 md:gap-6">
            {/* Inputs */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted tracking-wider">&gt; INPUTS</span>
                  <Badge color="muted">{(() => {
                    let count = data.inputs.length + data.shieldedSpends;
                    if ((data.orchardActions || 0) > 0 && data.inputs.length === 0 && data.shieldedSpends === 0) {
                      count += data.orchardActions || 0;
                    }
                    return count;
                  })()}</Badge>
                </div>
                {data.totalInput > 0 && (
                  <span className="text-xs text-muted font-mono ml-auto">{data.totalInput.toFixed(4)} {CURRENCY}</span>
                )}
              </CardHeader>
              <CardBody>
                <div className="divide-y divide-cipher-border">
                  {data.inputs.map((input: any, index: number) => (
                    <div key={index} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2 overflow-hidden">
                      <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{index}</span>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        {input.coinbase ? (
                          <span className="text-xs text-muted font-mono">Block Reward</span>
                        ) : input.address ? (
                          <div className="flex items-center gap-1 min-w-0">
                            <Link href={`/address/${input.address}`} className="min-w-0 block overflow-hidden">
                              <code className="text-[11px] text-secondary hover:text-cipher-cyan transition-colors font-mono truncate block">{input.address}</code>
                            </Link>
                            <CopyButton text={input.address} label={`input-${index}`} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted font-mono italic">Unknown</span>
                        )}
                      </div>
                      {!input.coinbase && (
                        <span className="text-[11px] font-mono text-primary shrink-0 tabular-nums">{input.value?.toFixed(8)}</span>
                      )}
                    </div>
                  ))}

                  {/* Sapling shielded inputs */}
                  {data.shieldedSpends > 0 && Array.from({ length: data.shieldedSpends }).map((_, index) => (
                    <div key={`s-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                      <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{data.inputs.length + index}</span>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Badge color="purple" icon={<Icons.Shield />}>SAPLING</Badge>
                        <span className="text-[10px] text-cipher-purple/50 font-mono">encrypted</span>
                      </div>
                      <span className="text-[10px] text-cipher-purple/40 font-mono shrink-0">████████</span>
                    </div>
                  ))}

                  {/* Orchard inputs */}
                  {(data.orchardActions || 0) > 0 && data.inputs.length === 0 && data.shieldedSpends === 0 && (
                    Array.from({ length: data.orchardActions || 0 }).map((_, index) => (
                      <div key={`o-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                        <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{index}</span>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Badge color="purple" icon={<Icons.Shield />}>ORCHARD</Badge>
                          <span className="text-[10px] text-cipher-purple/50 font-mono">encrypted</span>
                        </div>
                        <span className="text-[10px] text-cipher-purple/40 font-mono shrink-0">████████</span>
                      </div>
                    ))
                  )}

                  {data.inputs.length === 0 && data.shieldedSpends === 0 && (data.orchardActions || 0) === 0 && (
                    <p className="text-xs text-muted font-mono py-2 text-center">No inputs</p>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Outputs */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted tracking-wider">&gt; OUTPUTS</span>
                  <Badge color="muted">{(() => {
                    let count = data.outputs.length;
                    if (valueBalance < 0) count += 1;
                    if (data.shieldedOutputs > 0 && valueBalance >= 0) count += data.shieldedOutputs;
                    if ((data.orchardActions || 0) > 0 && data.outputs.length === 0 && data.shieldedOutputs === 0 && valueBalance >= 0) count += data.orchardActions || 0;
                    return count;
                  })()}</Badge>
                </div>
                {data.totalOutput > 0 && (
                  <span className="text-xs text-muted font-mono ml-auto">{data.totalOutput.toFixed(4)} {CURRENCY}</span>
                )}
              </CardHeader>
              <CardBody>
                <div className="divide-y divide-cipher-border">
                  {data.outputs.map((output: any, index: number) => {
                    const outputAddr = output.scriptPubKey?.addresses?.[0];
                    const matchedBridge = outputAddr ? bridgeOutputAddresses.get(outputAddr) : undefined;
                    return (
                      <div key={index} className={`flex items-center py-2 first:pt-0 last:pb-0 gap-2 overflow-hidden ${matchedBridge ? 'bg-cipher-cyan/5 -mx-3 px-3 rounded' : ''}`}>
                        <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{index}</span>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          {outputAddr ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <Link href={`/address/${outputAddr}`} className="min-w-0 block overflow-hidden">
                                <code className="text-[11px] text-secondary hover:text-cipher-cyan transition-colors font-mono truncate block">{outputAddr}</code>
                              </Link>
                              <CopyButton text={outputAddr} label={`output-${index}`} />
                              {matchedBridge && (
                                <Badge color="cyan" icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}>
                                  SWAP
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted font-mono italic">No address</span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-primary shrink-0 tabular-nums">{output.value?.toFixed(8)}</span>
                      </div>
                    );
                  })}

                  {/* Shielded output with known value (shielding) */}
                  {valueBalance < 0 && (
                    <div className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                      <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{data.outputs.length}</span>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Badge color="purple" icon={<Icons.Shield />}>SHIELDED</Badge>
                        <span className="text-[11px] text-cipher-purple font-mono truncate">
                          {(data.valueBalanceOrchard || 0) < 0 ? 'Orchard' : 'Sapling'} Pool
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-cipher-purple font-semibold shrink-0">{Math.abs(valueBalance).toFixed(8)}</span>
                    </div>
                  )}

                  {/* Sapling shielded outputs - encrypted */}
                  {data.shieldedOutputs > 0 && valueBalance >= 0 && Array.from({ length: data.shieldedOutputs }).map((_, index) => (
                    <div key={`s-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                      <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{data.outputs.length + index}</span>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Badge color="purple" icon={<Icons.Shield />}>SAPLING</Badge>
                        <span className="text-[10px] text-cipher-purple/50 font-mono">encrypted</span>
                      </div>
                      <span className="text-[10px] text-cipher-purple/40 font-mono shrink-0">████████</span>
                    </div>
                  ))}

                  {/* Orchard outputs */}
                  {(data.orchardActions || 0) > 0 && data.outputs.length === 0 && data.shieldedOutputs === 0 && valueBalance >= 0 && (
                    Array.from({ length: data.orchardActions || 0 }).map((_, index) => (
                      <div key={`o-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                        <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">{index}</span>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Badge color="purple" icon={<Icons.Shield />}>ORCHARD</Badge>
                          <span className="text-[10px] text-cipher-purple/50 font-mono">encrypted</span>
                        </div>
                        <span className="text-[10px] text-cipher-purple/40 font-mono shrink-0">████████</span>
                      </div>
                    ))
                  )}

                  {data.outputs.length === 0 && data.shieldedOutputs === 0 && (data.orchardActions || 0) === 0 && valueBalance >= 0 && (
                    <p className="text-xs text-muted font-mono py-2 text-center">No outputs</p>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}



    </div>
  );
}
