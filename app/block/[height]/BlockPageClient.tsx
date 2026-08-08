'use client';

import { useState, useEffect, useRef } from 'react';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { getCoinbaseClientEmoji, getCoinbaseClientInfo } from '@/lib/coinbase-client';
import {
  BlockPageSkeleton,
  BlockPageError,
  OrphanedBlockBanner,
  BlockPageHeader,
  NetworkUpgradeBanner,
  BlockInfoCard,
  BlockTransactionsSection,
  transformExpressBlockData,
  type BlockData,
  type BlockPageClientProps,
} from './components';

export type { BlockPageSummary } from './components';

export default function BlockPageClient({
  identifier,
  initialSummary,
}: BlockPageClientProps) {
  const height = identifier;
  const [data, setData] = useState<BlockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not-found' | 'unavailable' | null>(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const txSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/block/${height}`
          : `/api/block/${height}`;

        const response = await fetch(apiUrl);

        if (response.status === 404 || response.status === 410) {
          setData(null);
          setLoadError('not-found');
          return;
        }

        if (!response.ok) {
          throw new Error(`Block API returned ${response.status}`);
        }

        const blockData = await response.json();

        if (usePostgresApiClient()) {
          setData(transformExpressBlockData(blockData));
        } else {
          setData(blockData);
        }
      } catch (error) {
        console.error('Error fetching block:', error);
        setData(null);
        setLoadError('unavailable');
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
    return <BlockPageSkeleton identifier={identifier} initialSummary={initialSummary} />;
  }

  if (!data) {
    return (
      <BlockPageError
        identifier={identifier}
        initialSummary={initialSummary}
        loadError={loadError}
      />
    );
  }

  const coinbaseClientEmoji = getCoinbaseClientEmoji(data.coinbaseHex);
  const coinbaseClientInfo = getCoinbaseClientInfo(data.coinbaseHex);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 animate-fade-in">
      <OrphanedBlockBanner data={data} />
      <BlockPageHeader
        data={data}
        coinbaseClientEmoji={coinbaseClientEmoji}
        coinbaseClientInfo={coinbaseClientInfo}
      />
      <NetworkUpgradeBanner data={data} />
      <BlockInfoCard
        data={data}
        showMoreDetails={showMoreDetails}
        onToggleMoreDetails={() => setShowMoreDetails(!showMoreDetails)}
        onScrollToTransactions={scrollToTransactions}
      />
      <BlockTransactionsSection ref={txSectionRef} data={data} />
    </div>
  );
}
