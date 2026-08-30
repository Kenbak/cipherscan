'use client';

import { lazy, Suspense, useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { NodeGeoLayerMap } from './NodeGeoLayerMap';

const TopologyGraph = lazy(() =>
  import('./TopologyGraph').then((m) => ({ default: m.TopologyGraph }))
);

type MapTab = 'topology' | 'client' | 'infra';

const TABS: { id: MapTab; label: string }[] = [
  { id: 'topology', label: 'Topology Graph' },
  { id: 'client', label: 'Client Map' },
  { id: 'infra', label: 'Infra Map' },
];

const TAB_DESCRIPTIONS: Record<MapTab, string> = {
  topology: 'Gossip graph of the known network — reachable nodes plus addresses they advertised that never completed a handshake.',
  client: 'World map colored by the dominant client implementation observed in each region.',
  infra: 'World map colored by the dominant hosting provider (ISP/ASN) observed in each region.',
};

/**
 * Single "Node Map" surface for the /network/nodes deep-dive: one component,
 * three lenses onto the same crawler dataset, instead of stacking separate
 * hero visualizations. Non-active lenses aren't mounted, so the 3D WebGL
 * scene only loads when actually selected.
 */
export function NodeMapExplorer() {
  const [tab, setTab] = useState<MapTab>('topology');

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-primary">Node Map</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          Three views of the same crawled network — a connection graph, or a world map colored by client or by host.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <Tabs tabs={TABS} active={tab} onChange={setTab} className="border-b-0" />
      </div>
      <p className="text-[11px] text-muted mb-4">{TAB_DESCRIPTIONS[tab]}</p>

      {tab === 'topology' && (
        <Suspense fallback={
          <div className="h-[400px] flex items-center justify-center">
            <div className="animate-pulse text-muted text-sm font-mono">Loading topology...</div>
          </div>
        }>
          <TopologyGraph />
        </Suspense>
      )}

      {tab === 'client' && <NodeGeoLayerMap mode="client" />}
      {tab === 'infra' && <NodeGeoLayerMap mode="infra" />}
    </div>
  );
}
