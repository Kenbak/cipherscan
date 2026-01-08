'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAddressLabel, fetchOfficialLabels } from '@/lib/address-labels';

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
  const [labelInfo, setLabelInfo] = useState<{
    label: string;
    isOfficial: boolean;
    description?: string;
    category?: string;
  } | null>(null);
  const [labelsLoaded, setLabelsLoaded] = useState(false);

  // Load labels on mount
  useEffect(() => {
    const loadLabels = async () => {
      // Fetch official labels if not already loaded
      await fetchOfficialLabels();
      setLabelInfo(getAddressLabel(address));
      setLabelsLoaded(true);
    };
    loadLabels();
  }, [address]);

  // Truncate address for display
  const truncatedAddress = truncate
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  // Get badge color based on category
  const getBadgeColor = () => {
    if (!labelInfo?.isOfficial) {
      return 'bg-gray-500/20 border-gray-500/40 text-gray-300';
    }
    switch (labelInfo.category) {
      case 'foundation':
        return 'bg-purple-500/20 border-purple-500/40 text-purple-300';
      case 'exchange':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'mining':
        return 'bg-orange-500/20 border-orange-500/40 text-orange-300';
      default:
        return 'bg-cipher-cyan/20 border-cipher-cyan/40 text-cipher-cyan';
    }
  };

  // Content to render
  const content = (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={showFullOnHover ? `${labelInfo?.description || ''}\n${address}`.trim() : undefined}
    >
      {labelInfo ? (
        <>
          {/* Label badge */}
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded border ${getBadgeColor()}`}
          >
            {labelInfo.isOfficial && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
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
        className="hover:text-cipher-cyan transition-colors"
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
  const [labelInfo, setLabelInfo] = useState<{
    label: string;
    isOfficial: boolean;
  } | null>(null);

  useEffect(() => {
    const loadLabels = async () => {
      await fetchOfficialLabels();
      setLabelInfo(getAddressLabel(address));
    };
    loadLabels();
  }, [address]);

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <Link
      href={`/address/${address}`}
      className={`font-mono hover:text-cipher-cyan transition-colors ${className}`}
      title={address}
    >
      {labelInfo ? labelInfo.label : truncatedAddress}
    </Link>
  );
}
