'use client';

import { PageSectionNav } from '@/components/PageSectionNav';

const SECTIONS = [
  { id: 'network-overview', label: 'Overview' },
  { id: 'network-supply', label: 'Supply' },
] as const;

export function NetworkSectionNav() {
  return <PageSectionNav sections={SECTIONS} ariaLabel="Network page sections" />;
}
