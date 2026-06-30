import { ZodlClient } from './ZodlClient';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.mainnet.cipherscan.app';

async function fetchZodl(period: string) {
  try {
    const res = await fetch(`${API_BASE}/api/mining/zodl-leaderboard?period=${period}`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function ZodlPage() {
  const data = await fetchZodl('90d');
  return <ZodlClient initialData={data} initialPeriod="90d" />;
}
