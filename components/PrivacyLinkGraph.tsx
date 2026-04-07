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
  },
  tx: {
    border: 'border-cipher-cyan-muted/40',
    bg: 'bg-cipher-cyan/5',
    title: 'text-cipher-cyan-muted',
  },
  cluster: {
    border: 'border-cipher-green/40',
    bg: 'bg-cipher-green/10',
    title: 'text-cipher-green',
  },
  address: {
    border: 'border-cipher-yellow/40',
    bg: 'bg-cipher-yellow/10',
    title: 'text-cipher-yellow',
  },
  pool: {
    border: 'border-cipher-purple/30',
    bg: 'bg-cipher-purple/5',
    title: 'text-cipher-purple',
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
      <div className={`min-w-[180px] rounded-2xl border border-dashed px-5 py-4 ${palette.border} ${palette.bg}`}>
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-cipher-purple/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className={`text-[10px] font-mono uppercase tracking-[0.18em] ${palette.title}`}>
            Shielded Pool
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Privacy boundary</p>
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
      </div>
    );
  }

  return (
    <div className={`min-w-[160px] rounded-2xl border px-4 py-3 shadow-lg ${palette.border} ${palette.bg}`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cipher-border" />
      <p className={`text-[10px] font-mono uppercase tracking-[0.18em] ${palette.title}`}>
        {node.type}
      </p>
      <p className="mt-1 text-sm font-medium text-primary">{truncateLabel(node.label)}</p>
      {node.amountZec !== undefined && (
        <p className="mt-1 text-xs font-mono text-secondary">{node.amountZec.toFixed(4)} ZEC</p>
      )}
      {node.subtitle && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{node.subtitle}</p>
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

  const focusIdx = txNodes.findIndex((node) => node.id === focusNodeId);
  const sourceTx = focusIdx > 0 ? txNodes.slice(0, focusIdx) : [];
  const focusTx = focusIdx >= 0 ? [txNodes[focusIdx]] : txNodes.slice(0, 1);
  const targetTx = focusIdx >= 0 ? txNodes.slice(focusIdx + 1) : txNodes.slice(1);

  const positionColumn = (columnNodes: PrivacyGraphNode[], x: number, yStart: number, yGap: number) =>
    columnNodes.map((node, index) => [node.id, { x, y: yStart + index * yGap }] as const);

  const hasPool = poolNodes.length > 0;
  const hasCluster = clusters.length > 0;

  const poolX = 500;
  const focusX = hasPool ? 250 : 500;
  const clusterX = hasPool ? 760 : 760;
  const targetTxX = hasPool ? 760 : (hasCluster ? 1010 : 760);
  const rightAddrX = hasPool ? 1010 : (hasCluster ? 1260 : 1010);

  return new Map([
    ...positionColumn(leftAddresses, 30, 30, 110),
    ...positionColumn(sourceTx, 250, 60, 120),
    ...positionColumn(focusTx, focusX, hasPool ? 60 : 150, 120),
    ...positionColumn(poolNodes, poolX, 80, 120),
    ...positionColumn(clusters, clusterX, 150, 120),
    ...positionColumn(targetTx, targetTxX, 60, 120),
    ...positionColumn(rightAddresses, rightAddrX, 30, 110),
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
  height = 320,
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
        fontSize: 11,
      },
      labelBgStyle: {
        fill: 'var(--color-surface, #0b0f1a)',
        fillOpacity: 0.92,
      },
      labelBgPadding: [6, 3] as [number, number],
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
          fitViewOptions={{ padding: 0.18 }}
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
