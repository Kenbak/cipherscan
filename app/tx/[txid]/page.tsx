'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

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
  orchardActions?: number;
  valueBalance?: number;
  valueBalanceSapling?: number;
  valueBalanceOrchard?: number;
  bindingSig?: string;
  bindingSigSapling?: string;
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
  const txid = params.txid as string;
  const [data, setData] = useState<TransactionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [showOutputs, setShowOutputs] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

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
      className="ml-2 p-1 text-gray-500 hover:text-cipher-cyan transition-colors"
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

          const transformedData = {
            txid: txData.txid,
            blockHeight: txData.blockHeight,
            blockHash: txData.blockHash,
            timestamp: parseInt(txData.blockTime),
            confirmations: parseInt(txData.confirmations),
            inputs: transformedInputs,
            outputs: transformedOutputs,
            totalInput: transformedInputs.reduce((sum: number, i: any) => sum + (i.value || 0), 0),
            totalOutput: transformedOutputs.reduce((sum: number, o: any) => sum + (o.value || 0), 0),
            fee: 0, // Will be calculated below
            size: parseInt(txData.size),
            version: parseInt(txData.version),
            locktime: parseInt(txData.locktime),
            shieldedSpends: txData.shieldedSpends || 0,
            shieldedOutputs: txData.shieldedOutputs || 0,
            hasShieldedData: txData.hasSapling || txData.hasShielded || false,
            orchardActions: txData.orchardActions || 0,
            valueBalance: parseFloat(txData.valueBalance || 0),
            valueBalanceSapling: parseFloat(txData.valueBalanceSapling || 0),
            valueBalanceOrchard: parseFloat(txData.valueBalanceOrchard || 0),
            bindingSig: txData.bindingSig,
            bindingSigSapling: txData.bindingSigSapling,
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

    return `${relative} (${absolute})`;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
            <p className="text-gray-400 ml-4 font-mono text-lg">Loading transaction...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card text-center py-16">
          <div className="text-6xl mb-6">❌</div>
          <h2 className="text-3xl font-bold font-mono text-cipher-cyan mb-4">TX_NOT_FOUND</h2>
          <p className="text-gray-400 mb-8">This transaction doesn't exist or hasn't been confirmed yet.</p>
        </div>
      </div>
    );
  }

  const isCoinbase = data.inputs.length > 0 && data.inputs[0].coinbase;
  const hasOrchard = (data.orchardActions || 0) > 0;
  const hasSapling = data.hasShieldedData;
  const hasTransparent = data.inputs.length > 0 || data.outputs.some(o => o.scriptPubKey?.addresses);

  const txType =
    isCoinbase ? 'COINBASE' :
    hasOrchard && !hasTransparent ? 'ORCHARD' :
    (hasSapling || hasOrchard) && hasTransparent ? 'MIXED' :
    hasSapling ? 'SHIELDED' :
    'REGULAR';

  // Generate transaction summary
  const generateTxSummary = () => {
    if (isCoinbase) {
      const recipient = data.outputs[0]?.scriptPubKey?.addresses?.[0];
      if (recipient) {
        return (
          <>
            New coins minted via <span className="text-cipher-green font-semibold">block reward</span> to{' '}
            <Link href={`/address/${recipient}`} className="text-cipher-cyan hover:underline font-mono">
              {recipient.slice(0, 8)}...{recipient.slice(-6)}
            </Link>
          </>
        );
      }
      return 'New coins minted via block reward';
    }

    if (txType === 'ORCHARD') {
      return (
        <>
          <span className="text-purple-400 font-semibold">Fully shielded transaction</span> with{' '}
          {data.orchardActions} Orchard action{data.orchardActions !== 1 ? 's' : ''}. All amounts and addresses are private.
        </>
      );
    }

    if (txType === 'SHIELDED') {
      return (
        <>
          <span className="text-purple-400 font-semibold">Fully shielded transaction</span> with{' '}
          {data.shieldedSpends} shielded input{data.shieldedSpends !== 1 ? 's' : ''} →{' '}
          {data.shieldedOutputs} shielded output{data.shieldedOutputs !== 1 ? 's' : ''}
        </>
      );
    }

    if (txType === 'MIXED') {
      const transparentIns = data.inputs.length;
      const shieldedIns = data.shieldedSpends;
      const transparentOuts = data.outputs.length;
      const shieldedOuts = data.shieldedOutputs;

      return (
        <>
          <span className="text-yellow-400 font-semibold">Mixed transaction</span>:{' '}
          {transparentIns > 0 && `${transparentIns} transparent`}
          {transparentIns > 0 && shieldedIns > 0 && ' + '}
          {shieldedIns > 0 && `${shieldedIns} shielded`}
          {' input'}
          {(transparentIns + shieldedIns) !== 1 ? 's' : ''} →{' '}
          {transparentOuts > 0 && `${transparentOuts} transparent`}
          {transparentOuts > 0 && shieldedOuts > 0 && ' + '}
          {shieldedOuts > 0 && `${shieldedOuts} shielded`}
          {' output'}
          {(transparentOuts + shieldedOuts) !== 1 ? 's' : ''}
        </>
      );
    }

    // Regular transparent transaction
    const fromAddr = data.inputs[0]?.address;
    const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];

    if (fromAddr && toAddr) {
      // Separate change outputs from real recipients
      const changeOutputs = data.outputs.filter(
        out => out.scriptPubKey?.addresses?.[0] === fromAddr
      );
      const recipientOutputs = data.outputs.filter(
        out => out.scriptPubKey?.addresses?.[0] !== fromAddr
      );

      // Find the largest recipient output (primary destination)
      const primaryOutput = recipientOutputs.length > 0
        ? recipientOutputs.sort((a, b) => (b.value || 0) - (a.value || 0))[0]
        : data.outputs[0];

      const primaryAddr = primaryOutput?.scriptPubKey?.addresses?.[0];
      const primaryAmount = primaryOutput?.value || 0;

      // Count other recipients (excluding primary and change)
      const otherRecipients = recipientOutputs.length - 1;

      return (
        <>
          <Link href={`/address/${fromAddr}`} className="text-cipher-cyan hover:underline font-mono">
            {fromAddr.slice(0, 8)}...{fromAddr.slice(-6)}
          </Link>
          {' sent '}
          <span className="text-white font-semibold">{primaryAmount.toFixed(4)} {CURRENCY}</span>
          {' to '}
          <Link href={`/address/${primaryAddr || toAddr}`} className="text-cipher-cyan hover:underline font-mono">
            {(primaryAddr || toAddr).slice(0, 8)}...{(primaryAddr || toAddr).slice(-6)}
          </Link>
          {otherRecipients > 0 && (
            <span className="text-gray-500">
              {' '}+ {otherRecipients} other recipient{otherRecipients > 1 ? 's' : ''}
            </span>
          )}
          {changeOutputs.length > 0 && (
            <span className="text-gray-600 text-xs">
              {' '}({changeOutputs.length} change output{changeOutputs.length > 1 ? 's' : ''})
            </span>
          )}
        </>
      );
    }

    return `Transaction with ${data.inputs.length} input${data.inputs.length !== 1 ? 's' : ''} and ${data.outputs.length} output${data.outputs.length !== 1 ? 's' : ''}`;
  };

  // InfoRow component (same pattern as block page)
  const InfoRow = ({
    icon: Icon,
    label,
    value,
    tooltip,
    valueClass,
  }: {
    icon: React.ComponentType;
    label: string;
    value: React.ReactNode;
    tooltip?: string;
    valueClass?: string;
  }) => (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b border-gray-800 last:border-0 gap-2 sm:gap-0">
      <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-gray-400">
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Transaction Details</h1>
          {/* Type Badge */}
          {txType === 'COINBASE' && (
            <span className="px-2 md:px-3 py-1 bg-cipher-green/10 text-cipher-green text-xs md:text-sm rounded font-mono flex items-center gap-1 md:gap-2">
              <Icons.Currency />
              COINBASE
            </span>
          )}
          {(txType === 'ORCHARD' || txType === 'SHIELDED') && (
            <span className="px-2 md:px-3 py-1 bg-purple-500/10 text-purple-400 text-xs md:text-sm rounded font-mono flex items-center gap-1 md:gap-2">
              <Icons.Shield />
              SHIELDED
            </span>
          )}
          {txType === 'MIXED' && (
            <span className="px-2 md:px-3 py-1 bg-yellow-500/10 text-yellow-400 text-xs md:text-sm rounded font-mono flex items-center gap-1 md:gap-2">
              <Icons.Shield />
              MIXED
            </span>
          )}
        </div>

        {/* Transaction Summary */}
        <div className="bg-cipher-bg/30 border border-cipher-border/50 rounded-lg p-3 md:p-4 mt-4">
          <div className="flex items-start gap-2 md:gap-3">
            <svg className="w-4 h-4 md:w-5 md:h-5 text-cipher-cyan flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
              {generateTxSummary()}
            </p>
          </div>
        </div>

        {/* Decrypt This Transaction - Only for shielded TXs */}
        {(hasOrchard || hasSapling) && (
          <div className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-lg p-3 md:p-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2 md:gap-3">
                <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <div>
                  <p className="text-purple-300 text-sm font-semibold mb-1">
                    Is this your transaction?
                  </p>
                  <p className="text-gray-400 text-xs">
                    Use your viewing key to decrypt shielded amounts and memos client-side
                  </p>
                </div>
              </div>
              <Link
                href={`/decrypt?prefill=${data.txid}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                Decrypt This TX
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Main Transaction Info Card */}
      <div className="card mb-8">
        <div className="space-y-0">
          {/* Transaction Hash */}
          <div className="pb-3 border-b border-gray-800">
            <div className="flex items-center mb-2">
              <span className="mr-2">
                <Icons.Hash />
              </span>
              <span className="text-sm text-gray-400">Transaction Hash</span>
              <span className="ml-2">
                <Tooltip content="Unique identifier for this transaction" />
              </span>
            </div>
            <div className="bg-cipher-bg px-3 py-2 rounded border border-cipher-border w-fit flex items-center">
              <code className="text-xs text-cipher-cyan break-all block">{data.txid}</code>
              <CopyButton text={data.txid} label="txhash" />
            </div>
          </div>

          {/* Status */}
          <InfoRow
            icon={Icons.CheckCircle}
            label="Status"
            value={
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-cipher-green/10 text-cipher-green rounded text-xs font-semibold">
                <Icons.Check />
                Success
              </span>
            }
            tooltip="Transaction has been confirmed and included in the blockchain"
          />

          {/* Block */}
          <InfoRow
            icon={Icons.Cube}
            label="Block"
            value={
              <div className="flex items-center gap-2">
                <Link href={`/block/${data.blockHeight}`} className="text-cipher-cyan hover:underline">
                  #{data.blockHeight.toLocaleString()}
                </Link>
                <span className="text-gray-600">
                  ({data.confirmations.toLocaleString()} confirmation{data.confirmations !== 1 ? 's' : ''})
                </span>
              </div>
            }
            tooltip="The block that includes this transaction"
          />

          {/* Timestamp */}
          <InfoRow
            icon={Icons.Clock}
            label="Timestamp"
            value={formatTimestamp(data.timestamp)}
            tooltip="When this transaction was mined"
          />

          {/* Transaction Fee */}
          <InfoRow
            icon={Icons.Currency}
            label="Transaction Fee"
            value={
              data.fee > 0 ? (
                <span className="font-semibold">
                  {data.fee.toFixed(8)} {CURRENCY}
                </span>
              ) : (txType === 'ORCHARD' || txType === 'SHIELDED') ? (
                <span className="font-semibold text-gray-500 flex items-center gap-2">
                  0.00000000 {CURRENCY}
                </span>
              ) : (
                <span className="font-semibold">
                  {data.fee.toFixed(8)} {CURRENCY}
                </span>
              )
            }
            tooltip={(txType === 'ORCHARD' || txType === 'SHIELDED') && data.fee > 0
              ? "Fee paid from shielded pool (always public in Zcash)"
              : "Fee paid to the miner for processing this transaction"
            }
          />

          {/* Value */}
          <InfoRow
            icon={Icons.Database}
            label="Value"
            value={
              (txType === 'ORCHARD' || txType === 'SHIELDED') ? (
                <span className="font-semibold text-purple-400 flex items-center gap-2">
                  <Icons.Shield />
                  (amount hidden)
                </span>
              ) : (
                <span className="font-semibold text-white">
                  {data.totalOutput.toFixed(8)} {CURRENCY}
                </span>
              )
            }
            tooltip={(txType === 'ORCHARD' || txType === 'SHIELDED')
              ? "Transaction amount is private and encrypted using zero-knowledge proofs"
              : "Total amount transferred in this transaction"
            }
          />
        </div>

        {/* More Details Toggle */}
        <button
          onClick={() => setShowMoreDetails(!showMoreDetails)}
          className="mt-6 text-sm text-cipher-cyan hover:text-cipher-green transition-colors flex items-center font-mono"
        >
          <svg
            className={`w-4 h-4 mr-1 transition-transform ${showMoreDetails ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showMoreDetails ? 'Hide' : 'Show'} More Details
        </button>

        {/* Additional Details (Collapsible) */}
        {showMoreDetails && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-0">
            <InfoRow
              icon={Icons.Database}
              label="Size"
              value={`${data.size.toLocaleString()} bytes (${(data.size / 1024).toFixed(2)} KB)`}
              tooltip="The size of this transaction in bytes"
            />

            <InfoRow
              icon={Icons.Code}
              label="Version"
              value={data.version}
              tooltip="Transaction version number"
            />

            <InfoRow
              icon={Icons.Clock}
              label="Lock Time"
              value={data.locktime}
              tooltip="Block height or timestamp at which this transaction is unlocked"
            />

            {data.hasShieldedData && (
              <>
                <InfoRow
                  icon={Icons.Shield}
                  label="Sapling Spends"
                  value={data.shieldedSpends}
                  tooltip="Number of Sapling shielded inputs (vShieldedSpend) in this transaction. These are private inputs using zero-knowledge proofs."
                  valueClass="text-purple-400"
                />
                <InfoRow
                  icon={Icons.Shield}
                  label="Sapling Outputs"
                  value={data.shieldedOutputs}
                  tooltip="Number of Sapling shielded outputs (vShieldedOutput) in this transaction. These are private outputs using zero-knowledge proofs."
                  valueClass="text-purple-400"
                />
              </>
            )}

            {data.orchardActions !== undefined && data.orchardActions > 0 && (
              <InfoRow
                icon={Icons.Shield}
                label="Orchard Actions"
                value={data.orchardActions}
                tooltip="Number of Orchard actions in this transaction. Orchard is the newest shielded pool with improved performance and privacy."
                valueClass="text-purple-400"
              />
            )}

            {data.valueBalanceSapling !== undefined && data.valueBalanceSapling !== 0 && (
              <InfoRow
                icon={Icons.Currency}
                label="Sapling Value Balance"
                value={`${data.valueBalanceSapling.toFixed(8)} ${CURRENCY}`}
                tooltip="Net value transferred between transparent and Sapling shielded pools. Positive = shielding, Negative = deshielding."
                valueClass="text-purple-400"
              />
            )}

            {data.valueBalanceOrchard !== undefined && data.valueBalanceOrchard !== 0 && (
              <InfoRow
                icon={Icons.Currency}
                label="Orchard Value Balance"
                value={`${data.valueBalanceOrchard.toFixed(8)} ${CURRENCY}`}
                tooltip="Net value transferred between transparent and Orchard shielded pools. Positive = shielding, Negative = deshielding."
                valueClass="text-purple-400"
              />
            )}

            {data.bindingSigSapling && (
              <div className="pt-3 border-t border-gray-800 mt-3">
                <div className="flex items-center mb-2">
                  <span className="mr-2 text-purple-400">
                    <Icons.Shield />
                  </span>
                  <span className="text-sm text-gray-400">Sapling Binding Signature</span>
                  <span className="ml-2">
                    <Tooltip content="Cryptographic proof that the transaction is balanced and all shielded values are valid. This signature binds all Sapling components together." />
                  </span>
                </div>
                <div className="bg-cipher-bg px-3 py-2 rounded border border-cipher-border">
                  <code className="text-xs text-purple-400/60 break-all block">{data.bindingSigSapling}</code>
                </div>
              </div>
            )}

            {/* Block Hash */}
            <div className="pt-3 border-t border-gray-800 mt-3">
              <div className="flex items-center mb-2">
                <span className="mr-2">
                  <Icons.Hash />
                </span>
                <span className="text-sm text-gray-400">Block Hash</span>
                <span className="ml-2">
                  <Tooltip content="Hash of the block containing this transaction" />
                </span>
              </div>
              <Link href={`/block/${data.blockHeight}`}>
                <div className="bg-cipher-bg px-3 py-2 rounded border border-cipher-border w-fit hover:border-cipher-cyan transition-colors">
                  <code className="text-xs text-gray-400 hover:text-cipher-cyan break-all block">{data.blockHash}</code>
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Inputs/Outputs Cards */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
        {/* Inputs Card */}
        <div className="card py-3 md:py-4">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <Icons.ArrowLeft />
              Inputs ({data.inputs.length + data.shieldedSpends + (data.orchardActions || 0)})
            </h3>
            {data.inputs.length > 0 && (
              <button
                onClick={() => setShowInputs(!showInputs)}
                className="text-xs md:text-sm text-cipher-cyan hover:text-cipher-green transition-colors font-mono"
              >
                {showInputs ? 'Hide' : 'Show'}
              </button>
            )}
          </div>
          {((data.shieldedSpends > 0 || (data.orchardActions || 0) > 0) && data.totalInput === 0) ? (
            <>
              <div className="text-base md:text-lg font-semibold font-mono text-purple-400 mb-1 flex items-center gap-2">
                <Icons.Shield />
                (amount hidden)
              </div>
              <div className="text-xs text-gray-500">
                {(data.orchardActions || 0) > 0
                  ? `Orchard action${data.orchardActions !== 1 ? 's' : ''}`
                  : `Shielded input${data.shieldedSpends > 1 ? 's' : ''}`
                }
              </div>
            </>
          ) : (
            <>
              <div className="text-xl md:text-2xl font-bold font-mono text-white mb-1">{data.totalInput.toFixed(8)}</div>
              <div className="text-xs md:text-sm text-gray-500 font-mono">{CURRENCY}</div>
              {data.shieldedSpends > 0 && (
                <div className="text-xs text-purple-400 mt-1">+ {data.shieldedSpends} shielded input{data.shieldedSpends > 1 ? 's' : ''} (hidden)</div>
              )}
            </>
          )}
        </div>

        {/* Outputs Card */}
        <div className="card py-3 md:py-4">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <Icons.ArrowRight />
              Outputs ({data.outputs.length + data.shieldedOutputs + (data.orchardActions || 0)})
            </h3>
            {data.outputs.length > 0 && (
              <button
                onClick={() => setShowOutputs(!showOutputs)}
                className="text-xs md:text-sm text-cipher-cyan hover:text-cipher-green transition-colors font-mono"
              >
                {showOutputs ? 'Hide' : 'Show'}
              </button>
            )}
          </div>
          {((data.shieldedOutputs > 0 || (data.orchardActions || 0) > 0) && data.totalOutput === 0) ? (
            <>
              <div className="text-base md:text-lg font-semibold font-mono text-purple-400 mb-1 flex items-center gap-2">
                <Icons.Shield />
                (amount hidden)
              </div>
              <div className="text-xs text-gray-500">
                {(data.orchardActions || 0) > 0
                  ? `Orchard action${data.orchardActions !== 1 ? 's' : ''}`
                  : `Shielded output${data.shieldedOutputs > 1 ? 's' : ''}`
                }
              </div>
            </>
          ) : (
            <>
              <div className="text-xl md:text-2xl font-bold font-mono text-white mb-1">{data.totalOutput.toFixed(8)}</div>
              <div className="text-xs md:text-sm text-gray-500 font-mono">{CURRENCY}</div>
              {data.shieldedOutputs > 0 && (
                <div className="text-xs text-purple-400 mt-1">+ {data.shieldedOutputs} shielded output{data.shieldedOutputs > 1 ? 's' : ''} (hidden)</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detailed Inputs */}
      {showInputs && (
        <div className="card mb-6 md:mb-8">
          <h3 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
            <Icons.ArrowLeft />
            Input Details
            <Tooltip content="Sources of funds for this transaction. Each input references a previous transaction output." />
          </h3>

          {/* Privacy Notice for Shielded */}
          {data.shieldedSpends > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 md:p-4 mb-3 md:mb-4 flex items-start gap-2 md:gap-3">
              <Icons.Shield />
              <div>
                <p className="text-xs md:text-sm text-purple-300 font-semibold mb-1">
                  Privacy Protection Active
                </p>
                <p className="text-xs text-gray-400">
                  This transaction includes {data.shieldedSpends} shielded input{data.shieldedSpends > 1 ? 's' : ''}.
                  Addresses and amounts are encrypted using zero-knowledge proofs.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 md:space-y-3">
            {data.inputs.map((input, index) => (
              <div
                key={index}
                className="bg-cipher-bg/50 p-3 md:p-4 rounded-lg border border-cipher-border hover:border-cipher-cyan/50 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 md:mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono">INPUT #{index}</span>
                    {input.coinbase ? (
                      <span className="px-1.5 md:px-2 py-0.5 bg-cipher-green/10 text-cipher-green text-[10px] md:text-xs rounded font-mono">
                        COINBASE
                      </span>
                    ) : (
                      <span className="px-1.5 md:px-2 py-0.5 bg-cipher-cyan/10 text-cipher-cyan text-[10px] md:text-xs rounded font-mono">
                        TRANSPARENT
                      </span>
                    )}
                  </div>
                  {!input.coinbase && (
                    <span className="text-xs md:text-sm font-mono text-white font-semibold">
                      {input.value?.toFixed(8)} {CURRENCY}
                    </span>
                  )}
                </div>
                {input.address ? (
                  <div>
                    <label className="text-xs font-mono text-gray-500 uppercase tracking-wider block mb-1">
                      From
                    </label>
                    <div className="flex items-center">
                      <Link href={`/address/${input.address}`}>
                        <code className="text-xs text-gray-400 hover:text-cipher-cyan break-all block transition-colors">
                          {input.address}
                        </code>
                      </Link>
                      <CopyButton text={input.address} label={`input-${index}`} />
                    </div>
                  </div>
                ) : input.coinbase ? (
                  <div className="flex items-center gap-2">
                    <Icons.Currency />
                    <span className="text-xs text-gray-400 font-mono">Block Reward (newly minted coins)</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 font-mono italic">Shielded Input</span>
                )}
              </div>
            ))}

            {/* Shielded Inputs - More visual */}
            {data.shieldedSpends > 0 &&
              Array.from({ length: data.shieldedSpends }).map((_, index) => (
                <div
                  key={`shielded-${index}`}
                  className="relative bg-gradient-to-r from-purple-500/5 to-purple-600/5 p-4 rounded-lg border border-purple-500/20 overflow-hidden group hover:border-purple-500/40 transition-all"
                >
                  {/* Decorative pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="absolute inset-0" style={{
                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(139, 92, 246, 0.1) 10px, rgba(139, 92, 246, 0.1) 20px)`
                    }}></div>
                  </div>

                  <div className="relative">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">INPUT #{data.inputs.length + index}</span>
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded font-mono flex items-center gap-1">
                          <Icons.Shield />
                          SHIELDED
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-purple-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-mono">Encrypted</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">Address:</span>
                        <span className="text-purple-400/60 font-mono">████████████████████████████████████</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">Amount:</span>
                        <span className="text-purple-400/60 font-mono">█████████</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-purple-500/10">
                      <p className="text-xs text-gray-500 font-mono italic flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        Only visible with viewing key
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Detailed Outputs */}
      {showOutputs && (
        <div className="card">
          <h3 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
            <Icons.ArrowRight />
            Output Details
            <Tooltip content="Destinations where funds are sent. Each output creates new spendable coins at specified addresses." />
          </h3>

          {/* Privacy Notice for Shielded */}
          {data.shieldedOutputs > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 md:p-4 mb-3 md:mb-4 flex items-start gap-2 md:gap-3">
              <Icons.Shield />
              <div>
                <p className="text-xs md:text-sm text-purple-300 font-semibold mb-1">
                  Privacy Protection Active
                </p>
                <p className="text-xs text-gray-400">
                  This transaction includes {data.shieldedOutputs} shielded output{data.shieldedOutputs > 1 ? 's' : ''}.
                  Addresses and amounts are encrypted using zero-knowledge proofs.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 md:space-y-3">
            {data.outputs.map((output, index) => (
              <div
                key={index}
                className="bg-cipher-bg/50 p-3 md:p-4 rounded-lg border border-cipher-border hover:border-cipher-cyan/50 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 md:mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono">OUTPUT #{index}</span>
                    <span className="px-1.5 md:px-2 py-0.5 bg-cipher-cyan/10 text-cipher-cyan text-[10px] md:text-xs rounded font-mono">
                      TRANSPARENT
                    </span>
                  </div>
                  <span className="text-xs md:text-sm font-mono text-white font-semibold">
                    {output.value?.toFixed(8)} {CURRENCY}
                  </span>
                </div>
                {output.scriptPubKey?.addresses?.[0] ? (
                  <div>
                    <label className="text-xs font-mono text-gray-500 uppercase tracking-wider block mb-1">
                      To
                    </label>
                    <div className="flex items-center">
                      <Link href={`/address/${output.scriptPubKey.addresses[0]}`}>
                        <code className="text-xs text-gray-400 hover:text-cipher-cyan break-all block transition-colors">
                          {output.scriptPubKey.addresses[0]}
                        </code>
                      </Link>
                      <CopyButton text={output.scriptPubKey.addresses[0]} label={`output-${index}`} />
                    </div>
                  </div>
                ) : (
                  <code className="text-xs text-gray-600 break-all block">
                    {output.scriptPubKey?.hex || 'No address'}
                  </code>
                )}
              </div>
            ))}

            {/* Shielded Outputs - More visual */}
            {data.shieldedOutputs > 0 &&
              Array.from({ length: data.shieldedOutputs }).map((_, index) => (
                <div
                  key={`shielded-${index}`}
                  className="relative bg-gradient-to-r from-purple-500/5 to-purple-600/5 p-4 rounded-lg border border-purple-500/20 overflow-hidden group hover:border-purple-500/40 transition-all"
                >
                  {/* Decorative pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="absolute inset-0" style={{
                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(139, 92, 246, 0.1) 10px, rgba(139, 92, 246, 0.1) 20px)`
                    }}></div>
                  </div>

                  <div className="relative">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">OUTPUT #{data.outputs.length + index}</span>
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded font-mono flex items-center gap-1">
                          <Icons.Shield />
                          SHIELDED
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-purple-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-mono">Encrypted</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">To:</span>
                        <span className="text-purple-400 font-mono flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          Shielded Output
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">Amount:</span>
                        <span className="text-purple-400/60 font-mono italic">(amount hidden)</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-purple-500/10">
                      <p className="text-xs text-gray-500 font-mono italic flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        Only visible with viewing key
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
