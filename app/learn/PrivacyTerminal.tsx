'use client';

import { useEffect, useState } from 'react';
import styles from './learn.module.css';

const text = [
  '> shielded payment',
  '',
  '{',
  '  "sender":    "[shielded]",',
  '  "recipient": "[shielded]",',
  '  "amount":    "[shielded]",',
  '  "memo":      "[encrypted]",',
  '  "proof":     "verified"',
  '}',
].join('\n');

/** Educational terminal: no network request or purported transaction lookup. */
export function PrivacyTerminal() {
  const [length, setLength] = useState(0);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let started: number | undefined;
    const tick = (now: number) => {
      started ??= now;
      const next = motion.matches ? text.length : Math.min(text.length, Math.floor(Math.max(0, now - started - 180) / 17));
      setLength(next);
      if (next < text.length) frame = requestAnimationFrame(tick);
    };
    const restart = () => { cancelAnimationFrame(frame); started = undefined; frame = requestAnimationFrame(tick); };
    restart();
    motion.addEventListener('change', restart);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', restart); };
  }, [replay]);

  const complete = length === text.length;
  return <figure className={styles.terminal}>
    <div className={styles.terminalBar}><span><span className={styles.terminalDot} aria-hidden="true" />shielded_payment</span><button type="button" onClick={() => { setLength(0); setReplay(value => value + 1); }} aria-label="Replay terminal animation">Replay <span aria-hidden="true">↻</span></button></div>
    <pre className={styles.terminalBody} aria-hidden="true">{text.slice(0, length).split(/(\[shielded\]|\[encrypted\]|verified)/).map((part, index) => <span key={index} className={/^\[|^verified$/.test(part) ? styles.gold : undefined}>{part}</span>)}{!complete && <span className={styles.terminalCursor}>▌</span>}</pre>
    <p className="sr-only">Shielded payments hide the sender, recipient, amount and memo. A zero-knowledge proof lets the network verify validity without revealing those details.</p>
    <figcaption className={styles.terminalFooter}><span>Private details. Public verification.</span><span className={styles.terminalBrand}>zecblock.com</span></figcaption>
  </figure>;
}
