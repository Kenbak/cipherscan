import { BlockPageSkeleton } from './components';

/**
 * Route-level Suspense fallback for client-side navigations into
 * `/block/[height]` (e.g. clicking a block link from `/blocks`). Reuses the
 * same skeleton the client component shows while fetching full block data,
 * so there's no visual seam between the route transition and the in-page
 * loading state.
 */
export default function BlockLoading() {
  return <BlockPageSkeleton identifier="…" initialSummary={null} />;
}
