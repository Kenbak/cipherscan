'use client';

import Link from 'next/link';
import { PageSectionNav } from '@/components/PageSectionNav';

const SECTIONS = [
  { id: 'network-overview', label: 'Overview' },
  { id: 'network-supply', label: 'Supply' },
] as const;

export function NetworkSectionNav() {
  return (
    <div className="flex items-center gap-4">
      <PageSectionNav sections={SECTIONS} ariaLabel="Network page sections" />
      <Link
        href="/network/nodes"
        className="text-xs font-mono px-3 py-1.5 rounded-md bg-cipher-card border border-cipher-border text-secondary hover:text-primary hover:border-accent/50 transition-colors"
      >
        Nodes Explorer
      </Link>
    </div>
  );
}
