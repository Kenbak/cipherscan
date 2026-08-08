'use client';

import type { AddressTab, CrossChainActivity } from './types';

interface AddressTabBarProps {
  activeTab: AddressTab;
  totalTxCount: number;
  crossChain: CrossChainActivity | null;
  onTabChange: (tab: AddressTab) => void;
}

export function AddressTabBar({
  activeTab,
  totalTxCount,
  crossChain,
  onTabChange,
}: AddressTabBarProps) {
  return (
    <div id="transactions-section" className="mb-6 md:mb-8 animate-fade-in-up stagger-3">
      <div className="flex items-center gap-6 border-b border-cipher-border mb-0">
        <button
          onClick={() => onTabChange('transactions')}
          className={`pb-2 font-mono text-xs tracking-wider uppercase transition-colors ${
            activeTab === 'transactions'
              ? 'text-primary border-b-2 border-cipher-cyan -mb-[1px]'
              : 'text-muted hover:text-secondary'
          }`}
        >
          Transactions <span className="ml-1 text-[10px] opacity-70">{totalTxCount}</span>
        </button>
        {crossChain && crossChain.totalSwaps > 0 && (
          <button
            onClick={() => onTabChange('crosschain')}
            className={`pb-2 font-mono text-xs tracking-wider uppercase transition-colors ${
              activeTab === 'crosschain'
                ? 'text-primary border-b-2 border-cipher-cyan -mb-[1px]'
                : 'text-muted hover:text-secondary'
            }`}
          >
            Bridges <span className="ml-1 text-[10px] opacity-70">{crossChain.totalSwaps}</span>
          </button>
        )}
      </div>
    </div>
  );
}
