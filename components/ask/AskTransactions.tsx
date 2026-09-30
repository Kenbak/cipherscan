import Link from 'next/link';
import type { AskTransactions as TransactionResult } from '@/lib/ask/chat';

function fee(value: string) {
  const n = BigInt(value);
  return `${n / BigInt(100000000)}.${(n % BigInt(100000000)).toString().padStart(8, '0')} ZEC`;
}
export function AskTransactions({ result, expanded = false }: { result?: TransactionResult; expanded?: boolean }) {
  if (!result) return null;
  if (!result.rows.length) return <p className="mt-4 text-sm text-muted">No matching transaction records were returned.</p>;
  return <details open={expanded || result.rows.length === 1} className="mt-4 rounded-lg border border-cipher-border p-3 text-sm">
    <summary className="cursor-pointer text-cipher-gold">{result.rows.length === 1 ? 'Transaction details' : `${result.rows.length} latest indexed transactions · unfiltered`}</summary>
    <ul className="mt-3 space-y-3" aria-label="Transaction results">{result.rows.map(tx => <li key={tx.txid} className="border-t border-cipher-border pt-3 first:border-0 first:pt-0">
      <Link href={`/tx/${tx.txid}`} prefetch={false} className="break-all font-mono text-cipher-gold hover:underline">{tx.txid} ↗</Link>
      <p className="mt-2 text-xs text-secondary">{tx.status === 'stale' ? 'Non-canonical block' : tx.status === 'indexed' ? 'Indexed' : tx.status === 'confirmed' ? 'Confirmed' : tx.status === 'pending' ? 'Pending' : 'Status unknown'}{tx.blockHeight !== null ? ` · Block ${tx.blockHeight.toLocaleString('en-US')}` : ''}{tx.confirmations !== null ? ` · ${tx.confirmations.toLocaleString('en-US')} ${tx.confirmations === 1 ? 'confirmation' : 'confirmations'}` : ''}</p>
      {tx.coinbase || tx.pools.length ? <p className="mt-1 text-xs text-secondary">{[tx.coinbase ? 'Coinbase' : '', ...tx.pools].filter(Boolean).join(' · ')}</p> : null}
      <p className="mt-1 text-xs text-secondary">Fee: {tx.feeZat === null ? 'unavailable' : fee(tx.feeZat)}{tx.size === null ? '' : ` · ${tx.size.toLocaleString('en-US')} bytes`}</p>
      {tx.timestamp !== null ? <p className="mt-1 text-caption text-muted">Block timestamp: {new Date(tx.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC</p> : null}
    </li>)}</ul>
  </details>;
}
