'use client';

import { TokenChainIcon } from '@/components/TokenChainIcon';
import { Tooltip } from '@/components/Tooltip';

export interface WrappedZecAsset {
  id: string;
  label: string;
  issuer: string;
  chain: string;
  totalSupply: number;
  explorerUrl: string;
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}K`;
  if (amount >= 100) return amount.toFixed(2);
  return amount.toFixed(4);
}

const CHAIN_NAMES: Record<string, string> = { base: 'Base', sol: 'Solana', near: 'NEAR' };

export function WrappedZecTracker({ assets, totalWrapped }: { assets: WrappedZecAsset[]; totalWrapped: number }) {
  if (assets.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">WRAPPED_ZEC</h2>
          <Tooltip content="Live total supply of each known ZEC representation on other chains, read directly from each token's own contract via that chain's public RPC." />
        </div>
        <span className="text-xs font-mono text-muted">
          {formatAmount(totalWrapped)} <span className="text-cipher-cyan">ZEC</span> total
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {assets.map((asset) => (
          <a
            key={asset.id}
            href={asset.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan/40 transition-colors bg-glass-2 hover:bg-glass-3"
          >
            <TokenChainIcon token={asset.id === 'cbzec' ? 'cbzec' : 'zec'} chain={asset.chain} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-semibold text-primary truncate">{asset.label}</span>
                <svg className="w-2.5 h-2.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <div className="text-[10px] text-muted truncate">{asset.issuer} · {CHAIN_NAMES[asset.chain] || asset.chain}</div>
            </div>
            <span className="text-sm font-mono text-primary shrink-0">{formatAmount(asset.totalSupply)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
