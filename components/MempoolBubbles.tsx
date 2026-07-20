'use client';

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
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
  /** Frames remaining with a raised speed cap (after fling/repulsion/shockwave) */
  excited: number;
}

interface MempoolBubblesProps {
  transactions: MempoolTransaction[];
  className?: string;
  ambient?: boolean;
  stats?: { total: number; shieldedPct: number } | null;
  /** Increment to trigger the block-mined shockwave */
  blockPulse?: number;
}

export interface MempoolBubblesHandle {
  toggleFullscreen: () => void;
}

// Resolve theme-aware colors from CSS variables at runtime so bubbles
// adapt to light/dark mode (brand colors differ between themes).
function readThemeColors() {
  if (typeof window === 'undefined') {
    return {
      cyan: '0 212 255',
      purple: '167 139 250',
      orange: '255 107 53',
      isLight: false,
      labelText: 'rgba(255, 255, 255, 0.95)',
      labelShadow: 'rgba(0, 0, 0, 0.45)',
    };
  }
  const root = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.classList.contains('light');
  return {
    cyan: root.getPropertyValue('--color-cyan-rgb').trim() || '0 212 255',
    purple: root.getPropertyValue('--color-purple-rgb').trim() || '167 139 250',
    orange: root.getPropertyValue('--color-orange-rgb').trim() || '255 107 53',
    isLight,
    labelText: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.92)',
    labelShadow: isLight ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.45)',
  };
}

type TypeColors = {
  fill: string;
  stroke: string;
  glow: string;
  pop: string;
  label: string;
};

function buildColors(theme: ReturnType<typeof readThemeColors>): Record<'transparent' | 'mixed' | 'shielded', TypeColors> {
  // In light mode bubbles need stronger fill/stroke alphas because the brand
  // colors are darker and the canvas sits on a near-white surface.
  const fillA = theme.isLight ? 0.42 : 0.32;
  const strokeA = theme.isLight ? 0.95 : 0.85;
  const glowA = theme.isLight ? 0.22 : 0.18;
  const popA = theme.isLight ? 0.7 : 0.6;
  return {
    shielded: {
      fill: `rgba(${theme.purple.replace(/ /g, ', ')}, ${fillA})`,
      stroke: `rgba(${theme.purple.replace(/ /g, ', ')}, ${strokeA})`,
      glow: `rgba(${theme.purple.replace(/ /g, ', ')}, ${glowA})`,
      pop: `rgba(${theme.purple.replace(/ /g, ', ')}, ${popA})`,
      label: theme.labelText,
    },
    mixed: {
      fill: `rgba(${theme.orange.replace(/ /g, ', ')}, ${fillA - 0.04})`,
      stroke: `rgba(${theme.orange.replace(/ /g, ', ')}, ${strokeA - 0.05})`,
      glow: `rgba(${theme.orange.replace(/ /g, ', ')}, ${glowA - 0.02})`,
      pop: `rgba(${theme.orange.replace(/ /g, ', ')}, ${popA - 0.1})`,
      label: theme.labelText,
    },
    transparent: {
      fill: `rgba(${theme.cyan.replace(/ /g, ', ')}, ${fillA - 0.12})`,
      stroke: `rgba(${theme.cyan.replace(/ /g, ', ')}, ${strokeA - 0.15})`,
      glow: `rgba(${theme.cyan.replace(/ /g, ', ')}, ${glowA - 0.06})`,
      pop: `rgba(${theme.cyan.replace(/ /g, ', ')}, ${popA - 0.15})`,
      label: theme.labelText,
    },
  };
}

const TYPE_LABEL = {
  transparent: 'T',
  mixed: 'M',
  shielded: 'S',
} as const;

function sizeToRadius(size: number): number {
  const minR = 10;
  const maxR = 44;
  const normalized = Math.log2(Math.max(size, 200)) - Math.log2(200);
  const range = Math.log2(10000) - Math.log2(200);
  return minR + Math.min(normalized / range, 1) * (maxR - minR);
}


