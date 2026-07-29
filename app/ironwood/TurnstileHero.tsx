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
import { toPng } from 'html-to-image';
import { fmtValue, type CurrencyMode } from '@/hooks/useCurrencyToggle';

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
  migratedPct: number;
  blockPulseKey: number;
  activationHeight: number;
  tipHeight: number;
  cohorts: Array<{
    boundary: number;
    boundaryStartHeight: number;
    volumeZat: number;
    txCount: number;
    firstTime: number | null;
  }> | null;
  originalOrchardZat: number;
  currencyMode: CurrencyMode;
  zecPrice: number | null;
}

type ScrubMode = 'live' | 'scrub' | 'play';

export function TurnstileHero(props: TurnstileHeroProps) {
  const {
    activated,
    migratedPct,
    blockPulseKey,
    activationHeight,
    tipHeight,
    cohorts: rawCohorts,
    originalOrchardZat,
    currencyMode,
    zecPrice,
  } = props;

  const fmt = (zat: number) => fmtValue(zat, currencyMode, zecPrice);

  const [use3D, setUse3D] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
        orchardLabel: '—',
        ironwoodLabel: '—',
      };
    }

    if (mode === 'live') {
      const recentWindow = cohortPoints.slice(-3);
      const recentAvgVol = recentWindow.length > 0
        ? recentWindow.reduce((s, c) => s + c.volumeZat, 0) / recentWindow.length
        : 0;
      const intensity = Math.min(1, recentAvgVol / peakVolume);
      const totalMigrated = cohortPoints[cohortPoints.length - 1].cumulativeZat;
      const remaining = Math.max(0, originalOrchardZat - totalMigrated);
      const pct = originalOrchardZat > 0 ? (totalMigrated / originalOrchardZat) * 100 : 0;
      return {
        migratedPct: Math.min(pct, 100),
        flowIntensity: intensity,
        blockHeight: tipHeight,
        date: null,
        orchardLabel: fmt(remaining),
        ironwoodLabel: fmt(totalMigrated),
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
    const vol = ptLo.volumeZat + (ptHi.volumeZat - ptLo.volumeZat) * frac;
    // Gross cumulative migration volume — "how much has crossed the turnstile"
    const migratedZat = ptLo.cumulativeZat + (ptHi.cumulativeZat - ptLo.cumulativeZat) * frac;
    const remainingZat = Math.max(0, originalOrchardZat - migratedZat);
    const pct = originalOrchardZat > 0 ? (migratedZat / originalOrchardZat) * 100 : 0;
    const intensity = Math.min(1, vol / peakVolume);
    const displayPt = cohortPoints[Math.round(clamped)];
    const d = displayPt.firstTime ? new Date(displayPt.firstTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    return {
      migratedPct: Math.min(pct, 100),
      flowIntensity: intensity,
      blockHeight: displayPt.boundaryStartHeight,
      date: d,
      orchardLabel: fmt(remainingZat),
      ironwoodLabel: fmt(migratedZat),
    };
  }, [mode, scrubIndex, maxIndex, cohortPoints, peakVolume, activated, hasCohorts, migratedPct, tipHeight, originalOrchardZat, currencyMode, zecPrice]);

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
        setPaused(!onscreen && !document.fullscreenElement || document.hidden);
      },
      { threshold: 0.05 }
    );
    io.observe(el);
    const onVis = () => setPaused((!onscreen && !document.fullscreenElement) || document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [use3D]);

  const toggleFullscreen = useCallback(async () => {
    const el = cardRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const cardRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'capturing' | 'copied'>('idle');

  const captureCard = useCallback(async () => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      backgroundColor: '#0f1419',
      pixelRatio: 2,
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.html2canvasIgnore) return false;
        return true;
      },
    });
    return (await fetch(dataUrl)).blob();
  }, []);

  const shareText = `${sceneState.migratedPct.toFixed(1)}% of Orchard ZEC has migrated to Ironwood. Watch the migration live on CipherScan.\n\nhttps://cipherscan.app/ironwood`;

  const handleCopy = useCallback(async () => {
    setCopyStatus('capturing');
    try {
      const blob = await captureCard();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 3000);
    } catch {
      setCopyStatus('idle');
    }
  }, [captureCard]);

  const handleShare = useCallback(async () => {
    setCopyStatus('capturing');
    try {
      const blob = await captureCard();
      if (!blob) return;
      const file = new File([blob], 'cipherscan-migration.png', { type: 'image/png' });
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text: shareText, files: [file] });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank');
      }
      setCopyStatus('idle');
    } catch {
      setCopyStatus('idle');
    }
  }, [captureCard, shareText]);

  if (!use3D) return null;

  const scrubPct = hasCohorts && maxIndex > 0 ? (Math.min(scrubIndex, maxIndex) / maxIndex) * 100 : 100;

  return (
    <div className="mt-4">
      <div
        ref={cardRef}
        className={`relative overflow-hidden bg-cipher-surface ${
          isFullscreen
            ? 'flex flex-col h-screen w-screen'
            : 'rounded-2xl border border-cipher-border'
        }`}
      >
        {/* Watermark */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-[1] overflow-visible"
          aria-hidden="true"
        >
          <span className="-rotate-12 scale-[0.82] select-none whitespace-nowrap text-[2rem] font-bold font-mono tracking-[0.14em] text-white/[0.03] sm:scale-100 sm:text-5xl sm:tracking-[0.2em] lg:text-6xl">
            CIPHERSCAN
          </span>
        </div>

        {/* Header with title + share buttons */}
        <div className="relative z-[2] flex items-start justify-between gap-2 px-4 pt-4 sm:gap-3 sm:px-6">
          <h2 className="text-sm font-bold text-primary whitespace-nowrap">Orchard to Ironwood Migration</h2>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" data-html2canvas-ignore="true">
            {!isFullscreen && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={copyStatus === 'capturing'}
                  className="hidden sm:inline-flex rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
                >
                  {copyStatus === 'copied' ? 'Copied!' : 'Copy image'}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={copyStatus === 'capturing'}
                  className="hidden sm:inline-flex rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
                >
                  Share to X
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={copyStatus === 'capturing'}
                  className="sm:hidden rounded-md border border-cipher-border/50 p-1.5 text-muted transition-all hover:border-cipher-border hover:text-primary disabled:opacity-50"
                  aria-label={copyStatus === 'copied' ? 'Copied' : 'Copy image'}
                  title={copyStatus === 'copied' ? 'Copied!' : 'Copy image'}
                >
                  {copyStatus === 'copied' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={copyStatus === 'capturing'}
                  className="sm:hidden rounded-md border border-cipher-border/50 p-1.5 text-muted transition-all hover:border-cipher-border hover:text-primary disabled:opacity-50"
                  aria-label="Share"
                  title="Share"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-md border border-cipher-border/50 p-1 text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 3D scene */}
        <div ref={containerRef} className={`relative ${isFullscreen ? 'flex-1' : ''}`} style={{ background: 'var(--turnstile-bg)' }}>
          <div className={isFullscreen ? 'h-full' : 'h-64 sm:h-80'}>
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

          {/* Scene overlays — status only inside canvas; pool legends on desktop */}
          {sceneReady && (
            <>
              <div className="pointer-events-none absolute top-3 left-0 right-0 z-[2] text-center sm:top-4">
                <div className="text-base font-bold font-mono text-cipher-yellow-bright sm:text-xl">
                  {mode === 'live' ? (activated ? 'LIVE' : 'PENDING') : sceneState.date || `Block ${sceneState.blockHeight.toLocaleString()}`}
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-cipher-yellow-bright/60 sm:text-xs">
                  {sceneState.migratedPct.toFixed(1)}% migrated
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-14 left-5 right-5 z-[2] hidden items-end justify-between sm:flex sm:bottom-16">
                <div>
                  <div className="text-[10px] font-mono text-[#A78BFA]">Remaining in Orchard</div>
                  <div className="text-sm font-mono font-semibold text-[#A78BFA]/90">{sceneState.orchardLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-cipher-yellow-bright">Migrated to Ironwood</div>
                  <div className="text-sm font-mono font-semibold text-cipher-yellow-bright/90">{sceneState.ironwoodLabel}</div>
                </div>
              </div>
            </>
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

        {/* Mobile pool stats — below scene so legends don't overlap particles */}
        {sceneReady && (
          <div className="relative z-[2] grid grid-cols-2 gap-3 border-t border-cipher-border/20 bg-glass-3/60 px-3 py-2 sm:hidden">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wide text-[#A78BFA]/80">Orchard</div>
              <div className="text-[10px] font-mono text-[#A78BFA]/70">remaining</div>
              <div className="mt-0.5 text-xs font-mono font-semibold tabular-nums text-[#A78BFA]">{sceneState.orchardLabel}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-mono uppercase tracking-wide text-cipher-yellow-bright/80">Ironwood</div>
              <div className="text-[10px] font-mono text-cipher-yellow-bright/70">migrated</div>
              <div className="mt-0.5 text-xs font-mono font-semibold tabular-nums text-cipher-yellow-bright">{sceneState.ironwoodLabel}</div>
            </div>
          </div>
        )}

        {/* Scrubber bar */}
        {sceneReady && activated && hasCohorts && (
          <div className="relative z-[3] border-t border-cipher-border/25 bg-glass-3 backdrop-blur-sm px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-3">
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

              <button
                type="button"
                onClick={handleLive}
                className="shrink-0 rounded-full border border-cipher-border/50 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cipher-border transition-all"
              >
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-current opacity-30'}`} />
                Live
              </button>
            </div>

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

        {/* Footer — status first on mobile, brand last; desktop unchanged */}
        <div className="relative z-[2] border-t border-cipher-border/20 px-4 py-3 sm:px-6">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-2.5 sm:text-left">
            <div className="order-1 flex items-center justify-center gap-2 text-[10px] font-mono text-muted/80 sm:order-2 sm:shrink-0 sm:justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cipher-border/40 bg-glass-3/50 px-2 py-0.5">
                <span className={`h-1.5 w-1.5 rounded-full ${mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-muted/50'}`} />
                <span>{mode === 'live' ? 'LIVE' : 'SNAPSHOT'}</span>
              </span>
              <span className="text-muted/60">·</span>
              <span className="tabular-nums">block {(mode === 'live' ? tipHeight : sceneState.blockHeight).toLocaleString()}</span>
            </div>
            <div className="order-2 flex items-center justify-center gap-2 sm:order-1 sm:min-w-0 sm:justify-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" />
              <div className="flex flex-col items-center sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2 sm:gap-y-0">
                <span className="text-[11px] font-bold font-mono text-cipher-cyan-bright tracking-tight">
                  CIPHERSCAN
                </span>
                <span className="text-[10px] font-mono text-muted/55">cipherscan.app</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
