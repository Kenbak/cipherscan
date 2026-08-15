'use client';

import { useEffect, useState } from 'react';
import { IconTooltip } from './IconTooltip';

// Deliberately non-numeric — hex glyphs read as a plausible (if odd) real
// value at a glance, which defeats the point. Symbols can't be mistaken for
// a number no matter how briefly you look.
const GLYPHS = '#%*+~^&';
const LENGTH = 4;
const TICK_MS = 220;

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function randomGlyphs(): string[] {
  return Array.from({ length: LENGTH }, randomGlyph);
}

/**
 * Placeholder for an amount that isn't just unloaded but genuinely
 * unknowable — a fully-shielded transaction's value never touches the
 * transparent pool, so there's no number to reveal once "loading" finishes.
 *
 * A static mask (dots, dashes) reads as empty; a shimmer/pulse reads as
 * "still loading" — CipherScan's own convention for that state (see
 * SkeletonTable). Instead this continuously mutates a few symbol glyphs, one
 * at a time, at random — the same visual idea as ciphertext that's actively
 * encrypted rather than absent. Symbols only, never digits — a churning hex
 * value reads as a plausible (if odd) real number at a glance. Each instance
 * runs its own interval so multiple rows drift out of sync instead of
 * flickering in lockstep.
 */
export function RedactedAmount({ className = '' }: { className?: string }) {
  const [glyphs, setGlyphs] = useState<string[]>(randomGlyphs);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const interval = setInterval(() => {
      setGlyphs(prev => {
        const next = [...prev];
        next[Math.floor(Math.random() * LENGTH)] = randomGlyph();
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <IconTooltip
      label="Amount hidden — fully shielded transaction"
      className={`font-mono text-sm text-cipher-purple/70 whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true" className="tabular-nums">{glyphs.join('')}</span>
      <span aria-hidden="true" className="text-muted/40 ml-1.5">ZEC</span>
    </IconTooltip>
  );
}
