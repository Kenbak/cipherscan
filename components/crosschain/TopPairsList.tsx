'use client';

import { SectionHeader } from '@/components/ui/SectionHeader';
import { TokenChainIcon } from '@/components/TokenChainIcon';

const CHAIN_NAMES: Record<string, string> = {
  btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana', near: 'NEAR',
  doge: 'Dogecoin', xrp: 'Ripple', base: 'Base', arb: 'Arbitrum',
  pol: 'Polygon', avax: 'Avalanche', trx: 'Tron', tron: 'Tron',
  apt: 'Aptos', sui: 'Sui', ton: 'TON', bnb: 'BNB Chain',
  bsc: 'BNB Chain', op: 'Optimism', ltc: 'Litecoin',
};

interface PopularPair {
  chain: string;
  token: string;
  swapCount: number;
}

export function TopPairsList({ pairs }: { pairs: PopularPair[] }) {
  if (pairs.length === 0) return null;

  const maxCount = pairs[0]?.swapCount ?? 1;

  return (
    <div className="card">
      <SectionHeader label="TOP_PAIRS" actions={<span className="text-[10px] text-muted font-mono">30d swap count</span>} />
      <div className="space-y-1">
        {pairs.map((pair, i) => {
          const pct = maxCount > 0 ? (pair.swapCount / maxCount) * 100 : 0;
          return (
            <div key={`${pair.chain}-${pair.token}`} className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg">
              <div
                className="absolute inset-0 rounded-lg bg-glass-2"
                style={{ width: `${pct}%` }}
              />
              <span className="relative text-[10px] font-mono text-muted w-4 text-right tabular-nums">{i + 1}</span>
              <div className="relative">
                <TokenChainIcon token={pair.token} chain={pair.chain} size={22} />
              </div>
              <div className="relative flex-1 min-w-0 flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-primary">{pair.token}</span>
                <span className="text-[10px] font-mono text-muted">{CHAIN_NAMES[pair.chain] || pair.chain}</span>
              </div>
              <span className="relative text-xs font-mono text-secondary tabular-nums">{pair.swapCount.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