export const MempoolBubbles = forwardRef<MempoolBubblesHandle, MempoolBubblesProps>(
  function MempoolBubbles({ transactions, className = '', ambient = false, stats = null, blockPulse = 0 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animFrameRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<number>(0);
  const themeRef = useRef(readThemeColors());
  const colorsRef = useRef(buildColors(themeRef.current));
  const [hoveredTx, setHoveredTx] = useState<MempoolTransaction | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const cursorTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Cursor position for the gravity-well repulsion effect
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  // Active drag state (drag-and-fling)
  const dragRef = useRef<{
    id: string;
    moved: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    offsetX: number;
    offsetY: number;
    vx: number;
    vy: number;
  } | null>(null);
  // Expanding shockwave when a block is mined
  const waveRef = useRef<{ active: boolean; r: number }>({ active: false, r: 0 });
  const router = useRouter();

  // Fullscreen API
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useImperativeHandle(ref, () => ({ toggleFullscreen }), [toggleFullscreen]);

  // Trigger the shockwave whenever a new block is mined
  useEffect(() => {
    if (blockPulse > 0) {
      waveRef.current = { active: true, r: 0 };
    }
  }, [blockPulse]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Auto-hide cursor in fullscreen or ambient mode
  useEffect(() => {
    if (!isFullscreen && !ambient) return;
    const resetCursor = () => {
      setCursorVisible(true);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => setCursorVisible(false), 4000);
    };
    resetCursor();
    const el = containerRef.current;
    el?.addEventListener('mousemove', resetCursor);
    return () => {
      el?.removeEventListener('mousemove', resetCursor);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    };
  }, [isFullscreen, ambient]);

  // Watch for theme changes (light/dark class on <html>)
  useEffect(() => {
    const refresh = () => {
      themeRef.current = readThemeColors();
      colorsRef.current = buildColors(themeRef.current);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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

    // Add new bubbles with entrance animation, drifting in from the edges toward the center
    for (const tx of transactions) {
      if (!existingIds.has(tx.txid)) {
        const targetRadius = sizeToRadius(tx.size);
        const padding = targetRadius + 8;
        // Spawn from a random edge so they "flow in" toward the center
        const angle = Math.random() * Math.PI * 2;
        const spawnRadius = Math.max(w, h) * 0.6;
        const cx = w / 2;
        const cy = h / 2;
        const spawnX = cx + Math.cos(angle) * spawnRadius;
        const spawnY = cy + Math.sin(angle) * spawnRadius;
        bubblesRef.current.push({
          id: tx.txid,
          x: Math.max(padding, Math.min(w - padding, spawnX)),
          y: Math.max(padding, Math.min(h - padding, spawnY)),
          vx: 0,
          vy: 0,
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
          excited: 0,
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
      const theme = themeRef.current;
      const cyanRgb = theme.cyan.replace(/ /g, ', ');
      const purpleRgb = theme.purple.replace(/ /g, ', ');
      // In light mode, the canvas sits on a near-white surface; ambient effects
      // use dark tints, grid lines use black, hex chars use brand cyan at low alpha.
      const tintRgb = theme.isLight ? '15, 23, 42' : '255, 255, 255';
      const gridLineAlpha = theme.isLight ? 0.03 : 0.02;
      const gridDotAlpha = theme.isLight ? 0.06 : 0.04;
      const hexCharAlpha = theme.isLight ? 0.07 : 0.04;
      const ambientCyanAlpha = theme.isLight ? 0.05 : 0.03;
      const ambientPurpleAlpha = theme.isLight ? 0.04 : 0.025;
      const scanAlpha = theme.isLight ? 0.05 : 0.03;

      // === BACKGROUND LAYER (cypherpunk vibe) ===

      // Radial gradient atmosphere (cyan/purple corners)
      const bgGrad1 = ctx.createRadialGradient(w * 0.15, h * 0.2, 0, w * 0.15, h * 0.2, w * 0.5);
      bgGrad1.addColorStop(0, `rgba(${cyanRgb}, ${ambientCyanAlpha})`);
      bgGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bgGrad1;
      ctx.fillRect(0, 0, w, h);

      const bgGrad2 = ctx.createRadialGradient(w * 0.85, h * 0.8, 0, w * 0.85, h * 0.8, w * 0.5);
      bgGrad2.addColorStop(0, `rgba(${purpleRgb}, ${ambientPurpleAlpha})`);
      bgGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bgGrad2;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      const gridSpacing = 50;
      ctx.strokeStyle = `rgba(${tintRgb}, ${gridLineAlpha})`;
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
      ctx.fillStyle = `rgba(${tintRgb}, ${gridDotAlpha})`;
      for (let gx = gridSpacing; gx < w; gx += gridSpacing) {
        for (let gy = gridSpacing; gy < h; gy += gridSpacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Floating hex characters (faint, drifting slowly)
      ctx.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.fillStyle = `rgba(${cyanRgb}, ${hexCharAlpha})`;
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
      scanGrad.addColorStop(0, `rgba(${cyanRgb}, 0)`);
      scanGrad.addColorStop(0.5, `rgba(${cyanRgb}, ${scanAlpha})`);
      scanGrad.addColorStop(1, `rgba(${cyanRgb}, 0)`);
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 15, w, 30);

      // Remove dead bubbles
      bubblesRef.current = bubbles.filter(b => b.state !== 'dead');

      // === BLOCK-MINED SHOCKWAVE ===
      // Expanding ring from the center; bubbles on the wavefront get kicked outward.
      const wave = waveRef.current;
      const waveMaxR = Math.hypot(w, h) * 0.62;
      if (wave.active) {
        wave.r += Math.max(w, h) * 0.022;
        const wcx = w / 2;
        const wcy = h / 2;
        for (const b of bubblesRef.current) {
          if (b.state === 'dead') continue;
          const dxw = b.x - wcx;
          const dyw = b.y - wcy;
          const distW = Math.hypot(dxw, dyw) || 1;
          if (Math.abs(distW - wave.r) < 40) {
            b.vx += (dxw / distW) * 2.4;
            b.vy += (dyw / distW) * 2.4;
            b.excited = Math.max(b.excited, 70);
          }
        }
        if (wave.r > waveMaxR) wave.active = false;
      }

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

        const isDragged = dragRef.current?.id === b.id;
        if (b.state !== 'popping' && !isDragged) {
          // Per-bubble wander — each bubble drifts in its own slowly rotating
          // direction so they feel like individual entities, not a clump.
          // The phase/bobPhase seeds were assigned at creation so directions differ.
          const wanderAngle = b.phase * 0.4 + b.bobPhase * 0.7;
          const wanderStrength = 0.015;
          b.vx += Math.cos(wanderAngle) * wanderStrength;
          b.vy += Math.sin(wanderAngle) * wanderStrength;

          // Cursor gravity well — bubbles gently repel from the pointer
          const m = mouseRef.current;
          if (m.active) {
            const dxm = b.x - m.x;
            const dym = b.y - m.y;
            const distM = Math.hypot(dxm, dym);
            const repelRange = 110;
            if (distM < repelRange && distM > 0.5) {
              const f = (1 - distM / repelRange) * 0.35;
              b.vx += (dxm / distM) * f;
              b.vy += (dym / distM) * f;
              b.excited = Math.max(b.excited, 20);
            }
          }

          // Very gentle pull toward the canvas center — only kicks in when a
          // bubble has drifted far from the middle, otherwise it's negligible.
          const cx = w / 2;
          const cy = h / 2;
          const toCenterX = cx - b.x;
          const toCenterY = cy - b.y;
          const distToCenter = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY) || 1;
          const safeRadius = Math.min(w, h) * 0.28;
          if (distToCenter > safeRadius) {
            const excess = (distToCenter - safeRadius) / safeRadius;
            const pullStrength = 0.0008 * Math.min(excess, 1.5);
            b.vx += (toCenterX / distToCenter) * pullStrength * distToCenter;
            b.vy += (toCenterY / distToCenter) * pullStrength * distToCenter;
          }

          // Light damping — preserves individual drift without runaway speed
          b.vx *= 0.96;
          b.vy *= 0.96;

          // Soft speed cap so ambient motion stays calm. "Excited" bubbles
          // (flung, repelled, or hit by the block shockwave) get a temporary
          // higher cap so the energy reads on screen, then settle back down.
          const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          const maxSpeed = b.excited > 0 ? 7 : 0.6;
          if (speed > maxSpeed) {
            b.vx = (b.vx / speed) * maxSpeed;
            b.vy = (b.vy / speed) * maxSpeed;
          }
          if (b.excited > 0) b.excited -= 1;

          b.x += b.vx;
          b.y += b.vy;

          // Soft wall repulsion to keep bubbles inside
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
        const colors = colorsRef.current[b.type];
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

        // Outer glow (softer, more atmospheric)
        {
          const glowR = drawRadius * (1.6 + glowPulse * 0.25);
          const grad = ctx.createRadialGradient(b.x, b.y, drawRadius * 0.4, b.x, b.y, glowR);
          grad.addColorStop(0, colors.glow);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main bubble body — radial gradient for a glassy depth
        const bodyGrad = ctx.createRadialGradient(
          b.x - drawRadius * 0.35, b.y - drawRadius * 0.35, 0,
          b.x, b.y, drawRadius
        );
        const baseAlpha = parseFloat(colors.fill.match(/[\d.]+\)$/)?.[0] || '0.2');
        bodyGrad.addColorStop(0, colors.fill.replace(/[\d.]+\)$/, `${baseAlpha * 1.8})`));
        bodyGrad.addColorStop(0.7, colors.fill);
        bodyGrad.addColorStop(1, colors.fill.replace(/[\d.]+\)$/, `${baseAlpha * 0.6})`));
        ctx.fillStyle = isHovered ? colors.stroke : bodyGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.fill();

        // Border (refined — thinner default, prominent on hover)
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = isHovered ? 1.8 : 0.8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Specular highlight (subtle glass shine — top-left)
        // In light mode the white sheen is barely visible; tone it down further.
        const specGrad = ctx.createRadialGradient(
          b.x - drawRadius * 0.4, b.y - drawRadius * 0.45, 0,
          b.x - drawRadius * 0.2, b.y - drawRadius * 0.25, drawRadius * 0.7
        );
        const specStart = theme.isLight ? 0.28 : 0.18;
        const specMid = theme.isLight ? 0.08 : 0.05;
        specGrad.addColorStop(0, `rgba(255,255,255,${specStart})`);
        specGrad.addColorStop(0.4, `rgba(255,255,255,${specMid})`);
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = specGrad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.fill();

        // Bottom rim shadow for depth
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawRadius, 0, Math.PI * 2);
        ctx.clip();
        const rimGrad = ctx.createRadialGradient(
          b.x, b.y + drawRadius * 0.5, 0,
          b.x, b.y + drawRadius * 0.5, drawRadius
        );
        const rimAlpha = theme.isLight ? 0.18 : 0.15;
        rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
        rimGrad.addColorStop(1, `rgba(0,0,0,${rimAlpha})`);
        ctx.fillStyle = rimGrad;
        ctx.fillRect(b.x - drawRadius, b.y - drawRadius, drawRadius * 2, drawRadius * 2);
        ctx.restore();

        // Type letter inside — only for medium-large bubbles
        if (drawRadius > 13 && b.state !== 'popping') {
          const letter = TYPE_LABEL[b.type];
          const fontSize = Math.max(11, Math.min(drawRadius * 0.7, 22));
          ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Soft drop shadow for legibility on lighter bubbles
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.globalAlpha = b.opacity * 0.6;
          ctx.fillText(letter, b.x, b.y + 1);
          // Letter
          ctx.fillStyle = colors.label;
          ctx.globalAlpha = b.opacity;
          ctx.fillText(letter, b.x, b.y);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
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

      // Shockwave ring (drawn on top of bubbles)
      if (wave.active) {
        const waveAlpha = Math.max(0, 0.4 * (1 - wave.r / waveMaxR));
        if (waveAlpha > 0.01) {
          ctx.save();
          ctx.strokeStyle = `rgba(${cyanRgb}, ${waveAlpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, wave.r, 0, Math.PI * 2);
          ctx.stroke();
          // Softer trailing ring for depth
          ctx.strokeStyle = `rgba(${cyanRgb}, ${waveAlpha * 0.35})`;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, Math.max(0, wave.r - 10), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Mouse interaction — hover, cursor repulsion tracking, and drag-and-fling
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    mouseRef.current = { x: mx, y: my, active: true };

    // Active drag: bubble follows the pointer, velocity tracked for the fling
    const drag = dragRef.current;
    if (drag) {
      const b = bubblesRef.current.find(bb => bb.id === drag.id);
      if (b) {
        const dx = mx - drag.lastX;
        const dy = my - drag.lastY;
        b.x = mx + drag.offsetX;
        b.y = my + drag.offsetY;
        // Smoothed velocity so the fling uses recent motion, not one jittery frame
        drag.vx = drag.vx * 0.65 + dx * 0.35;
        drag.vy = drag.vy * 0.65 + dy * 0.35;
        drag.lastX = mx;
        drag.lastY = my;
        if (Math.hypot(mx - drag.startX, my - drag.startY) > 5) drag.moved = true;
        canvas.style.cursor = 'grabbing';
        setHoveredTx(null);
      }
      return;
    }

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
      canvas.style.cursor = 'grab';

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

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
        dragRef.current = {
          id: b.id,
          moved: false,
          startX: mx,
          startY: my,
          lastX: mx,
          lastY: my,
          offsetX: b.x - mx,
          offsetY: b.y - my,
          vx: 0,
          vy: 0,
        };
        break;
      }
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    const b = bubblesRef.current.find(bb => bb.id === drag.id);
    if (b) {
      if (!drag.moved) {
        // Simple click — open the transaction
        router.push(`/tx/${b.txid}`);
      } else {
        // Fling: hand the drag velocity to the bubble (clamped)
        b.vx = Math.max(-14, Math.min(14, drag.vx));
        b.vy = Math.max(-14, Math.min(14, drag.vy));
        b.excited = 90;
      }
    }
    dragRef.current = null;
  }, [router]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setHoveredTx(null);
    mouseRef.current.active = false;
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${className} ${isFullscreen || ambient ? 'bg-[#08090f]' : ''}`}
      style={{ cursor: (isFullscreen || ambient) && !cursorVisible ? 'none' : undefined }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={`w-full h-full ${isFullscreen || ambient ? '' : 'rounded-xl'}`}
      />

      {/* HUD corner brackets */}
      <div className="absolute top-2 left-2 w-5 h-5 border-t border-l border-cipher-cyan/20 rounded-tl pointer-events-none" />
      <div className="absolute top-2 right-2 w-5 h-5 border-t border-r border-cipher-cyan/20 rounded-tr pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-5 h-5 border-b border-l border-cipher-cyan/20 rounded-bl pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-5 h-5 border-b border-r border-cipher-cyan/20 rounded-br pointer-events-none" />

      {/* Top-left HUD label — shifts down in ambient to avoid EXIT button overlap */}
      <div className={`absolute ${ambient ? 'top-14' : 'top-4'} left-6 font-mono text-[9px] text-cipher-cyan/30 tracking-widest pointer-events-none select-none`}>
        MEMPOOL_LIVE // {transactions.length} TX
      </div>

      {/* Top-right timestamp */}
      <div
        className={`absolute ${ambient ? 'top-14' : 'top-4'} right-6 font-mono text-[9px] tracking-wider pointer-events-none select-none`}
        style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
      >
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
          <div
            className="rounded-lg px-3 py-2 shadow-xl text-xs min-w-[210px] border"
            style={{
              background: 'var(--color-surface-solid)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="font-mono text-cipher-cyan mb-1.5 truncate text-[10px] tracking-wider">
              &gt; {hoveredTx.txid.slice(0, 16)}...{hoveredTx.txid.slice(-8)}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">Type</span>
                <span className={
                  hoveredTx.type === 'shielded' ? 'text-cipher-purple font-mono' :
                  hoveredTx.type === 'mixed' ? 'text-cipher-orange font-mono' :
                  'text-cipher-cyan font-mono'
                }>
                  {hoveredTx.type.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">Size</span>
                <span className="text-primary font-mono">{(hoveredTx.size / 1024).toFixed(2)} KB</span>
              </div>
              {(hoveredTx as any).ironwoodActions ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted">Ironwood</span>
                  <span className="text-cipher-yellow font-mono">{(hoveredTx as any).ironwoodActions} actions</span>
                </div>
              ) : hoveredTx.orchardActions ? (
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
            </div>
            <div className="text-[10px] text-muted mt-1.5 pt-1.5 border-t border-cipher-border">Click to view transaction</div>
          </div>
        </div>
      )}

      {/* Legend — hidden in fullscreen/ambient to avoid clutter */}
      {!isFullscreen && !ambient && (
        <div
          className="absolute bottom-3 right-3 flex items-center gap-4 text-[10px] text-secondary font-mono backdrop-blur-sm rounded-lg px-3 py-1.5 border"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cipher-cyan/40 border border-cipher-cyan/70" />
            <span>T · Transparent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cipher-orange/40 border border-cipher-orange/70" />
            <span>M · Mixed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-cipher-purple/50 border border-cipher-purple/80" />
            <span>S · Shielded</span>
          </div>
        </div>
      )}

      {/* Exit affordance — HUD style, only visible while fullscreen */}
      {!ambient && isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-5 left-5 z-50 flex items-center gap-2 px-3 py-1.5 rounded font-mono text-[10px] tracking-[0.25em] text-cipher-cyan/70 border border-cipher-cyan/25 bg-[#08090f]/80 backdrop-blur-sm hover:text-cipher-cyan hover:border-cipher-cyan/60 hover:bg-cipher-cyan/10 transition-all duration-300"
          style={{ opacity: cursorVisible ? 1 : 0 }}
        >
          [ EXIT ]
          <kbd className="px-1 py-px rounded border border-white/15 text-[8px] text-white/40 tracking-normal">ESC</kbd>
        </button>
      )}

      {/* Ambient/fullscreen overlays */}
      {(isFullscreen || ambient) && (
        <>
          {/* Bottom-left: watermark + stats */}
          <div
            className="absolute bottom-6 left-6 font-mono pointer-events-none select-none transition-opacity duration-1000"
            style={{ opacity: cursorVisible ? 0.7 : 0.25 }}
          >
            <div className="text-[11px] text-white/50 tracking-widest uppercase mb-1">
              CipherScan {typeof window !== 'undefined' && window.location.hostname.includes('testnet') ? 'Testnet' : 'Mainnet'}
            </div>
            {stats && (
              <div className="text-[10px] tracking-wider">
                <span className="text-white/50">{stats.total} pending</span>
                <span className="text-white/20 mx-1.5">·</span>
                <span className="text-cipher-purple/60">{stats.shieldedPct}% shielded</span>
              </div>
            )}
          </div>

          {/* Compact legend in ambient — top-right area, fades with cursor */}
          <div
            className="absolute top-5 right-6 flex items-center gap-3 font-mono text-[9px] pointer-events-none select-none transition-opacity duration-1000"
            style={{ opacity: cursorVisible ? 0.5 : 0.2 }}
          >
            <span className="text-cipher-cyan/70">T</span>
            <span className="text-cipher-orange/70">M</span>
            <span className="text-cipher-purple/70">S</span>
          </div>
        </>
      )}

      {/* Empty state overlay */}
      {transactions.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-8 h-8 border border-cipher-cyan/20 rounded-full flex items-center justify-center animate-pulse">
            <div className="w-2 h-2 bg-cipher-cyan/40 rounded-full" />
          </div>
          <div className="text-center">
            <p className="text-muted font-mono text-xs tracking-wider">&gt; SCANNING MEMPOOL...</p>
            <p
              className="font-mono text-[10px] mt-1"
              style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}
            >
              awaiting pending transactions
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
