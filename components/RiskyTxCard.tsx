'use client';

import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';

interface RiskyTransaction {
  shieldTxid: string;
  shieldHeight: number;
  shieldTime: number;
  shieldAmount: number;
  shieldPool: string;
  shieldAddresses: string[];
  deshieldTxid: string;
  deshieldHeight: number;
  deshieldTime: number;
  deshieldAmount: number;
  deshieldPool: string;
  deshieldAddresses: string[];
  timeDelta: string;
  timeDeltaSeconds: number;
  score: number;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  scoreBreakdown: {
    amountSimilarity: number;
    timeProximity: number;
    amountRarity: number;
  };
}

interface RiskyTxCardProps {
  tx: RiskyTransaction;
}

function truncateTxid(txid: string): string {
  return `${txid.slice(0, 8)}...${txid.slice(-6)}`;
}

function truncateAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function RiskyTxCard({ tx }: RiskyTxCardProps) {
  const isHigh = tx.warningLevel === 'HIGH';
  const shieldAddress = tx.shieldAddresses?.[0];
  const deshieldAddress = tx.deshieldAddresses?.[0];
  const hasAddresses = shieldAddress && deshieldAddress;

  // Convert "after" to "later" for display
  const timeDeltaDisplay = tx.timeDelta
    ?.replace(' after', ' later')
    ?.replace('1 minutes', '1 minute')
    ?.replace('1 hours', '1 hour')
    ?.replace('1 days', '1 day') || tx.timeDelta;

  return (
    <div className="card rounded-xl overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${
        isHigh
          ? 'border-red-500/20 bg-red-500/5'
          : 'border-amber-500/20 bg-amber-500/5'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${isHigh ? 'text-red-500' : 'text-amber-500'}`}>
            {isHigh ? '⚠️ High Risk' : '⚡ Medium Risk'}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-mono ${
            isHigh
              ? 'bg-red-500/20 text-red-500'
              : 'bg-amber-500/20 text-amber-500'
          }`}>
            {tx.score}/100
          </span>
        </div>
        <span className="text-xs text-secondary">
          {formatRelativeTime(tx.deshieldTime)}
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4">
        {/* Flow visualization with amounts */}
        <div className="space-y-3">
          {/* Shield */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-xs text-green-500 font-medium shrink-0">↓ SHIELD</span>
            <div className="flex-1 flex items-center justify-between gap-2">
              <div>
                {shieldAddress ? (
                  <Link href={`/address/${shieldAddress}`} className="font-mono text-sm text-primary hover:underline">
                    {truncateAddress(shieldAddress)}
                  </Link>
                ) : (
                  <Link href={`/tx/${tx.shieldTxid}`} className="font-mono text-sm text-primary hover:underline">
                    {truncateTxid(tx.shieldTxid)}
                  </Link>
                )}
              </div>
              <span className="font-mono text-sm font-semibold text-primary">{tx.shieldAmount.toFixed(4)} ZEC</span>
            </div>
          </div>

          {/* Time arrow */}
          <div className="flex items-center gap-3 text-muted">
            <span className="w-24 shrink-0"></span>
            <span className="text-xs">↓ {timeDeltaDisplay}</span>
          </div>

          {/* Unshield */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-xs text-purple-500 font-medium shrink-0">↑ UNSHIELD</span>
            <div className="flex-1 flex items-center justify-between gap-2">
              <div>
                {deshieldAddress ? (
                  <Link href={`/address/${deshieldAddress}`} className="font-mono text-sm text-primary hover:underline">
                    {truncateAddress(deshieldAddress)}
                  </Link>
                ) : (
                  <Link href={`/tx/${tx.deshieldTxid}`} className="font-mono text-sm text-primary hover:underline">
                    {truncateTxid(tx.deshieldTxid)}
                  </Link>
                )}
              </div>
              <span className="font-mono text-sm font-semibold text-primary">{tx.deshieldAmount.toFixed(4)} ZEC</span>
            </div>
          </div>
        </div>

        {/* Conclusion - Simple italic text */}
        {hasAddresses && (
          <p className="text-sm text-secondary italic border-t border-cipher-border/30 pt-3">
            → An observer could conclude that these addresses belong to the same person.
          </p>
        )}

        {/* Transaction Links - Footer */}
        <div className="flex flex-wrap gap-4 text-xs text-muted pt-2">
          <Link href={`/tx/${tx.shieldTxid}`} className="hover:text-secondary font-mono">
            TX: {truncateTxid(tx.shieldTxid)}
          </Link>
          <Link href={`/tx/${tx.deshieldTxid}`} className="hover:text-secondary font-mono">
            TX: {truncateTxid(tx.deshieldTxid)}
          </Link>
        </div>
      </div>
    </div>
  );
}
