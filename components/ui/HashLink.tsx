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
  responsive = false,
  accent = 'cyan',
  linkClassName,
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
  /** Table mode: shorter truncation (8/-4) on mobile, lead/tail on sm+ */
  responsive?: boolean;
  /** Hover accent for links (purple for shielded contexts) */
  accent?: 'cyan' | 'purple';
  /** Extra classes on the link/code element itself */
  linkClassName?: string;
  className?: string;
}) {
  const hover = accent === 'purple' ? 'hover:text-cipher-purple' : 'hover:text-cipher-cyan';

  const display = full ? (
    value
  ) : responsive ? (
    <>
      <span className="sm:hidden">{truncate(value, 8, 4)}</span>
      <span className="hidden sm:inline">{truncate(value, lead, tail)}</span>
    </>
  ) : (
    truncate(value, lead, tail)
  );

  const text = href ? (
    <Link
      href={href}
      title={value}
      className={linkClassName ?? `font-mono text-xs text-primary ${hover} transition-colors truncate ${full ? 'break-all' : ''}`}
    >
      {display}
    </Link>
  ) : (
    <code title={value} className={linkClassName ?? `font-mono text-xs text-secondary ${full ? 'break-all' : ''}`}>
      {display}
    </code>
  );

  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      {text}
      {copy && <CopyButton text={value} size="xs" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" />}
    </span>
  );
}
