'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../docs.module.css';

export default function CopyCodeButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setStatus('copied'); }
    catch { setStatus('failed'); }
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setStatus('idle'), 2500);
  }
  const message = status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed — select the code to copy it' : `Copy ${label}`;
  return <span className={styles.copyControl}>
    <button type="button" className={styles.copyButton} onClick={copy} title={message} aria-label={`Copy ${label}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {status === 'copied' ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
      </svg>
    </button>
    <span role="status" className={status === 'failed' ? styles.copyError : 'sr-only'}>{status === 'idle' ? '' : message}</span>
  </span>;
}
