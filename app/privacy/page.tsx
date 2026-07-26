import Link from 'next/link';
import PrivacyClient from './PrivacyClient';
import { CURRENCY } from '@/lib/config';

export default function PrivacyPage() {
  return (
    <>
      <PrivacyClient />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div id="how-it-works" className="scroll-mt-36 border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-sans text-secondary mb-3">
            How the Privacy Score works
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash privacy depends on how the network is used — not just pool size. The score blends
              recent shielded transaction share, fully-shielded usage, supply held in pools, and how often
              deshielded {CURRENCY} is reshielded (turnstile hygiene).
            </p>
            <p>
              Pool balances and flow volume are on{' '}
              <Link href="/pools" className="text-cipher-cyan hover:underline">
                Shielded Pools
              </Link>
              . Post-deshield destinations are on{' '}
              <Link href="/turnstile" className="text-cipher-cyan hover:underline">
                Turnstile
              </Link>
              . All metrics come from CipherScan&apos;s index — no third-party analytics.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
