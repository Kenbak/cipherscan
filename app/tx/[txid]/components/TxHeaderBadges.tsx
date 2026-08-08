'use client';

import { ExportButton } from '@/components/ExportButton';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Icons } from './Icons';
import type { TransactionData, TxClassification } from './types';

interface TxHeaderBadgesProps {
  data: TransactionData;
  classification: TxClassification;
}

export function TxHeaderBadges({ data, classification }: TxHeaderBadgesProps) {
  const { txType, allBridges } = classification;

  return (
    <div className="flex items-center justify-between gap-2 mb-4 animate-fade-in-up">
      <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
        {txType === 'COINBASE' && (
          <Badge color="green" icon={<Icons.Currency />}>
            COINBASE
          </Badge>
        )}
        {txType === 'MIGRATION' && (
          <Badge
            color={data.zip318?.compliant ? 'green' : 'amber'}
            icon={<Icons.Shield />}
          >
            MIGRATION
          </Badge>
        )}
        {txType === 'IRONWOOD' && (
          <Badge color="amber" icon={<Icons.Shield />}>
            IRONWOOD
          </Badge>
        )}
        {(txType === 'ORCHARD' || txType === 'SHIELDED') && (
          <Badge color="purple" icon={<Icons.Shield />}>
            SHIELDED
          </Badge>
        )}
        {txType === 'SHIELDING' && (
          <Badge color="green" icon={<Icons.Shield />}>
            SHIELDING
          </Badge>
        )}
        {txType === 'UNSHIELDING' && (
          <Badge color="orange" icon={<Icons.Shield />}>
            UNSHIELDING
          </Badge>
        )}
        {txType === 'MIXED' && (
          <Badge color="orange" icon={<Icons.Shield />}>
            MIXED
          </Badge>
        )}
        {txType === 'REGULAR' && <Badge color="cyan">TRANSFER</Badge>}
        {allBridges.length > 0 && (
          <Badge
            color="cyan"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            }
          >
            {allBridges[0].direction === 'entry' ? 'BRIDGE IN' : 'BRIDGE OUT'}
          </Badge>
        )}
        {data.status === 'stale' || data.isCanonical === false ? (
          <StatusBadge status="reorganized" />
        ) : data.status === 'unknown' ? (
          <Badge color="muted">UNKNOWN</Badge>
        ) : (
          <StatusBadge status="confirmed" />
        )}
        <span className="text-xs font-mono text-muted">
          {process.env.NEXT_PUBLIC_NETWORK === 'testnet'
            ? 'Zcash testnet (TAZ)'
            : process.env.NEXT_PUBLIC_NETWORK === 'crosslink-testnet'
              ? 'Zcash Crosslink testnet'
              : 'Zcash mainnet'}
        </span>
      </div>
      <ExportButton
        data={{
          txid: data.txid,
          blockHeight: data.blockHeight,
          blockHash: data.blockHash,
          timestamp: data.timestamp,
          confirmations: data.confirmations,
          fee: data.fee,
          size: data.size,
          version: data.version,
          locktime: data.locktime,
          totalInput: data.totalInput,
          totalOutput: data.totalOutput,
          saplingSpendCount: data.saplingSpendCount,
          saplingOutputCount: data.saplingOutputCount,
          orchardActions: data.orchardActions,
          inputs: data.inputs.map((i: any) => ({
            address: i.address || 'shielded',
            value: i.value,
            coinbase: i.coinbase || false,
          })),
          outputs: data.outputs.map((o: any) => ({
            address: o.scriptPubKey?.addresses?.[0] || 'shielded',
            value: o.value,
            index: o.n,
            spent: o.spent || false,
          })),
        }}
        filename={`tx-${data.txid.slice(0, 16)}`}
        type="json"
        label="Export"
      />
    </div>
  );
}
