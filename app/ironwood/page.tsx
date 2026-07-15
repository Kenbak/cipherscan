import { MigrationClient } from './MigrationClient';
import { getApiUrl, getBaseUrl, getNetwork } from '@/lib/seo';
import { notFound } from 'next/navigation';

const PAGE_NAME = 'Zcash Ironwood Upgrade & Migration Tracker';
const PAGE_DESCRIPTION =
  'Track the Zcash Ironwood (NU6.3) activation, Orchard migration, Ironwood shielded supply, and observable turnstile activity on CipherScan.';

async function fetchJson(apiBase: string, path: string, expectedNetwork: 'mainnet' | 'testnet') {
  try {
    const res = await fetch(`${apiBase}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.success === true && data.network === expectedNetwork ? data : null;
  } catch {
    return null;
  }
}

export default async function MigrationPage() {
  const network = getNetwork();
  if (network === 'crosslink-testnet') notFound();

  const apiBase = getApiUrl();
  const baseUrl = getBaseUrl();
  const pageUrl = new URL('/ironwood', `${baseUrl}/`).toString();
  const fallbackActivationHeight = network === 'mainnet'
    ? 3428143
    : network === 'testnet'
      ? 4134000
      : 0;

  const [overview, cohorts, denominations] = await Promise.all([
    fetchJson(apiBase, '/api/migration/overview', network),
    fetchJson(apiBase, '/api/migration/cohorts', network),
    fetchJson(apiBase, '/api/migration/denominations', network),
  ]);

  const dataset = {
    '@type': 'Dataset',
    '@id': `${pageUrl}#dataset`,
    url: pageUrl,
    name: 'Zcash Ironwood Upgrade and Migration Data',
    description:
      'Live Zcash Ironwood activation and Orchard-to-Ironwood migration data, including pool balances, migration transaction counts, turnstile supply audit, cohort sizes, denominations, and privacy analysis.',
    creator: { '@id': 'https://cipherscan.app/#organization' },
    isPartOf: { '@id': `${baseUrl}/#website` },
    mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
  };
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: PAGE_NAME,
        description: PAGE_DESCRIPTION,
        isPartOf: { '@id': `${baseUrl}/#website` },
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` },
        mainEntity: { '@id': `${pageUrl}#dataset` },
      },
      dataset,
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Dashboard', item: `${baseUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Pools', item: `${baseUrl}/pools` },
          { '@type': 'ListItem', position: 3, name: 'Ironwood', item: pageUrl },
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
      <MigrationClient
        initialOverview={overview}
        initialCohorts={cohorts}
        initialDenominations={denominations}
        deploymentNetwork={network}
        fallbackActivationHeight={fallbackActivationHeight}
      />
    </>
  );
}
