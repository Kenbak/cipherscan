import { PageHeader } from '@/components/ui/SectionHeader';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
    <PageHeader eyebrow="NETWORK" eyebrowHref="/network" title="Zero Indexer attestations" titleAsHeading={false}
      subtitle="Enclave evidence, connection certificates and software release observations." />
    <LoadingRegion>
      <div className="grid sm:grid-cols-3 border border-cipher-border rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-cipher-border mb-8">
        {['Registered endpoints', 'Evidence + TLS verified', 'Software releases matched'].map(label => <div key={label} className="p-5 sm:p-6"><p className="type-label text-muted mb-3">{label}</p><Skeleton className="h-8 w-16" /></div>)}
      </div>
      <div className="space-y-4">{[0, 1].map(i => <div key={i} className="card card-static p-5 sm:p-6"><Skeleton className="h-5 w-40 mb-4" /><Skeleton className="h-4 w-2/3 mb-6" /><div className="grid sm:grid-cols-3 gap-4">{[0,1,2].map(j => <Skeleton key={j} className="h-10 w-full" />)}</div></div>)}</div>
    </LoadingRegion>
  </div>;
}
