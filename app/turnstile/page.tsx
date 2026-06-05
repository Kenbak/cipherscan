import Link from 'next/link';
import { TurnstileTracker } from '@/components/pools/TurnstileTracker';

export default function TurnstilePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> TURNSTILE_TRACKER
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">Turnstile Tracker</h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          Where does deshielded ZEC go? Track whether it stays on a transparent address,
          gets reshielded, moves to an exchange, or transfers elsewhere.
        </p>
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
        <Link
          href="/pools"
          className="text-[10px] font-mono text-cipher-cyan hover:underline"
        >
          Full Pool Analytics →
        </Link>
      </div>
    </div>
  );
}
