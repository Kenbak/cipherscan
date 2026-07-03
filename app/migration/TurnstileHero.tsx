'use client';

/**
 * TurnstileHero — wraps the 3D TurnstileScene with:
 *  - dynamic import (ssr:false) so three.js never ships to other pages / SSR,
 *  - graceful fallback to a 2D card for no-WebGL and prefers-reduced-motion,
 *  - render-loop pausing when the canvas is offscreen or the tab is hidden,
 *  - a crisp DOM overlay for the countdown numbers (accessible + selectable).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

const TurnstileScene = dynamic(() => import('./TurnstileScene'), { ssr: false });

const ORCHARD = '#A78BFA';
const IRONWOOD = '#F4B728';

function fmtZec(zat: number): string {
  const z = zat / 1e8;
  if (Math.abs(z) >= 1000) return Math.round(z).toLocaleString();
  return z.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

export interface TurnstileHeroProps {
  activated: boolean;
  balanced: boolean;
  migratedPct: number;
  blocksUntilActivation: number;
  tipHeight: number;
  activationHeight: number | null;
  orchardZat: number;
  ironwoodZat: number;
  /** Bumped each time a new block is observed → fires a ripple + counter tick. */
  blockPulseKey: number;
  /** 2D card shown when WebGL is unavailable or motion is reduced. */
  fallback: ReactNode;
}

export function TurnstileHero(props: TurnstileHeroProps) {
  const {
    activated,
    balanced,
    migratedPct,
    blocksUntilActivation,
    tipHeight,
    activationHeight,
    orchardZat,
    ironwoodZat,
    blockPulseKey,
    fallback,
  } = props;

  const [use3D, setUse3D] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && supportsWebGL()) setUse3D(true);
    setLightMode(document.documentElement.classList.contains('light'));
    const obs = new MutationObserver(() => {
      setLightMode(document.documentElement.classList.contains('light'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Pause the render loop when offscreen or the tab is hidden.
  useEffect(() => {
    if (!use3D) return;
    const el = containerRef.current;
    if (!el) return;
    let onscreen = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        onscreen = entry.isIntersecting;
        setPaused(!onscreen || document.hidden);
      },
      { threshold: 0.05 }
    );
    io.observe(el);
    const onVis = () => setPaused(!onscreen || document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [use3D]);

  if (!use3D) return <>{fallback}</>;

  const etaSecs = blocksUntilActivation * 75;
  const etaDays = etaSecs / 86400;
  const etaHours = etaSecs / 3600;
  const etaLabel = etaDays >= 2 ? `~${etaDays.toFixed(1)} days` : etaHours >= 1 ? `~${Math.round(etaHours)} hours` : '<1 hour';
  const estDate = blocksUntilActivation > 0 ? new Date(Date.now() + etaSecs * 1000) : null;
  const progressPct = activationHeight ? Math.min(100, (tipHeight / activationHeight) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className="relative mt-6 rounded-2xl border border-cipher-border overflow-hidden turnstile-hero"
      style={{ background: 'var(--turnstile-bg)' }}
    >
      {/* 3D layer */}
      <div className="absolute inset-0 h-full w-full">
        <TurnstileScene
          activated={activated}
          balanced={balanced}
          migratedPct={migratedPct}
          blockPulseKey={blockPulseKey}
          paused={paused}
          lightMode={lightMode}
          onReady={() => setSceneReady(true)}
        />
      </div>

      {/* Loading shimmer while 3D initializes */}
      {!sceneReady && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cipher-border border-t-cipher-yellow rounded-full animate-spin" />
        </div>
      )}

      {/* DOM overlay — crisp, accessible numbers */}
      <div className="relative z-10 pointer-events-none select-text h-80 sm:h-[420px] flex flex-col justify-between p-5 sm:p-6">
        {/* Top: countdown headline */}
        <div className="text-center">
          <div className="text-[10px] text-muted uppercase tracking-[0.2em] font-mono mb-2">
            NU6.3 IRONWOOD ACTIVATION
          </div>
          {activated ? (
            <div className="text-3xl sm:text-4xl font-bold font-mono" style={{ color: IRONWOOD }}>
              LIVE
            </div>
          ) : blocksUntilActivation > 0 ? (
            <>
              <div className="text-4xl sm:text-6xl font-bold font-mono text-primary tabular-nums leading-none">
                {blocksUntilActivation.toLocaleString()}
              </div>
              <div className="text-xs sm:text-sm text-secondary font-mono mt-2">
                blocks to go · {etaLabel}
                {estDate && (
                  <span className="text-muted">
                    {' '}· est. {estDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-3xl font-bold font-mono text-primary">
              {activationHeight ? 'Activation reached' : 'Activation height TBD'}
            </div>
          )}
        </div>

        {/* Bottom: pool labels + progress */}
        <div>
          <div className="flex items-end justify-between text-[11px] sm:text-xs font-mono mb-2">
            <div>
              <div style={{ color: ORCHARD }} className="font-semibold">Orchard</div>
              <div className="text-muted">{fmtZec(orchardZat)} ZEC</div>
            </div>
            <div className="text-right">
              <div style={{ color: IRONWOOD }} className="font-semibold">Ironwood</div>
              <div className="text-muted">{fmtZec(ironwoodZat)} ZEC</div>
            </div>
          </div>
          {activationHeight && blocksUntilActivation > 0 && (
            <>
              <div className="h-1.5 rounded-full bg-cipher-border/40 overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progressPct.toFixed(2)}%`, background: `linear-gradient(90deg, ${ORCHARD}, ${IRONWOOD})` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] font-mono text-muted">
                <span>height {tipHeight.toLocaleString()}</span>
                <span style={{ color: IRONWOOD }}>{progressPct.toFixed(1)}% · NU6.3 @ {activationHeight.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
