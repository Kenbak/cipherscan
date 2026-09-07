'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChartWatermark } from '@/components/ChartWatermark';
import type { ConnectionNode } from './address-connections';

const HEIGHT = 440;
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** A bounded, labelled relationship diagram. Positions and sizes do not encode money. */
export function AddressBubbleMap({ nodes, selectedId, onSelect, mode }: {
  nodes: ConnectionNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  mode: 'recent' | 'cluster';
}) {
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ id: string | null; x: number; y: number; moved: boolean } | null>(null);
  const gridId = useId().replace(/:/g, '');
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(320, entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => nodes.map((node, index) => {
    const ring = nodes.length > 24 ? Math.floor(index / 20) : 0;
    const inRing = nodes.length > 24 ? Math.min(20, nodes.length - ring * 20) : nodes.length;
    const angle = ((nodes.length > 24 ? index % 20 : index) / Math.max(1, inRing)) * Math.PI * 2 - Math.PI / 2 + ring * .14;
    const scale = nodes.length > 24 ? .48 + ring * .23 : 1;
    return { ...node, x: width / 2 + Math.cos(angle) * (width / 2 - 65) * scale, y: HEIGHT / 2 + Math.sin(angle) * 155 * scale };
  }), [nodes, width]);
  const reset = () => { setView({ x: 0, y: 0, zoom: 1 }); setPositions({}); };
  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
  };
  const buttonClass = 'rounded border border-cipher-border px-3 py-2 text-xs font-mono text-secondary hover:bg-cipher-hover hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold';
  return <div ref={container} className="relative min-w-0 bg-cipher-bg rounded-lg overflow-hidden">
    <div className="absolute top-3 left-3 z-10 flex gap-1.5 bg-cipher-surface rounded-lg p-1">
      <button type="button" aria-label="Zoom out" className={buttonClass} disabled={view.zoom <= .6} onClick={() => setView(v => ({ ...v, zoom: Math.max(.6, v.zoom - .2) }))}>−</button>
      <button type="button" aria-label="Zoom in" className={buttonClass} disabled={view.zoom >= 2.4} onClick={() => setView(v => ({ ...v, zoom: Math.min(2.4, v.zoom + .2) }))}>+</button>
      <button type="button" className={buttonClass} onClick={reset}>Reset view</button>
    </div>
    <svg ref={svg} role="group" aria-label="Interactive address connections. Select a node to inspect; drag nodes or the background to rearrange." viewBox={`0 0 ${width} ${HEIGHT}`} className="block w-full touch-none" style={{ height: HEIGHT }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const target = (event.target as Element).closest('[data-node]');
        drag.current = { id: target?.getAttribute('data-node') || null, ...point(event), moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        const p = point(event), previous = drag.current;
        const dx = p.x - previous.x, dy = p.y - previous.y;
        if (Math.abs(dx) + Math.abs(dy) < 2 && !previous.moved) return;
        previous.moved = true;
        if (previous.id) {
          const node = layout.find(n => n.id === previous.id);
          if (node) setPositions(current => { const old = current[node.id] || node; return { ...current, [node.id]: { x: old.x + dx / view.zoom, y: old.y + dy / view.zoom } }; });
        } else setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
        previous.x = p.x; previous.y = p.y;
      }}
      onPointerUp={event => {
        if (drag.current && !drag.current.moved) onSelect(drag.current.id);
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { drag.current = null; }}>
      <defs><pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" className="fill-muted" opacity=".15" /></pattern></defs>
      <rect width={width} height={HEIGHT} fill={`url(#${gridId})`} />
      <g transform={`translate(${width / 2 + view.x} ${HEIGHT / 2 + view.y}) scale(${view.zoom}) translate(${-width / 2} ${-HEIGHT / 2})`}>
        {layout.map(node => {
          const p = positions[node.id] || node;
          return <line key={node.id} x1={width / 2} y1={HEIGHT / 2} x2={p.x} y2={p.y}
            className={selectedId === node.id ? 'stroke-cipher-gold' : 'stroke-muted'}
            strokeWidth={selectedId === node.id ? 2 : 1} strokeDasharray={mode === 'cluster' ? '4 5' : undefined}
            opacity={selectedId && selectedId !== node.id ? .12 : selectedId === node.id ? .85 : .35} />;
        })}
        <circle cx={width / 2} cy={HEIGHT / 2} r="28" className="fill-cipher-surface stroke-cipher-gold" strokeWidth="2" />
        <circle cx={width / 2} cy={HEIGHT / 2} r="5" className="fill-cipher-gold" />
        <text x={width / 2} y={HEIGHT / 2 + 47} textAnchor="middle" className="fill-primary font-mono" fontSize="12">This address</text>
        {layout.map((node, index) => {
          const p = positions[node.id] || node, selected = selectedId === node.id;
          return <g key={node.id} data-node={node.id} role="button" tabIndex={0} aria-label={`Inspect ${node.label || node.id}`} aria-pressed={selected}
            className="cursor-grab outline-none group" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
            <title>{node.label ? `${node.label} · ` : ''}{node.id}</title>
            <circle cx={p.x} cy={p.y} r="20" fill="transparent" className="group-focus-visible:stroke-cipher-gold" strokeWidth="2" />
            <circle cx={p.x} cy={p.y} r={selected ? 11 : 8} className={selected ? 'fill-cipher-gold stroke-cipher-gold' : 'fill-cipher-surface stroke-secondary'} strokeWidth="2" opacity={selectedId && !selected ? .4 : 1} />
            {(selected || (!selectedId && (nodes.length <= 10 || index % Math.ceil(nodes.length / 8) === 0))) && <text x={p.x} y={p.y + 29} textAnchor="middle" fontSize="11" className="fill-secondary font-mono pointer-events-none">{node.label ? node.label.slice(0, 19) : short(node.id)}</text>}
          </g>;
        })}
      </g>
    </svg>
    <ChartWatermark size="map" />
  </div>;
}
