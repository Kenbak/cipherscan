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
  const [selectedAddressTab, setSelectedAddressTab] = useState<'unified' | 'transparent' | 'sapling' | 'orchard'>('unified');

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
    const isUnified = address.startsWith('u1') || address.startsWith('utest');

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
        {/* Cypherpunk Header */}
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_SHIELDED</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary">
              Shielded Address
            </h1>
            <div className="flex items-center gap-2">
              <Badge color="purple" icon={<Icons.Shield />}>
                {isUnified ? 'UNIFIED' : 'SHIELDED'}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-secondary">
            Zero-knowledge encrypted address — balance and history are private
          </p>
        </div>

        {/* Address Component Viewer */}
        {isUnified && (
          <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_COMPONENTS</span>
                </div>

                {uaLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <div className="animate-spin rounded-full h-3 w-3 border border-cipher-cyan border-t-transparent" />
                    <span className="font-mono">Decoding unified address...</span>
                  </div>
                ) : uaComponents ? (
                  <>
                    {/* Tabs */}
                    <div className="inline-flex">
                      <div className="filter-group inline-flex mb-4">
                        <button
                          onClick={() => setSelectedAddressTab('unified')}
                          className={`filter-btn ${selectedAddressTab === 'unified' ? 'filter-btn-active' : ''}`}
                        >
                          Unified
                        </button>
                        <button
                          onClick={() => uaComponents.has_transparent && setSelectedAddressTab('transparent')}
                          disabled={!uaComponents.has_transparent}
                          className={`filter-btn ${selectedAddressTab === 'transparent' ? 'filter-btn-active' : ''} ${!uaComponents.has_transparent ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                          Transparent
                        </button>
                        <button
                          onClick={() => uaComponents.has_sapling && setSelectedAddressTab('sapling')}
                          disabled={!uaComponents.has_sapling}
                          className={`filter-btn ${selectedAddressTab === 'sapling' ? 'filter-btn-active' : ''} ${!uaComponents.has_sapling ? 'opacity-30 cursor-not-allowed' : ''}`}
                        >
                          Sapling
                        </button>
                      </div>
                    </div>

                    {/* Tab Content */}
                    <div className="p-4 rounded-lg bg-cipher-surface/50 border border-white/[0.04]">
                      {selectedAddressTab === 'unified' && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge color="purple">UNIFIED</Badge>
                            <span className="text-[10px] text-muted font-mono">contains all receivers</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <code className="text-xs text-secondary break-all font-mono flex-1 leading-relaxed">{address}</code>
                            <CopyButton text={address} label="unified" />
                          </div>
                        </div>
                      )}

                      {selectedAddressTab === 'transparent' && uaComponents.has_transparent && uaComponents.transparent_address && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge color="cyan">TRANSPARENT</Badge>
                            <span className="text-[10px] text-muted font-mono">public on-chain</span>
                          </div>
                          <div className="flex items-start gap-2 mb-4">
                            <code className="text-xs text-cipher-cyan break-all font-mono flex-1 leading-relaxed">{uaComponents.transparent_address}</code>
                            <CopyButton text={uaComponents.transparent_address} label="transparent" />
                          </div>
                          <Link
                            href={`/address/${uaComponents.transparent_address}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cipher-cyan/10 text-cipher-cyan text-sm font-medium hover:bg-cipher-cyan/20 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View Transactions
                          </Link>
                        </div>
                      )}

                      {selectedAddressTab === 'sapling' && uaComponents.has_sapling && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge color="purple">SAPLING</Badge>
                            <span className="text-[10px] text-muted font-mono">shielded receiver</span>
                          </div>
                          {uaComponents.sapling_address ? (
                            <div className="flex items-start gap-2">
                              <code className="text-xs text-purple-400 break-all font-mono flex-1 leading-relaxed">{uaComponents.sapling_address}</code>
                              <CopyButton text={uaComponents.sapling_address} label="sapling" />
                            </div>
                          ) : (
                            <p className="text-sm text-muted font-mono">Receiver present — address encoding unavailable</p>
                          )}
                        </div>
                      )}

                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-lg bg-cipher-surface/50 border border-white/[0.04]">
                    <div className="flex items-start gap-2">
                      <code className="text-xs text-secondary break-all font-mono flex-1">{address}</code>
                      <CopyButton text={address} label="address" />
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* Non-unified shielded addresses */}
        {!isUnified && (
          <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS</span>
                </div>
                <div className="flex items-start gap-2 p-4 rounded-lg bg-cipher-surface/50 border border-white/[0.04]">
                  <code className="text-xs text-secondary break-all font-mono flex-1">{address}</code>
                  <CopyButton text={address} label="address" />
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Privacy Status Card */}
        <Card className="mb-6 overflow-hidden relative animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {/* Atmospheric overlays */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-cipher-cyan/[0.02] pointer-events-none" />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(167,139,250,0.015)_10px,rgba(167,139,250,0.015)_20px)] pointer-events-none" />
          {/* Scan line */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent animate-[scan_4s_ease-in-out_infinite]" style={{ animation: 'scan 4s ease-in-out infinite' }} />
          </div>

          <CardBody className="relative">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xs font-mono text-muted tracking-wider">&gt; PRIVACY_STATUS</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider">Protected</span>
              </div>
            </div>

            <div className="flex items-start gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary mb-1">
                  Privacy by Design
                </h2>
                <p className="text-sm text-secondary leading-relaxed">
                  This address uses <span className="text-purple-400 font-medium">zero-knowledge proofs</span> to encrypt all transaction data.
                  Balance and history are only visible to holders of the viewing key.
                </p>
              </div>
            </div>

            {/* Redacted data visualization */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                { label: 'BALANCE', redacted: '████████ ZEC' },
                { label: 'TX_COUNT', redacted: '████' },
                { label: 'LAST_ACTIVE', redacted: '████-██-██' },
                { label: 'MEMO_FIELD', redacted: '██████████████' },
              ].map((field) => (
                <div key={field.label} className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/[0.04] border border-purple-500/[0.08]">
                  <svg className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-muted font-mono uppercase tracking-wider block">{field.label}</span>
                    <span className="text-xs text-purple-400/40 font-mono tracking-tight">{field.redacted}</span>
                  </div>
                  <span className="text-[9px] text-purple-400/60 font-mono uppercase">encrypted</span>
                </div>
              ))}
            </div>

            {/* Privacy feature badges */}
            <div className="flex flex-wrap gap-2">
              {['Zero-Knowledge Proofs', 'Encrypted Amounts', 'Hidden Parties', 'Private Memos'].map((feature) => (
                <span key={feature} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/[0.06] border border-purple-500/[0.08] text-[11px] text-purple-300 font-mono">
                  <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Decrypt Tools — compact inline */}
        <div className="p-4 rounded-xl bg-cipher-surface/50 border border-white/[0.04] animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <svg className="w-4 h-4 text-cipher-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className="text-sm text-secondary">
                <span className="text-primary font-medium">Your address?</span> Decrypt with your viewing key.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/decrypt"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-cipher-cyan/30 text-cipher-cyan hover:bg-cipher-cyan/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Decrypt TX
              </Link>
              <Link
                href="/decrypt?tab=scan"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-cipher-border text-secondary hover:text-cipher-cyan hover:border-cipher-cyan/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Scan History
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Display message for addresses with no transactions
  if (hasNoTransactions && data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
        <div className="mb-8 animate-fade-in-up">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_LOOKUP</span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary mt-1 mb-3">Address Details</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="cyan">TRANSPARENT</Badge>
            <code className="text-xs text-secondary break-all font-mono">{address}</code>
            <CopyButton text={address} label="address" />
          </div>
        </div>

        <Card className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <CardBody>
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-cipher-surface border border-white/[0.04] flex items-center justify-center">
                <svg className="w-7 h-7 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-primary mb-2">No Transactions Yet</h2>
              <p className="text-sm text-secondary max-w-md mx-auto mb-6">
                Valid transparent address with no transaction history.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-cipher-surface rounded-lg text-xs text-muted font-mono border border-white/[0.04]">
                <span className="w-1.5 h-1.5 rounded-full bg-cipher-cyan" />
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
        <div className="mb-8 animate-fade-in-up">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_LOOKUP</span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary mt-1 mb-3">Address Details</h1>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs text-secondary break-all font-mono">{address}</code>
            <CopyButton text={address} label="address" />
          </div>
        </div>

        <Card className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <CardBody>
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xs font-mono text-muted tracking-wider">&gt; STATUS</span>
              <Badge color="orange">LIMITED DATA</Badge>
            </div>

            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-primary mb-1">Address valid, but history unavailable</h2>
                <p className="text-sm text-secondary leading-relaxed">
                  The explorer node doesn&apos;t have address indexing enabled. Transaction data can only be retrieved by specific transaction ID.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-cipher-surface/50 border border-white/[0.04] mb-4">
              <span className="text-[10px] text-muted font-mono uppercase tracking-wider block mb-3">&gt; TECHNICAL_DETAILS</span>
              <ul className="text-xs text-secondary space-y-2 font-mono">
                <li className="flex items-start gap-2">
                  <span className="text-muted mt-0.5">$</span>
                  <span>RPC methods <code className="text-cipher-cyan">getaddressbalance</code> / <code className="text-cipher-cyan">getaddresstxids</code> unavailable</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted mt-0.5">$</span>
                  <span>Requires <code className="text-cipher-cyan">addressindex=1</code> in node config</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted mt-0.5">$</span>
                  <span>Zebrad may not support these methods</span>
                </li>
              </ul>
            </div>

            <div className="p-3 rounded-lg bg-cipher-cyan/5 border border-cipher-cyan/10">
              <p className="text-xs text-cipher-cyan font-mono">
                &gt; TIP: Search by transaction hash (txid) to view individual transactions
              </p>
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
          color: 'purple',
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
      <div className="mb-8 animate-fade-in-up">
        <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_DETAILS</span>
        <div className="flex items-center justify-between mt-1 mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary">Address</h1>
            <Badge color={typeInfo.color as 'purple' | 'cyan'} icon={<Icons.Shield />}>
              {typeInfo.label}
            </Badge>
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
      <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
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
      <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
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
      <div id="transactions-section" className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted tracking-wider">&gt; TRANSACTIONS</span>
            <Badge color="cyan">{totalTxCount}</Badge>
          </div>
          <span className="text-sm text-muted font-normal font-mono ml-auto">
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
