'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { usePostgresApiClient, getApiUrl, API_CONFIG } from '@/lib/api-config';
import { decodeUnifiedAddress } from '@/lib/wasm-loader';
import { zatToZec } from '@/lib/format-numbers';
import { AddressHeader } from './AddressHeader';
import { AddressHeroCard } from './AddressHeroCard';
import { AddressTabBar } from './AddressTabBar';
import { AddressLoadingSkeleton } from './AddressLoadingSkeleton';
import { EmptyAddressView, IndexingIssueView } from './AddressStateViews';
import { ShieldedAddressView } from './ShieldedAddressView';
import { CrossChainTable } from './CrossChainTable';
import { TransactionTable } from './TransactionTable';
import { AddressGraph } from './AddressGraph';
import { AddressSummary } from './AddressSummary';
import {
  transformTransactions,
  getTypeInfo,
  isShieldedAddress,
  hasNoTransactions,
  hasIndexingIssue,
} from './helpers';
import type {
  AddressData,
  AddressTab,
  CrossChainActivity,
  PriceData,
  UnifiedAddressTab,
  UnifiedAddressComponents,
} from './types';

const PAGE_SIZE = 25;

interface AddressDetailClientProps {
  address: string;
}

export function AddressDetailClient({ address }: AddressDetailClientProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AddressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [crossChain, setCrossChain] = useState<CrossChainActivity | null>(null);
  const [activeTab, setActiveTab] = useState<AddressTab>('transactions');

  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const [totalPages, setTotalPages] = useState(1);

  const [uaComponents, setUaComponents] = useState<UnifiedAddressComponents | null>(null);
  const [uaLoading, setUaLoading] = useState(false);
  const [selectedAddressTab, setSelectedAddressTab] = useState<UnifiedAddressTab>('unified');

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const fetchPageData = useCallback(async () => {
    try {
      setLoading(true);

      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/address/${address}?page=${currentPage}&limit=${PAGE_SIZE}`
        : `/api/address/${address}?page=${currentPage}&limit=${PAGE_SIZE}`;

      const crossChainUrl = `${API_CONFIG.POSTGRES_API_URL}/api/crosschain/address/${encodeURIComponent(address)}`;
      const priceUrl = `${API_CONFIG.POSTGRES_API_URL}/api/price`;

      const [response, crossChainRes, priceRes] = await Promise.all([
        fetch(apiUrl),
        fetch(crossChainUrl).catch(() => null),
        fetch(priceUrl).catch(() => null),
      ]);

      if (!response.ok) throw new Error('Failed to fetch address data');
      const apiData = await response.json();

      setTotalPages(apiData.pagination?.totalPages || 1);

      if (usePostgresApiClient()) {
        const transformedTransactions = transformTransactions(apiData, apiData.transactions || []);
        setData({
          address: apiData.address,
          balance: zatToZec(apiData.balance),
          type: apiData.type || 'transparent',
          transactions: transformedTransactions,
          transactionCount: apiData.txCount || apiData.transactionCount,
          note: apiData.note,
          firstSeen: apiData.firstSeen,
          lastSeen: apiData.lastSeen,
          firstFunding: apiData.firstFunding ?? null,
        });
      } else {
        setData({
          address: apiData.address,
          balance: apiData.balance ?? 0,
          type: apiData.type,
          transactions: apiData.transactions || [],
          transactionCount: apiData.transactionCount,
          note: apiData.note,
          firstSeen: apiData.firstSeen,
          lastSeen: apiData.lastSeen,
          firstFunding: apiData.firstFunding ?? null,
        });
      }

      if (crossChainRes?.ok) {
        try {
          const ccData = await crossChainRes.json();
          if (ccData.success && ccData.totalSwaps > 0) setCrossChain(ccData);
        } catch { /* ignore */ }
      }

      if (priceRes?.ok) {
        try {
          const pData = await priceRes.json();
          setPriceData({ price: pData.price, change24h: pData.change24h });
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error('Error fetching address data:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [address, currentPage]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    const decodeUA = async () => {
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

  if (loading) {
    return <AddressLoadingSkeleton />;
  }

  const shielded = isShieldedAddress(data);
  const noTransactions = hasNoTransactions(data);
  const indexingIssue = hasIndexingIssue(data, shielded, noTransactions);

  if (shielded) {
    const isUnified = address.startsWith('u1') || address.startsWith('utest');

    return (
      <ShieldedAddressView
        address={address}
        isUnified={isUnified}
        uaComponents={uaComponents}
        uaLoading={uaLoading}
        selectedAddressTab={selectedAddressTab}
        onSelectTab={setSelectedAddressTab}
        copiedText={copiedText}
        onCopy={copyToClipboard}
      />
    );
  }

  if (noTransactions && data) {
    return (
      <EmptyAddressView
        address={address}
        copiedText={copiedText}
        onCopy={copyToClipboard}
      />
    );
  }

  if (!data || indexingIssue) {
    return (
      <IndexingIssueView
        address={address}
        copiedText={copiedText}
        onCopy={copyToClipboard}
      />
    );
  }

  const typeInfo = getTypeInfo(data.type);
  const totalTxCount = data.transactionCount || data.transactions.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <AddressHeader
        address={address}
        data={data}
        typeInfo={typeInfo}
        copiedText={copiedText}
        onCopy={copyToClipboard}
      />

      <AddressHeroCard
        data={data}
        priceData={priceData}
        crossChain={crossChain}
        summary={<AddressSummary data={data} totalTxCount={totalTxCount} />}
      />

      <AddressTabBar
        activeTab={activeTab}
        totalTxCount={totalTxCount}
        crossChain={crossChain}
        showGraph={data.type === 'transparent'}
        onTabChange={setActiveTab}
      />

      {activeTab === 'graph' && data.type === 'transparent' ? (
        <AddressGraph address={address} />
      ) : activeTab === 'crosschain' && crossChain && crossChain.totalSwaps > 0 ? (
        <CrossChainTable crossChain={crossChain} />
      ) : (
        <TransactionTable
          address={address}
          data={data}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          totalTxCount={totalTxCount}
        />
      )}
    </div>
  );
}
