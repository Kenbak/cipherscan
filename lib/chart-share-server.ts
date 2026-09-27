import 'server-only';
import { cache } from 'react';
import { readApiResponse } from './api-client';
import { catalogRows, type CatalogChart } from './chart-catalog';
import { chartEndpoint } from './chart-sharing';
import { getApiUrl, getNetwork } from './seo';
import { fetchWithDeadline } from './server-fetch';

export const loadShareChart = cache(async (chart: CatalogChart) => {
  try {
    const envelope = await readApiResponse(await fetchWithDeadline(`${getApiUrl()}${chartEndpoint(chart)}`, { next: { revalidate: 300 } }, 8000));
    if (envelope.meta.network !== getNetwork()) throw new Error('Network mismatch');
    return { payload: envelope.data, rows: catalogRows(chart, envelope.data), meta: envelope.meta };
  } catch {
    return null;
  }
});
