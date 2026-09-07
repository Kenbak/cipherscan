'use client';

import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { HashLink } from '@/components/ui/HashLink';
import { TxTypeBadge, resolveTxCategory } from '@/components/ui/TxTypeBadge';
import { RelativeTime } from '@/components/RelativeTime';
import { CURRENCY } from '@/lib/config';
import { TransactionPagination } from './TransactionPagination';
import type { AddressData, Transaction } from './types';

export function TransactionTable({ address, data, currentPage, totalPages, pageSize, totalTxCount }: {
  address: string; data: AddressData; currentPage: number; totalPages: number; pageSize: number; totalTxCount: number;
}) {
  const columns: DataTableColumn<Transaction>[] = [
    { id: 'hash', header: 'Transaction', cell: tx => <HashLink value={tx.txid} href={`/tx/${tx.txid}`} lead={10} tail={6} responsive copy={false} /> },
    { id: 'type', header: 'Type', cell: tx => <TxTypeBadge category={resolveTxCategory(tx)} /> },
    { id: 'direction', header: 'Effect', cell: tx => <span className={`text-xs font-mono whitespace-nowrap ${tx.amount === 0 ? 'text-muted' : tx.type === 'received' ? 'text-cipher-green' : 'text-danger'}`}>{tx.amount === 0 ? 'No change' : tx.type === 'received' ? '↓ Received' : '↑ Sent'}</span> },
    { id: 'other', header: 'Other address', className: 'hidden xl:table-cell', cell: tx => {
      const other = tx.type === 'received' ? tx.from : tx.to;
      if (tx.isCoinbase) return <span className="text-xs text-muted">Mining reward</span>;
      if (other === 'shielded') return <TxTypeBadge category="shielded" />;
      return other && other !== address ? <HashLink value={other} href={`/address/${other}`} lead={6} tail={4} copy={false} /> : <span className="text-xs text-muted">—</span>;
    } },
    { id: 'block', header: 'Block', className: 'hidden md:table-cell', cell: tx => tx.blockHeight ? <Link href={`/block/${tx.blockHeight}`} className="text-xs font-mono text-secondary hover:text-primary">{tx.blockHeight.toLocaleString('en-US')}</Link> : <span className="text-xs text-muted">—</span> },
    { id: 'amount', header: `Balance change (${CURRENCY})`, align: 'right', cell: tx => <span className={`text-xs font-mono whitespace-nowrap ${tx.amount === 0 ? 'text-secondary' : tx.type === 'received' ? 'text-cipher-green' : 'text-danger'}`}>{tx.amount === 0 ? '' : tx.type === 'received' ? '+' : '−'}{Math.abs(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 8 })}</span> },
    { id: 'age', header: 'Age', align: 'right', cell: tx => <RelativeTime timestamp={tx.timestamp} className="text-xs text-muted whitespace-nowrap" /> },
  ];
  return <section aria-label="Address transactions" className="space-y-4">
    <div className="flex flex-wrap justify-between items-baseline gap-2">
      <h2 className="text-base font-semibold text-primary">Transaction history</h2>
      <p className="text-xs text-muted">Newest first · changes to this address’s public balance</p>
    </div>
    <DataTable columns={columns} rows={data.transactions} rowKey={tx => tx.txid} empty={<p className="p-8 text-center text-sm text-muted">No transactions found for this address.</p>}
      footer={<p className="px-4 py-3 text-xs text-muted">Balance change is specific to this address. The other address, when available, is a representative input or output; open the transaction for all participants.</p>} />
    <TransactionPagination address={address} currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} totalTxCount={totalTxCount} />
  </section>;
}
