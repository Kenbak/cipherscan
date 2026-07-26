'use client';

import { useEffect, useState, type RefObject } from 'react';

export type SegmentLabelMode = 'full' | 'name' | 'none';

/** Hide or simplify in-segment labels when the band is too narrow to read. */
export function useSegmentLabelMode(
  ref: RefObject<HTMLElement | null>,
  capPct: number,
): SegmentLabelMode {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  if (width > 0 && width < 44) return 'none';
  if (width > 0 && width < 88) return 'name';
  if (capPct < 3.5) return 'none';
  if (capPct < 8) return 'name';
  return 'full';
}
