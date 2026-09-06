import { PageLoading } from '@/components/ui/PageLoading';

export default function Loading() {
  return <PageLoading layout="wallets" title="Wallet Anonymity Analysis" eyebrow="WALLET_ANALYSIS" subtitle="How distinguishable is your wallet on-chain?" />;
}
