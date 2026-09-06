'use client';
import { usePathname } from 'next/navigation';
import { SkeletonTable } from '@/components/ui/EmptyState';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

/** Neutral fallback for routes without data-specific chrome. */
export default function AppLoading() {
  const pathname = usePathname();
  if (pathname === '/') return <LoadingRegion className="home-page">
    <section className="home-hero-band"><div className="home-hero max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Skeleton className="h-6 w-80" /><Skeleton className="h-5 w-full max-w-xl mt-2" />
      <div className="home-command"><Skeleton className="h-[50px] w-full" /><div className="flex gap-3 mt-3"><Skeleton className="h-7 w-32" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-24" /></div></div>
    </div></section>
    <div className="home-body max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="grid lg:grid-cols-2 gap-6">{[0, 1].map(i => <div key={i}><Skeleton className="h-5 w-40 mb-5" /><div className="card p-0 overflow-hidden"><SkeletonTable rows={5} rowHeight="h-[52px]" footer label={null} /></div></div>)}</div></div>
  </LoadingRegion>;
  return <LoadingRegion className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
    <Skeleton className="h-4 w-32 mb-4" /><Skeleton className="h-10 w-80 mb-5" /><Skeleton className="h-5 w-full max-w-2xl mb-10" />
    <div className="space-y-4 max-w-3xl"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-3/4" /></div>
  </LoadingRegion>;
}
