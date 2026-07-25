'use client';

/**
 * TurnstileHero — wraps the 3D TurnstileScene.
 * Visual-only: no data overlay. Numbers live in the metrics row below.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const TurnstileScene = dynamic(() => import('./TurnstileScene'), { ssr: false });

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
  blockPulseKey: number;
  orchardZec?: string;
  ironwoodZec?: string;
}

export function TurnstileHero(props: TurnstileHeroProps) {
  const { activated, balanced, migratedPct, blockPulseKey, orchardZec, ironwoodZec } = props;

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

  if (!use3D) return null;

  return (
    <div
      ref={containerRef}
      className="relative mt-6 rounded-2xl border border-cipher-border overflow-hidden"
      style={{ background: 'var(--turnstile-bg)' }}
    >
      <div className="h-64 sm:h-80">
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

      {/* Text overlay */}
      {sceneReady && (
        <>
          <div className="absolute top-4 left-0 right-0 text-center pointer-events-none z-[2]">
            <div className="text-[10px] font-mono text-muted/70 uppercase tracking-widest">
              NU6.3 Ironwood activation
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono text-cipher-yellow-bright mt-1">
              {activated ? 'LIVE' : 'PENDING'}
            </div>
          </div>
          {(orchardZec || ironwoodZec) && (
            <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between pointer-events-none z-[2]">
              <div>
                <div className="text-[10px] font-mono text-[#A78BFA]">Orchard</div>
                <div className="text-sm font-mono font-semibold text-[#A78BFA]/90">{orchardZec} ZEC</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-mono text-cipher-yellow-bright">Ironwood</div>
                <div className="text-sm font-mono font-semibold text-cipher-yellow-bright/90">{ironwoodZec} ZEC</div>
              </div>
            </div>
          )}
        </>
      )}

      {!sceneReady && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-cipher-surface/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cipher-border border-t-cipher-yellow rounded-full animate-spin" />
            <span className="text-xs font-mono text-muted">Loading visualization…</span>
          </div>
        </div>
      )}
    </div>
  );
}
