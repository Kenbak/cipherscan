'use client';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { NETWORK } from '@/lib/api-config';
const AskPanel = dynamic(() => import('./AskPanel'), { ssr: false });
export function AskWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  if (NETWORK !== 'mainnet' || pathname === '/ask') return null;
  function close() { setOpen(false); launcher.current?.focus(); }
  return <>
    <button ref={launcher} type="button" onClick={() => { setLoaded(true); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'ask-page-panel' : undefined} className="fixed bottom-4 right-4 z-40 hidden md:flex items-center gap-2 rounded-full border border-cipher-border bg-cipher-surface px-4 py-3 text-sm text-primary shadow-lg hover:bg-glass-3" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}><span className="font-mono text-cipher-gold" aria-hidden="true">&gt;_</span> Ask</button>
    {loaded ? <AskPanel key={pathname} pathname={pathname} open={open} onClose={close} /> : null}
  </>;
}
