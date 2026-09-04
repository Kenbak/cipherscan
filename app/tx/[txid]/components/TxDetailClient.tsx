'use client';

import { Tabs } from '@/components/ui/Tabs';
import type { TxMeta } from '@/lib/seo';
import { classifyTransaction } from './tx-classification';
import { useTransactionPage } from './useTransactionPage';
import { TxLoadingSkeleton } from './TxLoadingSkeleton';
import { TxNotFoundView } from './TxNotFoundView';
import { MempoolPendingView } from './MempoolPendingView';
import { TxHeaderBadges } from './TxHeaderBadges';
import { TxHeroCard } from './TxHeroCard';
import { TxOverview } from './TxOverview';
import { InputsOutputsSection } from './InputsOutputsSection';
import { RawDataSection } from './RawDataSection';

interface TxDetailClientProps {
  txid: string;
  /** Server-resolved summary from `getTxResolution` — seeds the loading state. */
  initialMeta?: TxMeta | null;
}

export default function TxDetailClient({ txid, initialMeta = null }: TxDetailClientProps) {
  const {
    data,
    loading,
    lookupState,
    blockFallbackChecked,
    copiedText,
    copyToClipboard,
    activeTab,
    setActiveTab,
    rawData,
    setRawData,
    rawLoading,
    setRawLoading,
    priceUsd,
    mempoolTx,
    mempoolChecked,
    mempoolConfirming,
    mempoolElapsed,
  } = useTransactionPage(txid);

  if (loading) {
    return <TxLoadingSkeleton initialMeta={initialMeta} />;
  }

  if (!data) {
    if (mempoolTx) {
      return (
        <MempoolPendingView
          txid={txid}
          mempoolTx={mempoolTx}
          mempoolConfirming={mempoolConfirming}
          mempoolElapsed={mempoolElapsed}
          copiedText={copiedText}
          onCopy={copyToClipboard}
        />
      );
    }

    return (
      <TxNotFoundView
        lookupState={lookupState}
        blockFallbackChecked={blockFallbackChecked}
        mempoolChecked={mempoolChecked}
        txid={txid}
      />
    );
  }

  const classification = classifyTransaction(data);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-6 sm:pb-12 animate-fade-in">
      <TxHeaderBadges data={data} classification={classification} />

      <TxHeroCard data={data} classification={classification} priceUsd={priceUsd} />

      <div className="mb-6 animate-fade-in-up stagger-2">
        <Tabs
          tabs={[
            { id: 'summary', label: 'Overview' },
            { id: 'io', label: 'Inputs / Outputs' },
            { id: 'raw', label: 'Raw' },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'summary' && (
        <TxOverview data={data} classification={classification} />
      )}

      {activeTab === 'io' && (
        <InputsOutputsSection
          data={data}
          classification={classification}
          copiedText={copiedText}
          onCopy={copyToClipboard}
        />
      )}

      {activeTab === 'raw' && (
        <RawDataSection
          txid={txid}
          rawData={rawData}
          setRawData={setRawData}
          rawLoading={rawLoading}
          setRawLoading={setRawLoading}
        />
      )}
    </div>
  );
}
