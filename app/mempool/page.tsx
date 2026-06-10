import MempoolClient from './MempoolClient';

export default function MempoolPage() {
  return (
    <>
      <MempoolClient />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About the Zcash Mempool
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              The mempool is the staging area of the Zcash network: every transaction
              broadcast by a wallet waits here until a miner includes it in a block. With a
              75-second block target, most transactions clear the mempool within a couple of
              minutes. CipherScan streams mempool entries and removals live over WebSocket
              from its own Zebra full node.
            </p>
            <p>
              Each pending transaction is classified as transparent, shielded, or mixed based
              on its components. For shielded entries, only the structure is visible —
              amounts, senders, and receivers stay encrypted, in the mempool and forever
              after.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
