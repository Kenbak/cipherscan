import { readApiData } from '@/lib/api-client';
import { UsageClockClient } from './UsageClockClient';
import { getBaseUrl } from '@/lib/seo';
import { getApiUrl } from '@/lib/api-config';

const API_BASE = getApiUrl();

async function fetchClock(period: string) {
  try {
    const res = await fetch(`${API_BASE}/v1/analytics/usage-clock?period=${period}`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    return await readApiData(res);
  } catch {
    return null;
  }
}

async function fetchNodes() {
  try {
    const res = await fetch(`${API_BASE}/v1/network/nodes`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return await readApiData(res);
  } catch {
    return null;
  }
}

export default async function UsageClockPage() {
  const [clock, nodes] = await Promise.all([fetchClock('1y'), fetchNodes()]);
  const base = getBaseUrl();
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    '@id': `${base}/usage-clock#webpage`, url: `${base}/usage-clock`,
    name: 'The Rhythm of Zcash',
    description: 'Daily Zcash transaction activity, daylight simulation and observed node geography.',
    isPartOf: { '@id': `${base}/#website` },
    publisher: { '@id': 'https://zecblock.com/#organization' },
  };
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <UsageClockClient
      initialData={clock}
      initialPeriod="1y"
      initialNodes={nodes?.locations || []}
    />
    </>
  );
}
