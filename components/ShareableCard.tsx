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
        className="relative overflow-hidden rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6"
      >
      {watermark ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="-rotate-12 select-none text-5xl font-bold font-mono tracking-[0.2em] text-black/[0.04] dark:text-white/[0.045] sm:text-6xl">
            CIPHERSCAN
          </span>
        </div>
      ) : null}

      <div className="relative">
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-sm font-bold text-primary">{title}</h2>
          <div className="flex shrink-0 items-center gap-2" data-html2canvas-ignore="true">
            <button
              type="button"
              onClick={handleCopy}
              disabled={copyStatus === 'capturing'}
              className="rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
            >
              {copyStatus === 'copied' ? 'Copied!' : 'Copy image'}
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={copyStatus === 'capturing'}
              className="rounded-md border border-cipher-border/50 px-2 py-1 text-[10px] font-mono text-muted transition-all hover:border-cipher-border hover:bg-foreground/[0.04] hover:text-primary disabled:opacity-50"
            >
              Share to X
            </button>
          </div>
        </div>
        {children}
        <div className="mt-4 flex items-center justify-between border-t border-cipher-border/20 pt-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[11px] font-bold font-mono text-cipher-cyan-bright tracking-tight">
                CIPHERSCAN
              </span>
              <span className="text-[10px] font-mono text-muted/55">cipherscan.app</span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted/80">
            {footerNote ?? `${isLive ? 'LIVE' : 'SNAPSHOT'} · block ${sourceHeight.toLocaleString()}`}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
