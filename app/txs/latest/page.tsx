import type { Metadata } from 'next';
import { renderTransactionsPage, parseTransactionsRequest, getArchiveCanonicalPath, hasShieldedSubFilters } from '../render';
import { buildPageMetadata } from '@/lib/seo';

export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const request = parseTransactionsRequest({});
  const isStableArchive = (request.type === 'all' || (request.type === 'shielded' && !hasShieldedSubFilters(request)))
    && (request.page === 1 || request.direction === 'next')
    && request.pageParamConsistent;

  return buildPageMetadata({
    title: 'Latest Zcash Transactions | CipherScan',
    description: 'Browse the latest Zcash transactions including shielded, transparent, and coinbase transactions. Real-time transaction explorer.',
    path: isStableArchive ? getArchiveCanonicalPath(request) : '/txs',
    index: isStableArchive && request.page === 1,
    keywords: ['zcash transactions', 'zcash transaction explorer', 'ZEC transactions', 'zcash shielded transactions', 'zcash tx'],
  });
}

export default function LatestTransactionsPage() {
  return renderTransactionsPage(Promise.resolve({}), 'shell');
}
