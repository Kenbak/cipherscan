import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { formatRelativeTime, formatDateUTC } from '@/lib/utils';
import { CURRENCY } from '@/lib/config';
import { Card, CardBody } from '@/components/ui/Card';
import { BlockInfoRow } from './BlockInfoRow';
import { BlockMoreDetails } from './BlockMoreDetails';
import { Icons } from './icons';
import type { BlockData } from './types';

export function BlockInfoCard({
  data,
  showMoreDetails,
  onToggleMoreDetails,
  onScrollToTransactions,
}: {
  data: BlockData;
  showMoreDetails: boolean;
  onToggleMoreDetails: () => void;
  onScrollToTransactions: () => void;
}) {
  return (
    <Card className="mb-6">
      <CardBody className="space-y-0">
        <BlockInfoRow
          icon={Icons.Clock}
          label="Timestamp"
          value={
            <span>
              {formatRelativeTime(data.timestamp)}
              <span className="text-muted ml-2">({formatDateUTC(data.timestamp)})</span>
            </span>
          }
          tooltip="The date and time this block was mined"
        />

        <BlockInfoRow
          icon={Icons.Document}
          label="Transactions"
          value={
            data.isOrphaned ? (
              <span className="text-muted font-mono text-xs">
                {data.transactionCount} recorded — details not stored
              </span>
            ) : (
              <span
                className="text-primary font-semibold cursor-pointer hover:text-cipher-cyan transition-colors"
                onClick={onScrollToTransactions}
                title="Click to view all transactions"
              >
                {data.transactionCount} transaction{data.transactionCount !== 1 ? 's' : ''} in this block
              </span>
            )
          }
          tooltip={data.isOrphaned ? 'Transaction data is not stored for orphaned blocks' : 'Total number of transactions included in this block'}
          clickable={!data.isOrphaned}
          onClick={data.isOrphaned ? undefined : onScrollToTransactions}
        />

        {!data.isOrphaned && (
          <BlockInfoRow
            icon={Icons.Check}
            label="Confirmations"
            value={
              <span className={data.confirmations > 6 ? 'text-cipher-green font-semibold' : 'text-cipher-orange'}>
                {data.confirmations.toLocaleString()}
              </span>
            }
            tooltip="Number of blocks mined after this one (6+ confirmations = secure)"
          />
        )}

        {data.finality && !data.isOrphaned && (
          <BlockInfoRow
            icon={Icons.Shield}
            label="Finality"
            value={
              <span className={
                data.finality === 'Finalized'
                  ? 'text-cipher-green font-semibold'
                  : 'text-cipher-orange'
              }>
                {data.finality === 'Finalized' ? 'Finalized' : 'Not Yet Finalized'}
              </span>
            }
            tooltip="Crosslink finality status — Finalized blocks are irreversible via PoS consensus"
          />
        )}

        <BlockInfoRow
          icon={Icons.Database}
          label="Block Size"
          value={`${(data.size / 1024).toFixed(2)} KB`}
          tooltip="The size of this block in kilobytes"
        />

        {data.minerAddress && (
          <BlockInfoRow
            icon={Icons.User}
            label="Fee Recipient"
            value={
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/address/${data.minerAddress}`} className="text-cipher-cyan hover:underline break-all">
                  {data.minerAddress}
                </Link>
                {data.minerPool && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-cipher-surface text-xs font-mono text-cipher-cyan border border-cipher-border whitespace-nowrap">
                    {data.minerPoolUrl ? (
                      <a href={data.minerPoolUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{data.minerPool}</a>
                    ) : (
                      data.minerPool
                    )}
                    {data.minerPoolRegion && <span className="text-muted">({data.minerPoolRegion})</span>}
                  </span>
                )}
              </span>
            }
            tooltip="The address that received the block reward and transaction fees"
          />
        )}

        {data.coinbaseText && (
          <div className="py-3 border-b block-info-border">
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-0">
              <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-secondary">
                <span className="mr-2"><Icons.Code /></span>
                <span className="text-xs sm:text-sm">Coinbase Data</span>
                <span className="ml-2">
                  <Tooltip content="Arbitrary data embedded by the miner in the coinbase transaction. Often contains pool identification tags or messages." />
                </span>
              </div>
              <div className="flex-1 space-y-2">
                <div className="block-hash-bg p-2.5 rounded-lg border border-cipher-border">
                  <code className="text-xs text-cipher-cyan break-all leading-relaxed font-mono-emoji">{data.coinbaseText}</code>
                </div>
                {data.coinbaseHex && (
                  <details className="group">
                    <summary className="text-[10px] font-mono text-muted cursor-pointer hover:text-secondary transition-colors">
                      Raw hex ({Math.floor(data.coinbaseHex.length / 2)} bytes)
                    </summary>
                    <div className="mt-1.5 block-hash-bg p-2 rounded border border-cipher-border">
                      <code className="text-[10px] text-muted break-all">{data.coinbaseHex}</code>
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {data.totalFees !== undefined && !data.isOrphaned && (
          <BlockInfoRow
            icon={Icons.Currency}
            label="Transaction Fees"
            value={
              <span className="font-semibold">
                {data.totalFees.toFixed(8)} {CURRENCY}
              </span>
            }
            tooltip="Total fees paid by all transactions in this block"
          />
        )}

        <div className="pt-4 border-t block-info-border mt-4">
          <div className="flex items-center mb-2 text-secondary">
            <span className="mr-2"><Icons.Hash /></span>
            <span className="text-sm">Block Hash</span>
            <span className="ml-2">
              <Tooltip content="Unique cryptographic identifier for this block" />
            </span>
          </div>
          <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
            <code className="text-xs text-secondary break-all">{data.hash}</code>
          </div>
        </div>

        {!data.isOrphaned && (
          <button
            onClick={onToggleMoreDetails}
            className="mt-8 pt-6 border-t block-info-border text-sm text-secondary hover:text-primary transition-colors flex items-center font-mono w-full"
          >
            <svg className={`w-4 h-4 mr-1 transition-transform ${showMoreDetails ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showMoreDetails ? 'Hide' : 'Show'} More Details
          </button>
        )}

        {showMoreDetails && !data.isOrphaned && (
          <BlockMoreDetails data={data} />
        )}
      </CardBody>
    </Card>
  );
}
