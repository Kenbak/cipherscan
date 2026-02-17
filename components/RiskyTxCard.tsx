'use client';

import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { AddressDisplay } from '@/components/AddressWithLabel';

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
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isHigh ? 'bg-red-500/10' : 'bg-amber-500/10'
          }`}>
            <svg className={`w-4 h-4 ${isHigh ? 'text-red-500' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <span className={`text-sm font-semibold ${isHigh ? 'text-red-500' : 'text-amber-500'}`}>
            {isHigh ? 'High Risk' : 'Medium Risk'}
          </span>
          <Badge color={isHigh ? 'orange' : 'muted'} className="font-mono">
            {tx.score}/100
          </Badge>
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
            <Badge color="green" className="w-24 justify-center whitespace-nowrap">
              ↓ SHIELD
            </Badge>
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 min-w-0">
              <div className="truncate">
                {shieldAddress ? (
                  <AddressDisplay address={shieldAddress} className="text-xs sm:text-sm" />
                ) : (
                  <Link href={`/tx/${tx.shieldTxid}`} className="font-mono text-xs sm:text-sm text-primary hover:text-cipher-cyan transition-colors">
                    {truncateTxid(tx.shieldTxid)}
                  </Link>
                )}
              </div>
              <span className="font-mono text-sm font-semibold text-primary shrink-0">{tx.shieldAmount.toFixed(4)} ZEC</span>
            </div>
          </div>

          {/* Time arrow */}
          <div className="flex items-center gap-3 text-muted pl-1">
            <div className="w-24 flex justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <span className="text-xs font-mono">{timeDeltaDisplay}</span>
          </div>

          {/* Unshield */}
          <div className="flex items-center gap-3">
            <Badge color="purple" className="w-24 justify-center whitespace-nowrap">
              ↑ UNSHIELD
            </Badge>
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 min-w-0">
              <div className="truncate">
                {deshieldAddress ? (
                  <AddressDisplay address={deshieldAddress} className="text-xs sm:text-sm" />
                ) : (
                  <Link href={`/tx/${tx.deshieldTxid}`} className="font-mono text-xs sm:text-sm text-primary hover:text-cipher-cyan transition-colors">
                    {truncateTxid(tx.deshieldTxid)}
                  </Link>
                )}
              </div>
              <span className="font-mono text-sm font-semibold text-primary shrink-0">{tx.deshieldAmount.toFixed(4)} ZEC</span>
            </div>
          </div>
        </div>

        {/* Conclusion - Simple italic text */}
        {hasAddresses && (
          <div className="flex items-start gap-2 pt-3 border-t border-cipher-border/30">
            <svg className="w-4 h-4 text-muted mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-secondary italic">
              An observer could conclude that these addresses belong to the same person.
            </p>
          </div>
        )}

        {/* Transaction Links - Footer */}
        <div className="flex flex-wrap gap-4 text-xs text-muted pt-3 border-t border-cipher-border/30">
          <Link href={`/tx/${tx.shieldTxid}`} className="hover:text-cipher-cyan font-mono transition-colors inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {truncateTxid(tx.shieldTxid)}
          </Link>
          <Link href={`/tx/${tx.deshieldTxid}`} className="hover:text-cipher-cyan font-mono transition-colors inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {truncateTxid(tx.deshieldTxid)}
          </Link>
        </div>
      </div>
    </div>
  );
}
