import Link from 'next/link';
import { PageHeader } from '@/components/ui/SectionHeader';
import { isMainnet } from '@/lib/config';
import { CrosschainDashboard } from '@/components/crosschain/CrosschainDashboard';

export default function CrosschainPage() {
  if (!isMainnet) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center py-12">
            <h1 className="text-2xl font-bold font-mono text-secondary mb-4">Cross-Chain Available on Mainnet Only</h1>
            <p className="text-muted max-w-lg mx-auto mb-6">NEAR Intents cross-chain swaps are only available for ZEC mainnet.</p>
            <div className="flex justify-center gap-4">
              <a href="https://cipherscan.app/crosschain" className="px-4 py-2 bg-cipher-green/20 border border-cipher-green text-cipher-green rounded-lg hover:bg-cipher-green/30 transition-colors font-mono text-sm">View on Mainnet</a>
              <Link href="/" className="px-4 py-2 bg-cipher-surface/30 border border-cipher-border text-secondary rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm">Back to Explorer</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          eyebrow="CROSSCHAIN"
          title="ZEC Cross-Chain Analytics"
          subtitle={
            <span className="text-muted font-mono italic">
              Real-time swap data across 15+ chains via{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">NEAR Intents</a>
            </span>
          }
          actions={
            <a
              href="https://cipherswap.app/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-secondary border border-cipher-border rounded-full hover:border-glass-10 hover:bg-glass-3 transition-colors whitespace-nowrap"
            >
              Buy ZEC on CipherSwap
              <svg className="w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            </a>
          }
        />

        <CrosschainDashboard />
      </div>
    </div>
  );
}
