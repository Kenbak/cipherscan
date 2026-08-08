'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Tooltip } from '@/components/Tooltip';
import { InfoRow } from './InfoRow';
import { Icons } from './Icons';
import type { TransactionData } from './types';

export function ShieldedDetailsSection({ data }: { data: TransactionData }) {
  return (
    <>
      {data.hasShieldedData && (
        <>
          <InfoRow
            icon={Icons.Shield}
            label="Sapling Spends"
            value={data.saplingSpendCount}
            tooltip="Number of Sapling shielded inputs"
            valueClass="text-cipher-cyan"
          />
          <InfoRow
            icon={Icons.Shield}
            label="Sapling Outputs"
            value={data.saplingOutputCount}
            tooltip="Number of Sapling shielded outputs"
            valueClass="text-cipher-cyan"
          />
        </>
      )}

      {(data.orchardActions || 0) > 0 && (
        <InfoRow
          icon={Icons.Shield}
          label="Orchard Actions"
          value={data.orchardActions}
          tooltip="Number of Orchard actions"
          valueClass="text-cipher-purple"
        />
      )}

      {(data.ironwoodActions || 0) > 0 && (
        <InfoRow
          icon={Icons.Shield}
          label="Ironwood Actions"
          value={data.ironwoodActions}
          tooltip="Number of Ironwood actions (NU6.3)"
          valueClass="text-cipher-yellow"
        />
      )}

      {data.valueBalanceSapling !== undefined && data.valueBalanceSapling !== 0 && (
        <InfoRow
          icon={Icons.Currency}
          label="Sapling Value Balance"
          tooltip="Net value flow for the Sapling shielded pool. Positive = entering pool (shielding), negative = leaving pool (unshielding)."
          valueClass="text-cipher-cyan"
          value={
            <span className="flex items-center gap-2">
              <span>
                {data.valueBalanceSapling < 0 ? '+' : '-'}
                {Math.abs(data.valueBalanceSapling).toFixed(8)} {CURRENCY}
              </span>
              <span className="text-[10px] text-muted font-mono">
                {data.valueBalanceSapling < 0 ? '→ Sapling Pool' : '← Sapling Pool'}
              </span>
            </span>
          }
        />
      )}

      {data.valueBalanceOrchard !== undefined && data.valueBalanceOrchard !== 0 && (
        <InfoRow
          icon={Icons.Currency}
          label="Orchard Value Balance"
          tooltip="Net value flow for the Orchard shielded pool. Positive = entering pool (shielding), negative = leaving pool (unshielding)."
          valueClass="text-cipher-purple"
          value={
            <span className="flex items-center gap-2">
              <span>
                {data.valueBalanceOrchard < 0 ? '+' : '-'}
                {Math.abs(data.valueBalanceOrchard).toFixed(8)} {CURRENCY}
              </span>
              <span className="text-[10px] text-muted font-mono">
                {data.valueBalanceOrchard < 0 ? '→ Orchard Pool' : '← Orchard Pool'}
              </span>
            </span>
          }
        />
      )}

      {data.valueBalanceIronwood !== undefined && data.valueBalanceIronwood !== 0 && (
        <InfoRow
          icon={Icons.Currency}
          label="Ironwood Value Balance"
          tooltip="Net value flow for the Ironwood shielded pool (NU6.3). Positive = entering pool (shielding), negative = leaving pool (unshielding)."
          valueClass="text-cipher-yellow"
          value={
            <span className="flex items-center gap-2">
              <span>
                {data.valueBalanceIronwood < 0 ? '+' : '-'}
                {Math.abs(data.valueBalanceIronwood).toFixed(8)} {CURRENCY}
              </span>
              <span className="text-[10px] text-muted font-mono">
                {data.valueBalanceIronwood < 0 ? '→ Ironwood Pool' : '← Ironwood Pool'}
              </span>
            </span>
          }
        />
      )}

      {data.bindingSigSapling && (
        <div className="pt-3 border-t block-info-border mt-3">
          <div className="flex items-center mb-2">
            <span className="mr-2 text-cipher-purple">
              <Icons.Shield />
            </span>
            <span className="text-sm text-secondary">Sapling Binding Signature</span>
            <span className="ml-2">
              <Tooltip content="Cryptographic proof that the transaction is balanced" />
            </span>
          </div>
          <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border">
            <code className="text-xs text-cipher-purple/60 break-all block">
              {data.bindingSigSapling}
            </code>
          </div>
        </div>
      )}

      <div className="pt-3 border-t block-info-border mt-3">
        <div className="flex items-center mb-2 text-secondary">
          <span className="mr-2">
            <Icons.Hash />
          </span>
          <span className="text-sm">Block Hash</span>
          <span className="ml-2">
            <Tooltip content="Hash of the block containing this transaction" />
          </span>
        </div>
        <Link href={`/block/${data.blockHeight}`}>
          <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border hover:border-cipher-cyan transition-colors max-w-full">
            <code className="text-xs text-secondary hover:text-cipher-cyan break-all block">
              {data.blockHash}
            </code>
          </div>
        </Link>
      </div>
    </>
  );
}
