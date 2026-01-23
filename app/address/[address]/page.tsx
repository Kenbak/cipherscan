'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { AddressLabel } from '@/components/AddressLabel';
import { AddressDisplay } from '@/components/AddressWithLabel';
import { ExportButton } from '@/components/ExportButton';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { decodeUnifiedAddress, UnifiedAddressComponents } from '@/lib/wasm-loader';

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
  const searchParams = useSearchParams();
  const address = params.address as string;
  const [data, setData] = useState<AddressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Pagination - read from URL
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;

  // Unified address components (for u1 addresses)
  const [uaComponents, setUaComponents] = useState<UnifiedAddressComponents | null>(null);
  const [uaLoading, setUaLoading] = useState(false);

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

  // Transform API transactions to frontend format
  const transformTransactions = (apiData: any, txList: any[]): Transaction[] => {
    return txList.map((tx: any) => {
      const hasShieldedActivity = tx.hasOrchard || tx.hasSapling;
      const isReceiving = tx.netChange > 0;
      const isSending = tx.netChange < 0;

      let from = null;
      let to = null;

      if (isReceiving) {
        to = apiData.address;
        if (tx.counterparty) {
          from = tx.counterparty;
        } else if (hasShieldedActivity) {
          from = 'shielded';
        }
      } else if (isSending) {
        from = apiData.address;
        if (tx.counterparty) {
          to = tx.counterparty;
        } else if (hasShieldedActivity) {
          to = 'shielded';
        }
      }

      return {
        txid: tx.txid,
        timestamp: tx.blockTime,
        amount: Math.abs(tx.netChange / 100000000),
        type: isReceiving ? 'received' : 'sent',
        blockHeight: tx.blockHeight,
        from,
        to,
        isCoinbase: tx.txIndex === 0 && tx.inputValue === 0 && !hasShieldedActivity && tx.senderCount === 0,
        isShielded: hasShieldedActivity && tx.inputValue === 0 && tx.outputValue === 0,
        isDeshielding: !tx.counterparty && tx.outputValue > 0 && hasShieldedActivity && isReceiving,
        isShielding: !tx.counterparty && hasShieldedActivity && isSending,
      };
    });
  };

  // Fetch transactions for current page (from URL)
  const fetchPageData = useCallback(async () => {
    try {
      setLoading(true);

      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/address/${address}?page=${currentPage}&limit=${pageSize}`
        : `/api/address/${address}?page=${currentPage}&limit=${pageSize}`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch address data');

      const apiData = await response.json();

      // Update total pages
      setTotalPages(apiData.pagination?.totalPages || 1);

      if (usePostgresApiClient()) {
        const transformedTransactions = transformTransactions(apiData, apiData.transactions || []);

        setData({
          address: apiData.address,
          balance: apiData.balance / 100000000,
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
  }, [address, currentPage, pageSize]);

  // Fetch data when address or page changes
  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // Fetch price once
  useEffect(() => {
    const fetchPrice = async () => {
      try {
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
    fetchPrice();
  }, []);

  // Decode unified address to show components
  useEffect(() => {
    const decodeUA = async () => {
      // Only decode u1 (mainnet) or utest (testnet) addresses
      if (!address.startsWith('u1') && !address.startsWith('utest')) {
        return;
      }

      try {
        setUaLoading(true);
        const components = await decodeUnifiedAddress(address);
        setUaComponents(components);
      } catch (error) {
        console.error('Failed to decode unified address:', error);
      } finally {
        setUaLoading(false);
      }
    };
    decodeUA();
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
        <Card>
          <CardBody className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-cipher-cyan border-t-transparent"></div>
            <p className="text-secondary ml-4 font-mono">Loading address data...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Check if this is a shielded address (privacy by design)
  const isShieldedAddress = data?.type === 'shielded' && data?.note && (
    data.note.includes('Shielded address') ||
    data.note.includes('Fully shielded unified address')
  );

  // Check if address has no transactions yet
  const hasNoTransactions = data?.note?.includes('no transaction history yet');

  // Check if we have indexing issues (but not for shielded addresses or empty addresses)
  const hasIndexingIssue = !isShieldedAddress && !hasNoTransactions && data?.note && (
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

        <Card className="py-12">
          <CardBody>
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

            {/* Unified Address Components */}
            {(address.startsWith('u1') || address.startsWith('utest')) && (
              <div className="block-hash-bg rounded p-4 mt-4 border border-cipher-border">
                <p className="text-xs text-muted mb-3">
                  <strong className="text-cipher-cyan">Unified Address Components:</strong>
                </p>
                {uaLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <div className="animate-spin rounded-full h-3 w-3 border border-cipher-cyan border-t-transparent"></div>
                    Decoding address...
                  </div>
                ) : uaComponents ? (
                  <div className="space-y-2 font-mono text-xs">
                    {/* Transparent receiver */}
                    <div className="flex items-start gap-2">
                      <span className="text-muted">├─</span>
                      <span className="text-muted">Transparent:</span>
                      {uaComponents.has_transparent && uaComponents.transparent_address ? (
                        <Link
                          href={`/address/${uaComponents.transparent_address}`}
                          className="text-cipher-cyan hover:underline break-all"
                        >
                          {uaComponents.transparent_address}
                        </Link>
                      ) : (
                        <span className="text-muted italic">not included</span>
                      )}
                    </div>

                    {/* Sapling receiver */}
                    <div className="flex items-start gap-2">
                      <span className="text-muted">├─</span>
                      <span className="text-muted">Sapling:</span>
                      {uaComponents.has_sapling ? (
                        <span className="text-purple-400">
                          {uaComponents.sapling_address || 'present'} <span className="text-muted">(shielded)</span>
                        </span>
                      ) : (
                        <span className="text-muted italic">not included</span>
                      )}
                    </div>

                    {/* Orchard receiver */}
                    <div className="flex items-start gap-2">
                      <span className="text-muted">└─</span>
                      <span className="text-muted">Orchard:</span>
                      {uaComponents.has_orchard ? (
                        <span className="text-purple-400">present <span className="text-muted">(shielded)</span></span>
                      ) : (
                        <span className="text-muted italic">not included</span>
                      )}
                    </div>

                    {/* Link to transparent address if available */}
                    {uaComponents.has_transparent && uaComponents.transparent_address && (
                      <div className="mt-3 pt-3 border-t border-cipher-border">
                        <Link
                          href={`/address/${uaComponents.transparent_address}`}
                          className="inline-flex items-center gap-2 text-xs text-cipher-cyan hover:text-cipher-green"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View transparent component transactions
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted italic">Could not decode address components</p>
                )}
              </div>
            )}

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
          </CardBody>
        </Card>
      </div>
    );
  }

  // Display message for addresses with no transactions
  if (hasNoTransactions && data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Address Details</h1>
          <div className="flex items-center gap-2">
            <Badge color="cyan">TRANSPARENT</Badge>
            <code className="text-sm text-secondary break-all">{address}</code>
            <CopyButton text={address} label="address" />
          </div>
        </div>

        <Card>
          <CardBody>
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-cipher-border/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-primary mb-2">No Transactions Yet</h2>
              <p className="text-sm text-secondary max-w-md mx-auto mb-6">
                This is a valid transparent address, but it hasn&apos;t received or sent any transactions yet.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-cipher-border/20 rounded-lg text-xs text-muted">
                <span className="w-2 h-2 rounded-full bg-cipher-cyan"></span>
                Balance: 0 ZEC
              </div>
            </div>
          </CardBody>
        </Card>
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

        <Card>
          <CardBody className="py-12">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-amber-600 dark:text-yellow-400 mb-4">Limited Data Available</h2>
            </div>

            <div className="gradient-card-warning rounded-lg p-6 max-w-2xl mx-auto">
              <p className="text-sm text-secondary mb-4">
                <strong className="text-amber-600 dark:text-yellow-400">This address is valid, but we cannot display its transaction history.</strong>
              </p>

              <p className="text-xs text-muted mb-4">
                The explorer node doesn&apos;t have address indexing enabled. This means we can only display
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
          </CardBody>
        </Card>
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
        <Card variant="compact">
          <CardBody>
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Wallet />
              <span className="text-xs md:text-sm uppercase tracking-wide">{CURRENCY} Balance</span>
              <Tooltip content="Current balance of this address" />
            </div>
            <div className="text-xl md:text-2xl font-bold font-mono text-primary">
              {data.balance.toFixed(8)}
            </div>
          </CardBody>
        </Card>

        {/* Value (USD) */}
        <Card variant="compact">
          <CardBody>
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Currency />
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
          </CardBody>
        </Card>

        {/* Address Type */}
        <Card variant="compact">
          <CardBody>
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
          </CardBody>
        </Card>
      </div>

      {/* Overview Cards - Row 2 */}
      <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        {/* Total Transactions */}
        <Card variant="compact">
          <CardBody>
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
          </CardBody>
        </Card>

        {/* First Transaction */}
        <Card variant="compact">
          <CardBody>
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Clock />
              <span className="text-xs md:text-sm">First Transaction</span>
              {firstTx && <Tooltip content="The first transaction involving this address" />}
            </div>
            {firstTx ? (
              <Link href={`/tx/${firstTx.txid}`} className="group block">
                <code className="text-xs text-secondary group-hover:text-cipher-cyan transition-colors font-mono block mb-1">
                  {firstTx.txid.slice(0, 10)}...{firstTx.txid.slice(-8)}
                </code>
                <div className="text-xs text-muted">
                  {formatTimestamp(firstTx.timestamp)}
                </div>
              </Link>
            ) : (
              <div className="text-sm text-muted">No transactions yet</div>
            )}
          </CardBody>
        </Card>

        {/* Latest Transaction */}
        <Card variant="compact">
          <CardBody>
            <div className="flex items-center gap-2 mb-2 text-secondary">
              <Icons.Clock />
              <span className="text-xs md:text-sm">Latest Transaction</span>
              {latestTx && <Tooltip content="The most recent transaction involving this address" />}
            </div>
            {latestTx ? (
              <Link href={`/tx/${latestTx.txid}`} className="group block">
                <code className="text-xs text-secondary group-hover:text-cipher-cyan transition-colors font-mono block mb-1">
                  {latestTx.txid.slice(0, 10)}...{latestTx.txid.slice(-8)}
                </code>
                <div className="text-xs text-muted">
                  {formatTimestamp(latestTx.timestamp)}
                </div>
              </Link>
            ) : (
              <div className="text-sm text-muted">No transactions yet</div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Transactions List */}
      <div id="transactions-section">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icons.List />
            <h2 className="text-lg font-semibold text-primary">Transactions</h2>
            <Badge color="cyan">{totalTxCount}</Badge>
          </div>
          <span className="text-sm text-muted font-normal ml-auto">
            {totalPages > 1 ? `page ${currentPage} of ${totalPages}` : `${totalTxCount} total`}
          </span>
        </CardHeader>
        <CardBody>

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
              {sortedTxs.map((tx, index) => (
                <Link href={`/tx/${tx.txid}`} key={tx.txid || index}>
                  <div className="grid grid-cols-12 gap-3 items-center block-tx-row p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan transition-all cursor-pointer group">
                    {/* Type Column */}
                    <div className="col-span-1">
                      {tx.type === 'received' ? (
                        <Badge color="green" icon={<Icons.ArrowDown />}>IN</Badge>
                      ) : (
                        <Badge color="orange" icon={<Icons.ArrowUp />}>OUT</Badge>
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
                            {/* From address */}
                            {tx.from === 'shielded' ? (
                              <span className="text-purple-400 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Shielded
                              </span>
                            ) : tx.from ? (
                              <AddressDisplay address={tx.from} className="text-xs truncate" />
                            ) : (
                              <span className="text-muted">-</span>
                            )}

                            <span className="text-muted">→</span>

                            {/* To address */}
                            {tx.to === 'shielded' ? (
                              <span className="text-purple-400 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Shielded
                              </span>
                            ) : tx.to ? (
                              <AddressDisplay address={tx.to} className="text-xs truncate" />
                            ) : (
                              <span className="text-muted">-</span>
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

          {/* Pagination Controls - Etherscan style with Links */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 tx-summary-box rounded-lg border border-cipher-border">
              {/* Page info */}
              <div className="text-sm text-secondary">
                Page <span className="font-semibold text-primary">{currentPage}</span> of{' '}
                <span className="font-semibold text-primary">{totalPages}</span>
                <span className="text-muted ml-2">
                  ({((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalTxCount)} of {totalTxCount} txns)
                </span>
              </div>

              {/* Page navigation */}
              <div className="flex items-center gap-1">
                {/* First page */}
                {currentPage > 1 ? (
                  <Link
                    href={`/address/${address}`}
                    className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-cipher-cyan transition-colors"
                    title="First page"
                  >
                    ««
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">««</span>
                )}

                {/* Previous page */}
                {currentPage > 1 ? (
                  <Link
                    href={currentPage === 2 ? `/address/${address}` : `/address/${address}?page=${currentPage - 1}`}
                    className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-cipher-cyan transition-colors"
                    title="Previous page"
                  >
                    «
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">«</span>
                )}

                {/* Page numbers */}
                <div className="flex items-center gap-1 mx-2">
                  {(() => {
                    const pages: (number | string)[] = [];
                    const maxVisible = 5;

                    if (totalPages <= maxVisible + 2) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      let start = Math.max(2, currentPage - 1);
                      let end = Math.min(totalPages - 1, currentPage + 1);
                      if (currentPage <= 3) {
                        end = Math.min(4, totalPages - 1);
                      } else if (currentPage >= totalPages - 2) {
                        start = Math.max(2, totalPages - 3);
                      }
                      if (start > 2) pages.push('...');
                      for (let i = start; i <= end; i++) pages.push(i);
                      if (end < totalPages - 1) pages.push('...');
                      pages.push(totalPages);
                    }

                    return pages.map((p, idx) => (
                      typeof p === 'number' ? (
                        p === currentPage ? (
                          <span
                            key={idx}
                            className="px-3 py-1.5 text-sm rounded bg-cipher-cyan text-cipher-bg font-semibold"
                          >
                            {p}
                          </span>
                        ) : (
                          <Link
                            key={idx}
                            href={p === 1 ? `/address/${address}` : `/address/${address}?page=${p}`}
                            className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-cipher-cyan transition-colors"
                          >
                            {p}
                          </Link>
                        )
                      ) : (
                        <span key={idx} className="px-2 text-muted">...</span>
                      )
                    ));
                  })()}
                </div>

                {/* Next page */}
                {currentPage < totalPages ? (
                  <Link
                    href={`/address/${address}?page=${currentPage + 1}`}
                    className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-cipher-cyan transition-colors"
                    title="Next page"
                  >
                    »
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">»</span>
                )}

                {/* Last page */}
                {currentPage < totalPages ? (
                  <Link
                    href={`/address/${address}?page=${totalPages}`}
                    className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-cipher-cyan transition-colors"
                    title="Last page"
                  >
                    »»
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">»»</span>
                )}
              </div>
            </div>
          )}
        </>
        )}
        </CardBody>
      </Card>
      </div>
    </div>
  );
}
