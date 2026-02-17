import type { Metadata } from 'next';
import BroadcastClient from './BroadcastClient';

export const metadata: Metadata = {
  title: 'Broadcast Transaction - Submit Raw Zcash TX | CipherScan',
  description: 'Broadcast a pre-signed raw Zcash transaction to the network via a live Zebra node. No private keys required, transactions must be fully signed before submitting.',
  keywords: [
    'broadcast zcash transaction',
    'sendrawtransaction zcash',
    'zcash push transaction',
    'submit zcash tx',
    'zcash raw transaction broadcast',
    'zebra sendrawtransaction',
    'zcash developer tool',
  ],
  openGraph: {
    title: 'Broadcast Zcash Transaction | CipherScan',
    description: 'Submit a pre-signed raw transaction to the Zcash network.',
    url: 'https://cipherscan.app/tools/broadcast',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cipherscan.app/tools/broadcast',
  },
};

export default function BroadcastPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <BroadcastClient />
    </div>
  );
}
