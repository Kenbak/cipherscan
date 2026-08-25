'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { getApiUrl } from '@/lib/api-config';

interface TopologyNode extends SimulationNodeDatum {
  id: number;
  lat: number | null;
  lon: number | null;
  client: string;
  isTor: boolean;
  betweenness: number | null;
  closeness: number | null;
  degree: number | null;
}

interface TopologyEdge extends SimulationLinkDatum<TopologyNode> {
  source: number | TopologyNode;
  target: number | TopologyNode;
}

const CLIENT_COLORS: Record<string, string> = {
  Zebra: '#5B9CF6',
  Zakura: '#34D399',
  zcashd: '#F59E0B',
  Unknown: '#6B7280',
  Other: '#8B5CF6',
};

const TOR_COLOR = '#A855F7';

export function TopologyGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [hovered, setHovered] = useState<TopologyNode | null>(null);
  const nodesRef = useRef<TopologyNode[]>([]);
  const edgesRef = useRef<TopologyEdge[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation<TopologyNode>> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const { x: tx, y: ty, k } = transformRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + tx, height / 2 + ty);
    ctx.scale(k, k);

    // Draw edges
    ctx.strokeStyle = 'rgba(91, 156, 246, 0.08)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const edge of edgesRef.current) {
      const source = edge.source as TopologyNode;
      const target = edge.target as TopologyNode;
      if (source.x != null && source.y != null && target.x != null && target.y != null) {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      }
    }
    ctx.stroke();

    // Draw nodes
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const radius = Math.max(2, Math.min(8, (node.degree || 1) * 0.3 + 2));
      const color = node.isTor ? TOR_COLOR : (CLIENT_COLORS[node.client] || CLIENT_COLORS.Unknown);

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = node === hovered ? 1 : 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (node === hovered) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [hovered]);

  useEffect(() => {
    const apiUrl = getApiUrl();

    async function fetchTopology() {
      try {
        const res = await fetch(`${apiUrl}/api/network/topology`);
        if (!res.ok) return;
        const data = await res.json();

        if (!data.nodes?.length) {
          setLoading(false);
          return;
        }

        const nodeMap = new Map<number, TopologyNode>();
        const nodes: TopologyNode[] = data.nodes.map((n: TopologyNode) => {
          const node: TopologyNode = { ...n };
          nodeMap.set(n.id, node);
          return node;
        });

        const edges: TopologyEdge[] = (data.edges || []).filter(
          (e: { source: number; target: number }) => nodeMap.has(e.source) && nodeMap.has(e.target)
        );

        nodesRef.current = nodes;
        edgesRef.current = edges;
        setNodeCount(nodes.length);
        setEdgeCount(edges.length);

        const sim = forceSimulation<TopologyNode>(nodes)
          .force('link', forceLink<TopologyNode, TopologyEdge>(edges)
            .id(d => d.id)
            .distance(50)
            .strength(0.3)
          )
          .force('charge', forceManyBody().strength(-30))
          .force('center', forceCenter(0, 0))
          .force('collide', forceCollide(5))
          .alphaDecay(0.02)
          .on('tick', draw);

        simRef.current = sim;
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch topology:', err);
        setLoading(false);
      }
    }

    fetchTopology();

    return () => {
      simRef.current?.stop();
    };
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const { x: tx, y: ty, k } = transformRef.current;
    const mx = (e.clientX - rect.left - canvas.width / 2 - tx) / k;
    const my = (e.clientY - rect.top - canvas.height / 2 - ty) / k;

    let closest: TopologyNode | null = null;
    let closestDist = 100;

    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const dist = Math.hypot(node.x - mx, node.y - my);
      if (dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }

    setHovered(closestDist < 12 ? closest : null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transformRef.current.k = Math.max(0.2, Math.min(5, transformRef.current.k * delta));
    draw();
  }, [draw]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-mono text-secondary uppercase tracking-wider">
          Network Topology
        </h3>
        {!loading && (
          <span className="text-[10px] text-muted font-mono">
            {nodeCount} nodes · {edgeCount} edges
          </span>
        )}
      </div>

      <div className="relative w-full h-[400px] bg-cipher-bg rounded-lg border border-cipher-border overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted animate-pulse">Loading topology...</span>
          </div>
        ) : nodeCount === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted">No topology data available yet. Crawl data will appear here once the crawler is active.</span>
          </div>
        ) : null}

        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
        />

        {hovered && (
          <div className="absolute bottom-3 left-3 bg-cipher-card/95 border border-cipher-border rounded-md px-3 py-2 backdrop-blur-sm pointer-events-none">
            <div className="text-xs font-mono text-primary">{hovered.client} {hovered.isTor ? '(Tor)' : ''}</div>
            <div className="text-[10px] text-muted font-mono mt-0.5">
              Degree: {hovered.degree || '—'} · Betweenness: {hovered.betweenness?.toFixed(4) || '—'}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] font-mono text-muted">
        {Object.entries(CLIENT_COLORS).filter(([k]) => k !== 'Other').map(([name, color]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TOR_COLOR }} />
          Tor
        </span>
      </div>
    </div>
  );
}
