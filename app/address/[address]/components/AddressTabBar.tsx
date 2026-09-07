'use client';

import type { AddressTab, CrossChainActivity } from './types';

export function AddressTabBar({ activeTab, totalTxCount, crossChain, showGraph, onTabChange }: {
  activeTab: AddressTab;
  totalTxCount: number;
  crossChain: CrossChainActivity | null;
  showGraph?: boolean;
  onTabChange: (tab: AddressTab) => void;
}) {
  const tabs: { id: AddressTab; label: string; count?: number }[] = [
    { id: 'transactions', label: 'Transactions', count: totalTxCount },
    ...(showGraph ? [{ id: 'graph' as const, label: 'Address connections' }] : []),
    ...(crossChain && crossChain.totalSwaps > 0 ? [{ id: 'crosschain' as const, label: 'Bridges', count: crossChain.totalSwaps }] : []),
  ];
  return <nav id="transactions-section" aria-label="Address views" className="mb-6 flex gap-5 overflow-x-auto border-b border-cipher-border">
    {tabs.map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined}
      onClick={() => onTabChange(tab.id)}
      className={`shrink-0 px-1 py-3 text-sm font-mono border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold ${activeTab === tab.id ? 'text-primary border-cipher-gold' : 'text-muted border-transparent hover:text-primary'}`}>
      {tab.label}{tab.count !== undefined && <span className="ml-2 text-xs text-muted">{tab.count.toLocaleString('en-US')}</span>}
    </button>)}
  </nav>;
}
