import Link from 'next/link';
import type { AskTransfers as TransferResult } from '@/lib/ask/chat';

function amount(value: string) {
  const zat = BigInt(value);
  return `${(zat / BigInt(100000000)).toLocaleString('en-US')}.${(zat % BigInt(100000000)).toString().padStart(8, '0').replace(/0+$/, '') || '00'}`;
}
const utc = (value: string | number) => new Date(typeof value === 'number' ? value * 1000 : value).toISOString().slice(0, 19).replace('T', ' ');
export function AskTransfers({ result }: { result?: TransferResult }) {
  if (!result) return null;
  return <div className="mt-4 min-w-0 space-y-5">
    <p className="text-caption text-muted">{utc(result.start)} — {utc(result.end)} UTC · {result.pool === 'all' ? 'All pools' : result.pool}</p>
    {result.groups.map(group => <section key={group.kind}>
      <h3 className="mb-2 text-sm font-medium">{group.kind === 'latest' ? 'Latest' : 'Largest'} {result.direction === 'deshield' ? 'deshields' : 'shields'}</h3>
      {group.kind === 'largest' && !result.complete ? <p className="text-sm text-muted">The full window could not be checked. No largest ranking is shown.</p> : !group.rows.length ? <p className="text-sm text-muted">No matching indexed transactions in this window.</p> : <div className="overflow-x-auto rounded-lg border border-cipher-border"><table className="w-full text-left text-xs">
        <caption className="sr-only">{group.kind} public {result.direction} transactions in the stated UTC window</caption>
        <thead className="border-b border-cipher-border text-muted"><tr><th scope="col" className="p-3">Transaction</th><th scope="col" className="p-3">ZEC</th><th scope="col" className="p-3">Time (UTC)</th><th scope="col" className="p-3">Pool</th></tr></thead>
        <tbody>{group.rows.map(row => <tr key={row.txid} className="border-b border-cipher-border last:border-0"><td className="p-3"><Link href={`/tx/${row.txid}`} title={row.txid} className="font-mono text-cipher-gold hover:underline">{row.txid.slice(0, 8)}…{row.txid.slice(-6)}</Link></td><td className="whitespace-nowrap p-3 font-mono tabular-nums">{amount(row.amountZat)}</td><td className="whitespace-nowrap p-3 text-secondary">{utc(row.blockTime)}</td><td className="p-3 capitalize text-secondary">{row.pools.join(', ')}</td></tr>)}</tbody>
      </table></div>}
    </section>)}
    <p className="text-caption text-muted">Retrieved {utc(result.retrievedAt)} UTC. Public transaction flow amounts.{result.groups.some(group => group.rows.some(row => row.amountAuthority === 'legacy-reported-zec')) ? ' Amounts use the source’s reported ZEC values.' : ''}</p>
  </div>;
}
