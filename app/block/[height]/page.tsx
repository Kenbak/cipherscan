'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

interface BlockData {
  height: number;
  hash: string;
  timestamp: number;
  transactions: any[];
  transactionCount: number;
  size: number;
  difficulty: number;
  confirmations: number;
  previousBlockHash?: string;
  nextBlockHash?: string;
  version?: number;
  merkleRoot?: string;
  finalSaplingRoot?: string;
  bits?: string;
  nonce?: string;
  solution?: string;
  totalFees?: number;
  minerAddress?: string;
}

// Heroicons SVG Components
const Icons = {
  Hash: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Document: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  ),
  Cube: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Code: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  Key: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  Currency: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  User: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

export default function BlockPage() {
  const params = useParams();
  const height = params.height as string;
  const [data, setData] = useState<BlockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const txSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // For testnet, call Express API directly; for mainnet, use Next.js API
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/block/${height}`
          : `/api/block/${height}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error('Block not found');
        }

        const blockData = await response.json();

        // Transform data if coming from Express API
        if (usePostgresApiClient()) {
          // Express API returns snake_case and values in satoshis, convert to camelCase and ZEC
          const transformedTransactions = (blockData.transactions || []).map((tx: any) => {
            // Check if it's a shielded transaction (has sapling/orchard activity)
            const hasShieldedActivity = tx.has_sapling || tx.has_orchard ||
              (tx.shielded_spends > 0) || (tx.shielded_outputs > 0) || (tx.orchard_actions > 0);

            // Coinbase = no transparent inputs AND no shielded activity
            const isCoinbase = !hasShieldedActivity &&
              ((tx.inputs || []).length === 0 || (tx.inputs || []).every((input: any) => !input.prev_txid));

            // Transform inputs
            const transformedInputs = isCoinbase
              ? [{ coinbase: true }]
              : (tx.inputs || []).map((input: any) => ({
                  ...input,
                  value: input.value ? parseFloat(input.value) / 100000000 : 0, // satoshis to ZEC
                  txid: input.prev_txid,
                  vout: input.prev_vout,
                }));

            // Transform outputs
            const transformedOutputs = (tx.outputs || []).map((output: any) => ({
              value: output.value ? parseFloat(output.value) / 100000000 : 0, // satoshis to ZEC
              n: output.vout_index,
              spent: output.spent || false,
              scriptPubKey: {
                hex: output.script_pubkey || '',
                addresses: output.address ? [output.address] : [],
              },
            }));

            return {
              ...tx,
              inputs: transformedInputs,
              outputs: transformedOutputs,
              vin: transformedInputs,
              vout: transformedOutputs,
              // Pass shielded info for type detection
              hasShieldedActivity,
              vShieldedSpend: tx.shielded_spends > 0 ? Array(tx.shielded_spends).fill({}) : [],
              vShieldedOutput: tx.shielded_outputs > 0 ? Array(tx.shielded_outputs).fill({}) : [],
              orchard: tx.orchard_actions > 0 ? { actions: Array(tx.orchard_actions).fill({}) } : null,
            };
          });

          // Calculate total fees for all transactions in the block
          // Formula: fee = transparentInputs - transparentOutputs + valueBalance
          // This works for all tx types (shielding, deshielding, transparent, z-to-z)
          const calculatedFees = (blockData.transactions || []).reduce((sum: number, tx: any) => {
            // Skip coinbase transactions (they don't pay fees)
            const isCoinbaseTx = tx.tx_index === 0;
            if (isCoinbaseTx) return sum;

            // Calculate transparent inputs sum
            const transparentInputs = (tx.inputs || []).reduce((inputSum: number, input: any) => {
              return inputSum + parseInt(input.value || 0);
            }, 0);

            // Calculate transparent outputs sum
            const transparentOutputs = (tx.outputs || []).reduce((outputSum: number, output: any) => {
              return outputSum + parseInt(output.value || 0);
            }, 0);

            // Get shielded value balance (positive = leaving shielded pool, negative = entering)
            const valueBalance = parseInt(tx.value_balance_sapling || 0) + parseInt(tx.value_balance_orchard || 0);

            // Fee = what comes in (inputs + shielded leaving) - what goes out (outputs)
            const txFee = transparentInputs - transparentOutputs + valueBalance;
            return sum + (txFee > 0 ? txFee : 0);
          }, 0);

          const totalFeesZatoshi = calculatedFees;

          const transformedData = {
            height: parseInt(blockData.height),
            hash: blockData.hash,
            timestamp: parseInt(blockData.timestamp),
            transactions: transformedTransactions,
            transactionCount: blockData.transactionCount || transformedTransactions.length,
            size: parseInt(blockData.size),
            difficulty: parseFloat(blockData.difficulty),
            confirmations: parseInt(blockData.confirmations),
            previousBlockHash: blockData.previous_block_hash || blockData.previousBlockHash,
            nextBlockHash: blockData.next_block_hash || blockData.nextBlockHash,
            version: parseInt(blockData.version),
            merkleRoot: blockData.merkle_root || blockData.merkleRoot,
            finalSaplingRoot: blockData.final_sapling_root || blockData.finalSaplingRoot,
            bits: blockData.bits,
            nonce: blockData.nonce,
            solution: blockData.solution,
            totalFees: totalFeesZatoshi / 100000000, // zatoshis to ZEC
            minerAddress: blockData.miner_address || blockData.minerAddress,
          };
          setData(transformedData);
        } else {
          setData(blockData);
        }
      } catch (error) {
        console.error('Error fetching block:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [height]);

  const scrollToTransactions = () => {
    txSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
            <p className="text-secondary ml-4 font-mono text-lg">Loading block...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card text-center py-16">
          <div className="text-6xl mb-6">❌</div>
          <h2 className="text-3xl font-bold font-mono text-cipher-cyan mb-4">BLOCK_NOT_FOUND</h2>
          <p className="text-secondary">This block doesn't exist or hasn't been mined yet.</p>
        </div>
      </div>
    );
  }

  const InfoRow = ({ icon: Icon, label, value, tooltip, valueClass = "text-primary", clickable = false, onClick }: {
    icon: React.ComponentType;
    label: string;
    value: React.ReactNode;
    tooltip?: string;
    valueClass?: string;
    clickable?: boolean;
    onClick?: () => void;
  }) => (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b block-info-border last:border-0 gap-2 sm:gap-0">
      <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-secondary">
        <span className="mr-2"><Icon /></span>
        <span className="text-xs sm:text-sm">{label}</span>
        {tooltip && (
          <span className="ml-2">
            <Tooltip content={tooltip} />
          </span>
        )}
      </div>
      <div
        className={`flex-1 font-mono text-xs sm:text-sm ${valueClass} break-all ${clickable ? 'cursor-pointer hover:text-cipher-cyan transition-colors' : ''}`}
        onClick={onClick}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 animate-fade-in">
      {/* Header with Inline Navigation */}
      <div className="mb-6">
        <div className="flex items-center space-x-2 mb-2 text-secondary">
          <Icons.Cube />
          <h1 className="text-base md:text-lg font-semibold">Block</h1>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href={`/block/${data.height - 1}`}
            className={`p-1.5 rounded transition-colors ${
              data.previousBlockHash
                ? 'text-cipher-cyan hover:bg-cipher-cyan/10'
                : 'text-muted cursor-not-allowed'
            }`}
            title="Previous Block"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <span className="text-2xl md:text-3xl font-bold font-mono text-primary">
            #{data.height.toLocaleString()}
          </span>

          <Link
            href={`/block/${data.height + 1}`}
            className={`p-1.5 rounded transition-colors ${
              data.nextBlockHash
                ? 'text-cipher-cyan hover:bg-cipher-cyan/10'
                : 'text-muted cursor-not-allowed'
            }`}
            title="Next Block"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Main Block Info */}
      <div className="card mb-6">
        <div className="space-y-0">
          <InfoRow
            icon={Icons.Clock}
            label="Timestamp"
            value={
              <span>
                {formatRelativeTime(data.timestamp)}
                <span className="text-muted ml-2">({formatDate(data.timestamp)})</span>
              </span>
            }
            tooltip="The date and time this block was mined"
          />

          <InfoRow
            icon={Icons.Document}
            label="Transactions"
            value={
              <span
                className="text-cipher-cyan font-semibold cursor-pointer hover:underline"
                onClick={scrollToTransactions}
                title="Click to view all transactions"
              >
                {data.transactionCount} transaction{data.transactionCount !== 1 ? 's' : ''} in this block
              </span>
            }
            tooltip="Total number of transactions included in this block"
            clickable
            onClick={scrollToTransactions}
          />

          <InfoRow
            icon={Icons.Check}
            label="Confirmations"
            value={
              <span className={data.confirmations > 6 ? 'text-cipher-green font-semibold' : 'text-cipher-orange'}>
                {data.confirmations.toLocaleString()}
              </span>
            }
            tooltip="Number of blocks mined after this one (6+ confirmations = secure)"
          />

          <InfoRow
            icon={Icons.Database}
            label="Block Size"
            value={`${(data.size / 1024).toFixed(2)} KB`}
            tooltip="The size of this block in kilobytes"
          />

          {/* Fee Recipient (Miner) */}
          {data.minerAddress && (
            <InfoRow
              icon={Icons.User}
              label="Fee Recipient"
              value={
                <Link href={`/address/${data.minerAddress}`} className="text-cipher-cyan hover:underline">
                  {data.minerAddress}
                </Link>
              }
              tooltip="The address that received the block reward and transaction fees"
            />
          )}

          {/* Transaction Fees */}
          {data.totalFees !== undefined && (
            <InfoRow
              icon={Icons.Currency}
              label="Transaction Fees"
              value={
                <span className="font-semibold">
                  {data.totalFees.toFixed(8)} {CURRENCY}
                </span>
              }
              tooltip="Total fees paid by all transactions in this block"
            />
          )}

          {/* Block Hash - Full Width */}
          <div className="pt-4 border-t block-info-border mt-4">
            <div className="flex items-center mb-2 text-secondary">
              <span className="mr-2"><Icons.Hash /></span>
              <span className="text-sm">Block Hash</span>
              <span className="ml-2">
                <Tooltip content="Unique cryptographic identifier for this block" />
              </span>
            </div>
            <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
              <code className="text-xs text-cipher-cyan break-all">{data.hash}</code>
            </div>
          </div>
        </div>

        {/* More Details Toggle */}
        <button
          onClick={() => setShowMoreDetails(!showMoreDetails)}
          className="mt-6 text-sm text-cipher-cyan hover:text-cipher-green transition-colors flex items-center font-mono"
        >
          <svg className={`w-4 h-4 mr-1 transition-transform ${showMoreDetails ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showMoreDetails ? 'Hide' : 'Show'} More Details
        </button>

        {/* Additional Details (Collapsible) */}
        {showMoreDetails && (
          <div className="mt-4 pt-4 border-t block-info-border space-y-0">
            <InfoRow
              icon={Icons.Code}
              label="Difficulty"
              value={data.difficulty.toFixed(8)}
              tooltip="Mining difficulty at the time this block was mined"
            />

            {data.version && (
              <InfoRow
                icon={Icons.Cube}
                label="Version"
                value={data.version}
                tooltip="Block version number"
              />
            )}

            {data.bits && (
              <InfoRow
                icon={Icons.Key}
                label="Bits"
                value={data.bits}
                tooltip="Compact representation of the difficulty target"
              />
            )}

            {data.nonce && (
              <InfoRow
                icon={Icons.Hash}
                label="Nonce"
                value={data.nonce}
                tooltip="Random value used in mining to find a valid block hash"
              />
            )}

            {data.merkleRoot && (
              <div className="pt-3">
                <div className="flex items-center mb-2 text-secondary">
                  <span className="mr-2"><Icons.Key /></span>
                  <span className="text-sm">Merkle Root</span>
                  <span className="ml-2">
                    <Tooltip content="Cryptographic hash that proves all transparent transactions in this block are valid and unmodified. Calculated from the transaction tree." />
                  </span>
                </div>
                <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
                  <code className="text-xs text-muted break-all">{data.merkleRoot}</code>
                </div>
              </div>
            )}

            {data.finalSaplingRoot && (
              <div className="pt-3">
                <div className="flex items-center mb-2">
                  <span className="mr-2 text-purple-400"><Icons.Shield /></span>
                  <span className="text-sm text-secondary">Final Sapling Root</span>
                  <span className="ml-2">
                    <Tooltip content="Root hash of the Sapling note commitment tree after processing this block. This proves the existence of all shielded (private) transactions without revealing their details." />
                  </span>
                </div>
                <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
                  <code className="text-xs text-purple-400/60 break-all">{data.finalSaplingRoot}</code>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transactions Section */}
      <div className="card" ref={txSectionRef}>
        <h2 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-4 pb-3 border-b block-info-border flex items-center">
          Transactions
          <span className="ml-2 px-2 py-0.5 bg-cipher-cyan/10 text-cipher-cyan text-xs rounded font-normal">
            {data.transactionCount}
          </span>
        </h2>

        {!data.transactions || data.transactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-secondary">No transaction details available</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            {/* Table Header */}
            <div className="min-w-[900px] grid grid-cols-12 gap-3 px-4 py-2 mb-2 text-xs font-semibold text-muted uppercase tracking-wider border-b block-info-border">
              <div className="col-span-1">#</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-2">Hash</div>
              <div className="col-span-2">From</div>
              <div className="col-span-2">To</div>
              <div className="col-span-1 text-center">Ins</div>
              <div className="col-span-1 text-center">Outs</div>
              <div className="col-span-1 text-center">Size</div>
              <div className="col-span-1 text-right whitespace-nowrap">Amount ({CURRENCY})</div>
            </div>

            {/* Transaction Rows */}
            <div className="space-y-2 min-w-[900px]">
              {data.transactions.map((tx, index) => {
                // Detect coinbase first (takes priority in display)
                const isCoinbase = tx.vin?.[0]?.coinbase;

                // Detect shielded transactions (Sapling, Orchard, or Sprout)
                const isShielded = !isCoinbase && (
                  tx.hasShieldedActivity || // From transformation (uses has_sapling, has_orchard)
                  tx.has_sapling || tx.has_orchard || tx.has_sprout || // Direct from API
                  (tx.vShieldedSpend?.length > 0 || tx.vShieldedOutput?.length > 0) || // Sapling
                  (tx.orchard?.actions?.length > 0) || // Orchard
                  (tx.vJoinSplit?.length > 0) // Sprout (legacy)
                );
                const totalOutput = tx.vout?.reduce((sum: number, out: any) => sum + (out.value || 0), 0) || 0;

                // Get first input and output addresses
                const fromAddress = !isCoinbase && tx.vin?.[0]?.address; // Enriched by API
                const toAddress = tx.vout?.[0]?.scriptPubKey?.addresses?.[0];

                const inputCount = tx.vin?.length || 0;
                const outputCount = tx.vout?.length || 0;
                const txSize = tx.size || 0;

                return (
                  <Link href={`/tx/${tx.txid}`} key={tx.txid || index}>
                    <div className="grid grid-cols-12 gap-3 items-center block-tx-row p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan transition-all cursor-pointer group">
                      {/* # Column */}
                      <div className="col-span-1">
                        <span className="text-xs font-mono text-muted">#{index + 1}</span>
                      </div>

                      {/* Type Column */}
                      <div className="col-span-1">
                        {isCoinbase ? (
                          <span className="px-1.5 py-0.5 bg-cipher-green/10 text-cipher-green text-[10px] rounded font-mono">
                            COINBASE
                          </span>
                        ) : isShielded ? (
                          <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded font-mono">
                            SHIELDED
                          </span>
                        ) : (
                          <span className="text-xs text-muted font-mono">Regular</span>
                        )}
                      </div>

                      {/* Hash Column */}
                      <div className="col-span-2">
                        <code className="text-xs text-secondary group-hover:text-cipher-cyan transition-colors font-mono" title={tx.txid}>
                          {tx.txid.slice(0, 8)}...{tx.txid.slice(-6)}
                        </code>
                      </div>

                      {/* From Column */}
                      <div className="col-span-2">
                        {isCoinbase ? (
                          <span className="text-xs text-muted font-mono">Block Reward</span>
                        ) : fromAddress ? (
                          <span className="text-xs text-secondary font-mono truncate block" title={fromAddress}>
                            {fromAddress.slice(0, 8)}...{fromAddress.slice(-6)}
                          </span>
                        ) : isShielded ? (
                          <span className="text-xs text-purple-400 font-mono flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Shielded
                          </span>
                        ) : (
                          <span className="text-xs text-muted font-mono">—</span>
                        )}
                      </div>

                      {/* To Column */}
                      <div className="col-span-2">
                        {toAddress ? (
                          <span className="text-xs text-secondary font-mono truncate block" title={toAddress}>
                            {toAddress.slice(0, 8)}...{toAddress.slice(-6)}
                          </span>
                        ) : isShielded ? (
                          <span className="text-xs text-purple-400 font-mono flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Shielded
                          </span>
                        ) : (
                          <span className="text-xs text-muted font-mono">—</span>
                        )}
                      </div>

                      {/* Inputs Column */}
                      <div className="col-span-1 text-center">
                        {isShielded && inputCount === 0 ? (
                          <span className="text-purple-400" title="Shielded inputs">
                            <svg className="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </span>
                        ) : (
                          <span className="text-xs text-secondary font-mono">
                            {inputCount}
                          </span>
                        )}
                      </div>

                      {/* Outputs Column */}
                      <div className="col-span-1 text-center">
                        {isShielded && outputCount === 0 ? (
                          <span className="text-purple-400" title="Shielded outputs">
                            <svg className="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </span>
                        ) : (
                          <span className="text-xs text-secondary font-mono">
                            {outputCount}
                          </span>
                        )}
                      </div>

                      {/* Size Column */}
                      <div className="col-span-1 text-center">
                        <span className="text-xs text-secondary font-mono">
                          {txSize > 0 ? (txSize / 1024).toFixed(1) : '-'}
                        </span>
                      </div>

                      {/* Amount Column */}
                      <div className="col-span-1 text-right">
                        {totalOutput > 0 ? (
                          <div className="text-xs font-mono text-primary font-semibold">
                            {totalOutput.toFixed(4)}
                          </div>
                        ) : isShielded ? (
                          <span className="text-purple-400 flex items-center justify-end gap-1" title="Amount hidden (shielded)">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
