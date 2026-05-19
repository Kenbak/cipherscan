import type { Metadata } from 'next';
import FaucetClient from './FaucetClient';

export const metadata: Metadata = {
  title: 'Testnet Faucet — Get free TAZ | CipherScan',
  description:
    'Free testnet ZEC delivered to any transparent address. 0.5 TAZ per address every 24 hours.',
  openGraph: {
    title: 'Zcash Testnet Faucet | CipherScan',
    description: 'Get free testnet ZEC (TAZ) for development and testing.',
    url: 'https://testnet.cipherscan.app/faucet',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://testnet.cipherscan.app/faucet',
  },
};

export default function FaucetPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <FaucetClient />
    </div>
  );
}
