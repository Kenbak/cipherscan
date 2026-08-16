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

// Deterministic — no Math.random() — so the server-rendered HTML and the
// client's first render agree exactly. Randomizing here caused a hydration
// mismatch on every RedactedAmount instance (server picks one random set,
// client's initial render picks another), forcing React to discard and
// re-render the whole tree on mount. The actual churn only starts in
// useEffect below, which runs client-only after hydration is already done.
function initialGlyphs(): string[] {
  return Array.from({ length: LENGTH }, (_, i) => GLYPHS[i % GLYPHS.length]);
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
  const [glyphs, setGlyphs] = useState<string[]>(initialGlyphs);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Shuffle once immediately post-mount (client-only, after hydration) so
    // instances don't all sit on the same deterministic pattern for the
    // first 220ms before the interval below kicks in.
    setGlyphs(randomGlyphs());

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
      className={`font-mono text-sm text-secondary whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true" className="tabular-nums">{glyphs.join('')}</span>
      <span aria-hidden="true" className="text-muted/40 ml-1.5">ZEC</span>
    </IconTooltip>
  );
}
