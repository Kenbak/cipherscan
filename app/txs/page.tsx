import { API_CONFIG } from '@/lib/api-config';
import TxsClient from './TxsClient';

const API_URL = API_CONFIG.POSTGRES_API_URL;

async function getInitialTxs() {
  try {
    const res = await fetch(`${API_URL}/api/transactions/list?limit=25&type=all`, {
      cache: 'no-store',
    });
    if (!res.ok) return { txs: [], pagination: null };

    const json = await res.json();
    if (!json.success) return { txs: [], pagination: null };

    return { txs: json.transactions || [], pagination: json.pagination ?? null };
  } catch (error) {
    console.error('Error fetching initial transactions:', error);
    return { txs: [], pagination: null };
  }
}

export default async function TransactionsPage() {
  const { txs, pagination } = await getInitialTxs();

  return (
    <>
      <TxsClient initialTxs={txs} initialPagination={pagination} />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Zcash Transactions
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash supports two kinds of value transfer: transparent transactions, which work
              like Bitcoin and expose addresses and amounts on-chain, and shielded
              transactions, which use zero-knowledge proofs (Sapling and Orchard) to keep
              sender, receiver, and amount private. Many transactions mix both — shielding
              funds into a private pool or deshielding them back out.
            </p>
            <p>
              This page lists every transaction as it is mined, with type badges for
              transparent, Sapling, Orchard, and coinbase activity, plus flow indicators for
              shielding and unshielding movements. Filter by type or open any transaction to
              inspect its inputs, outputs, and shielded components.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
