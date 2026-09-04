import { PageHeader, SkeletonTable } from '@/components/ui';

/**
 * Route-level Suspense fallback for client-side navigations into `/txs`
 * (a high-traffic list page). The server page itself SSRs the first page of
 * data, so this only shows during the brief window of a client-side route
 * transition before the new route's server payload streams in.
 */
export default function TxsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
      <PageHeader eyebrow="ALL_TRANSACTIONS" title="Latest Zcash Transactions" />
      <SkeletonTable rows={25} className="mt-4" label="Loading transactions…" />
    </div>
  );
}
