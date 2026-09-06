import { Metadata } from 'next';
import { Suspense } from 'react';
import MempoolLiveClient from './MempoolLiveClient';

export const metadata: Metadata = {
  title: 'Mempool Live — Zcash Network Screensaver | ZecBlock',
  description: 'Watch Zcash transactions flow in real time. A full-screen ambient visualization of the mempool — perfect for dashboards and passive monitoring.',
  robots: { index: true, follow: true },
};

export default function MempoolLivePage() {
  // The client reads ?view= via useSearchParams, which Next requires to sit
  // under a Suspense boundary or the route cannot be statically prerendered.
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[9999] bg-cipher-bg-dark" />}>
      <MempoolLiveClient />
    </Suspense>
  );
}
