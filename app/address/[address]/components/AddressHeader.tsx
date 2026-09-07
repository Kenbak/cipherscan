'use client';

import { ExportButton } from '@/components/ExportButton';
import { AddressLabel } from '@/components/AddressLabel';
import { Badge } from '@/components/ui/Badge';
import { Icons } from './icons';
import type { AddressData, Transaction } from './types';

interface AddressHeaderProps {
  address: string;
  data: AddressData;
  typeInfo: {
    label: string;
    color: string;
    description: string;
  };
}

export function AddressHeader({
  address,
  data,
  typeInfo,
}: AddressHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge color={typeInfo.color as 'purple' | 'gold' | 'muted'} icon={<Icons.Shield />}>{typeInfo.label}</Badge>
        <AddressLabel address={address} />
      </div>
        <ExportButton
          data={{
            address: data.address,
            balance: data.balance,
            type: data.type,
            transactionCount: data.transactionCount,
            transactions: data.transactions.map((tx: Transaction) => ({
              txid: tx.txid,
              blockHeight: tx.blockHeight,
              timestamp: tx.timestamp,
              type: tx.type,
              amount: tx.amount,
              from: tx.from || null,
              to: tx.to || null,
              isCoinbase: tx.isCoinbase || false,
              isShielded: tx.isShielded || false,
              isShielding: tx.isShielding || false,
              isDeshielding: tx.isDeshielding || false,
            })),
          }}
          csvData={data.transactions}
          filename={`address-${address.slice(0, 12)}`}
          type="both"
          label="Export"
          csvHeaders={['TXID', 'Block', 'Timestamp', 'Type', 'Amount (ZEC)']}
          csvMapper={(tx: Transaction) => [
            tx.txid,
            String(tx.blockHeight || ''),
            new Date(tx.timestamp * 1000).toISOString(),
            tx.type,
            tx.amount.toFixed(8),
          ]}
        />
    </div>
  );
}
