'use client';

import '@xyflow/react/dist/style.css';

import { memo, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';

interface PrivacyGraphNode {
  id: string;
  type: 'transaction' | 'address' | 'cluster' | 'pool';
  label: string;
  amountZec?: number;
  blockTime?: number;
  subtitle?: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  label?: string;
}

interface PrivacyLinkGraphProps {
  nodes: PrivacyGraphNode[];
  edges: GraphEdge[];
  focusNodeId?: string;
  height?: number;
}

function truncateLabel(label: string) {
  return label.length > 18 ? `${label.slice(0, 18)}...` : label;
}

type GraphNodeData = Record<string, unknown> & PrivacyGraphNode & { isFocus: boolean };

const palettes = {
  txFocus: {
    border: 'border-cipher-cyan/50',
    bg: 'bg-cipher-cyan/10',
    title: 'text-cipher-cyan',
    label: 'var(--color-cyan-glow, #00E5FF)',
    amount: 'var(--color-text-primary)',
  },
  tx: {
    border: 'border-cipher-cyan-muted/40',
    bg: 'bg-cipher-cyan/5',
    title: 'text-cipher-cyan-muted',
    label: 'var(--color-cyan-muted, #5EBBCE)',
    amount: 'var(--color-text-primary)',
  },
  cluster: {
    border: 'border-cipher-green/40',
    bg: 'bg-cipher-green/10',
    title: 'text-cipher-green',
    label: 'var(--color-green, #00E676)',
    amount: 'var(--color-text-primary)',
  },
  address: {
    border: 'border-cipher-yellow/40',
    bg: 'bg-cipher-yellow/10',
    title: 'text-cipher-yellow',
    label: 'var(--color-yellow, #F4B728)',
    amount: 'var(--color-text-primary)',
  },
  pool: {
    border: 'border-cipher-purple/30',
    bg: 'bg-cipher-purple/5',
    title: 'text-cipher-purple',
    label: 'var(--color-purple, #A78BFA)',
    amount: 'var(--color-text-primary)',
  },
};

function GraphCardNode({ data }: NodeProps) {
  const node = data as GraphNodeData;

  const palette =
    node.type === 'pool' ? palettes.pool
    : node.type === 'transaction' ? (node.isFocus ? palettes.txFocus : palettes.tx)
    : node.type === 'cluster' ? palettes.cluster
    : palettes.address;

  if (node.type === 'pool') {
    return (
      <div className={`rounded-xl border border-dashed px-4 py-3 ${palette.border} ${palette.bg}`}>
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-cipher-purple/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className={`text-[9px] font-mono uppercase tracking-[0.15em] ${palette.title}`}>
            Shielded Pool
          </p>
        </div>
        <p className="mt-0.5 text-[10px] text-muted">Privacy boundary</p>
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
      </div>
    );
  }

  return (
    <div className={`max-w-[170px] rounded-xl border px-3 py-2.5 shadow-md ${palette.border} ${palette.bg}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
      <p className={`text-[9px] font-mono uppercase tracking-[0.15em] ${palette.title}`}>
        {node.type}
      </p>
      <p
        className="mt-0.5 text-[13px] font-semibold leading-tight font-mono"
        style={{ color: palette.label }}
      >
        {truncateLabel(node.label)}
      </p>
      {node.amountZec !== undefined && (
        <p className="mt-0.5 text-[11px] font-mono" style={{ color: palette.amount }}>
          {node.amountZec.toFixed(4)} ZEC
        </p>
      )}
      {node.subtitle && (
        <p className="mt-0.5 text-[10px] leading-snug text-secondary">{node.subtitle}</p>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
    </div>
  );
}

const nodeTypes = {
  graphNode: memo(GraphCardNode),
};

function buildLayout(nodes: PrivacyGraphNode[], edges: GraphEdge[], focusNodeId?: string) {
  const addressSources = new Set(edges.filter((edge) => edge.source.startsWith('address:')).map((edge) => edge.source));
  const addressTargets = new Set(edges.filter((edge) => edge.target.startsWith('address:')).map((edge) => edge.target));

  const leftAddresses = nodes.filter((node) => node.type === 'address' && addressSources.has(node.id));
  const rightAddresses = nodes.filter((node) => node.type === 'address' && addressTargets.has(node.id) && !addressSources.has(node.id));
  const clusters = nodes.filter((node) => node.type === 'cluster');
  const poolNodes = nodes.filter((node) => node.type === 'pool');
  const txNodes = nodes
    .filter((node) => node.type === 'transaction')
    .sort((a, b) => (a.blockTime || 0) - (b.blockTime || 0));

  const hasPool = poolNodes.length > 0;
  const hasCluster = clusters.length > 0;

  const positionColumn = (columnNodes: PrivacyGraphNode[], x: number, yStart: number, yGap: number) =>
    columnNodes.map((node, index) => [node.id, { x, y: yStart + index * yGap }] as const);

  if (hasPool) {
    // Pool layout: addr -> shieldTx -> pool -> deshieldTx -> addr
    // Place all txs in time order, split around the pool
    const shieldTxs = txNodes.filter((n) => edges.some((e) => e.source === n.id && e.target.startsWith('pool:')));
    const deshieldTxs = txNodes.filter((n) => edges.some((e) => e.target === n.id && e.source.startsWith('pool:')));
    const otherTxs = txNodes.filter((n) => !shieldTxs.includes(n) && !deshieldTxs.includes(n));

    return new Map([
      ...positionColumn(leftAddresses, 30, 60, 120),
      ...positionColumn(shieldTxs, 280, 50, 130),
      ...positionColumn(otherTxs, 280, 50 + shieldTxs.length * 130, 130),
      ...positionColumn(poolNodes, 560, 65, 130),
      ...positionColumn(deshieldTxs, 840, 50, 130),
      ...positionColumn(rightAddresses, 1100, 60, 120),
    ]);
  }

  // Non-pool layout (clusters, batch patterns, etc.)
  const focusIdx = txNodes.findIndex((node) => node.id === focusNodeId);
  const sourceTx = focusIdx > 0 ? txNodes.slice(0, focusIdx) : [];
  const focusTx = focusIdx >= 0 ? [txNodes[focusIdx]] : txNodes.slice(0, 1);
  const targetTx = focusIdx >= 0 ? txNodes.slice(focusIdx + 1) : txNodes.slice(1);

  return new Map([
    ...positionColumn(leftAddresses, 30, 30, 120),
    ...positionColumn(sourceTx, 280, 60, 130),
    ...positionColumn(focusTx, 540, 60, 130),
    ...positionColumn(clusters, 800, 60, 130),
    ...positionColumn(targetTx, hasCluster ? 1060 : 800, 60, 130),
    ...positionColumn(rightAddresses, hasCluster ? 1300 : 1060, 30, 120),
  ]);
}

function edgeStroke(type: string): string {
  switch (type) {
    case 'PAIR_LINK': return 'var(--color-cyan, #56D4C8)';
    case 'transparent_output': return 'var(--color-yellow, #E8C48D)';
    case 'pool_entry': return 'var(--color-purple, #A78BFA)';
    default: return 'var(--color-blue, #5B9CF6)';
  }
}

export function PrivacyLinkGraph({
  nodes,
  edges,
  focusNodeId,
  height = 360,
}: PrivacyLinkGraphProps) {
  if (nodes.length === 0 || edges.length === 0) {
    return null;
  }

  const positions = buildLayout(nodes, edges, focusNodeId);
  const flowNodes = useMemo<Node[]>(() => (
    nodes
      .filter((node) => positions.has(node.id))
      .map((node) => ({
        id: node.id,
        type: 'graphNode',
        position: positions.get(node.id) || { x: 0, y: 0 },
        draggable: false,
        data: {
          ...node,
          isFocus: node.id === focusNodeId,
        } satisfies GraphNodeData,
      }))
  ), [nodes, positions, focusNodeId]);

  const flowEdges = useMemo<Edge[]>(() => (
    edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: edge.type === 'PAIR_LINK',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
      },
      style: {
        stroke: edgeStroke(edge.type),
        strokeOpacity: 0.82,
        strokeWidth: Math.max(2, edge.confidence / 35),
        ...(edge.type === 'pool_entry' ? { strokeDasharray: '6 3' } : {}),
      },
      labelStyle: {
        fill: 'var(--color-text-secondary, #94A3B8)',
        fontSize: 10,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: 'var(--color-surface, #0b0f1a)',
        fillOpacity: 0.95,
      },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 6,
    }))
  ), [edges]);

  return (
    <div className="privacy-link-graph w-full overflow-hidden rounded-2xl border border-cipher-border" style={{ background: 'var(--glass-2)' }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted">Link Graph</p>
          <p className="mt-1 text-xs text-secondary">Drag, pan, and zoom to inspect the relationship.</p>
        </div>
      </div>
      <div style={{ height }} className="w-full">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.45}
          maxZoom={1.8}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--glass-6, rgba(148,163,184,0.12))" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
