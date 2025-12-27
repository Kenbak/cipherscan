'use client';

import { useState, useEffect, useRef } from 'react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close tooltip when clicking outside (mobile)
  useEffect(() => {
    if (!show || !isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show, isMobile]);

  const handleInteraction = () => {
    if (isMobile) {
      // On mobile, toggle on click
      setShow(!show);
    } else {
      // On desktop, show on hover
      setShow(true);
    }
  };

  return (
    <div className="relative inline-block" ref={tooltipRef}>
      <button
        type="button"
        onClick={handleInteraction}
        onMouseEnter={() => !isMobile && setShow(true)}
        onMouseLeave={() => !isMobile && setShow(false)}
        onFocus={() => !isMobile && setShow(true)}
        onBlur={() => !isMobile && setShow(false)}
        className="text-muted hover:text-cipher-cyan transition-colors cursor-help"
        aria-label="More information"
      >
        {children || (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        )}
      </button>
      {show && (
        <div className="absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs leading-relaxed tooltip-content w-56 max-w-xs">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="tooltip-arrow"></div>
          </div>
        </div>
      )}
    </div>
  );
}
