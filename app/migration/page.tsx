import { MigrationClient } from './MigrationClient';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.mainnet.cipherscan.app';

async function fetchJson(path: string) {
  try {
    const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function MigrationPage() {
  const [overview, cohorts, denominations] = await Promise.all([
    fetchJson('/api/migration/overview'),
    fetchJson('/api/migration/cohorts'),
    fetchJson('/api/migration/denominations'),
  ]);

  return (
    <MigrationClient
      initialOverview={overview}
      initialCohorts={cohorts}
      initialDenominations={denominations}
    />
  );
}
