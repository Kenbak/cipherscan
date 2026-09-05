'use client';

import { useRef, useCallback, useState, type ReactNode } from 'react';
import { toPng } from 'html-to-image';
import { useTheme } from '@/contexts/ThemeContext';

export function ShareableCard({
  title,
  children,
  sourceHeight,
  isLive = true,
  shareText,
  fileName = 'cipherscan.png',
  watermark = true,
  footerNote,
  className = 'mt-4',
}: {
  title: string;
  children: ReactNode;
  sourceHeight: number;
  isLive?: boolean;
  shareText: string;
  fileName?: string;
  watermark?: boolean;
  footerNote?: string;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'capturing' | 'copied'>('idle');
  const captureBg = theme === 'light' ? '#ffffff' : '#0f1419';

  const captureCard = useCallback(async () => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, {
      backgroundColor: captureBg,
      pixelRatio: 2,
      filter: (node) => {
        if (node instanceof HTMLElement && node.dataset.html2canvasIgnore) return false;
        return true;
      },
    });
    return (await fetch(dataUrl)).blob();
  }, [captureBg]);

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
      const file = new File([blob], fileName, { type: 'image/png' });
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
  }, [captureCard, fileName, shareText]);

  return (
    <div className={className}>
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface p-4 sm:p-6"
      >
      {watermark ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible"
          aria-hidden="true"
        >
          <span className="-rotate-12 scale-[0.82] select-none whitespace-nowrap text-[2rem] font-bold font-mono tracking-[0.14em] text-black/[0.04] dark:text-white/[0.045] sm:scale-100 sm:text-5xl sm:tracking-[0.2em] lg:text-6xl">
            CIPHERSCAN
          </span>
        </div>
      ) : null}

      <div className="relative min-w-0">
        <div className="mb-4 sm:mb-5 flex items-start justify-between gap-2 sm:gap-3">
          <h2 className="text-sm font-bold text-primary">{title}</h2>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" data-html2canvas-ignore="true">
            {/* Full buttons on desktop */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={copyStatus === 'capturing'}
              className="hidden sm:inline-flex rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
            >
              {copyStatus === 'copied' ? 'Copied!' : 'Copy image'}
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={copyStatus === 'capturing'}
              className="hidden sm:inline-flex rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
            >
              Share to X
            </button>
            {/* Icon buttons on mobile */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={copyStatus === 'capturing'}
              className="sm:hidden rounded-md border border-cipher-border/50 p-1.5 text-muted transition hover:border-cipher-border hover:text-primary disabled:opacity-50"
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
              className="sm:hidden rounded-md border border-cipher-border/50 p-1.5 text-muted transition hover:border-cipher-border hover:text-primary disabled:opacity-50"
              aria-label="Share"
              title="Share"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>
        </div>
        {children}
        <div className="mt-4 border-t border-cipher-border/20 pt-3">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-2.5 sm:text-left">
            <div className="order-1 flex items-center justify-center gap-2 text-[10px] font-mono text-muted/80 sm:order-2 sm:shrink-0 sm:justify-end">
              {footerNote ? (
                <span>{footerNote}</span>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cipher-border/40 bg-glass-3/50 px-2 py-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-muted/50'}`} />
                    <span>{isLive ? 'LIVE' : 'SNAPSHOT'}</span>
                  </span>
                  <span className="text-muted/60">·</span>
                  <span className="tabular-nums">block {sourceHeight.toLocaleString()}</span>
                </>
              )}
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
    </div>
  );
}
