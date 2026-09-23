import { buildPageMetadata, getBaseUrl } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Forks & Orphaned Blocks | ZecBlock',
  description: 'Monitor Zcash forks, orphaned blocks, competing tips, reorg depth, affected miners, and consensus health in real time.',
  keywords: ['zcash fork', 'zcash reorg', 'zcash orphaned blocks', 'zcash chain fork', 'zcash consensus', 'zcash fork watch'],
  path: '/reorgs',
  index: true,
});

export default function UnclesLayout({ children }: { children: React.ReactNode }) {
  const base = getBaseUrl();
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${base}/reorgs#webpage`,
    url: `${base}/reorgs`,
    name: 'Zcash Fork Watch',
    description: 'Monitor Zcash chain forks, orphaned blocks and competing tips.',
    isPartOf: { '@id': `${base}/#website` },
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    {children}
  </>;
}
