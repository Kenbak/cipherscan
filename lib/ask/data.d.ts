import type { ApiMeta } from '@/lib/api-client';
import type { AnalysisSpec } from './contract';
export interface EvidencePoint { date: string; values: Record<string, string | null> }
export interface Evidence {
  key: string;
  dimension?: 'chain';
  points: EvidencePoint[];
  series: { key: string; label: string; color: string }[];
  meta: ApiMeta;
  source: string;
  sourceLabel: string;
  title: string;
  csvUnit: string;
  unit: 'ZEC' | 'flows' | 'USD' | 'swaps' | 'transactions' | 'alerts' | '%';
  note: string;
  receivedAt: string;
}
export function describeMetric(metric: AnalysisSpec['metric']): Pick<Evidence, 'title' | 'source' | 'sourceLabel' | 'unit' | 'csvUnit' | 'note'>;
export function normalizeEvidence(spec: AnalysisSpec, data: Record<string, unknown>, meta: ApiMeta): Evidence;
export function snapshotInput(spec: AnalysisSpec, evidence: Evidence): string;
export function formatValue(value: string | null, unit: Evidence['unit'], signed?: boolean): string;
export function summarizeEvidence(evidence: Evidence, spec: AnalysisSpec, start?: string, end?: string): { points: EvidencePoint[]; totals: { key: string; label: string; color: string; value: string | null; change: string | null }[]; start: string | null; end: string | null };

export function formatChain(chain: string): string;
