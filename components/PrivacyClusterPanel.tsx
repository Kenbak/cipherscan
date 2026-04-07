'use client';

import { PrivacyLinkGraph } from '@/components/PrivacyLinkGraph';
import { PrivacyTimelineChart, PrivacyTimelinePoint } from '@/components/PrivacyTimelineChart';

interface GraphNode {
  id: string;
  type: 'transaction' | 'address';
  label: string;
  amountZec?: number;
  blockTime?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  label?: string;
}

interface PrivacyClusterPanelProps {
  title: string;
  subtitle?: string;
  metrics: Array<{ label: string; value: string }>;
  timelinePoints: PrivacyTimelinePoint[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  focusNodeId?: string;
}

export function PrivacyClusterPanel({
  title,
  subtitle,
  metrics,
  timelinePoints,
  graphNodes,
  graphEdges,
  focusNodeId,
}: PrivacyClusterPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-cipher-border bg-cipher-surface/20 p-4">
      <div>
        <h4 className="text-sm font-medium text-primary">{title}</h4>
        {subtitle && <p className="mt-1 text-xs text-secondary">{subtitle}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-cipher-border bg-cipher-surface/30 px-3 py-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted">{metric.label}</p>
            <p className="mt-1 text-sm font-mono text-primary">{metric.value}</p>
          </div>
        ))}
      </div>

      <PrivacyTimelineChart points={timelinePoints} height={160} yLabel="Amount" />
      <PrivacyLinkGraph nodes={graphNodes} edges={graphEdges} focusNodeId={focusNodeId} />
    </div>
  );
}
