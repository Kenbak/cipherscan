'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/lib/api-config';
import { AddressBubbleMap, buildBubbleNodes, type BubbleNode } from './AddressBubbleMap';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphPeer {
  address: string;
  balanceZec: number;
  txCount: number;
  label: string | null;
  category: string | null;
}

interface GraphCounterparty {
  address: string;
  sentZec: number;
  receivedZec: number;
  txCount: number;
  label: string | null;
  category: string | null;
  clusterId: number | null;
  clusterSize: number | null;
  sameEntity: boolean;
}

interface GraphResponse {
  success: boolean;
  address: string;
  cluster: { clusterId: number; memberCount: number } | null;
  peers: GraphPeer[];
  peerSelection?: 'full' | 'top_by_balance';
  counterparties: GraphCounterparty[];
  sampledRecentTxs?: number;
  note?: string;
}

const COLORS = {
  self: '#56D4C8',
  entity: '#E8C48D',
  counterparty: '#5B9CF6',
  text: 'rgba(255, 255, 255, 0.85)',
  textDim: 'rgba(255, 255, 255, 0.4)',
};

const GRAPH_HEIGHT = 560;
const API_MAX_COUNTERPARTIES = 20;

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtZec(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function roleLabel(n: Pick<BubbleNode, 'role' | 'sameEntity'>) {
  if (n.role === 'self') return 'The address you are viewing';
  if (n.role === 'peer') return 'Same entity — co-spent in a shared input';
  if (n.sameEntity) return 'Same entity — also seen in recent transactions';
  return 'Recent counterparty';
}

function roleExplanation(n: Pick<BubbleNode, 'role' | 'sameEntity' | 'sentZec' | 'receivedZec'>) {
  if (n.role === 'self') {
    return 'Center of the map. Tan bubbles share a wallet cluster with this address; blue bubbles are recent transaction partners from our sample.';
  }
  if (n.role === 'peer') {
    return 'Grouped by the common-input heuristic: spent as inputs in the same transaction, treated as one wallet. Not necessarily active recently.';
  }
  if (n.sameEntity) {
    return 'Same entity cluster, also appearing in recent transaction flow with this address.';
  }
  if (n.receivedZec > n.sentZec) {
    return 'Primarily sent funds to this address in our recent transaction sample.';
  }
  if (n.sentZec > n.receivedZec) {
    return 'Primarily received funds from this address in our recent transaction sample.';
  }
  return 'Roughly balanced send/receive with this address in the recent transaction sample.';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddressGraph({ address }: { address: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${getApiUrl()}/api/address/${encodeURIComponent(address)}/graph`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(json => {
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      })
      .catch(err => {
        console.error('Failed to load address graph:', err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  const bubbleNodes = useMemo(() => {
    if (!data?.success || width === 0) return [] as BubbleNode[];

    const raw: Omit<BubbleNode, 'x' | 'y' | 'vx' | 'vy' | 'targetX' | 'targetY'>[] = [];
    const seen = new Set<string>();

    raw.push({
      id: data.address,
      role: 'self',
      name: null,
      sameEntity: true,
      valueZec: 0,
      sentZec: 0,
      receivedZec: 0,
      txCount: 0,
      radius: 22,
    });
    seen.add(data.address);

    const peerCount = data.peers.length;
    const peerRadius = Math.max(6, Math.min(12, Math.floor(130 / Math.sqrt(peerCount + 2))));

    for (const peer of data.peers) {
      if (seen.has(peer.address)) continue;
      seen.add(peer.address);
      raw.push({
        id: peer.address,
        role: 'peer',
        name: peer.label,
        sameEntity: true,
        valueZec: peer.balanceZec,
        sentZec: 0,
        receivedZec: 0,
        txCount: peer.txCount,
        radius: peerRadius,
      });
    }

    const cps = [...data.counterparties].sort(
      (a, b) => b.sentZec + b.receivedZec - (a.sentZec + a.receivedZec),
    );
    const maxVal = Math.max(...cps.map(c => c.sentZec + c.receivedZec), 1);

    for (const cp of cps) {
      const total = cp.sentZec + cp.receivedZec;
      const t = Math.log10(1 + total) / Math.log10(1 + maxVal);
      const isInflow = cp.receivedZec >= cp.sentZec;
      if (!seen.has(cp.address)) {
        seen.add(cp.address);
        raw.push({
          id: cp.address,
          role: isInflow ? 'inflow' : 'outflow',
          name: cp.label,
          sameEntity: cp.sameEntity,
          valueZec: total,
          sentZec: cp.sentZec,
          receivedZec: cp.receivedZec,
          txCount: cp.txCount,
          radius: 10 + t * 14,
        });
      }
    }

    return buildBubbleNodes(raw, width, GRAPH_HEIGHT);
  }, [data, width]);

  const openAddress = useCallback(
    (id: string) => {
      if (id && id !== address) router.push(`/address/${id}`);
    },
    [address, router],
  );

  const hovered = useMemo(
    () => (hoveredId ? bubbleNodes.find(n => n.id === hoveredId) ?? null : null),
    [hoveredId, bubbleNodes],
  );

  if (loading) {
    return <div className="min-h-[560px] rounded-xl bg-cipher-surface animate-pulse" />;
  }

  if (error || !data?.success) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted text-sm rounded-xl border border-cipher-border">
        Entity graph unavailable right now.
      </div>
    );
  }

  if (!data.cluster && data.counterparties.length === 0) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted text-sm rounded-xl border border-cipher-border">
        <p>No entity cluster or recent counterparties found for this address.</p>
        {data.note && <p className="text-xs">{data.note}</p>}
      </div>
    );
  }

  const totalClusterMembers = data.cluster?.memberCount ?? 0;
  const clusterPeersReturned = data.peers.length;
  const clusterPeersOnGraph = clusterPeersReturned;
  const omittedClusterPeers = Math.max(0, totalClusterMembers - 1 - clusterPeersReturned);
  const counterpartyOnlyOnGraph = bubbleNodes.filter(
    n => n.role !== 'self' && n.role !== 'peer',
  ).length;
  const isFullCluster = data.peerSelection === 'full' || omittedClusterPeers === 0;
  const sampledTxs = data.sampledRecentTxs ?? 300;

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.self }} />
          This address
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.entity }} />
          Same entity · inner ring
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.counterparty }} />
          Recent partner · outer ring
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
        <div
          ref={containerRef}
          className="relative rounded-xl border border-cipher-border overflow-hidden h-[560px]"
          style={{ background: 'rgba(10, 14, 26, 0.4)' }}
          onMouseLeave={() => setHoveredId(null)}
        >
          {width > 0 && bubbleNodes.length > 0 && (
            <AddressBubbleMap
              nodes={bubbleNodes}
              width={width}
              height={GRAPH_HEIGHT}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onClick={openAddress}
              colors={COLORS}
            />
          )}
        </div>

        <div className="rounded-xl border border-cipher-border bg-[rgba(10,14,26,0.4)] overflow-hidden flex flex-col h-[560px]">
          <div className="px-3 py-2 border-b border-cipher-border text-[11px] font-mono tracking-wider uppercase text-muted">
            {hovered ? 'Selection' : 'About this graph'}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 text-xs">
            {hovered ? (
              <>
                <div className="flex items-start gap-2 mb-2">
                  <span
                    className="mt-1 w-2.5 h-2.5 shrink-0 rounded-full"
                    style={{
                      background:
                        hovered.role === 'self'
                          ? COLORS.self
                          : hovered.sameEntity
                            ? COLORS.entity
                            : COLORS.counterparty,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-primary truncate">
                      {hovered.role === 'self' ? 'This address' : hovered.name || shortAddr(hovered.id)}
                    </p>
                    {hovered.name && (
                      <p className="font-mono text-muted truncate mt-0.5">{shortAddr(hovered.id)}</p>
                    )}
                    {hovered.role === 'self' && !hovered.name && (
                      <p className="font-mono text-muted truncate mt-0.5">{shortAddr(hovered.id)}</p>
                    )}
                  </div>
                </div>

                <p className="text-secondary leading-relaxed">{roleLabel(hovered)}</p>
                <p className="text-muted mt-2 leading-relaxed">{roleExplanation(hovered)}</p>

                {hovered.role === 'peer' && hovered.valueZec > 0 && (
                  <p className="text-secondary mt-2 font-mono">
                    Balance {fmtZec(hovered.valueZec)} ZEC
                    {hovered.txCount > 0 && <span className="text-muted"> · {hovered.txCount} tx</span>}
                  </p>
                )}

                {hovered.role !== 'peer' && hovered.role !== 'self' && hovered.valueZec > 0 && (
                  <p className="text-secondary mt-2 font-mono leading-relaxed">
                    {hovered.receivedZec > 0 && (
                      <span className="block">They sent {fmtZec(hovered.receivedZec)} ZEC → this address</span>
                    )}
                    {hovered.sentZec > 0 && (
                      <span className="block">This address sent {fmtZec(hovered.sentZec)} ZEC → them</span>
                    )}
                    {hovered.txCount > 0 && (
                      <span className="block text-muted mt-1">{hovered.txCount} tx in sample</span>
                    )}
                  </p>
                )}

                {hovered.role !== 'self' && (
                  <button
                    type="button"
                    onClick={() => openAddress(hovered.id)}
                    className="mt-3 font-mono text-[11px] text-cipher-cyan hover:text-primary transition-colors"
                  >
                    Open address →
                  </button>
                )}
              </>
            ) : (
              <>
                {data.cluster ? (
                  <>
                    <p className="text-secondary leading-relaxed">
                      <span className="font-mono text-muted">CLUSTER #{data.cluster.clusterId}</span>
                      {' · '}
                      <strong className="text-primary">{totalClusterMembers.toLocaleString()} addresses</strong>
                      {' '}in the full cluster (from our index — not capped).
                    </p>
                    <p className="text-primary mt-2 leading-relaxed">
                      On the map:{' '}
                      <strong>1</strong> (this address) +{' '}
                      <strong>{clusterPeersOnGraph.toLocaleString()}</strong> tan cluster{' '}
                      {clusterPeersOnGraph === 1 ? 'peer' : 'peers'}
                      {counterpartyOnlyOnGraph > 0 && (
                        <>
                          {' '}+ <strong>{counterpartyOnlyOnGraph.toLocaleString()}</strong> blue recent{' '}
                          {counterpartyOnlyOnGraph === 1 ? 'partner' : 'partners'}
                        </>
                      )}
                      .
                    </p>
                    {isFullCluster ? (
                      <p className="text-muted mt-2 leading-relaxed">
                        All {totalClusterMembers.toLocaleString()} cluster addresses are on the map.
                        {counterpartyOnlyOnGraph > 0 && (
                          <> Blue bubbles are extra recent transaction partners not already drawn as tan peers.</>
                        )}
                      </p>
                    ) : (
                      <p className="text-muted mt-2 leading-relaxed">
                        Tan peers are the top {clusterPeersReturned} cluster addresses by balance.{' '}
                        {omittedClusterPeers.toLocaleString()} more cluster{' '}
                        {omittedClusterPeers === 1 ? 'address is' : 'addresses are'} not shown (cluster too
                        large for the full map — cap is 64).
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-secondary leading-relaxed">
                    This address is not in a multi-address entity cluster. The map shows recent transaction
                    counterparties only.
                  </p>
                )}

                <p className="text-muted mt-3 leading-relaxed">
                  Clusters use the <strong className="text-secondary font-normal">common-input ownership heuristic</strong>:
                  transparent addresses spent together in the same transaction are grouped as one wallet.
                  This is a heuristic, not proof of ownership.
                </p>

                <p className="text-muted mt-3 leading-relaxed">
                  <strong className="text-secondary font-normal">How addresses are chosen:</strong>{' '}
                  tan peers {isFullCluster ? 'are every co-spent address in the cluster' : 'are ranked by on-chain balance'}.
                  Blue partners are the top {API_MAX_COUNTERPARTIES} by ZEC moved in the last {sampledTxs}{' '}
                  transactions (sampled for high-activity addresses like exchanges).
                </p>

                <p className="text-muted mt-3 leading-relaxed">
                  Bubble size = balance (tan) or value moved (blue). Drag to rearrange; hover for details.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
