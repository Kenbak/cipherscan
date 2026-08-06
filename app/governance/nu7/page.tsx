import { NU7VoteClient } from './NU7VoteClient';
import { getApiUrl, getBaseUrl, getNetwork } from '@/lib/seo';
import { NU7_VOTE } from '@/lib/nu7-vote-config';
import { notFound } from 'next/navigation';

async function fetchJson(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function NU7VotePage() {
  const network = getNetwork();
  if (network !== 'mainnet') notFound();

  const apiBase = getApiUrl();
  const baseUrl = getBaseUrl();
  const pageUrl = new URL('/governance/nu7', `${baseUrl}/`).toString();

  const networkStats = await fetchJson(`${apiBase}/api/network/stats`);

  const supply = networkStats?.supply ?? null;
  const initialData = {
    ironwoodZec: supply?.ironwood ?? null,
    sproutZec: supply?.sprout ?? null,
    totalShielded: supply?.totalShielded ?? null,
    chainSupply: supply?.chainSupply ?? null,
  };

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: 'NU7 Coinholder Vote — Zcash Governance',
        description:
          'Follow the Zcash NU7 coinholder vote: issuance smoothing, Sprout deprecation, 25-second blocks, and upgrade schedule.',
        isPartOf: { '@id': `${baseUrl}/#website` },
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
      },
      {
        '@type': 'Event',
        '@id': `${pageUrl}#event`,
        name: NU7_VOTE.title,
        startDate: NU7_VOTE.voteStartTime,
        endDate: NU7_VOTE.voteEndTime,
        eventStatus: 'https://schema.org/EventScheduled',
        organizer: [
          { '@type': 'Organization', name: 'Valar Group' },
          { '@type': 'Organization', name: 'Project Tachyon' },
        ],
        description:
          'Private coinholder vote on NU7 scope: issuance smoothing, Sprout deprecation, 25-second blocks, and upgrade schedule.',
        url: pageUrl,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Dashboard', item: `${baseUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Governance', item: `${baseUrl}/governance` },
          { '@type': 'ListItem', position: 3, name: 'NU7 Vote', item: pageUrl },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <NU7VoteClient initialData={initialData} />
    </>
  );
}
