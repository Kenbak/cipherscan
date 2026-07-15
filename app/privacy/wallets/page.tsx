import WalletsClient from './WalletsClient';

export default function WalletsPage() {
  return (
    <>
      <WalletsClient />
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="prose prose-invert max-w-none text-sm opacity-70">
          <h2>About This Analysis</h2>
          <p>
            This page examines how Zcash wallet implementations differ in their on-chain behavior.
            Even within the shielded pool, wallets leave distinct fingerprints through fee strategies,
            expiry heights, nLockTime values, and action padding patterns. Understanding these signals
            helps users evaluate their own anonymity set size and choose wallets that maximize privacy.
          </p>
          <p>
            Fee lane analysis is based on ZIP-317, which defines a standard fee of 5,000 zatoshis per
            logical action. Transactions paying exactly this rate blend into the largest anonymity set.
            Non-standard fees — whether higher or lower — reduce the set of transactions you could be
            confused with.
          </p>
        </div>
      </section>
    </>
  );
}
