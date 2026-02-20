import type { Metadata } from 'next';
import UnitConverterClient from './UnitConverterClient';

export const metadata: Metadata = {
  title: 'ZEC / Zatoshi Unit Converter | CipherScan',
  description: 'Convert between ZEC and zatoshis (1 ZEC = 100,000,000 zatoshis). Free Zcash unit converter for developers and users.',
  keywords: [
    'zcash unit converter',
    'zec to zatoshi',
    'zatoshi to zec',
    'zcash zatoshi',
    'ZEC converter',
    'zcash developer tool',
  ],
  openGraph: {
    title: 'ZEC / Zatoshi Unit Converter | CipherScan',
    description: 'Convert between ZEC and zatoshis. 1 ZEC = 10^8 zatoshis.',
    url: 'https://cipherscan.app/tools/unit-converter',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cipherscan.app/tools/unit-converter',
  },
};

export default function UnitConverterPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <UnitConverterClient />
    </div>
  );
}
