import { zatToZec } from '@/lib/format-numbers';
import type { AddressData, Transaction } from './types';

export function transformTransactions(apiData: { address: string }, txList: unknown[]): Transaction[] {
  return txList.map((rawTx) => {
    const tx = rawTx as {
      hasOrchard?: boolean;
      hasSapling?: boolean;
      hasIronwood?: boolean;
      netChange: number;
      counterparty?: string;
      txid: string;
      blockTime: number;
      blockHeight?: number;
      txIndex?: number;
      inputValue?: number;
      outputValue?: number;
      senderCount?: number;
    };
    const hasShieldedActivity = tx.hasOrchard || tx.hasSapling || tx.hasIronwood;
    const isReceiving = tx.netChange > 0;
    const isSending = tx.netChange < 0;

    let from = null;
    let to = null;

    if (isReceiving) {
      to = apiData.address;
      if (tx.counterparty) {
        from = tx.counterparty;
      } else if (hasShieldedActivity) {
        from = 'shielded';
      }
    } else if (isSending) {
      from = apiData.address;
      if (tx.counterparty) {
        to = tx.counterparty;
      } else if (hasShieldedActivity) {
        to = 'shielded';
      }
    }

    return {
      txid: tx.txid,
      timestamp: tx.blockTime,
      amount: Math.abs(zatToZec(tx.netChange)),
      type: isReceiving ? 'received' as const : 'sent' as const,
      blockHeight: tx.blockHeight,
      from,
      to,
      isCoinbase: tx.txIndex === 0 && tx.inputValue === 0 && !hasShieldedActivity && tx.senderCount === 0,
      isShielded: hasShieldedActivity && tx.inputValue === 0 && tx.outputValue === 0,
      isDeshielding: !tx.counterparty && (tx.outputValue ?? 0) > 0 && hasShieldedActivity && isReceiving,
      isShielding: !tx.counterparty && hasShieldedActivity && isSending,
    };
  });
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }
  if (diffMins > 0) {
    return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

export function formatAbsoluteDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Long-form date for summary prose, e.g. "September 2, 2023". */
export function formatHumanDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getTypeInfo(type: AddressData['type']) {
  switch (type) {
    case 'shielded':
      return {
        label: 'SHIELDED',
        color: 'purple',
        description: 'Private address - balance and transactions are encrypted',
      };
    case 'unified':
      return {
        label: 'UNIFIED',
        color: 'purple',
        description: 'Can receive both shielded and transparent funds',
      };
    case 'transparent':
    default:
      return {
        label: 'TRANSPARENT',
        color: 'muted',
        description: 'Public address - all transactions are visible',
      };
  }
}

export function isShieldedAddress(data: AddressData | null): boolean {
  return data?.type === 'shielded' && !!data?.note && (
    data.note.includes('Shielded address') ||
    data.note.includes('Fully shielded unified address')
  );
}

export function hasNoTransactions(data: AddressData | null): boolean {
  return !!data?.note?.includes('no transaction history yet');
}

export function hasIndexingIssue(
  data: AddressData | null,
  isShielded: boolean,
  noTransactions: boolean,
): boolean {
  return !isShielded && !noTransactions && !!data?.note && (
    data.note.includes('not found') ||
    data.note.includes('indexing') ||
    data.note.includes('Unable to connect')
  );
}
