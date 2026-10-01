import 'server-only';
import { cache } from 'react';
import { readApiResponse } from './api-client';
import { catalogRows, type CatalogChart } from './chart-catalog';
import { chartEndpoint } from './chart-sharing';
import { getApiUrl, getNetwork } from './seo';
import { fetchWithDeadline } from './server-fetch';

// Above the 1s default because chart endpoints aggregate long histories, but
// short enough that a slow API doesn't hold the page; the client loads the
// chart itself when the snapshot is missing.
const CHART_SNAPSHOT_TIMEOUT_MS = 3_000;

export const loadShareChart = cache(async (chart: CatalogChart) => {
  try {
    const envelope = await readApiResponse(await fetchWithDeadline(`${getApiUrl()}${chartEndpoint(chart)}`, { next: { revalidate: 300 } }, CHART_SNAPSHOT_TIMEOUT_MS));
    if (envelope.meta.network !== getNetwork()) throw new Error('Network mismatch');
    const generatedAt = Date.parse(envelope.meta.generatedAt);
    return {
      payload: envelope.data,
      rows: catalogRows(chart, envelope.data),
      meta: envelope.meta,
      fetchedAt: Number.isFinite(generatedAt) ? generatedAt : undefined,
    };
  } catch (error) {
    console.error(`[charts] snapshot for ${chart.id} unavailable:`, error instanceof Error ? error.message : error);
    return null;
  }
});
