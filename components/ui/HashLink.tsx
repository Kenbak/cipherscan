'use client';

import Link from 'next/link';
import { CopyButton } from '@/components/CopyButton';

function truncate(value: string, lead: number, tail: number): string {
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

/**
 * HashLink — the one way to render a hash, txid, or address.
 *
 * Truncated mono text with the full value on hover (title), an optional
 * link, and an optional one-click copy button. Use everywhere instead of
 * hand-rolled `slice(0, 8)}...{slice(-6)` so truncation and styling stay
 * identical across the app.
 */
export function HashLink({
  value,
  href,
  lead = 8,
  tail = 6,
  copy = true,
  full = false,
  className = '',
}: {
  /** The full hash / txid / address */
  value: string;
  /** Optional link target, e.g. `/tx/${txid}` — omit for plain text */
  href?: string;
  /** Leading characters to keep when truncating */
  lead?: number;
  /** Trailing characters to keep when truncating */
  tail?: number;
  /** Show the copy button */
  copy?: boolean;
  /** Render the full untruncated value (still gets mono styling + copy) */
  full?: boolean;
  className?: string;
}) {
  const display = full ? value : truncate(value, lead, tail);

  const text = href ? (
    <Link
      href={href}
      title={value}
      className={`font-mono text-cipher-cyan hover:underline ${full ? 'break-all' : ''}`}
    >
      {display}
    </Link>
  ) : (
    <code title={value} className={`font-mono text-secondary ${full ? 'break-all' : ''}`}>
      {display}
    </code>
  );

  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      {text}
      {copy && <CopyButton text={value} size="xs" />}
    </span>
  );
}
