import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learn Zcash - Beginner Guide to ZEC Privacy & Shielded Transactions | CipherScan',
  description: 'Learn how Zcash works: zero-knowledge proofs, shielded transactions, Sapling & Orchard pools, viewing keys, and privacy best practices. Beginner-friendly guide.',
  keywords: ['learn zcash', 'zcash guide', 'zcash tutorial', 'what is zcash', 'zcash privacy', 'zero knowledge proofs', 'zcash shielded transactions explained', 'ZEC beginner guide', 'zcash education'],
  openGraph: {
    title: 'Learn Zcash - Privacy & Shielded Transactions Guide | CipherScan',
    description: 'Beginner-friendly guide to Zcash: zero-knowledge proofs, shielded transactions, and privacy best practices.',
    url: 'https://cipherscan.app/learn',
  },
  alternates: {
    canonical: 'https://cipherscan.app/learn',
  },
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
