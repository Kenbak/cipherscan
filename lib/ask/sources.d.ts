import type { ApiEnvelope } from '@/lib/api-client';
import type { AnalysisSpec } from './contract';
import type { Evidence } from './data';
export interface SourceRequest { path: string; legacy: string; query: Record<string, string> }
export function sourceRequest(spec: AnalysisSpec): SourceRequest;
export function loadEvidence(spec: AnalysisSpec, request: (source: SourceRequest) => Promise<ApiEnvelope<Record<string, unknown>>>): Promise<Evidence>;
