import { TxLoadingSkeleton } from './components/TxLoadingSkeleton';

/**
 * Route-level Suspense fallback for client-side navigations into
 * `/tx/[txid]`. No `initialMeta` is available at this layer (route
 * `loading.tsx` never receives params/data), so this renders the same
 * skeleton `TxDetailClient` falls back to before its own resolution arrives.
 */
export default function TxLoading() {
  return <TxLoadingSkeleton />;
}
