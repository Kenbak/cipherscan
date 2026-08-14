'use client';

import Link from 'next/link';
import { formatHumanDate } from './helpers';
import type { AddressData } from './types';

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtZec(v: number) {
  if (v >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

interface AddressSummaryProps {
  data: AddressData;
  totalTxCount: number;
}

export function AddressSummary({ data, totalTxCount }: AddressSummaryProps) {
  const typeWord =
    data.type === 'transparent' ? 'transparent' : data.type === 'unified' ? 'unified' : 'shielded';
  const txLabel = totalTxCount === 1 ? 'transaction' : 'transactions';

  const funding = data.firstFunding;
  const firstSeen = data.firstSeen ?? null;
  const lastSeen = data.lastSeen ?? null;
  const sameDay =
    firstSeen && lastSeen && formatHumanDate(firstSeen) === formatHumanDate(lastSeen);

  const funderNode = (() => {
    if (!funding) return null;
    if (funding.isCoinbase) return null;
    if (funding.funderLabel && funding.funderAddress) {
      return (
        <Link
          href={`/address/${funding.funderAddress}`}
          className="text-cipher-cyan hover:text-primary transition-colors"
        >
          {funding.funderLabel}
        </Link>
      );
    }
    if (funding.funderAddress) {
      return (
        <Link
          href={`/address/${funding.funderAddress}`}
          className="text-cipher-cyan hover:text-primary transition-colors"
        >
          {shortAddr(funding.funderAddress)}
        </Link>
      );
    }
    return <>an unknown sender</>;
  })();

  return (
    <p className="text-sm text-muted leading-relaxed max-w-xl">
      This {typeWord} address has {totalTxCount.toLocaleString()} {txLabel} on the chain.
      {funding && funding.isCoinbase && (
        <>
          {' '}
          It first received {fmtZec(funding.amountZec)} ZEC as a mining reward on{' '}
          {formatHumanDate(funding.blockTime)}.
        </>
      )}
      {funding && !funding.isCoinbase && (
        <>
          {' '}
          It first received {fmtZec(funding.amountZec)} ZEC from {funderNode} on{' '}
          {formatHumanDate(funding.blockTime)}.
        </>
      )}
      {!funding && firstSeen && lastSeen && (
        <>
          {' '}
          {sameDay || firstSeen === lastSeen ? (
            <>Activity dates to {formatHumanDate(firstSeen)}.</>
          ) : (
            <>
              First activity was on {formatHumanDate(firstSeen)}, and the most recent was on{' '}
              {formatHumanDate(lastSeen)}.
            </>
          )}
        </>
      )}
      {funding && lastSeen && firstSeen && lastSeen !== firstSeen && (
        <> Last activity was on {formatHumanDate(lastSeen)}.</>
      )}
    </p>
  );
}
