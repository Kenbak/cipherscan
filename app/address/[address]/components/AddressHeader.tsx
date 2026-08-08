'use client';

import { ExportButton } from '@/components/ExportButton';
import { AddressLabel } from '@/components/AddressLabel';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from './CopyButton';
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
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function AddressHeader({
  address,
  data,
  typeInfo,
  copiedText,
  onCopy,
}: AddressHeaderProps) {
  return (
    <div className="mb-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-2 sm:gap-4 mb-2">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; ADDRESS_DETAILS</span>
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

      <Badge color={typeInfo.color as 'purple' | 'cyan'} icon={<Icons.Shield />}>
        {typeInfo.label}
      </Badge>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <code className="text-sm text-secondary break-all font-mono">{address}</code>
        <CopyButton text={address} label="address" copiedText={copiedText} onCopy={onCopy} />
        <AddressLabel address={address} />
      </div>
    </div>
  );
}
