'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseInViewportOptions {
  /** Lookahead distance so heavy content starts loading before the user
   * actually scrolls it into view, avoiding a jarring pop-in. */
  rootMargin?: string;
  enabled?: boolean;
}

/**
 * Attach the returned ref to a sentinel element; the returned boolean flips
 * to `true` once that element has ever intersected the viewport (with
 * `rootMargin` lookahead) and stays `true` afterward.
 *
 * Built for "defer fetching/rendering this below-fold section's heavy
 * payload until the user is about to scroll to it" (e.g. the Ironwood
 * migration scatter chart's ~10MB dataset), not for continuous visibility
 * tracking.
 */
export function useInViewport<T extends Element = HTMLDivElement>(
  options: UseInViewportOptions = {},
): [RefObject<T | null>, boolean] {
  const { rootMargin = '600px', enabled = true } = options;
  const ref = useRef<T | null>(null);
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    if (!enabled || inViewport) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      // No IntersectionObserver support (very old browser / non-DOM test
      // environment) — fail open so the content isn't permanently hidden.
      setInViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, inViewport, rootMargin]);

  return [ref, inViewport];
}
