import { readApiData } from '@/lib/api-client';
import { ZodlClient } from './ZodlClient';
import { getApiUrl } from '@/lib/api-config';

const API_BASE = getApiUrl();

async function fetchZodl(period: string) {
  try {
    const res = await fetch(`${API_BASE}/v1/mining/zodl-leaderboard?period=${period}`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    return await readApiData(res);
  } catch {
    return null;
  }
}

export default async function ZodlPage() {
  const data = await fetchZodl('90d');
  return <ZodlClient initialData={data} initialPeriod="90d" />;
}
