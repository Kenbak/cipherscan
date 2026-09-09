'use client';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { getApiUrl } from '@/lib/api-config';
import { readApiResponse } from '@/lib/api-client';
import { snapshotInput, type Evidence } from '@/lib/ask/data';
import type { AnalysisSpec } from '@/lib/ask/contract';

const schema = z.object({ summary: z.string().min(1).max(1200), observations: z.array(z.string().min(1).max(1000)).min(1).max(2), limitation: z.string().min(1).max(1000) }).strict();
type Explanation = z.infer<typeof schema>;
export const explanationRecipe = (spec: AnalysisSpec) => JSON.stringify([spec.metric, spec.period, spec.pool, spec.start, spec.end]);

export function AskInsights({ spec, evidence, enabled, autoExplain }: { spec: AnalysisSpec; evidence: Evidence; enabled: boolean; autoExplain: MutableRefObject<string | null> }) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const snapshot = snapshotInput(spec, evidence);
  const explain = useCallback(async () => {
    if (!enabled) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    const timeout = setTimeout(() => current.abort(), 25000);
    setBusy(true); setError('');
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot));
      const evidenceKey = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      const response = await fetch(`${getApiUrl()}/v1/ask/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: current.signal, body: JSON.stringify({ spec, evidenceKey }) });
      const { data, meta } = await readApiResponse<{ explanation: unknown; evidenceKey: string; reason?: string }>(response);
      if (current.signal.aborted) return;
      if (meta.network !== 'mainnet') throw new Error('Wrong network');
      if (data.evidenceKey !== evidenceKey || data.reason === 'source-changed') {
        setError('The source changed since this chart loaded. Refresh the analysis, then explain the updated view.');
        return;
      }
      setExplanation(schema.parse(data.explanation));
    } catch {
      if (controller.current === current) setError('AI insights are temporarily unavailable. The chart and source data are still available.');
    } finally {
      clearTimeout(timeout);
      if (controller.current === current) setBusy(false);
    }
  }, [enabled, snapshot, spec]);

  useEffect(() => {
    if (enabled && autoExplain.current === explanationRecipe(spec)) {
      autoExplain.current = null;
      void explain();
    }
  }, [enabled, autoExplain, spec, explain]);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);

  return <section aria-label="AI analysis" className="border-t border-cipher-border mt-5 pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-medium text-primary">What the data tells us</h3><span className="text-caption font-mono text-muted">AI ANALYSIS</span></div>
    {!enabled ? <p className="mt-3 text-sm text-muted leading-relaxed">AI explanations will appear here once a provider is connected: what changed, what stands out, and what the data cannot tell us.</p>
      : busy ? <p role="status" className="mt-3 text-sm text-muted">Preparing insights from these observations…</p>
        : explanation ? <div className="mt-3 text-sm text-secondary leading-relaxed" aria-live="polite"><p>{explanation.summary}</p><ul className="list-disc pl-5 mt-3 space-y-2">{explanation.observations.map((text, index) => <li key={index}>{text}</li>)}</ul><p className="mt-4 text-xs text-muted">{explanation.limitation}</p><Link href={evidence.source} className="inline-block mt-3 text-caption text-cipher-gold hover:underline">Check the source data ↗</Link></div>
          : <p className="mt-3 text-sm text-muted leading-relaxed">Get a short explanation of the patterns and limitations in this view.</p>}
    {error ? <p role="alert" className="mt-3 text-xs text-warning">{error}</p> : null}
    {enabled && !busy ? <button type="button" onClick={() => void explain()} className="mt-4 text-caption font-mono text-cipher-gold hover:underline">{explanation ? 'Explain again' : 'Explain this view'} →</button> : null}
  </section>;
}
