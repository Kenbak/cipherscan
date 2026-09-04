import { SkeletonTable } from '@/components/ui';

export default function AppLoading() {
  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      aria-busy="true"
      aria-label="Loading CipherScan"
    >
      <div className="mb-10 space-y-3 text-center">
        <div className="mx-auto h-8 w-72 max-w-full animate-pulse rounded-md bg-glass-3" />
        <div className="mx-auto h-4 w-[32rem] max-w-full animate-pulse rounded bg-glass-3" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <SkeletonTable rows={6} rowHeight="h-12" />
        <SkeletonTable rows={6} rowHeight="h-12" />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        Loading page data
      </span>
    </div>
  );
}
