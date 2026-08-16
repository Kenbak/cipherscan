'use client';

import Link from 'next/link';
import { useAddressLabel } from '@/lib/address-labels';

const CheckmarkIcon = ({ className = 'w-3 h-3' }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

interface AddressWithLabelProps {
  address: string;
  truncate?: boolean;
  linkable?: boolean;
  showFullOnHover?: boolean;
  className?: string;
}

/**
 * Displays an address with its label (if available)
 * Format: "Label (t1xxx...xxx)" or just "t1xxx...xxx" if no label
 */
export function AddressWithLabel({
  address,
  truncate = true,
  linkable = true,
  showFullOnHover = true,
  className = '',
}: AddressWithLabelProps) {
  const labelInfo = useAddressLabel(address);

  // Truncate address for display
  const truncatedAddress = truncate
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  // Labels are plain text, not badges — a badge implies a category worth
  // scanning for, but an address label is just a name. Official identities
  // get a small checkmark; unofficial guesses stay muted/lower-confidence
  // with no checkmark, same as everywhere else in prose (no per-category
  // color, to avoid the "rainbow" effect of coloring every named entity).
  const content = (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={showFullOnHover ? `${labelInfo?.description || ''}\n${address}`.trim() : undefined}
    >
      {labelInfo ? (
        <>
          <span
            className={`inline-flex items-center gap-1 font-medium ${
              labelInfo.isOfficial ? 'text-primary' : 'text-secondary italic'
            }`}
          >
            {labelInfo.isOfficial && (
              <CheckmarkIcon className="w-3 h-3 text-cipher-green shrink-0" />
            )}
            {labelInfo.label}
          </span>
          {/* Truncated address in parentheses */}
          <span className="text-muted font-mono text-xs">
            ({truncatedAddress})
          </span>
        </>
      ) : (
        /* Just the address if no label */
        <span className="font-mono">{truncatedAddress}</span>
      )}
    </span>
  );

  // Wrap in link if linkable
  if (linkable) {
    return (
      <Link
        href={`/address/${address}`}
        className="hover:text-primary transition-colors"
      >
        {content}
      </Link>
    );
  }

  return content;
}

/**
 * Simpler version that just shows label or truncated address
 * For use in tight spaces like tables
 */
export function AddressDisplay({
  address,
  className = '',
}: {
  address: string;
  className?: string;
}) {
  const labelInfo = useAddressLabel(address);
  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <Link
      href={`/address/${address}`}
      // The address is the identifying fact here (this is the hero flow
      // diagram's node in most call sites), so it rests at text-primary
      // like the block hash / reward addresses elsewhere — hover:underline
      // instead of hover:text-primary, since hovering to the same color
      // it started at wouldn't visibly change anything.
      className={`font-mono text-primary hover:underline transition-colors ${className}`}
      title={address}
    >
      {labelInfo ? labelInfo.label : truncatedAddress}
    </Link>
  );
}
