import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import { Suspense } from 'react';
import MempoolLiveClient from './MempoolLiveClient';

export const metadata = buildPageMetadata({
  title: 'Mempool Live — Zcash Network Screensaver | ZecBlock',
  description: 'Watch pending Zcash transactions in a full-screen mempool visualization for passive monitoring.',
  path: '/mempool/live',
});

export default function MempoolLivePage() {
  // The client reads ?view= via useSearchParams, which Next requires to sit
  // under a Suspense boundary or the route cannot be statically prerendered.
  return (
    <>
    <div className="sr-only"><h1>Zcash Mempool Live</h1><p>A full-screen visualization of pending Zcash transactions observed by ZecBlock.</p></div>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'WebPage', name: 'Zcash Mempool Live',
      url: `${getBaseUrl()}/mempool/live`, isPartOf: { '@id': `${getBaseUrl()}/#website` },
    }) }} />
    <Suspense fallback={<div className="fixed inset-0 z-[9999] bg-cipher-bg-dark" />}>
      <MempoolLiveClient />
    </Suspense>
    </>
  );
}
