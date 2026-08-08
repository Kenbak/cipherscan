import type { BridgeData } from './types';

export function BridgeExplorerLinks({ bridges }: { bridges: BridgeData[] }) {
  if (bridges.length === 0) return null;

  const explorerNames: Record<string, string> = {
    eth: 'Etherscan',
    sol: 'Solscan',
    btc: 'Mempool.space',
    near: 'NearBlocks',
    doge: 'DogeChain',
    xrp: 'XRPScan',
    arb: 'Arbiscan',
    base: 'BaseScan',
    pol: 'PolygonScan',
    avax: 'Snowtrace',
    bsc: 'BscScan',
    op: 'Optimism Explorer',
    tron: 'TronScan',
  };

  return (
    <div>
      {bridges.map((b, i) => {
        if (!b.explorerUrl) return null;
        const explorerName = explorerNames[b.otherChain] || `${b.otherChain.toUpperCase()} Explorer`;
        return (
          <a
            key={i}
            href={b.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mr-3 text-xs text-cipher-cyan hover:text-cipher-cyan/80 transition-colors font-mono"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            View {b.otherChain.toUpperCase()} tx on {explorerName}
          </a>
        );
      })}
    </div>
  );
}
