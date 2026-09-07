'use client';

import { useEffect, useState } from 'react';
import { IconTooltip } from './IconTooltip';

// Block textures convey redaction without suggesting a numerical value.
const GLYPHS = '█▓▒';
const LENGTH = 4;
const TICK_MS = 480;

function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function randomGlyphs(): string[] {
  return Array.from({ length: LENGTH }, randomGlyph);
}

// Stable server markup; also the static reduced-motion representation.
function initialGlyphs(): string[] {
  return Array.from({ length: LENGTH }, () => '█');
}

/** A durable hidden value, never a loading state or an estimated value. */
export function RedactedAmount({
  className = '',
  label = 'Amount hidden — fully shielded transaction',
  unit = 'ZEC',
}: { className?: string; label?: string; unit?: string | null }) {
  const [glyphs, setGlyphs] = useState<string[]>(initialGlyphs);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval: ReturnType<typeof setInterval> | undefined;
    const updateMotion = () => {
      clearInterval(interval);
      if (preference.matches) {
        setGlyphs(initialGlyphs());
        return;
      }
      setGlyphs(randomGlyphs());
      interval = setInterval(() => {
        setGlyphs(prev => {
          const next = [...prev];
          next[Math.floor(Math.random() * LENGTH)] = randomGlyph();
          return next;
        });
      }, TICK_MS);
    };
    updateMotion();
    preference.addEventListener('change', updateMotion);
    return () => {
      clearInterval(interval);
      preference.removeEventListener('change', updateMotion);
    };
  }, []);

  return (
    <IconTooltip
      label={label}
      className={`font-mono text-sm text-secondary whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true" className="redacted-blocks">{glyphs.map((glyph, i) => <span key={i}>{glyph}</span>)}</span>
      {unit && <span aria-hidden="true" className="text-muted ml-1.5">{unit}</span>}
    </IconTooltip>
  );
}
