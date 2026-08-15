'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface IconTooltipProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Hover/focus tooltip for small inline icons (shield-flow badges, status dots,
 * etc). Portal-rendered to `document.body` so it's never clipped by a
 * scrollable ancestor (our data tables use `overflow-x-auto`, which would
 * otherwise cut off an in-flow tooltip). Styled with the shared
 * `.tooltip-content` token so it matches every other tooltip in the app,
 * unlike a native `title` attribute which renders with OS/browser chrome.
 */
export function IconTooltip({ label, children, className = '' }: IconTooltipProps) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The portal below is `position: fixed`, which is already viewport-relative —
    // do NOT add window.scrollY/scrollX here, or the tooltip drifts down/right
    // by exactly however far the page is scrolled.
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const handleShow = useCallback(() => {
    computePosition();
    setShow(true);
  }, [computePosition]);

  const handleHide = useCallback(() => setShow(false), []);

  useEffect(() => {
    if (!show) return;
    const reposition = () => computePosition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [show, computePosition]);

  return (
    <span
      ref={triggerRef}
      tabIndex={0}
      role="img"
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cipher-cyan/60 ${className}`}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
    >
      {children}
      {show && coords && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] px-2.5 py-1.5 text-[11px] font-mono leading-none tooltip-content whitespace-nowrap pointer-events-none animate-fade-in"
          style={{ top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)', marginTop: -8 }}
        >
          {label}
        </div>,
        document.body
      )}
    </span>
  );
}
