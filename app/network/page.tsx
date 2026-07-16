import NetworkClient from './NetworkClient';

export default function NetworkPage() {
  return (
    <>
      <NetworkClient />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About the Zcash Network
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash is a proof-of-work blockchain secured by Equihash mining, with a block
              target of 75 seconds and a maximum supply of 21 million ZEC. This page tracks
              the network&apos;s vital signs: chain height, hashrate, difficulty, connected
              peers, observed node-software diversity, and the split of circulating supply
              between the transparent, Sapling, Orchard, and Ironwood pools.
            </p>
            <p>
              Supply numbers distinguish transparent ZEC (publicly auditable, like Bitcoin)
              from shielded ZEC (held in zero-knowledge pools where balances are private but
              the pool totals remain verifiable). Mining pool distribution is derived from
              coinbase markers and shows how concentrated block production currently is.
              Peer software percentages are a sample from CipherScan&apos;s live connections,
              not a complete census of every Zcash node.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
