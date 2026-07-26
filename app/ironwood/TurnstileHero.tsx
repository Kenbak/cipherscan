'use client';

/**
 * TurnstileHero — wraps the 3D TurnstileScene with scrubber controls.
 *
 * Modes:
 * - Live: follows chain tip, flow intensity from recent cohort volume
 * - Scrub: user drags timeline to replay migration history
 * - Play: auto-advance through boundaries as timelapse
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

interface CohortPoint {
  boundary: number;
  boundaryStartHeight: number;
  volumeZat: number;
  txCount: number;
  firstTime: number | null;
  cumulativeZat: number;
}

export interface TurnstileHeroProps {
  activated: boolean;
  balanced: boolean;
  migratedPct: number;
  blockPulseKey: number;
  orchardZec?: string;
  ironwoodZec?: string;
  activationHeight: number;
  tipHeight: number;
  cohorts: Array<{
    boundary: number;
    boundaryStartHeight: number;
    volumeZat: number;
    txCount: number;
    firstTime: number | null;
  }> | null;
  totalMigratedZat: number;
  originalOrchardZat: number;
}

type ScrubMode = 'live' | 'scrub' | 'play';

const fmtZec = (zat: number) => (zat / 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 });

export function TurnstileHero(props: TurnstileHeroProps) {
  const {
    activated,
    migratedPct,
    blockPulseKey,
    orchardZec,
    ironwoodZec,
    activationHeight,
    tipHeight,
    cohorts: rawCohorts,
    totalMigratedZat,
    originalOrchardZat,
  } = props;

  const [use3D, setUse3D] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<ScrubMode>('live');
  const [scrubIndex, setScrubIndex] = useState(0);
  const playPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  // Build cumulative cohort points for scrubber
  const cohortPoints: CohortPoint[] = useMemo(() => {
    if (!rawCohorts || rawCohorts.length === 0) return [];
    const sorted = [...rawCohorts].sort((a, b) => a.boundaryStartHeight - b.boundaryStartHeight);
    let cum = 0;
    return sorted.map((c) => {
      cum += c.volumeZat;
      return { ...c, cumulativeZat: cum };
    });
  }, [rawCohorts]);

  const hasCohorts = cohortPoints.length > 0;
  const maxIndex = hasCohorts ? cohortPoints.length - 1 : 0;

  // Peak volume for intensity normalization (use top 5% as reference so outliers don't flatten everything)
  const peakVolume = useMemo(() => {
    if (!hasCohorts) return 1;
    const vols = cohortPoints.map((c) => c.volumeZat).sort((a, b) => b - a);
    return vols[Math.floor(vols.length * 0.05)] || vols[0] || 1;
  }, [cohortPoints, hasCohorts]);

  // Compute scene state from mode + scrub position
  const sceneState = useMemo(() => {
    if (!activated || !hasCohorts) {
      return {
        migratedPct,
        flowIntensity: 0,
        blockHeight: tipHeight,
        date: null as string | null,
        orchardLabel: orchardZec,
        ironwoodLabel: ironwoodZec,
      };
    }

    if (mode === 'live') {
      // Live: use real migratedPct, intensity from most recent cohorts
      const recentWindow = cohortPoints.slice(-3);
      const recentAvgVol = recentWindow.length > 0
        ? recentWindow.reduce((s, c) => s + c.volumeZat, 0) / recentWindow.length
        : 0;
      const intensity = Math.min(1, recentAvgVol / peakVolume);
      return {
        migratedPct,
        flowIntensity: intensity,
        blockHeight: tipHeight,
        date: null,
        orchardLabel: orchardZec,
        ironwoodLabel: ironwoodZec,
      };
    }

    // Scrub or Play: interpolate between cohort boundaries for smoothness
    const floatIdx = mode === 'play' ? playPosRef.current : scrubIndex;
    const clamped = Math.min(Math.max(floatIdx, 0), maxIndex);
    const lo = Math.floor(clamped);
    const hi = Math.min(lo + 1, maxIndex);
    const frac = clamped - lo;

    const ptLo = cohortPoints[lo];
    const ptHi = cohortPoints[hi];
    const cumZat = ptLo.cumulativeZat + (ptHi.cumulativeZat - ptLo.cumulativeZat) * frac;
    const vol = ptLo.volumeZat + (ptHi.volumeZat - ptLo.volumeZat) * frac;
    const pct = originalOrchardZat > 0 ? (cumZat / originalOrchardZat) * 100 : 0;
    const intensity = Math.min(1, vol / peakVolume);
    const ironwoodZat = cumZat;
    const orchardZat = Math.max(0, originalOrchardZat - cumZat);
    const displayPt = cohortPoints[Math.round(clamped)];
    const d = displayPt.firstTime ? new Date(displayPt.firstTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    return {
      migratedPct: Math.min(pct, 100),
      flowIntensity: intensity,
      blockHeight: displayPt.boundaryStartHeight,
      date: d,
      orchardLabel: `${fmtZec(orchardZat)} ZEC`,
      ironwoodLabel: `${fmtZec(ironwoodZat)} ZEC`,
    };
  }, [mode, scrubIndex, maxIndex, cohortPoints, peakVolume, activated, hasCohorts, migratedPct, tipHeight, orchardZec, ironwoodZec, originalOrchardZat]);

  // Play mode: smooth RAF-driven advance (~8 boundaries/sec)
  useEffect(() => {
    if (mode !== 'play') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    playPosRef.current = scrubIndex;
    lastFrameRef.current = performance.now();

    const speed = Math.max(8, maxIndex / 30);
    const tick = (now: number) => {
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      playPosRef.current += speed * dt;
      if (playPosRef.current >= maxIndex) {
        setScrubIndex(maxIndex);
        setMode('live');
        return;
      }
      setScrubIndex(Math.round(playPosRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mode, maxIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setScrubIndex(val);
    if (mode === 'live') setMode('scrub');
  }, [mode]);

  const handleLive = useCallback(() => {
    setMode('live');
    setScrubIndex(maxIndex);
  }, [maxIndex]);

  const handlePlay = useCallback(() => {
    if (mode === 'play') {
      setMode('scrub');
    } else {
      if (scrubIndex >= maxIndex) setScrubIndex(0);
      setMode('play');
    }
  }, [mode, scrubIndex, maxIndex]);

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

  const scrubPct = hasCohorts && maxIndex > 0 ? (Math.min(scrubIndex, maxIndex) / maxIndex) * 100 : 100;

  return (
    <div
      ref={containerRef}
      className="relative mt-6 overflow-hidden rounded-2xl border border-cipher-border"
      style={{ background: 'var(--turnstile-bg)' }}
    >
      <div className="h-64 sm:h-80">
        <TurnstileScene
          activated={activated}
          migratedPct={sceneState.migratedPct}
          flowIntensity={sceneState.flowIntensity}
          blockPulseKey={mode === 'live' ? blockPulseKey : sceneState.blockHeight}
          paused={paused}
          lightMode={lightMode}
          onReady={() => setSceneReady(true)}
        />
      </div>

      {/* Text overlay */}
      {sceneReady && (
        <>
          <div className="pointer-events-none absolute top-4 left-0 right-0 z-[2] text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted/70">
              NU6.3 Ironwood activation
            </div>
            <div className="mt-1 text-lg font-bold font-mono text-cipher-yellow-bright sm:text-xl">
              {mode === 'live' ? (activated ? 'LIVE' : 'PENDING') : sceneState.date || `Block ${sceneState.blockHeight.toLocaleString()}`}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-14 left-5 right-5 z-[2] flex items-end justify-between sm:bottom-16">
            <div>
              <div className="text-[10px] font-mono text-[#A78BFA]">Orchard</div>
              <div className="text-sm font-mono font-semibold text-[#A78BFA]/90">{sceneState.orchardLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono text-cipher-yellow-bright">Ironwood</div>
              <div className="text-sm font-mono font-semibold text-cipher-yellow-bright/90">{sceneState.ironwoodLabel}</div>
            </div>
          </div>
        </>
      )}

      {/* Scrubber bar */}
      {sceneReady && activated && hasCohorts && (
        <div className="relative z-[3] border-t border-white/5 bg-black/30 backdrop-blur-sm px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-3">
            {/* Play button */}
            <button
              type="button"
              onClick={handlePlay}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-white/30 hover:text-white/90"
              aria-label={mode === 'play' ? 'Pause' : 'Play timelapse'}
            >
              {mode === 'play' ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1.5" width="2.5" height="7" rx="0.5" /><rect x="6" y="1.5" width="2.5" height="7" rx="0.5" /></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.5 1.5v7l6-3.5z" /></svg>
              )}
            </button>

            {/* Timeline track */}
            <div className="relative flex-1">
              <div className="relative h-1.5 rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
                  style={{
                    width: `${mode === 'live' ? 100 : scrubPct}%`,
                    background: `linear-gradient(90deg, #A78BFA, #F4B728)`,
                  }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={maxIndex}
                value={mode === 'live' ? maxIndex : scrubIndex}
                onChange={handleScrub}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Migration timeline scrubber"
              />
            </div>

            {/* Live button */}
            <button
              type="button"
              onClick={handleLive}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-all ${
                mode === 'live'
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                  : 'border-white/15 text-white/50 hover:border-white/30 hover:text-white/80'
              }`}
            >
              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
              Live
            </button>
          </div>

          {/* Block label */}
          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-white/40">
            <span>Block {activationHeight.toLocaleString()}</span>
            <span>
              {mode === 'live'
                ? `Block ${tipHeight.toLocaleString()}`
                : sceneState.date
                  ? `${sceneState.date} · Block ${sceneState.blockHeight.toLocaleString()}`
                  : `Block ${sceneState.blockHeight.toLocaleString()}`}
            </span>
          </div>
        </div>
      )}

      {!sceneReady && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-cipher-surface/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cipher-border border-t-cipher-yellow" />
            <span className="text-xs font-mono text-muted">Loading visualization…</span>
          </div>
        </div>
      )}
    </div>
  );
}
