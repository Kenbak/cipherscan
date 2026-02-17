import type { Metadata } from 'next';
import BroadcastClient from './BroadcastClient';

export const metadata: Metadata = {
  title: 'Broadcast Transaction - Submit Raw Zcash TX | CipherScan',
  description: 'Broadcast a pre-signed raw Zcash transaction to the network via a live Zebra node. No private keys required — transactions must be fully signed before submitting.',
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
    <div className="min-h-screen py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <BroadcastClient />
      </div>
    </div>
  );
}
