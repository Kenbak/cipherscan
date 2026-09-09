import { readApiResponse } from '@/lib/api-client';
import { getApiUrl } from '@/lib/api-config';
import type { AnalysisSpec } from './contract';
import type { Evidence } from './data';
import { loadEvidence } from './sources';
export { formatValue, summarizeEvidence } from './data';
export type { Evidence, EvidencePoint } from './data';

export async function fetchEvidence(spec: AnalysisSpec, signal: AbortSignal): Promise<Evidence> {
  return loadEvidence(spec, async source => {
    const response = await fetch(`${getApiUrl()}${source.path}?${new URLSearchParams(source.query)}`, { signal, cache: 'no-store' });
    return readApiResponse<Record<string, unknown>>(response);
  });
}
