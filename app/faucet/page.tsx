import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FaucetClient from './FaucetClient';
import { isTestnet } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Testnet Faucet | CipherScan',
  description: 'Get TAZ for your Orchard Unified Address',
  openGraph: {
    title: 'Zcash Testnet Faucet | CipherScan',
    description: 'Get TAZ for your Orchard Unified Address',
    url: 'https://testnet.cipherscan.app/faucet',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://testnet.cipherscan.app/faucet',
  },
};

export default function FaucetPage() {
  if (!isTestnet) notFound();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <FaucetClient />
    </div>
  );
}
