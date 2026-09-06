import { PageLoading } from '@/components/ui/PageLoading';

export default function Loading() {
  return <PageLoading layout="network" title="Zcash Network" eyebrow="NETWORK_STATUS" subtitle="Protocol, issuance, block production and the nodes we observe." />;
}
