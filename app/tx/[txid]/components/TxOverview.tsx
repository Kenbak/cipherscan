'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HashLink } from '@/components/ui/HashLink';
import { RedactedAmount } from '@/components/ui/RedactedAmount';
import { StakingActionBadge } from '@/components/StakingActionBadge';
import { displayPubkey } from '@/lib/utils';
import { InfoRow } from './InfoRow';
import { Icons } from './Icons';
import { formatTimestamp } from './format-timestamp';
import { ShieldedDetailsSection } from './ShieldedDetailsSection';
import type { TransactionData, TxClassification } from './types';

interface TxOverviewProps {
  data: TransactionData;
  classification: TxClassification;
  priceUsd: number | null;
}

export function TxOverview({ data, classification, priceUsd }: TxOverviewProps) {
  const { txType, migrationSourcePool, valueBalance, hasOrchard, hasSapling } = classification;

  return (
    <div>
      <Card className="mb-6">
        <CardBody className="space-y-0">
          <InfoRow
            icon={Icons.Cube}
            label="Block"
            tooltip="The block that includes this transaction"
            value={
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/block/${data.blockHeight}`} className="text-cipher-cyan hover:underline">
                  #{data.blockHeight.toLocaleString()}
                </Link>
                <span className="text-muted">
                  ({data.confirmations.toLocaleString()} confirmation
                  {data.confirmations !== 1 ? 's' : ''})
                </span>
                {data.finality && (
                  <Badge color={data.finality === 'Finalized' ? 'green' : 'orange'}>
                    {data.finality === 'Finalized' ? 'Finalized' : 'Pending'}
                  </Badge>
                )}
              </div>
            }
          />

          {data.stakingAction && (
            <InfoRow
              icon={Icons.Shield}
              label="Crosslink Action"
              tooltip="Crosslink staking action encoded in this transaction"
              value={
                <div className="flex items-center gap-2 flex-wrap">
                  <StakingActionBadge type={data.stakingAction.type} />
                  {data.stakingAction.amountZec !== null && (
                    <span className="font-semibold text-primary">
                      {data.stakingAction.amountZec.toFixed(4)} {CURRENCY}
                    </span>
                  )}
                  {data.stakingAction.delegatee && (
                    <span className="text-xs text-muted">
                      to{' '}
                      <HashLink
                        value={displayPubkey(data.stakingAction.delegatee)}
                        href={`/finalizer/${data.stakingAction.delegatee}`}
                        lead={12}
                        tail={6}
                        copy={false}
                      />
                    </span>
                  )}
                </div>
              }
            />
          )}

          <InfoRow
            icon={Icons.Clock}
            label="Timestamp"
            value={formatTimestamp(data.timestamp)}
            tooltip="When this transaction was mined"
          />

          <InfoRow
            icon={Icons.Currency}
            label="Fee"
            tooltip="Fee paid to the miner"
            value={
              <span className="font-semibold text-primary">
                {data.fee.toFixed(8)} {CURRENCY}
                {priceUsd && data.fee > 0 && (
                  <span className="text-muted font-normal text-[11px] ml-2">
                    (${(data.fee * priceUsd).toFixed(2)})
                  </span>
                )}
              </span>
            }
          />

          <InfoRow
            icon={Icons.Database}
            label="Value"
            tooltip={
              txType === 'ORCHARD' || txType === 'SHIELDED' || txType === 'IRONWOOD'
                ? 'Transaction amount is private and encrypted'
                : txType === 'MIGRATION'
                  ? `Amount crossing from ${migrationSourcePool} to Ironwood pool`
                  : 'Total amount transferred'
            }
            value={
              txType === 'MIGRATION' ? (
                <span className="font-semibold text-primary">
                  {Math.abs(data.valueBalanceIronwood || 0).toFixed(4)} {CURRENCY}
                  <span className="text-xs text-muted font-normal ml-2">
                    {migrationSourcePool} → Ironwood
                  </span>
                </span>
              ) : txType === 'IRONWOOD' ? (
                <RedactedAmount />
              ) : (txType === 'ORCHARD' || txType === 'SHIELDED') && (hasOrchard || hasSapling) ? (
                <div className="flex flex-col gap-2">
                  <RedactedAmount />
                  <Link
                    href={`/decrypt?prefill=${data.txid}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-cipher-purple/20 hover:border-cipher-purple/40 hover:bg-cipher-purple/10 text-cipher-purple text-xs font-medium rounded-md transition-colors w-fit"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                      />
                    </svg>
                    Decrypt with viewing key
                  </Link>
                </div>
              ) : txType === 'SHIELDING' ? (
                <span className="font-semibold text-primary">
                  {Math.abs(valueBalance).toFixed(8)} {CURRENCY}
                  {priceUsd && (
                    <span className="text-muted font-normal text-[11px] ml-2">
                      ($
                      {(Math.abs(valueBalance) * priceUsd).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      )
                    </span>
                  )}
                </span>
              ) : txType === 'UNSHIELDING' ? (
                <span className="font-semibold text-primary">
                  {data.totalOutput.toFixed(8)} {CURRENCY}
                  {priceUsd && (
                    <span className="text-muted font-normal text-[11px] ml-2">
                      ($
                      {(data.totalOutput * priceUsd).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      )
                    </span>
                  )}
                </span>
              ) : (
                <span className="font-semibold text-primary">
                  {(data.totalOutput > 0 ? data.totalOutput : data.totalInput).toFixed(8)} {CURRENCY}
                  {priceUsd && (
                    <span className="text-muted font-normal text-[11px] ml-2">
                      ($
                      {(
                        (data.totalOutput > 0 ? data.totalOutput : data.totalInput) * priceUsd
                      ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      )
                    </span>
                  )}
                </span>
              )
            }
          />

          <InfoRow
            icon={Icons.Database}
            label="Size"
            value={`${data.size.toLocaleString()} bytes (${(data.size / 1024).toFixed(2)} KB)`}
            tooltip="Transaction size in bytes"
          />
          <InfoRow
            icon={Icons.Code}
            label="Version"
            value={data.version}
            tooltip="Transaction version number"
          />
          <InfoRow
            icon={Icons.Clock}
            label="Lock Time"
            value={data.locktime}
            tooltip="Block height or timestamp at which this transaction is unlocked"
          />

          {data.expiryHeight != null && data.expiryHeight > 0 && (
            <InfoRow
              icon={Icons.Clock}
              label="Expiry Height"
              tooltip="Block height after which this transaction can no longer be mined. The delta from the mined block height indicates the wallet's configured expiry window."
              value={
                <span className="flex items-center gap-2 flex-wrap">
                  <span>{data.expiryHeight.toLocaleString()}</span>
                  <span className="text-[10px] text-muted font-mono">
                    +{data.expiryHeight - (data.blockHeight || 0)} blocks
                  </span>
                </span>
              }
            />
          )}

          <ShieldedDetailsSection data={data} />
        </CardBody>
      </Card>
    </div>
  );
}
