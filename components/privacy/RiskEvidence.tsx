import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';

export const riskButtonClass = 'rounded-md border border-cipher-border px-3 py-2 text-xs text-secondary hover:bg-cipher-hover hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-gold disabled:opacity-50';

export function RiskScore({ score, level }: { score: number; level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  return <div className="flex items-center gap-3 shrink-0">
    <Badge color={level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'gold' : 'muted'}>{level === 'HIGH' ? 'High' : level === 'MEDIUM' ? 'Medium' : 'Low'} signal</Badge>
    <span className="font-mono text-sm text-primary tabular-nums" aria-label={`Heuristic score ${score} out of 100`}>{score}<span className="text-muted"> / 100</span></span>
  </div>;
}

export function ScoreEvidence({ rows, ambiguity, margin, children }: {
  rows: { label: string; value: number | undefined }[]; ambiguity?: number; margin?: number; children?: ReactNode;
}) {
  return <details className="group border-t border-cipher-border mt-4">
    <summary className="cursor-pointer rounded-md px-3 py-2 -mx-3 text-xs text-secondary hover:bg-cipher-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-gold">Score inputs & limitations</summary>
    <div className="pt-3 pb-4 space-y-4">
      <p className="text-xs text-muted">Heuristic points rank candidates; the total is not a probability of shared ownership. Adjustments and caps can make these inputs differ from the final score.</p>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {rows.map(row => <div key={row.label}><dt className="text-xs text-muted">{row.label}</dt><dd className="mt-1 font-mono text-sm text-primary">{row.value == null ? 'Unavailable' : `${row.value} pts`}</dd></div>)}
        <div><dt className="text-xs text-muted">Ambiguity index</dt><dd className="mt-1 font-mono text-sm text-primary">{ambiguity == null ? 'Unavailable' : `${ambiguity} / 100`}</dd></div>
        <div><dt className="text-xs text-muted">Candidate margin</dt><dd className="mt-1 font-mono text-sm text-primary">{margin ?? 'Unavailable'}</dd></div>
      </dl>
      {children}
      <p className="text-xs text-muted">Higher ambiguity means more competing explanations. The margin is the model’s separation between candidates, not a percentage of certainty.</p>
    </div>
  </details>;
}

export function RiskResultsSkeleton() {
  return <div className="space-y-4" role="status" aria-label="Loading privacy observations">
    {[0, 1, 2].map(i => <div key={i} className="rounded-xl border border-cipher-border p-4 sm:p-5 motion-safe:animate-pulse" aria-hidden="true">
      <div className="flex justify-between gap-4 mb-4"><div className="skeleton-bg rounded h-5 w-40" /><div className="skeleton-bg rounded h-5 w-28" /></div>
      <div className="grid grid-cols-2 gap-8"><div className="skeleton-bg rounded h-16" /><div className="skeleton-bg rounded h-16" /></div>
      <div className="mt-5 border-t border-cipher-border pt-4"><div className="skeleton-bg rounded h-4 w-48" /></div>
    </div>)}
  </div>;
}
