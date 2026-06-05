import Link from 'next/link';
import { TurnstileTracker } from '@/components/pools/TurnstileTracker';

export default function TurnstilePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> TURNSTILE_TRACKER
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary font-sans">Turnstile Tracker</h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl font-sans">
          Where does deshielded ZEC go? Track whether it stays on a transparent address,
          gets reshielded, moves to an exchange, or transfers elsewhere.
        </p>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-glass-6 bg-glass-3">
        <p className="text-xs text-secondary font-sans flex-1">
          Turnstile tracking follows ZEC after it exits a shielded pool. High &quot;still held&quot; share
          suggests users aren&apos;t immediately selling or moving funds.
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/pools#flows"
            className="text-[10px] font-mono px-3 py-1.5 rounded-md border border-glass-6 text-muted hover:text-secondary hover:border-glass-12 hover:bg-glass-4 transition-colors"
          >
            Shield / Deshield Flows
          </Link>
          <Link
            href="/privacy-risks"
            className="text-[10px] font-mono px-3 py-1.5 rounded-md border border-glass-6 text-muted hover:text-secondary hover:border-glass-12 hover:bg-glass-4 transition-colors"
          >
            Privacy Risks
          </Link>
          <Link
            href="/pools"
            className="text-[10px] font-mono px-3 py-1.5 rounded-md border border-glass-6 text-muted hover:text-secondary hover:border-glass-12 hover:bg-glass-4 transition-colors"
          >
            Full Pool Analytics →
          </Link>
        </div>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <TurnstileTracker />
      </div>

      <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-glass-4 pt-6">
        <Link
          href="/"
          className="text-[10px] font-mono text-muted hover:text-cipher-cyan transition-colors"
        >
          <span className="text-cipher-cyan font-bold">CipherScan</span>
          <span className="text-muted/60"> — Zcash Block Explorer</span>
        </Link>
      </div>
    </div>
  );
}
