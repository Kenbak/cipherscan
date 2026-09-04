import { AddressLoadingSkeleton } from './components';

/**
 * Route-level Suspense fallback for client-side navigations into
 * `/address/[address]`. No `initialMeta` is available at this layer (route
 * `loading.tsx` never receives params/data), so this renders the same
 * skeleton `AddressDetailClient` falls back to before its own resolution
 * arrives.
 */
export default function AddressLoading() {
  return <AddressLoadingSkeleton />;
}
