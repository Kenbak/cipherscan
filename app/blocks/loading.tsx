import { PageHeader, SkeletonTable } from '@/components/ui';

/**
 * Route-level Suspense fallback for client-side navigations into `/blocks`
 * (a high-traffic list page). The server page itself SSRs the first page of
 * data with `revalidate: 30`, so this only shows during the brief window of
 * a client-side route transition (e.g. clicking "Blocks" in the nav) before
 * the new route's server payload streams in.
 */
export default function BlocksLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
      <PageHeader eyebrow="ALL_BLOCKS" title="Latest Zcash Blocks" />
      <SkeletonTable rows={25} className="mt-4" label="Loading blocks…" />
    </div>
  );
}
