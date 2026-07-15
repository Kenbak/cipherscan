import BroadcastClient from './BroadcastClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Broadcast a Zcash Transaction | CipherScan',
  description: 'Broadcast a fully signed raw Zcash transaction through CipherScan\'s Zebra node. No private key is required or submitted.',
  keywords: [
    'broadcast zcash transaction',
    'sendrawtransaction zcash',
    'zcash push transaction',
    'submit zcash tx',
    'zcash raw transaction broadcast',
    'zebra sendrawtransaction',
    'zcash developer tool',
  ],
  path: '/tools/broadcast',
});

export default function BroadcastPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <BroadcastClient />
    </div>
  );
}
