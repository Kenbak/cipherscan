'use client';

import { readApiData } from '@/lib/api-client';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { getApiUrl } from '@/lib/api-config';
import { decodeUnifiedAddress } from '@/lib/wasm-loader';
import type { AddressMeta } from '@/lib/seo';
import { zatToZec } from '@/lib/format-numbers';
import { AddressHeader } from './AddressHeader';
import { AddressHeroCard } from './AddressHeroCard';
import { AddressTabBar } from './AddressTabBar';
import { AddressLoadingSkeleton, AddressGraphSkeleton } from './AddressLoadingSkeleton';
import { EmptyAddressView, IndexingIssueView } from './AddressStateViews';
import { ShieldedAddressView } from './ShieldedAddressView';
import { CrossChainTable } from './CrossChainTable';
import { TransactionTable } from './TransactionTable';

// Load the interactive connections workspace only when it is opened.
const AddressGraph = dynamic(
  () => import('./AddressGraph').then((mod) => mod.AddressGraph),
  {
    ssr: false,
    loading: () => <AddressGraphSkeleton />,
  },
);
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
  UnifiedAddressComponents,
} from './types';

const PAGE_SIZE = 25;

interface AddressDetailClientProps {
  address: string;
  /** Server-resolved summary from `getAddressResolution` — seeds the loading state. */
  initialMeta?: AddressMeta | null;
}

export function AddressDetailClient({ address, initialMeta = null }: AddressDetailClientProps) {
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
  const [uaLoading, setUaLoading] = useState(() => address.startsWith('u1') || address.startsWith('utest'));

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
    if (initialMeta?.isShielded) { setLoading(false); return; }
    try {
      setLoading(true);

      const apiUrl = `${getApiUrl()}/v1/addresses/${address}?page=${currentPage}&limit=${PAGE_SIZE}`;

      const crossChainUrl = `${getApiUrl()}/v1/crosschain/addresses/${encodeURIComponent(address)}`;
      const priceUrl = `${getApiUrl()}/v1/network/price`;

      const [response, crossChainRes, priceRes] = await Promise.all([
        fetch(apiUrl),
        fetch(crossChainUrl).catch(() => null),
        fetch(priceUrl).catch(() => null),
      ]);

      if (!response.ok) throw new Error('Failed to fetch address data');
      const apiData = await readApiData(response);

      setTotalPages(apiData.pagination?.totalPages || 1);

      const transformedTransactions = transformTransactions(apiData, apiData.transactions || []);
      setData({
        address: apiData.address,
        balance: apiData.balance == null ? 0 : zatToZec(apiData.balance),
        type: apiData.type || 'transparent',
        transactions: transformedTransactions,
        transactionCount: apiData.txCount || apiData.transactionCount,
        note: apiData.note,
        firstSeen: apiData.firstSeen,
        lastSeen: apiData.lastSeen,
        firstFunding: apiData.firstFunding ?? null,
      });

      if (crossChainRes?.ok) {
        try {
          const ccData = await readApiData(crossChainRes);
          if (ccData && ccData.totalSwaps > 0) setCrossChain(ccData);
        } catch { /* ignore */ }
      }

      if (priceRes?.ok) {
        try {
          const pData = await readApiData(priceRes);
          setPriceData({ price: pData.price, change24h: pData.change24h });
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error('Error fetching address data:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [address, currentPage, initialMeta?.isShielded]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    let cancelled = false;
    setUaComponents(null);
    const decodeUA = async () => {
      if (!address.startsWith('u1') && !address.startsWith('utest')) {
        return;
      }

      try {
        setUaLoading(true);
        const components = await decodeUnifiedAddress(address);
        if (!cancelled) setUaComponents(components);
      } catch (error) {
        console.error('Failed to decode unified address:', error);
      } finally {
        if (!cancelled) setUaLoading(false);
      }
    };
    decodeUA();
    return () => { cancelled = true; };
  }, [address]);

  const privateLookup = initialMeta?.isShielded || isShieldedAddress(data);

  if (loading && !privateLookup) {
    return <AddressLoadingSkeleton initialMeta={initialMeta} address={address} />;
  }

  const shielded = privateLookup;
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12 animate-fade-in">
      <AddressHeader
        address={address}
        data={data}
        typeInfo={typeInfo}
      />

      <AddressHeroCard
        data={data}
        priceData={priceData}
        crossChain={crossChain}
        totalTxCount={totalTxCount}
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
