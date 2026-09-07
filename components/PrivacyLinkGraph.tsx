'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { ChartWatermark } from '@/components/ChartWatermark';
import { HashLink } from '@/components/ui/HashLink';
import { riskButtonClass } from '@/components/privacy/RiskEvidence';
import '@xyflow/react/dist/style.css';
import styles from './PrivacyLinkGraph.module.css';
import { memo, useMemo, useState, useCallback } from 'react';
import {
  Background, Controls, Handle, Position, ReactFlow, applyNodeChanges, BaseEdge, EdgeLabelRenderer, getSmoothStepPath,
  type Edge, type EdgeProps, type Node, type NodeProps, type NodeChange, type ReactFlowInstance,
} from '@xyflow/react';

interface PrivacyGraphNode {
  id: string;
  type: 'transaction' | 'address' | 'cluster' | 'pool';
  label: string;
  amountZec?: number;
  blockTime?: number;
  subtitle?: string;
}
interface GraphEdge { id: string; source: string; target: string; type: string; confidence: number; label?: string }
interface PrivacyLinkGraphProps { nodes: PrivacyGraphNode[]; edges: GraphEdge[]; focusNodeId?: string; height?: number }
type GraphNodeData = Record<string, unknown> & PrivacyGraphNode;

function GraphCardNode({ data, selected }: NodeProps) {
  const node = data as GraphNodeData;
  const privatePool = node.type === 'pool';
  const label = node.label.length > 22 ? `${node.label.slice(0, 10)}…${node.label.slice(-7)}` : node.label;
  return <div className={`${styles.node} ${selected ? styles.selected : ''} ${privatePool ? styles.pool : ''} ${node.type === 'address' ? styles.addressNode : ''}`}>
    <Handle type="target" position={Position.Left} className={styles.handle} />
    <p className={`text-xs ${privatePool ? 'text-cipher-shielded' : 'text-muted'}`}>{privatePool ? 'Shielded activity' : node.subtitle || node.type}</p>
    <p className="mt-2 text-sm font-mono text-primary">{privatePool ? 'Not observable' : label}</p>
    {node.amountZec != null && <p className="mt-2 font-mono text-sm text-primary">{node.amountZec.toLocaleString(undefined, { maximumFractionDigits: 8 })} <span className="text-muted text-xs">ZEC</span></p>}
    {privatePool && <p className="mt-2 text-xs text-muted">Internal transfers are hidden</p>}
    <Handle type="source" position={Position.Right} className={styles.handle} />
  </div>;
}
const nodeTypes = { evidence: memo(GraphCardNode) };
function EvidenceEdge(props: EdgeProps) {
  const [path, x, y] = getSmoothStepPath(props);
  return <><BaseEdge path={path} style={props.style} /><EdgeLabelRenderer>{props.label && <span className="absolute pointer-events-none rounded px-2 py-1 text-xs text-secondary bg-cipher-bg" style={{ transform: `translate(-50%, -100%) translate(${x}px, ${y - 58}px)` }}>{props.label}</span>}</EdgeLabelRenderer></>;
}
const edgeTypes = { evidence: EvidenceEdge };

// Layout encodes roles only. Neither distance nor line width encodes money or certainty.
function layoutNodes(nodes: PrivacyGraphNode[], edges: GraphEdge[]): Node[] {
  const pool = nodes.some(node => node.type === 'pool');
  const columns = new Map<number, number>();
  return [...new Map(nodes.map(node => [node.id, node])).values()].map(node => {
    let column = 0;
    if (pool) {
      if (node.type === 'pool') column = 2;
      else if (node.type === 'transaction') column = edges.some(edge => edge.target === node.id && edge.source.startsWith('pool:')) ? 3 : 1;
      else column = edges.some(edge => edge.source === node.id) ? 0 : 4;
    } else {
      if (node.type === 'cluster') column = 1;
      else if (node.type === 'address') column = edges.some(edge => edge.source === node.id) ? 0 : 2;
      else column = edges.some(edge => edge.target === node.id && nodes.some(n => n.id === edge.source && n.type === 'transaction')) ? 1 : 0;
    }
    const row = columns.get(column) || 0;
    columns.set(column, row + 1);
    return { id: node.id, type: 'evidence', position: { x: column * 255, y: row * (node.type === 'address' ? 105 : 145) }, data: { ...node }, ariaLabel: `${node.subtitle || node.type}: ${node.label}` };
  });
}

export function PrivacyLinkGraph(props: PrivacyLinkGraphProps) {
  // Remount graph state for a different evidence set; selections and drags stay local.
  const nodes = [...new Map(props.nodes.map(node => [node.id, node])).values()];
  const identity = nodes.map(node => node.id).join('|');
  return <EvidenceGraph key={identity} {...props} nodes={nodes} />;
}

