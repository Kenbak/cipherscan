import PrivacyClient from './PrivacyClient';

export default function PrivacyPage() {
  return (
    <>
      <PrivacyClient />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            How the Privacy Score Works
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash privacy is not binary — it depends on how the network is used. Funds held
              in the shielded pools (Sapling and Orchard) are protected by zero-knowledge
              proofs, but transparent transactions and careless shielding patterns leak
              metadata. The privacy score aggregates shielded pool size, shielded transaction
              share, and detected linkage risks into a single 0–100 indicator of network-wide
              privacy health.
            </p>
            <p>
              The dashboard tracks these inputs over time: pool balances in ZEC, daily
              shielding and deshielding flows, and the ratio of fully shielded to mixed
              transactions. All metrics come from CipherScan&apos;s own index of the chain —
              no third-party analytics, and shielded data stays shielded.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
