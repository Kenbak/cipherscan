import { readApiResponse } from '@/lib/api-client';
import { ZodlClient, type ZodlData } from './ZodlClient';
import { getApiUrl } from '@/lib/api-config';
import { fetchWithDeadline } from '@/lib/server-fetch';

const API_BASE = getApiUrl();

async function fetchZodl(period: string): Promise<{ data: ZodlData; fetchedAt: number | undefined } | null> {
  try {
    const res = await fetchWithDeadline(`${API_BASE}/v1/mining/zodl-leaderboard?period=${period}`, {
      next: { revalidate: 900 },
    }, 3_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const envelope = await readApiResponse<ZodlData>(res);
    const generatedAt = Date.parse(envelope.meta.generatedAt);
    return { data: envelope.data, fetchedAt: Number.isFinite(generatedAt) ? generatedAt : undefined };
  } catch (error) {
    // The client loads the leaderboard itself when the server snapshot is missing.
    console.error('[zodl] leaderboard snapshot unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

export default async function ZodlPage() {
  const snapshot = await fetchZodl('90d');
  return <ZodlClient initialData={snapshot?.data ?? null} initialFetchedAt={snapshot?.fetchedAt} initialPeriod="90d" />;
}
