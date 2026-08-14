'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Delaunay } from 'd3-delaunay';

export type BubbleRole = 'self' | 'peer' | 'inflow' | 'outflow';

export interface BubbleNode {
  id: string;
  role: BubbleRole;
  name: string | null;
  sameEntity: boolean;
  valueZec: number;
  sentZec: number;
  receivedZec: number;
  txCount: number;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
}

interface AddressBubbleMapProps {
  nodes: BubbleNode[];
  width: number;
  height: number;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  colors: {
    self: string;
    entity: string;
    counterparty: string;
    text: string;
    textDim: string;
  };
}

function nodeColor(n: Pick<BubbleNode, 'role' | 'sameEntity'>, colors: AddressBubbleMapProps['colors']) {
  if (n.role === 'self') return colors.self;
  if (n.sameEntity) return colors.entity;
  return colors.counterparty;
}

function hashUnit(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AddressBubbleMap({
  nodes,
  width,
  height,
  hoveredId,
  onHover,
  onClick,
  colors,
}: AddressBubbleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simNodesRef = useRef<BubbleNode[]>([]);
  const animRef = useRef(0);
  const hoveredRef = useRef<string | null>(null);
  const dragRef = useRef<{
    id: string;
    moved: boolean;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    vx: number;
    vy: number;
  } | null>(null);

  // Sync simulation state when graph data changes
  useEffect(() => {
    simNodesRef.current = nodes.map(n => ({
      ...n,
      vx: 0,
      vy: 0,
    }));
  }, [nodes]);

  // Keep hover ref in sync for animation loop
  useEffect(() => {
    hoveredRef.current = hoveredId;
  }, [hoveredId]);

  // Animation + rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const cx = width / 2;
    const cy = height / 2;

    const tick = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const sim = simNodesRef.current;
      if (!sim.length) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      const activeHover = hoveredRef.current;
      const drag = dragRef.current;
      const hub = sim.find(n => n.role === 'self');
      const hx = hub?.x ?? cx;
      const hy = hub?.y ?? cy;

      // ── Physics ────────────────────────────────────────────────────────
      for (const n of sim) {
        if (drag?.id === n.id) continue;

        if (n.role === 'self') {
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          const m = n.radius + 8;
          n.x = Math.max(m, Math.min(width - m, n.x));
          n.y = Math.max(m, Math.min(height - m, n.y));
          continue;
        }

        // Zone pull — peers orbit the hub, inflow left, outflow right
        if (n.role === 'peer' && hub) {
          const angle = Math.atan2(n.targetY - cy, n.targetX - cx);
          const r = Math.hypot(n.targetX - cx, n.targetY - cy);
          const tx = hx + Math.cos(angle) * r;
          const ty = hy + Math.sin(angle) * r;
          n.vx += (tx - n.x) * 0.018;
          n.vy += (ty - n.y) * 0.018;
        } else {
          n.vx += (n.targetX - n.x) * 0.018;
          n.vy += (n.targetY - n.y) * 0.018;
        }

        // Hovered bubble pushes neighbors away (bubble-map hover lift)
        if (activeHover && activeHover !== n.id) {
          const h = sim.find(b => b.id === activeHover);
          if (h) {
            const dx = n.x - h.x;
            const dy = n.y - h.y;
            const dist = Math.hypot(dx, dy) || 1;
            const range = h.radius + n.radius + (activeHover === h.id ? 0 : 36);
            if (dist < range) {
              const f = (1 - dist / range) * 0.35;
              n.vx += (dx / dist) * f;
              n.vy += (dy / dist) * f;
            }
          }
        }

        n.vx *= 0.88;
        n.vy *= 0.88;

        const speed = Math.hypot(n.vx, n.vy);
        const maxSpeed = activeHover === n.id ? 0.15 : 2.8;
        if (speed > maxSpeed) {
          n.vx = (n.vx / speed) * maxSpeed;
          n.vy = (n.vy / speed) * maxSpeed;
        }

        n.x += n.vx;
        n.y += n.vy;
      }

      // Collisions
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const a = sim[i];
          const b = sim[j];
          if (a.role === 'self' || b.role === 'self') continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist < 0.01) dist = 0.01;
          const hoverPad =
            (activeHover === a.id ? 14 : 0) + (activeHover === b.id ? 14 : 0);
          const minDist = a.radius + b.radius + 6 + hoverPad;
          if (dist < minDist) {
            const push = (minDist - dist) * 0.45;
            const ux = dx / dist;
            const uy = dy / dist;
            if (drag?.id !== a.id) {
              a.x -= ux * push;
              a.y -= uy * push;
            }
            if (drag?.id !== b.id) {
              b.x += ux * push;
              b.y += uy * push;
            }
          }
        }
      }

      // Hub collision — nothing overlaps the anchor
      if (hub) {
        for (const n of sim) {
          if (n.role === 'self') continue;
          const dx = n.x - hub.x;
          const dy = n.y - hub.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = hub.radius + n.radius + 10;
          if (dist < minDist) {
            const push = minDist - dist;
            n.x += (dx / dist) * push;
            n.y += (dy / dist) * push;
          }
        }
      }

      // Soft bounds
      for (const n of sim) {
        if (n.role === 'self') continue;
        const m = n.radius + 8;
        if (n.x < m) n.x = m;
        if (n.x > width - m) n.x = width - m;
        if (n.y < m) n.y = m;
        if (n.y > height - m) n.y = height - m;
      }

      // ── Draw links to hub ────────────────────────────────────────────
      if (hub) {
        for (const n of sim) {
          if (n.role === 'self') continue;
          const active =
            activeHover && (activeHover === n.id || activeHover === hub.id);
          ctx.beginPath();
          ctx.moveTo(hub.x, hub.y);
          ctx.lineTo(n.x, n.y);
          ctx.strokeStyle = n.sameEntity
            ? active
              ? 'rgba(232, 196, 141, 0.75)'
              : 'rgba(232, 196, 141, 0.18)'
            : active
              ? 'rgba(91, 156, 246, 0.8)'
              : 'rgba(91, 156, 246, 0.22)';
          ctx.lineWidth = active ? 1.8 : 0.9;
          ctx.globalAlpha = activeHover && !active ? 0.25 : 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ── Draw bubbles ─────────────────────────────────────────────────
      for (const n of sim) {
        const isActive = activeHover === n.id;
        const isDimmed = Boolean(activeHover) && !isActive && n.role !== 'self';
        const r = n.radius * (isActive ? 1.12 : 1);
        const fill = nodeColor(n, colors);

        if (isActive) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.globalAlpha = 0.2;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.globalAlpha = isDimmed ? 0.22 : isActive || n.role === 'self' ? 1 : 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.strokeStyle = isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = isActive ? 2 : 0.8;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.stroke();

        if (n.role === 'self' || n.name || isActive) {
          const label = n.role === 'self' ? 'This address' : n.name || shortAddr(n.id);
          ctx.font = `${n.role === 'self' || n.name ? '600' : '400'} 11px ui-monospace, monospace`;
          ctx.fillStyle = isDimmed ? colors.textDim : isActive || n.name ? colors.text : colors.textDim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(label, n.x, n.y + r + 5);
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [width, height, colors]);

  const findNodeAt = useCallback(
    (mx: number, my: number): BubbleNode | null => {
      const sim = simNodesRef.current;
      if (!sim.length) return null;

      const points: [number, number][] = sim.map(n => [n.x, n.y]);
      const delaunay = Delaunay.from(points);
      const idx = delaunay.find(mx, my);
      const n = sim[idx];
      if (!n) return null;
      // Voronoi picks the nearest cell; cap distance so empty corners stay clear
      const dx = n.x - mx;
      const dy = n.y - my;
      const maxDist = Math.max(n.radius * 2.5, 44);
      if (dx * dx + dy * dy > maxDist * maxDist) return null;
      return n;
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const drag = dragRef.current;
      if (drag) {
        const n = simNodesRef.current.find(b => b.id === drag.id);
        if (n) {
          n.x = mx + drag.offsetX;
          n.y = my + drag.offsetY;
          drag.vx = drag.vx * 0.65 + (mx - drag.lastX) * 0.35;
          drag.vy = drag.vy * 0.65 + (my - drag.lastY) * 0.35;
          drag.lastX = mx;
          drag.lastY = my;
          if (Math.hypot(mx - drag.startX, my - drag.startY) > 5) drag.moved = true;
          canvas.style.cursor = 'grabbing';
        }
        return;
      }

      const hit = findNodeAt(mx, my);
      hoveredRef.current = hit?.id ?? null;
      onHover(hit?.id ?? null);
      canvas.style.cursor = hit ? 'grab' : 'default';
    },
    [findNodeAt, onHover],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = findNodeAt(mx, my);
      if (!hit) return;
      dragRef.current = {
        id: hit.id,
        moved: false,
        startX: mx,
        startY: my,
        offsetX: hit.x - mx,
        offsetY: hit.y - my,
        lastX: mx,
        lastY: my,
        vx: 0,
        vy: 0,
      };
    },
    [findNodeAt],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const n = simNodesRef.current.find(b => b.id === drag.id);
      if (n) {
        if (!drag.moved) {
          onClick(n.id);
        } else {
          n.vx = Math.max(-6, Math.min(6, drag.vx));
          n.vy = Math.max(-6, Math.min(6, drag.vy));
        }
      }
      dragRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = 'default';
    },
    [onClick],
  );

  const handleMouseLeave = useCallback(() => {
    dragRef.current = null;
    hoveredRef.current = null;
    onHover(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
  }, [onHover]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="block w-full"
        style={{ height }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

/** Assign initial positions + zone targets for the bubble simulation. */
export function buildBubbleNodes(
  raw: Omit<BubbleNode, 'x' | 'y' | 'vx' | 'vy' | 'targetX' | 'targetY'>[],
  width: number,
  height: number,
): BubbleNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const spread = Math.min(width, height);
  const peers = raw.filter(r => r.role === 'peer');
  const counterparties = raw.filter(r => r.role === 'inflow' || r.role === 'outflow');

  return raw.map(n => {
    let x = cx;
    let y = cy;
    let targetX = cx;
    let targetY = cy;
    const jitter = (salt: string, amp: number) => (hashUnit(n.id + salt) - 0.5) * amp;

    if (n.role === 'peer') {
      const peerIdx = peers.findIndex(p => p.id === n.id);
      const perRing = peers.length <= 14 ? peers.length : 14;
      const ring = Math.floor(peerIdx / perRing);
      const idxInRing = peerIdx % perRing;
      const countInRing = Math.min(perRing, peers.length - ring * perRing);
      const angle = (idxInRing / Math.max(countInRing, 1)) * Math.PI * 2 + ring * 0.4;
      const r = spread * (0.14 + ring * 0.07);
      targetX = cx + Math.cos(angle) * r;
      targetY = cy + Math.sin(angle) * r;
      x = targetX + jitter('x', 20);
      y = targetY + jitter('y', 20);
    } else if (n.role === 'inflow' || n.role === 'outflow') {
      const idx = counterparties.findIndex(p => p.id === n.id);
      const angle = (idx / Math.max(counterparties.length, 1)) * Math.PI * 2;
      const r = spread * 0.38;
      targetX = cx + Math.cos(angle) * r;
      targetY = cy + Math.sin(angle) * r;
      x = targetX + jitter('x', 36);
      y = targetY + jitter('y', 36);
    }

    return { ...n, x, y, vx: 0, vy: 0, targetX, targetY };
  });
}
