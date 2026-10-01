import { PageLoading } from '@/components/ui/PageLoading';

export default function Loading() {
  return <PageLoading layout="mempool" title="Zcash Mempool — Pending Transactions" eyebrow="MEMPOOL_VIEWER" subtitle="Transactions waiting to be mined into the next Zcash block, streamed in real time. Shielded, transparent, and mixed transactions are labeled as they enter the queue." />;
}
