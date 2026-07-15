import UnitConverterClient from './UnitConverterClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
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
  path: '/tools/unit-converter',
  networks: ['mainnet'],
});

export default function UnitConverterPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <UnitConverterClient />
    </div>
  );
}
