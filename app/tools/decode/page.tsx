import type { Metadata } from 'next';
import DecodeClient from './DecodeClient';

export const metadata: Metadata = {
  title: 'Decode Raw Transaction - Parse Zcash TX Hex | CipherScan',
  description: 'Free tool to decode raw Zcash transaction hex into human-readable fields. View inputs, outputs, shielded data, and more without broadcasting.',
  keywords: [
    'decode zcash transaction',
    'decoderawtransaction zcash',
    'zcash tx decoder',
    'zcash raw transaction parser',
    'zcash transaction hex',
    'zebra decoderawtransaction',
    'zcash developer tool',
  ],
  openGraph: {
    title: 'Decode Raw Zcash Transaction | CipherScan',
    description: 'Parse any raw Zcash transaction hex into human-readable fields.',
    url: 'https://cipherscan.app/tools/decode',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cipherscan.app/tools/decode',
  },
};

export default function DecodePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <DecodeClient />
    </div>
  );
}
