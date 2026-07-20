import { Metadata } from 'next';
import MempoolLiveClient from './MempoolLiveClient';

export const metadata: Metadata = {
  title: 'Mempool Live — Zcash Network Screensaver | CipherScan',
  description: 'Watch Zcash transactions flow in real time. A full-screen ambient visualization of the mempool — perfect for dashboards and passive monitoring.',
  robots: { index: true, follow: true },
};

export default function MempoolLivePage() {
  return <MempoolLiveClient />;
}
