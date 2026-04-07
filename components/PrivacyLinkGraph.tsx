'use client';

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

interface PrivacyLinkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusNodeId?: string;
  height?: number;
}

function truncateLabel(label: string) {
  return label.length > 18 ? `${label.slice(0, 18)}...` : label;
}

function buildLayout(nodes: GraphNode[], edges: GraphEdge[], focusNodeId?: string) {
  const addressSources = new Set(edges.filter((edge) => edge.source.startsWith('address:')).map((edge) => edge.source));
  const addressTargets = new Set(edges.filter((edge) => edge.target.startsWith('address:')).map((edge) => edge.target));

  const leftAddresses = nodes.filter((node) => node.type === 'address' && addressSources.has(node.id));
  const rightAddresses = nodes.filter((node) => node.type === 'address' && addressTargets.has(node.id) && !addressSources.has(node.id));
  const txNodes = nodes
    .filter((node) => node.type === 'transaction')
    .sort((a, b) => (a.blockTime || 0) - (b.blockTime || 0));

  const focusIdx = txNodes.findIndex((node) => node.id === focusNodeId);
  const sourceTx = focusIdx > 0 ? txNodes.slice(0, focusIdx) : [];
  const focusTx = focusIdx >= 0 ? [txNodes[focusIdx]] : txNodes.slice(0, 1);
  const targetTx = focusIdx >= 0 ? txNodes.slice(focusIdx + 1) : txNodes.slice(1);

  const positionColumn = (columnNodes: GraphNode[], x: number, yStart: number, yGap: number) =>
    columnNodes.map((node, index) => [node.id, { x, y: yStart + index * yGap }] as const);

  return new Map([
    ...positionColumn(leftAddresses, 80, 60, 70),
    ...positionColumn(sourceTx, 210, 70, 80),
    ...positionColumn(focusTx, 380, 120, 80),
    ...positionColumn(targetTx, 550, 70, 80),
    ...positionColumn(rightAddresses, 680, 60, 70),
  ]);
}

export function PrivacyLinkGraph({
  nodes,
  edges,
  focusNodeId,
  height = 240,
}: PrivacyLinkGraphProps) {
  if (nodes.length === 0 || edges.length === 0) {
    return null;
  }

  const width = 760;
  const positions = buildLayout(nodes, edges, focusNodeId);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-cipher-border bg-cipher-surface/30 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[720px]">
        {edges.map((edge) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;

          return (
            <g key={edge.id}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.type === 'PAIR_LINK' ? '#56D4C8' : '#E8C48D'}
                strokeOpacity={0.7}
                strokeWidth={Math.max(1.5, edge.confidence / 35)}
              />
              {edge.label && (
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 8}
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {truncateLabel(edge.label)}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const isFocus = node.id === focusNodeId;
          const fill = node.type === 'transaction'
            ? isFocus
              ? '#56D4C8'
              : '#5B9CF6'
            : '#E8C48D';

          return (
            <g key={node.id}>
              <circle cx={position.x} cy={position.y} r={isFocus ? 18 : 14} fill={fill} fillOpacity={0.18} stroke={fill} />
              <text x={position.x} y={position.y + 4} textAnchor="middle" className="fill-white text-[10px] font-mono">
                {node.type === 'transaction' ? 'tx' : 't'}
              </text>
              <text x={position.x} y={position.y + 28} textAnchor="middle" className="fill-slate-300 text-[10px] font-mono">
                {truncateLabel(node.label)}
              </text>
              {node.amountZec !== undefined && (
                <text x={position.x} y={position.y + 42} textAnchor="middle" className="fill-slate-500 text-[9px] font-mono">
                  {node.amountZec.toFixed(4)} ZEC
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
