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
  type: 'transaction' | 'address' | 'cluster';
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

function GraphCardNode({ data }: NodeProps) {
  const node = data as GraphNodeData;
  const palette = node.type === 'transaction'
    ? node.isFocus
      ? {
          border: 'border-cipher-cyan/50',
          bg: 'bg-cipher-cyan/10',
          title: 'text-cipher-cyan',
        }
      : {
          border: 'border-cipher-blue/40',
          bg: 'bg-cipher-blue/10',
          title: 'text-cipher-blue',
        }
    : node.type === 'cluster'
      ? {
          border: 'border-cipher-green/40',
          bg: 'bg-cipher-green/10',
          title: 'text-cipher-green',
        }
      : {
          border: 'border-cipher-gold/40',
          bg: 'bg-[#E8C48D]/10',
          title: 'text-[#E8C48D]',
        };

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
  const txNodes = nodes
    .filter((node) => node.type === 'transaction')
    .sort((a, b) => (a.blockTime || 0) - (b.blockTime || 0));

  const focusIdx = txNodes.findIndex((node) => node.id === focusNodeId);
  const sourceTx = focusIdx > 0 ? txNodes.slice(0, focusIdx) : [];
  const focusTx = focusIdx >= 0 ? [txNodes[focusIdx]] : txNodes.slice(0, 1);
  const targetTx = focusIdx >= 0 ? txNodes.slice(focusIdx + 1) : txNodes.slice(1);

  const positionColumn = (columnNodes: PrivacyGraphNode[], x: number, yStart: number, yGap: number) =>
    columnNodes.map((node, index) => [node.id, { x, y: yStart + index * yGap }] as const);

  return new Map([
    ...positionColumn(leftAddresses, 30, 30, 110),
    ...positionColumn(sourceTx, 250, 60, 120),
    ...positionColumn(focusTx, 500, 150, 120),
    ...positionColumn(clusters, 760, 150, 120),
    ...positionColumn(targetTx, clusters.length > 0 ? 1010 : 760, 60, 120),
    ...positionColumn(rightAddresses, clusters.length > 0 ? 1260 : 1010, 30, 110),
  ]);
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

  const width = 1440;
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
        stroke: edge.type === 'PAIR_LINK' ? '#56D4C8' : edge.type === 'transparent_output' ? '#E8C48D' : '#5B9CF6',
        strokeOpacity: 0.82,
        strokeWidth: Math.max(1.6, edge.confidence / 35),
      },
      labelStyle: {
        fill: '#94A3B8',
        fontSize: 11,
      },
      labelBgStyle: {
        fill: '#0b0f1a',
        fillOpacity: 0.96,
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
    }))
  ), [edges]);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface/20">
      <div className="flex items-center justify-between border-b border-cipher-border/70 px-4 py-3">
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
          <Background color="rgba(148,163,184,0.12)" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
