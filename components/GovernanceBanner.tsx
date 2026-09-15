'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { isMainnet, isCrosslink } from '@/lib/config';
import type { Announcement } from '@/lib/governance';

export function GovernanceBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissedKeys = useRef(new Set<string>());
  const ref = useRef<HTMLDivElement>(null);
  const visible = Boolean(announcement && !dismissed);
  useEffect(() => {
    if (!isMainnet || isCrosslink) return;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/governance/announcement', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error('Unavailable');
        const { announcement: next } = await response.json() as { announcement: Announcement | null };
        if (controller.signal.aborted) return;
        let stored = false;
        try { stored = next ? sessionStorage.getItem(`governance:${next.key}`) === '1' : false; } catch { /* Storage can be disabled. */ }
        setAnnouncement(next);
        setDismissed(stored || Boolean(next && dismissedKeys.current.has(next.key)));
      } catch { if (!controller.signal.aborted) setAnnouncement(null); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!visible || !element) { document.documentElement.style.setProperty('--app-ironwood-height', '0px'); return; }
    const sync = () => document.documentElement.style.setProperty('--app-ironwood-height', `${element.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync); observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.setProperty('--app-ironwood-height', '0px'); };
  }, [visible]);
  if (!visible || !announcement) return null;
  return <div ref={ref} role="region" aria-label="Governance announcement" className="ironwood-banner sticky top-[calc(var(--app-nav-height,4rem)+var(--app-stats-height,2.75rem))] z-40 border-b border-cipher-border/50 backdrop-blur-xl">
    <div className="relative mx-auto flex h-10 max-w-7xl items-center justify-center px-4 pr-12 sm:px-12">
      <Link href={announcement.href} className="truncate font-mono text-xs text-cipher-cyan hover:underline">{announcement.text} →</Link>
      <button aria-label="Dismiss governance announcement" className="absolute right-3 flex h-8 w-8 items-center justify-center text-muted hover:text-primary" onClick={() => { dismissedKeys.current.add(announcement.key); try { sessionStorage.setItem(`governance:${announcement.key}`, '1'); } catch { /* In-memory fallback. */ } setDismissed(true); }}>×</button>
    </div>
  </div>;
}
