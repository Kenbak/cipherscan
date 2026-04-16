'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; align: 'center' | 'left' | 'right' } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 224;
    const halfWidth = tooltipWidth / 2;
    const centerX = rect.left + rect.width / 2;

    let align: 'center' | 'left' | 'right' = 'center';
    let left = centerX;

    if (centerX - halfWidth < 8) {
      align = 'left';
      left = rect.left;
    } else if (centerX + halfWidth > window.innerWidth - 8) {
      align = 'right';
      left = rect.right;
    }

    setCoords({
      top: rect.top + window.scrollY,
      left: left + window.scrollX,
      align,
    });
  }, []);

  useEffect(() => {
    if (!show) return;
    const handleDismiss = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handleDismiss);
    return () => document.removeEventListener('mousedown', handleDismiss);
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const handleScroll = () => computePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [show, computePosition]);

  const handleShow = () => {
    computePosition();
    setShow(true);
  };

  const handleInteraction = () => {
    if (isMobile) {
      if (!show) computePosition();
      setShow(!show);
    } else {
      handleShow();
    }
  };

  const transformMap = {
    center: 'translateX(-50%)',
    left: 'translateX(0)',
    right: 'translateX(-100%)',
  };

  const arrowClasses = {
    center: 'left-1/2 -translate-x-1/2',
    left: 'left-3',
    right: 'right-3',
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleInteraction}
        onMouseEnter={() => !isMobile && handleShow()}
        onMouseLeave={() => !isMobile && setShow(false)}
        onFocus={() => !isMobile && handleShow()}
        onBlur={() => !isMobile && setShow(false)}
        className="inline-flex text-muted hover:text-cipher-cyan transition-colors cursor-help"
        aria-label="More information"
      >
        {children || (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        )}
      </button>
      {show && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] px-3 py-2 text-xs leading-relaxed tooltip-content w-56 max-w-xs normal-case tracking-normal pointer-events-auto"
          style={{
            top: coords.top - window.scrollY,
            left: coords.left,
            transform: `${transformMap[coords.align]} translateY(-100%)`,
            marginTop: -8,
          }}
        >
          {content}
          <div className={`absolute top-full ${arrowClasses[coords.align]} -mt-px`}>
            <div className="tooltip-arrow"></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
