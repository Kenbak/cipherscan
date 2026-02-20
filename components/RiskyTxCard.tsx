'use client';

import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
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
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

function TxLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-muted/40 hover:text-cipher-cyan transition-colors shrink-0" title="View transaction">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </Link>
  );
}

export function RiskyTxCard({ tx }: RiskyTxCardProps) {
  const isHigh = tx.warningLevel === 'HIGH';
  const shieldAddress = tx.shieldAddresses?.[0];
  const deshieldAddress = tx.deshieldAddresses?.[0];
  const hasAddresses = shieldAddress && deshieldAddress;

  const timeDeltaDisplay = tx.timeDelta
    ?.replace(' after', ' later')
    ?.replace('1 minutes', '1 minute')
    ?.replace('1 hours', '1 hour')
    ?.replace('1 days', '1 day') || tx.timeDelta;

  return (
    <div className="card card-compact">
      {/* Header — monospace, unified severity */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className={`w-3.5 h-3.5 ${isHigh ? 'text-red-400' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className={`text-xs font-mono font-semibold tracking-wide uppercase ${isHigh ? 'text-red-400' : 'text-yellow-500'}`}>
            {isHigh ? 'High' : 'Med'}
            <span className="opacity-30 mx-1">·</span>
            {tx.score}/100
          </span>
        </div>
        <span className="text-[11px] text-muted font-mono">
          {formatRelativeTime(tx.deshieldTime)}
        </span>
      </div>

      {/* Horizontal flow — 3-column grid for tight blocks */}
      <div className="grid grid-cols-[auto_1fr_auto] gap-y-0.5 items-center">
        {/* Row 1: Action labels */}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/70" />
          <span className="text-[10px] font-mono font-medium text-purple-400 uppercase tracking-wider">Shield</span>
        </div>
        <div />
        <div className="flex items-center gap-1.5 justify-end">
          <span className="text-[10px] font-mono font-medium text-orange-400 uppercase tracking-wider">Unshield</span>
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400/70" />
        </div>

        {/* Row 2: Amounts + connecting line */}
        <span className="font-mono text-sm font-semibold text-primary tabular-nums">
          {tx.shieldAmount.toFixed(4)} ZEC
        </span>
        <div className="flex items-center mx-2 sm:mx-4">
          <div className="flex-1 h-px" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(167,139,250,0.2) 0px, rgba(167,139,250,0.2) 2px, transparent 2px, transparent 6px)' }} />
          <span className="text-[10px] font-mono text-muted/40 px-2 sm:px-3 whitespace-nowrap">
            {timeDeltaDisplay}
          </span>
          <div className="flex-1 h-px" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(167,139,250,0.2) 0px, rgba(167,139,250,0.2) 2px, transparent 2px, transparent 6px)' }} />
        </div>
        <span className="font-mono text-sm font-semibold text-primary tabular-nums text-right">
          {tx.deshieldAmount.toFixed(4)} ZEC
        </span>

        {/* Row 3: Addresses + tx links */}
        <div className="flex items-center gap-1 min-w-0">
          {shieldAddress ? (
            <AddressDisplay address={shieldAddress} className="text-[11px]" />
          ) : (
            <span className="font-mono text-[11px] text-muted truncate">{truncateTxid(tx.shieldTxid)}</span>
          )}
          <TxLink href={`/tx/${tx.shieldTxid}`} />
        </div>
        <div />
        <div className="flex items-center gap-1 min-w-0 justify-end">
          <TxLink href={`/tx/${tx.deshieldTxid}`} />
          {deshieldAddress ? (
            <AddressDisplay address={deshieldAddress} className="text-[11px]" />
          ) : (
            <span className="font-mono text-[11px] text-muted truncate">{truncateTxid(tx.deshieldTxid)}</span>
          )}
        </div>
      </div>

      {/* Conclusion — dynamic, uses actual tx data */}
      <p className="text-[11px] text-muted mt-3 leading-relaxed">
        {hasAddresses
          ? `${tx.shieldAmount.toFixed(4)} ZEC shielded then sent to a different address ${timeDeltaDisplay}, an observer could link both addresses to the same person.`
          : `${tx.shieldAmount.toFixed(4)} ZEC shielded then unshielded ${timeDeltaDisplay}, the matching amount makes this traceable.`}
      </p>
    </div>
  );
}
