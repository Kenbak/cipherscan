'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface MempoolTransaction {
  txid: string;
  size: number;
  type: 'transparent' | 'shielded' | 'mixed';
  time: number;
  vin: number;
  vout: number;
  vShieldedSpend: number;
  vShieldedOutput: number;
  orchardActions?: number;
}

type BubbleState = 'entering' | 'alive' | 'popping' | 'dead';

interface Bubble {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
  type: 'transparent' | 'shielded' | 'mixed';
  opacity: number;
  age: number;
  phase: number;
  bobPhase: number;
  txid: string;
  state: BubbleState;
  popProgress: number;
  rippleRadius: number;
  rippleOpacity: number;
}

interface MempoolBubblesProps {
  transactions: MempoolTransaction[];
  className?: string;
}

const COLORS = {
  shielded: {
    fill: 'rgba(167, 139, 250, 0.25)',
    stroke: 'rgba(167, 139, 250, 0.7)',
    glow: 'rgba(167, 139, 250, 0.12)',
    pop: 'rgba(167, 139, 250, 0.5)',
  },
  mixed: {
    fill: 'rgba(255, 107, 53, 0.2)',
    stroke: 'rgba(255, 107, 53, 0.65)',
    glow: 'rgba(255, 107, 53, 0.1)',
    pop: 'rgba(255, 107, 53, 0.4)',
  },
  transparent: {
    fill: 'rgba(0, 212, 255, 0.12)',
    stroke: 'rgba(0, 212, 255, 0.4)',
    glow: 'rgba(0, 212, 255, 0.06)',
    pop: 'rgba(0, 212, 255, 0.3)',
  },
};

function sizeToRadius(size: number): number {
  const minR = 10;
  const maxR = 44;
  const normalized = Math.log2(Math.max(size, 200)) - Math.log2(200);
  const range = Math.log2(10000) - Math.log2(200);
  return minR + Math.min(normalized / range, 1) * (maxR - minR);
}

function drawShieldIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.7, x + s, y - s * 0.2);
  ctx.quadraticCurveTo(x + s * 0.85, y + s * 0.5, x, y + s);
  ctx.quadraticCurveTo(x - s * 0.85, y + s * 0.5, x - s, y - s * 0.2);
  ctx.quadraticCurveTo(x - s * 0.9, y - s * 0.7, x, y - s);
  ctx.closePath();
}

function drawMixedIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size * 0.3;
  // Two arrows crossing
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.3);
  ctx.lineTo(x + s, y - s * 0.3);
  ctx.moveTo(x + s * 0.4, y - s * 0.8);
  ctx.lineTo(x + s, y - s * 0.3);
  ctx.lineTo(x + s * 0.4, y + s * 0.2);
  ctx.moveTo(x + s, y + s * 0.3);
  ctx.lineTo(x - s, y + s * 0.3);
  ctx.moveTo(x - s * 0.4, y - s * 0.2);
  ctx.lineTo(x - s, y + s * 0.3);
  ctx.lineTo(x - s * 0.4, y + s * 0.8);
}

