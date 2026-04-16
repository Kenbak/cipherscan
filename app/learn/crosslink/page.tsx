import { CrosslinkLearn } from '@/components/CrosslinkLearn';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learn Crosslink - PoW+PoS Finality, Staking & Seasons | CipherScan',
  description: 'Learn how Crosslink works: hybrid PoW/PoS finality, staking days, finalizers, delegation bonds, and how to earn real ZEC by participating in Season 1.',
  keywords: ['crosslink', 'zcash crosslink', 'proof of stake', 'finality', 'staking', 'finalizer', 'cTAZ', 'zcash staking'],
};

export default function CrosslinkLearnPage() {
  return <CrosslinkLearn />;
}
