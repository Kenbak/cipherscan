'use client';
import { useEffect, useRef, useState } from 'react';
interface Turnstile { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void }
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<void> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.onload = () => resolve();
    script.onerror = () => { script.remove(); loading = null; reject(new Error('Verification unavailable')); };
    document.head.appendChild(script);
  });
  return loading;
}
export function AskChallenge({ siteKey, onToken, reset }: { siteKey?: string | null; onToken: (token: string) => void; reset: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false; let id: string | undefined;
    onToken(''); setError(false);
    load().then(() => {
      if (cancelled || !host.current || !window.turnstile) return;
      id = window.turnstile.render(host.current, { sitekey: siteKey, action: 'ask', size: 'flexible', theme: 'auto', callback: (token: string) => { if (!cancelled) onToken(token); }, 'expired-callback': () => onToken(''), 'error-callback': () => { onToken(''); setError(true); } });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (id) window.turnstile?.remove(id); };
  }, [siteKey, reset, onToken, attempt]);
  return siteKey ? <div className="mt-2"><div ref={host} />{error ? <p role="alert" className="text-xs text-warning">Verification could not load. <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Retry verification</button></p> : null}</div> : null;
}