export function MempoolBubbles({ transactions, className = '' }: MempoolBubblesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animFrameRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<number>(0);
  const [hoveredTx, setHoveredTx] = useState<MempoolTransaction | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const router = useRouter();

  // Sync transactions to bubbles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const existing = bubblesRef.current;
    const existingIds = new Set(existing.map(b => b.id));
    const newIds = new Set(transactions.map(t => t.txid));

    // Mark removed bubbles as popping (don't remove instantly)
    for (const b of existing) {
      if (!newIds.has(b.id) && b.state === 'alive') {
        b.state = 'popping';
        b.popProgress = 0;
      }
    }

    // Add new bubbles with entrance animation
    for (const tx of transactions) {
      if (!existingIds.has(tx.txid)) {
        const targetRadius = sizeToRadius(tx.size);
        const padding = targetRadius + 10;
        bubblesRef.current.push({
          id: tx.txid,
          x: padding + Math.random() * Math.max(10, w - padding * 2),
          y: padding + Math.random() * Math.max(10, h - padding * 2),
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          radius: 0,
          targetRadius,
          type: tx.type,
          opacity: 0,
          age: 0,
          phase: Math.random() * Math.PI * 2,
          bobPhase: Math.random() * Math.PI * 2,
          txid: tx.txid,
          state: 'entering',
          popProgress: 0,
          rippleRadius: 0,
          rippleOpacity: 0.6,
        });
      }
    }
  }, [transactions]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      timeRef.current += 1;
      const t = timeRef.current;
      const bubbles = bubblesRef.current;

      // === BACKGROUND LAYER ===

      // Radial gradient atmosphere (cyan/purple corners)
      const bgGrad1 = ctx.createRadialGradient(w * 0.15, h * 0.2, 0, w * 0.15, h * 0.2, w * 0.5);
      bgGrad1.addColorStop(0, 'rgba(0, 212, 255, 0.03)');
      bgGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bgGrad1;
      ctx.fillRect(0, 0, w, h);

      const bgGrad2 = ctx.createRadialGradient(w * 0.85, h * 0.8, 0, w * 0.85, h * 0.8, w * 0.5);
      bgGrad2.addColorStop(0, 'rgba(167, 139, 250, 0.025)');
      bgGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bgGrad2;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      const gridSpacing = 50;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 0.5;
      for (let gx = gridSpacing; gx < w; gx += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = gridSpacing; gy < h; gy += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Grid intersection dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      for (let gx = gridSpacing; gx < w; gx += gridSpacing) {
        for (let gy = gridSpacing; gy < h; gy += gridSpacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Floating hex characters (faint, drifting slowly)
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(0, 212, 255, 0.04)';
      const hexChars = '0123456789abcdef';
      const seed = t * 0.3;
      for (let i = 0; i < 20; i++) {
        const hx = ((Math.sin(seed * 0.01 + i * 7.3) * 0.5 + 0.5) * w);
        const hy = ((Math.cos(seed * 0.008 + i * 4.1) * 0.5 + 0.5) * h);
        const char1 = hexChars[Math.floor(Math.abs(Math.sin(i * 13.7 + t * 0.005)) * 16)];
        const char2 = hexChars[Math.floor(Math.abs(Math.cos(i * 9.2 + t * 0.007)) * 16)];
        ctx.fillText(`${char1}${char2}`, hx, hy);
      }

      // Scan line
      const scanY = (t * 0.5) % (h + 40) - 20;
      const scanGrad = ctx.createLinearGradient(0, scanY - 15, 0, scanY + 15);
      scanGrad.addColorStop(0, 'rgba(0, 212, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 212, 255, 0.03)');
      scanGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 15, w, 30);

      // === CONNECTION LINES between nearby bubbles ===
      const aliveBubbles = bubblesRef.current.filter(b => b.state === 'alive' || b.state === 'entering');
      for (let i = 0; i < aliveBubbles.length; i++) {
        for (let j = i + 1; j < aliveBubbles.length; j++) {
          const a = aliveBubbles[i];
          const b2 = aliveBubbles[j];
          const dx = b2.x - a.x;
          const dy = b2.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 160;
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.08 * Math.min(a.opacity, b2.opacity);
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b2.x, b2.y);
            ctx.stroke();
          }
        }
      }

      // Remove dead bubbles
      bubblesRef.current = bubbles.filter(b => b.state !== 'dead');

      for (let i = 0; i < bubblesRef.current.length; i++) {
        const b = bubblesRef.current[i];

        // State machine
        if (b.state === 'entering') {
          b.opacity = Math.min(b.opacity + 0.04, 1);
          b.radius += (b.targetRadius - b.radius) * 0.06;
          if (b.radius > b.targetRadius * 0.95 && b.opacity > 0.95) {
            b.state = 'alive';
            b.radius = b.targetRadius;
            b.opacity = 1;
            b.rippleRadius = b.targetRadius;
            b.rippleOpacity = 0.4;
          }
        } else if (b.state === 'popping') {
          b.popProgress += 0.035;
          // Expand then fade
          b.radius = b.targetRadius * (1 + b.popProgress * 0.8);
          b.opacity = Math.max(0, 1 - b.popProgress * 1.5);
          if (b.popProgress >= 1) {
            b.state = 'dead';
          }
        }

        // Entrance ripple animation
        if (b.rippleOpacity > 0) {
          b.rippleRadius += 1.5;
          b.rippleOpacity -= 0.008;
        }

        b.age += 1;
        b.phase += 0.012;
        b.bobPhase += 0.008 + (i % 5) * 0.001; // Slightly different bob speed per bubble

        if (b.state !== 'popping') {
          // Organic swimming motion — sine waves at different frequencies
          const swimX = Math.sin(b.bobPhase) * 0.06 + Math.sin(b.bobPhase * 0.7 + 1.3) * 0.035;
          const swimY = Math.cos(b.bobPhase * 0.9) * 0.05 + Math.cos(b.bobPhase * 0.5 + 2.1) * 0.04;

          b.vx += swimX;
          b.vy += swimY;

          // Random nudges
          b.vx += (Math.random() - 0.5) * 0.015;
          b.vy += (Math.random() - 0.5) * 0.015;

          // Damping to keep speed reasonable
          b.vx *= 0.97;
          b.vy *= 0.97;

          // Speed cap
          const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          if (speed > 0.7) {
            b.vx = (b.vx / speed) * 0.7;
            b.vy = (b.vy / speed) * 0.7;
          }

          b.x += b.vx;
          b.y += b.vy;

          // Soft wall repulsion (not hard bounce)
          const margin = b.radius + 4;
          if (b.x < margin) { b.vx += (margin - b.x) * 0.05; }
          if (b.x > w - margin) { b.vx -= (b.x - (w - margin)) * 0.05; }
          if (b.y < margin) { b.vy += (margin - b.y) * 0.05; }
          if (b.y > h - margin) { b.vy -= (b.y - (h - margin)) * 0.05; }

          // Clamp to bounds
          b.x = Math.max(margin, Math.min(w - margin, b.x));
          b.y = Math.max(margin, Math.min(h - margin, b.y));
        }

        // Collision with other bubbles
        for (let j = i + 1; j < bubblesRef.current.length; j++) {
          const other = bubblesRef.current[j];
          if (other.state === 'popping' || other.state === 'dead') continue;
          const dx = other.x - b.x;
          const dy = other.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = b.radius + other.radius + 3;

          if (dist < minDist && dist > 0.1) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (minDist - dist) * 0.4;

            b.x -= nx * overlap;
            b.y -= ny * overlap;
            other.x += nx * overlap;
            other.y += ny * overlap;

            // Soft bounce
            const relVx = other.vx - b.vx;
            const relVy = other.vy - b.vy;
            const dot = relVx * nx + relVy * ny;
            if (dot > 0) {
              b.vx += nx * dot * 0.15;
              b.vy += ny * dot * 0.15;
              other.vx -= nx * dot * 0.15;
              other.vy -= ny * dot * 0.15;
            }
          }
        }

        // --- Drawing ---
        const isHovered = hoveredRef.current === b.id;
        const colors = COLORS[b.type];
        const glowPulse = 0.5 + 0.5 * Math.sin(b.phase);
        const breathe = 1 + Math.sin(b.phase * 1.3) * 0.015; // Subtle size breathing

        ctx.save();
        ctx.globalAlpha = b.opacity;

        const drawRadius = b.radius * breathe;

        // Entrance ripple
        if (b.rippleOpacity > 0.01) {
          ctx.strokeStyle = colors.stroke;
          ctx.globalAlpha = b.rippleOpacity * b.opacity;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = b.opacity;
        }

        // Pop particles
        if (b.state === 'popping') {
          const numParticles = 8;
          for (let p = 0; p < numParticles; p++) {
            const angle = (p / numParticles) * Math.PI * 2;
            const dist = b.radius * (0.5 + b.popProgress * 1.2);
            const px = b.x + Math.cos(angle) * dist;
            const py = b.y + Math.sin(angle) * dist;
            const pSize = 2 * (1 - b.popProgress);
            ctx.fillStyle = colors.pop;
            ctx.globalAlpha = b.opacity * 0.8;
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = b.opacity;
        }

        // Outer glow
        {
          const glowR = drawRadius * (1.8 + glowPulse * 0.4);
          const grad = ctx.createRadialGradient(b.x, b.y, drawRadius * 0.3, b.x, b.y, glowR);
          grad.addColorStop(0, colors.glow);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main bubble body
        const bodyGrad = ctx.createRadialGradient(
          b.x - drawRadius * 0.3, b.y - drawRadius * 0.3, 0,
          b.x, b.y, drawRadius
        );
        bodyGrad.addColorStop(0, colors.fill.replace(/[\d.]+\)$/, `${parseFloat(colors.fill.match(/[\d.]+\)$/)?.[0] || '0.2') * 1.5})`));
        bodyGrad.addColorStop(1, colors.fill);
        ctx.fillStyle = isHovered ? colors.stroke : bodyGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Specular highlight (glass effect)
        const specGrad = ctx.createRadialGradient(
          b.x - drawRadius * 0.25, b.y - drawRadius * 0.3, 0,
          b.x - drawRadius * 0.1, b.y - drawRadius * 0.1, drawRadius * 0.6
        );
        specGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.fill();

        // Icon inside — only for bigger bubbles
        if (drawRadius > 14 && b.state !== 'popping') {
          ctx.globalAlpha = b.opacity * (0.35 + glowPulse * 0.15);
          if (b.type === 'shielded') {
            // Draw shield path
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 1.5;
            drawShieldIcon(ctx, b.x, b.y, drawRadius * 0.7);
            ctx.stroke();
          } else if (b.type === 'mixed') {
            // Draw crossing arrows
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            drawMixedIcon(ctx, b.x, b.y, drawRadius * 0.7);
            ctx.stroke();
          }
          ctx.globalAlpha = b.opacity;
        }

        // Hover ring
        if (isHovered) {
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth = 2;
          ctx.globalAlpha = b.opacity * 0.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawRadius + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Mouse interaction
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: Bubble | null = null;
    for (const b of bubblesRef.current) {
      if (b.state === 'popping' || b.state === 'dead') continue;
      const dx = mx - b.x;
      const dy = my - b.y;
      if (dx * dx + dy * dy < b.radius * b.radius) {
        found = b;
        break;
      }
    }

    if (found) {
      hoveredRef.current = found.id;
      canvas.style.cursor = 'pointer';
      // Give the hovered bubble a tiny push away from cursor
      const dx = found.x - mx;
      const dy = found.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      found.vx += (dx / dist) * 0.15;
      found.vy += (dy / dist) * 0.15;

      const tx = transactions.find(t => t.txid === found!.id);
      if (tx) {
        setHoveredTx(tx);
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    } else {
      hoveredRef.current = null;
      canvas.style.cursor = 'default';
      setHoveredTx(null);
    }
  }, [transactions]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const b of bubblesRef.current) {
      if (b.state === 'popping' || b.state === 'dead') continue;
      const dx = mx - b.x;
      const dy = my - b.y;
      if (dx * dx + dy * dy < b.radius * b.radius) {
        router.push(`/tx/${b.txid}`);
        break;
      }
    }
  }, [router]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setHoveredTx(null);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full rounded-xl"
      />

      {/* HUD corner brackets */}
      <div className="absolute top-2 left-2 w-5 h-5 border-t border-l border-cipher-cyan/20 rounded-tl pointer-events-none" />
      <div className="absolute top-2 right-2 w-5 h-5 border-t border-r border-cipher-cyan/20 rounded-tr pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-cipher-cyan/20 rounded-bl pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-cipher-cyan/20 rounded-br pointer-events-none" />

      {/* Top-left HUD label */}
      <div className="absolute top-4 left-6 font-mono text-[9px] text-cipher-cyan/30 tracking-widest pointer-events-none select-none">
        MEMPOOL_LIVE // {transactions.length} TX
      </div>

      {/* Top-right timestamp */}
      <div className="absolute top-4 right-6 font-mono text-[9px] text-white/15 tracking-wider pointer-events-none select-none">
        {new Date().toISOString().slice(11, 19)} UTC
      </div>

      {/* Tooltip */}
      {hoveredTx && (
        <div
          className="absolute pointer-events-none z-10 transition-opacity"
          style={{
            left: Math.min(tooltipPos.x + 12, (containerRef.current?.clientWidth || 400) - 220),
            top: Math.max(8, tooltipPos.y - 90),
          }}
        >
          <div className="bg-[#14161F]/95 backdrop-blur-sm border border-cipher-cyan/15 rounded-lg px-3 py-2 shadow-xl text-xs min-w-[200px]">
            <div className="font-mono text-cipher-cyan mb-1 truncate text-[10px]">
              &gt; {hoveredTx.txid.slice(0, 16)}...{hoveredTx.txid.slice(-8)}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Type</span>
              <span className={
                hoveredTx.type === 'shielded' ? 'text-cipher-purple' :
                hoveredTx.type === 'mixed' ? 'text-orange-400' :
                'text-cipher-cyan'
              }>
                {hoveredTx.type.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted">Size</span>
              <span className="text-primary font-mono">{(hoveredTx.size / 1024).toFixed(2)} KB</span>
            </div>
            {hoveredTx.orchardActions ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">Orchard</span>
                <span className="text-cipher-purple font-mono">{hoveredTx.orchardActions} actions</span>
              </div>
            ) : hoveredTx.vShieldedSpend > 0 || hoveredTx.vShieldedOutput > 0 ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">Sapling</span>
                <span className="text-cipher-purple font-mono">{hoveredTx.vShieldedSpend}s → {hoveredTx.vShieldedOutput}o</span>
              </div>
            ) : null}
            <div className="text-[10px] text-muted mt-1 border-t border-white/5 pt-1">Click to view transaction</div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-4 text-[10px] text-muted font-mono bg-[#14161F]/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/5">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cipher-purple/60 border border-cipher-purple/80" />
          <span>Shielded</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500/40 border border-orange-500/70" />
          <span>Mixed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cipher-cyan/30 border border-cipher-cyan/50" />
          <span>Transparent</span>
        </div>
      </div>

      {/* Empty state overlay */}
      {transactions.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-8 h-8 border border-cipher-cyan/20 rounded-full flex items-center justify-center animate-pulse">
            <div className="w-2 h-2 bg-cipher-cyan/40 rounded-full" />
          </div>
          <div className="text-center">
            <p className="text-muted font-mono text-xs tracking-wider">&gt; SCANNING MEMPOOL...</p>
            <p className="text-white/10 font-mono text-[10px] mt-1">awaiting pending transactions</p>
          </div>
        </div>
      )}
    </div>
  );
}
