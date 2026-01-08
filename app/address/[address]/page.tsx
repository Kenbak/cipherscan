'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { AddressLabel } from '@/components/AddressLabel';
import { AddressDisplay } from '@/components/AddressWithLabel';
import { ExportButton } from '@/components/ExportButton';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

interface PriceData {
  price: number;
  change24h: number;
}

interface AddressData {
  address: string;
  balance: number;
  type: 'shielded' | 'transparent' | 'unified';
  transactions: Transaction[];
  transactionCount?: number;
  note?: string;
}

interface Transaction {
  txid: string;
  timestamp: number;
  amount: number;
  type: 'received' | 'sent';
  memo?: string;
  blockHeight?: number;
  from?: string | null;
  to?: string | null;
  isCoinbase?: boolean;
  isShielded?: boolean;
  isDeshielding?: boolean;
  isShielding?: boolean;
}

// Icon components (same as block/tx pages)
const Icons = {
  Wallet: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Currency: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  List: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  ArrowDown: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  ),
  ArrowUp: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  ),
};

export default function AddressPage() {
  const params = useParams();
  const address = params.address as string;
  const [data, setData] = useState<AddressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
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
          ? `${getApiUrl()}/api/address/${address}`
          : `/api/address/${address}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error('Failed to fetch address data');
        }

        const apiData = await response.json();

        // Transform data if coming from Express API
        if (usePostgresApiClient()) {
          // Express API returns values in satoshis
          const transformedTransactions = (apiData.transactions || []).map((tx: any) => ({
            txid: tx.txid,
            timestamp: tx.blockTime,
            amount: Math.abs(tx.netChange / 100000000), // satoshis to ZEC
            type: tx.netChange > 0 ? 'received' : 'sent',
            blockHeight: tx.blockHeight,
            from: tx.netChange > 0 ? null : apiData.address,
            to: tx.netChange > 0 ? apiData.address : null,
            // Coinbase = first TX of block (tx_index 0) with no transparent inputs
            // Deshielding = receiving from shielded (no transparent inputs, has shielded activity)
            // Shielding = sending to shielded (has transparent inputs, shielded activity, sending)
            isCoinbase: tx.txIndex === 0 && tx.inputValue === 0 && !tx.hasOrchard && !tx.hasSapling,
            isShielded: tx.hasOrchard || tx.hasSapling,
            isDeshielding: tx.inputValue === 0 && tx.outputValue > 0 && (tx.hasOrchard || tx.hasSapling),
            isShielding: tx.inputValue > 0 && (tx.hasOrchard || tx.hasSapling) && tx.netChange < 0,
          }));

          setData({
            address: apiData.address,
            balance: apiData.balance / 100000000, // satoshis to ZEC
            type: apiData.type || 'transparent',
            transactions: transformedTransactions,
            transactionCount: apiData.txCount || apiData.transactionCount,
            note: apiData.note,
          });
        } else {
          setData({
            address: apiData.address,
            balance: apiData.balance ?? 0,
            type: apiData.type,
            transactions: apiData.transactions || [],
            transactionCount: apiData.transactionCount,
            note: apiData.note,
          });
        }
      } catch (error) {
        console.error('Error fetching address data:', error);
        setData(null);
      } finally {
      setLoading(false);
      }
    };

    const fetchPrice = async () => {
      try {
        // Call CoinGecko directly (no need for proxy API)
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true'
        );
        const data = await response.json();
        setPriceData({
          price: data.zcash.usd,
          change24h: data.zcash.usd_24h_change,
        });
      } catch (error) {
        console.error('Error fetching price:', error);
      }
    };

    fetchData();
    fetchPrice();
  }, [address]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="card">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
            <p className="text-secondary ml-4 font-mono text-lg">Loading address data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if this is a shielded address (privacy by design)
  const isShieldedAddress = data?.type === 'shielded' && data?.note && (
    data.note.includes('Shielded address') ||
    data.note.includes('Fully shielded unified address')
  );

  // Check if we have indexing issues (but not for shielded addresses)
  const hasIndexingIssue = !isShieldedAddress && data?.note && (
    data.note.includes('not found') ||
    data.note.includes('indexing') ||
    data.note.includes('Unable to connect')
  );

  // Display special message for shielded addresses
  if (isShieldedAddress) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Address Details</h1>
          <div className="flex items-center">
            <code className="text-sm text-secondary break-all">{address}</code>
            <CopyButton text={address} label="address" />
          </div>
        </div>

        <div className="card py-12">
          <div className="gradient-card-purple-subtle rounded-lg p-6 max-w-2xl mx-auto">
            <p className="text-sm text-secondary mb-4">
              <strong className="text-purple-600 dark:text-purple-400">This is a shielded address.</strong> Balance and transaction history are private by design.
            </p>

            <p className="text-xs text-muted mb-4">
              Zcash shielded addresses use zero-knowledge proofs to encrypt transaction data on the blockchain.
              This means that while transactions are verified, the sender, receiver, and amount remain private.
            </p>

            <div className="block-hash-bg rounded p-4 mt-4">
              <p className="text-xs text-muted mb-2">
                <strong>Privacy Features:</strong>
              </p>
              <ul className="text-xs text-muted space-y-1">
                <li>✓ Balance is encrypted</li>
                <li>✓ Transaction amounts are hidden</li>
                <li>✓ Sender and receiver are private</li>
                <li>✓ Optional encrypted memos</li>
              </ul>
            </div>

            {/* Decrypt Tools Section */}
            <div className="mt-8 pt-6 border-t border-cipher-border">
              <h3 className="text-lg font-bold text-primary mb-3">
                🔐 Want to View Your Transactions?
              </h3>
              <p className="text-sm text-secondary mb-6">
                Use your <strong className="text-cipher-cyan">Unified Full Viewing Key (UFVK)</strong> to decrypt transactions sent to this address.
                All decryption happens locally in your browser - your keys never leave your device.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <Link
                  href="/decrypt"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-cipher-cyan text-cipher-bg font-bold rounded-lg hover:bg-cipher-green transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Decrypt Single Transaction</span>
                </Link>

                <Link
                  href="/decrypt?tab=scan"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 border-2 border-cipher-border text-primary rounded-lg hover:border-cipher-cyan hover:text-cipher-cyan transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>Scan Transaction History</span>
                </Link>
              </div>

              <div className="block-hash-bg border border-cipher-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <h4 className="text-sm font-semibold text-primary">How to Find Your Viewing Key</h4>
                </div>
                <div className="space-y-2 text-sm text-secondary ml-6">
                  <p>
                    <strong className="text-cipher-cyan">Zashi:</strong> Settings → Backup → Export Viewing Key
                  </p>
                  <p>
                    <strong className="text-cipher-cyan">Ywallet:</strong> Accounts → Select Account → Export Viewing Key
                  </p>
                  <p>
                    <strong className="text-cipher-cyan">Zingo-CLI:</strong> <code className="text-xs learn-code-inline px-2 py-1 rounded font-mono text-cipher-green">exportufvk</code>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || hasIndexingIssue) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Address Details</h1>
          <div className="flex items-center">
            <code className="text-sm text-secondary break-all">{address}</code>
            <CopyButton text={address} label="address" />
          </div>
        </div>

        <div className="card py-12">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-amber-600 dark:text-yellow-400 mb-4">Limited Data Available</h2>
          </div>

          <div className="gradient-card-warning rounded-lg p-6 max-w-2xl mx-auto">
            <p className="text-sm text-secondary mb-4">
              <strong className="text-amber-600 dark:text-yellow-400">This address is valid, but we cannot display its transaction history.</strong>
            </p>

            <p className="text-xs text-muted mb-4">
              The explorer node doesn't have address indexing enabled. This means we can only display
              transaction data if you provide the specific transaction ID.
            </p>

            <div className="block-hash-bg rounded p-4 mt-4">
              <p className="text-xs text-muted mb-2">
                <strong>Technical details:</strong>
              </p>
              <ul className="text-xs text-muted space-y-1">
                <li>• RPC methods <code className="text-cipher-cyan">getaddressbalance</code> and <code className="text-cipher-cyan">getaddresstxids</code> are not available</li>
                <li>• These require <code className="text-cipher-cyan">addressindex=1</code> in node configuration</li>
                <li>• Zebrad may not support these methods yet</li>
                <li>• Consider using zcashd with address indexing enabled</li>
              </ul>
            </div>

            <div className="mt-6 p-4 bg-cipher-cyan/10 rounded border border-cipher-cyan/30">
              <p className="text-xs text-cipher-cyan">
                💡 <strong>Tip:</strong> You can still view individual transactions by searching for their transaction hash (txid).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getTypeInfo = () => {
    switch (data.type) {
      case 'shielded':
        return {
          label: 'SHIELDED',
          color: 'purple',
          description: 'Private address - balance and transactions are encrypted',
        };
      case 'unified':
        return {
          label: 'UNIFIED',
          color: 'blue',
          description: 'Can receive both shielded and transparent funds',
        };
      case 'transparent':
      default:
        return {
          label: 'TRANSPARENT',
          color: 'cyan',
          description: 'Public address - all transactions are visible',
        };
    }
  };

  const typeInfo = getTypeInfo();
  const sortedTxs = [...data.transactions].sort((a, b) => b.timestamp - a.timestamp);
  const firstTx = sortedTxs[sortedTxs.length - 1];
  const latestTx = sortedTxs[0];

  const totalTxCount = data.transactionCount || data.transactions.length;
  const displayLimit = 25;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-primary">Address Details</h1>
            {/* Type Badge */}
            <span className={`px-3 py-1 bg-${typeInfo.color}-500/10 text-${typeInfo.color}-600 dark:text-${typeInfo.color}-400 text-sm rounded font-mono flex items-center gap-2`}>
              <Icons.Shield />
              {typeInfo.label}
            </span>
          </div>

          {/* Export Button - Right aligned */}
          <ExportButton
            data={{
              address: data.address,
              balance: data.balance,
              type: data.type,
              transactionCount: data.transactionCount,
              transactions: data.transactions.map((tx: Transaction) => ({
                txid: tx.txid,
                blockHeight: tx.blockHeight,
                timestamp: tx.timestamp,
                type: tx.type,
                amount: tx.amount,
                from: tx.from || null,
                to: tx.to || null,
                isCoinbase: tx.isCoinbase || false,
                isShielded: tx.isShielded || false,
                isShielding: tx.isShielding || false,
                isDeshielding: tx.isDeshielding || false
              }))
            }}
            csvData={data.transactions}
            filename={`address-${address.slice(0, 12)}`}
            type="both"
            label="Export"
            csvHeaders={['TXID', 'Block', 'Timestamp', 'Type', 'Amount (ZEC)']}
            csvMapper={(tx: Transaction) => [
              tx.txid,
              String(tx.blockHeight || ''),
              new Date(tx.timestamp * 1000).toISOString(),
              tx.type,
              tx.amount.toFixed(8)
            ]}
          />
        </div>

        {/* Address with copy button */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <code className="text-sm text-secondary break-all">{address}</code>
          <CopyButton text={address} label="address" />
        </div>

        {/* Address Label */}
        <div className="mt-3">
          <AddressLabel address={address} />
        </div>
      </div>

      {/* Overview Cards - Row 1 */}
      <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
        {/* Balance */}
        <div className="card py-3 md:py-4">
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <Icons.Wallet />
            <span className="text-xs md:text-sm uppercase tracking-wide">{CURRENCY} Balance</span>
            <Tooltip content="Current balance of this address" />
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono text-primary">
            {data.balance.toFixed(8)}
              </div>
            </div>

        {/* Value (USD) */}
        <div className="card py-3 md:py-4">
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs md:text-sm uppercase tracking-wide">{CURRENCY} Value</span>
            <Tooltip content="Estimated value in US Dollars" />
              </div>
          {priceData ? (
            <div className="text-xl md:text-2xl font-bold font-mono text-primary">
              ${(data.balance * priceData.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs md:text-sm text-muted">(@ ${priceData.price.toFixed(2)}/ZEC)</span>
            </div>
          ) : (
            <div className="text-sm text-muted">Loading price...</div>
          )}
        </div>

        {/* Address Type */}
        <div className="card py-3 md:py-4">
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <Icons.Shield />
            <span className="text-xs md:text-sm uppercase tracking-wide">Address Type</span>
          </div>
          <div className="text-base md:text-lg font-semibold text-primary mb-1">
            {typeInfo.label}
          </div>
          <div className="text-xs text-muted">
            {typeInfo.description}
          </div>
        </div>
      </div>

      {/* Overview Cards - Row 2 */}
      <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        {/* Total Transactions */}
        <div className="card py-3 md:py-4">
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <Icons.List />
            <span className="text-xs md:text-sm">Total Transactions</span>
            <Tooltip content="Total number of transactions involving this address" />
          </div>
          <button
            onClick={() => {
              const txSection = document.getElementById('transactions-section');
              txSection?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-xl md:text-2xl font-bold font-mono text-primary hover:text-cipher-cyan transition-colors text-left"
          >
            {totalTxCount}
          </button>
        </div>

        {/* First Transaction */}
        {firstTx ? (
          <div className="card py-3 md:py-4">
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Clock />
              <span className="text-xs md:text-sm">First Transaction</span>
              <Tooltip content="The first transaction involving this address" />
            </div>
            <Link href={`/tx/${firstTx.txid}`} className="group block">
              <code className="text-xs text-secondary group-hover:text-cipher-cyan transition-colors font-mono block mb-1">
                {firstTx.txid.slice(0, 10)}...{firstTx.txid.slice(-8)}
              </code>
              <div className="text-xs text-muted">
                {formatTimestamp(firstTx.timestamp)}
              </div>
            </Link>
          </div>
        ) : (
          <div className="card py-3 md:py-4">
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Clock />
              <span className="text-xs md:text-sm">First Transaction</span>
            </div>
            <div className="text-sm text-muted">No transactions yet</div>
          </div>
        )}

        {/* Latest Transaction */}
        {latestTx ? (
          <div className="card py-3 md:py-4">
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Clock />
              <span className="text-xs md:text-sm">Latest Transaction</span>
              <Tooltip content="The most recent transaction involving this address" />
            </div>
            <Link href={`/tx/${latestTx.txid}`} className="group block">
              <code className="text-xs text-secondary group-hover:text-cipher-cyan transition-colors font-mono block mb-1">
                {latestTx.txid.slice(0, 10)}...{latestTx.txid.slice(-8)}
              </code>
              <div className="text-xs text-muted">
                {formatTimestamp(latestTx.timestamp)}
              </div>
            </Link>
          </div>
        ) : (
          <div className="card py-3 md:py-4">
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Clock />
              <span className="text-xs md:text-sm">Latest Transaction</span>
            </div>
            <div className="text-sm text-muted">No transactions yet</div>
          </div>
        )}
      </div>

      {/* Transactions List */}
      <div id="transactions-section" className="card">
        <h2 className="text-xl font-semibold text-primary mb-6 flex items-center gap-2">
          <Icons.List />
          Transactions
          <span className="text-sm text-muted font-normal">
            (Latest {Math.min(sortedTxs.length, displayLimit)} of {totalTxCount})
          </span>
        </h2>

        {data.transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-secondary">No transactions found for this address</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-6 px-6">
              {/* Table Header */}
              <div className="min-w-[800px] grid grid-cols-12 gap-3 px-4 py-2 mb-2 text-xs font-semibold text-muted uppercase tracking-wider border-b block-info-border">
                <div className="col-span-1">Type</div>
                <div className="col-span-3">Transaction Hash</div>
                <div className="col-span-1">Block</div>
                <div className="col-span-2">Age</div>
                <div className="col-span-3">From → To</div>
                <div className="col-span-2 text-right">Amount ({CURRENCY})</div>
              </div>

              {/* Transaction Rows */}
              <div className="space-y-2 min-w-[800px]">
              {sortedTxs.slice(0, displayLimit).map((tx, index) => (
                <Link href={`/tx/${tx.txid}`} key={tx.txid || index}>
                  <div className="grid grid-cols-12 gap-3 items-center block-tx-row p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan transition-all cursor-pointer group">
                    {/* Type Column */}
                    <div className="col-span-1">
                      {tx.type === 'received' ? (
                        <span className="px-2 py-1 bg-cipher-green/10 text-cipher-green text-xs rounded font-mono flex items-center gap-1 w-fit">
                          <Icons.ArrowDown />
                          IN
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-500/10 text-red-500 dark:text-red-400 text-xs rounded font-mono flex items-center gap-1 w-fit">
                          <Icons.ArrowUp />
                          OUT
                        </span>
                      )}
                    </div>

                    {/* Hash Column */}
                    <div className="col-span-3 flex items-center">
                      <code className="text-xs text-secondary group-hover:text-cipher-cyan transition-colors font-mono">
                        {tx.txid.slice(0, 10)}...{tx.txid.slice(-6)}
                      </code>
                      <CopyButton text={tx.txid} label={`tx-${index}`} />
                    </div>

                    {/* Block Column */}
                    <div className="col-span-1">
                      {tx.blockHeight ? (
                        <Link
                          href={`/block/${tx.blockHeight}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-cipher-cyan hover:underline"
                        >
                          #{tx.blockHeight}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </div>

                    {/* Age Column */}
                    <div className="col-span-2">
                      <span className="text-xs text-secondary">
                        {formatTimestamp(tx.timestamp)}
                      </span>
                    </div>

                    {/* From → To Column */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-1 text-xs text-secondary font-mono">
                        {tx.isDeshielding ? (
                          <>
                            {/* Deshielding: From shielded, To transparent (visible) */}
                            <span className="text-purple-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                              Shielded
                            </span>
                            <span className="text-muted">→</span>
                            <AddressDisplay address={address} className="text-xs truncate" />
                          </>
                        ) : tx.isShielding ? (
                          <>
                            {/* Shielding: From transparent (visible), To shielded */}
                            <AddressDisplay address={address} className="text-xs truncate" />
                            <span className="text-muted">→</span>
                            <span className="text-purple-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                              Shielded
                            </span>
                          </>
                        ) : tx.isShielded ? (
                          <>
                            <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded font-mono flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              SHIELDED
                            </span>
                            <span className="text-muted text-[10px]">Private Transaction</span>
                          </>
                        ) : tx.isCoinbase ? (
                          <>
                            <span className="text-muted italic">Block Reward</span>
                            <span className="text-muted">→</span>
                            <AddressDisplay address={tx.to || address} className="text-xs truncate" />
                          </>
                        ) : (
                          <>
                            {tx.from ? (
                              <AddressDisplay address={tx.from} className="text-xs truncate" />
                            ) : (
                              <span className="text-purple-400 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Shielded
                              </span>
                            )}
                            <span className="text-muted">→</span>
                            {tx.to ? (
                              <AddressDisplay address={tx.to} className="text-xs truncate" />
                            ) : (
                              <span className="text-purple-400 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Shielded
                              </span>
                            )}
                          </>
                        )}
                  </div>
                    </div>

                    {/* Amount Column */}
                    <div className="col-span-2 text-right">
                      {(tx.isShielded && !tx.isDeshielding && !tx.isShielding) || tx.amount === 0 ? (
                        <span className="text-xs text-purple-400 font-mono flex items-center justify-end gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Hidden
                        </span>
                      ) : (
                        <span className={`text-sm font-mono font-semibold ${
                          tx.type === 'received' ? 'text-cipher-green' : 'text-red-500 dark:text-red-400'
                        }`}>
                          {tx.type === 'received' ? '+' : '-'}{Math.abs(tx.amount).toFixed(4)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              </div>
          </div>

          {/* View All Button - Outside scrollable area */}
          {totalTxCount > displayLimit && (
            <div className="mt-6 text-center p-4 tx-summary-box rounded-lg border border-cipher-border">
              <p className="text-sm text-secondary mb-3">
                Showing latest {displayLimit} of {totalTxCount} transactions
              </p>
              <button
                onClick={() => {
                  // TODO: Implement pagination or load all transactions
                  alert('Full transaction history pagination coming soon! Currently showing the latest 25 transactions.');
                }}
                className="px-4 py-2 bg-cipher-cyan text-cipher-bg font-semibold rounded hover:bg-cipher-green transition-colors text-sm"
              >
                View All Transactions →
              </button>
            </div>
          )}
        </>
        )}
      </div>
    </div>
  );
}