function EvidenceGraph({ nodes, edges, focusNodeId, height = 320 }: PrivacyLinkGraphProps) {
  const { theme } = useTheme();
  const initial = useMemo(() => layoutNodes(nodes, edges), [nodes, edges]);
  const [flowNodes, setFlowNodes] = useState<Node[]>(initial);
  const [selected, setSelected] = useState(focusNodeId || nodes[0]?.id);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes(current => applyNodeChanges(changes, current));
    const selection = changes.find(change => change.type === 'select' && change.selected);
    if (selection?.type === 'select') setSelected(selection.id);
  }, []);
  const selectNode = (id: string) => {
    setSelected(id);
    const node = flowNodes.find(item => item.id === id);
    if (node && instance) void instance.setCenter(node.position.x + 102, node.position.y + 50, { zoom: 1 });
  };
  const flowEdges = useMemo<Edge[]>(() => edges.filter(edge => nodes.some(node => node.id === edge.source) && nodes.some(node => node.id === edge.target)).map(edge => {
    const observed = ['transparent_input', 'transparent_output', 'pool_entry'].includes(edge.type);
    return {
      id: edge.id, source: edge.source, target: edge.target, type: 'evidence',
      label: observed ? edge.label : 'Candidate link',
      style: { stroke: 'var(--color-text-muted)', strokeWidth: 1.5, ...(observed ? {} : { strokeDasharray: '5 5' }) },
      labelStyle: { fill: 'var(--color-text-secondary)', fontSize: 12 },
      labelBgStyle: { fill: 'var(--color-surface-solid)' }, labelBgPadding: [7, 5], labelBgBorderRadius: 4,
      ariaLabel: `${observed ? 'Public observation' : 'Inferred relationship'}${edge.label ? `: ${edge.label}` : ''}`,
    };
  }), [nodes, edges]);
  const inspected = nodes.find(node => node.id === selected);
  const href = inspected?.type === 'transaction' && /^[a-f0-9]{64}$/i.test(inspected.id) ? `/tx/${inspected.id}` : inspected?.type === 'address' ? `/address/${inspected.label}` : null;
  if (!nodes.length) return <p className="text-sm text-muted">No graph observations are available.</p>;
  return <section aria-label="Linkage evidence graph" className={`${styles.root} rounded-xl border border-cipher-border overflow-hidden bg-cipher-bg`}>
    <div className="px-4 py-4 border-b border-cipher-border flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-sm font-medium text-primary">Linkage evidence</h4><p className="text-xs text-muted mt-1">Drag nodes to arrange · pan to move · select to inspect</p></div>
      <button className={riskButtonClass} onClick={() => { setFlowNodes(initial); setSelected(focusNodeId || nodes[0]?.id); void instance?.fitView({ padding: 0.12, duration: 0 }); }}>Reset layout</button>
    </div>
    <div className="w-full" style={{ height: Math.max(260, height) }}>
      <ReactFlow<Node, Edge> colorMode={theme} nodes={flowNodes.map(node => ({ ...node, selected: node.id === selected }))} edges={flowEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onInit={flow => {
          setInstance(flow);
          if (window.matchMedia('(max-width: 639px)').matches) {
            const focus = initial.find(node => node.id === selected) || initial[0];
            if (focus) void flow.setCenter(focus.position.x + 102, focus.position.y + 53, { zoom: 0.9 });
          }
        }} onNodesChange={onNodesChange} onNodeClick={(_, node) => setSelected(node.id)}
        fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.2} maxZoom={2} nodesDraggable nodesConnectable={false}
        zoomOnScroll={false} panOnScroll={false} preventScrolling={false} deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
        <Background color="var(--color-border)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <div className="border-t border-cipher-border p-4 grid gap-4 sm:grid-cols-[220px_1fr]">
      <label className="text-xs text-muted">Inspect a node
        <select className="mt-2 block w-full rounded-md border border-cipher-border bg-cipher-surface px-3 py-2 text-sm text-primary" value={selected} onChange={event => selectNode(event.target.value)}>{nodes.map(node => <option key={node.id} value={node.id}>{node.subtitle || node.type} · {node.label.slice(0, 12)}</option>)}</select>
      </label>
      <div className="min-w-0 text-sm text-secondary" aria-live="polite">
        {inspected && <><p className="text-xs text-muted mb-2">{inspected.subtitle || inspected.type}</p>{href ? <HashLink value={inspected.type === 'address' ? inspected.label : inspected.id} href={href} full className="max-w-full" /> : <p>{inspected.type === 'pool' ? 'No individual transfers can be followed inside the shielded pool.' : inspected.label}</p>}{inspected.blockTime != null && <p className="mt-2 text-xs text-muted">{new Date(inspected.blockTime * 1000).toUTCString()}</p>}</>}
      </div>
    </div>
    <div className="px-4 pb-4 space-y-3"><p className="text-xs text-muted">Solid line: public association · Dashed line: inferred relationship. Layout is schematic; it does not trace hidden funds.</p><ChartWatermark /></div>
  </section>;
}
