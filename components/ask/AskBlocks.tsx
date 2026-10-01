import Link from 'next/link';
import type { AskBlocks as BlockResult } from '@/lib/ask/chat';

export function AskBlocks({ result, expanded = false }: { result?: BlockResult; expanded?: boolean }) {
  if (!result) return null;
  if (result.status === 'orphaned' && result.query.identifier) return <Link href={`/block/${result.query.identifier}`} className="mt-3 block text-sm text-cipher-gold hover:underline">Inspect orphaned block ↗</Link>;
  if (!result.rows.length) return null;
  return <details open={expanded || result.rows.length === 1} className="mt-4 rounded-lg border border-cipher-border p-3 text-sm">
    <summary className="cursor-pointer text-cipher-gold">{result.rows.length === 1 ? 'Block details' : `${result.rows.length} latest indexed blocks · unfiltered`}</summary>
    <ul className="mt-3 space-y-3" aria-label="Block results">{result.rows.map(block => <li key={block.hash} className="border-t border-cipher-border pt-3 first:border-0 first:pt-0">
      <Link href={`/block/${block.hash}`} prefetch={false} className="font-mono text-cipher-gold hover:underline">Block {block.height.toLocaleString('en-US')} ↗</Link>
      <p className="mt-1 text-xs text-secondary">{block.transactions.toLocaleString('en-US')} {block.transactions === 1 ? 'transaction' : 'transactions'} · {block.size.toLocaleString('en-US')} bytes</p>
      <p className="mt-1 text-caption text-muted">{new Date(block.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC</p>
    </li>)}</ul>
  </details>;
}
