import Link from 'next/link';
import { ExportButton } from '@/components/ExportButton';
import { NETWORK_UPGRADES } from '@/lib/config';
import { Badge } from '@/components/ui/Badge';
import type { CoinbaseClientEmoji, CoinbaseClientInfo } from '@/lib/coinbase-client';
import type { BlockData } from './types';

export function BlockPageHeader({
  data,
  coinbaseClientEmoji,
  coinbaseClientInfo,
}: {
  data: BlockData;
  coinbaseClientEmoji: CoinbaseClientEmoji | null;
  coinbaseClientInfo: CoinbaseClientInfo;
}) {
  return (
    <div className="mb-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-2 sm:gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-mono text-muted tracking-wider">&gt; BLOCK_DETAILS</span>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {!data.isOrphaned && (
              <Link
                href={`/block/${data.height - 1}`}
                className={`p-1 rounded transition-colors ${
                  data.previousBlockHash
                    ? 'text-secondary hover:text-primary'
                    : 'text-muted cursor-not-allowed pointer-events-none'
                }`}
                title="Previous Block"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}

            <h1 className={`text-xl sm:text-2xl md:text-3xl font-bold font-mono ${data.isOrphaned ? 'text-cipher-orange' : 'text-primary'}`}>
              {data.isOrphaned ? 'Orphaned Zcash Block' : 'Zcash Block'} #{data.height.toLocaleString()}
            </h1>
            {data.isOrphaned && (
              <Badge color="orange">ORPHAN</Badge>
            )}
            {!data.isOrphaned && (
              <Badge color="green">CANONICAL</Badge>
            )}
            {coinbaseClientEmoji && (
              <Badge color="muted" className="text-sm leading-none">
                <span role="img" aria-label={coinbaseClientInfo.name ? `Mined with ${coinbaseClientInfo.name}` : 'Block-template client marker'}>
                  {coinbaseClientEmoji}
                </span>
                {coinbaseClientInfo.name && (
                  <span className="ml-1 text-[10px] font-mono text-muted">
                    {coinbaseClientInfo.name}{coinbaseClientInfo.version ? ` ${coinbaseClientInfo.version}` : ''}
                  </span>
                )}
              </Badge>
            )}
            {NETWORK_UPGRADES[data.height] && (
              <Link href={NETWORK_UPGRADES[data.height].link || '#'} className="no-underline">
                <Badge color="amber">
                  {NETWORK_UPGRADES[data.height].name}
                </Badge>
              </Link>
            )}

            {!data.isOrphaned && (
              <Link
                href={`/block/${data.height + 1}`}
                className={`p-1 rounded transition-colors ${
                  data.nextBlockHash
                    ? 'text-secondary hover:text-primary'
                    : 'text-muted cursor-not-allowed pointer-events-none'
                }`}
                title="Next Block"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>
        {!data.isOrphaned && <ExportButton
          data={{
            height: data.height,
            hash: data.hash,
            timestamp: data.timestamp,
            transactionCount: data.transactionCount,
            size: data.size,
            difficulty: data.difficulty,
            confirmations: data.confirmations,
            previousBlockHash: data.previousBlockHash,
            nextBlockHash: data.nextBlockHash,
            version: data.version,
            merkleRoot: data.merkleRoot,
            finalSaplingRoot: data.finalSaplingRoot,
            bits: data.bits,
            nonce: data.nonce,
            solution: data.solution,
            totalFees: data.totalFees,
            minerAddress: data.minerAddress,
            transactions: data.transactions?.map((tx: any) => ({
              txid: tx.txid,
              type: tx.vin?.[0]?.coinbase ? 'coinbase' : tx.hasShieldedActivity ? 'shielded' : 'regular',
              inputs: tx.vin?.length || 0,
              outputs: tx.vout?.length || 0,
              amount: tx.vout?.reduce((sum: number, out: any) => sum + (out.value || 0), 0) || 0
            }))
          }}
          csvData={data.transactions}
          filename={`block-${data.height}`}
          type="both"
          label="Export"
          csvHeaders={['TXID', 'Type', 'Inputs', 'Outputs', 'Amount (ZEC)']}
          csvMapper={(tx: any) => [
            tx.txid,
            tx.vin?.[0]?.coinbase ? 'Coinbase' : tx.hasShieldedActivity ? 'Shielded' : 'Regular',
            String(tx.vin?.length || 0),
            String(tx.vout?.length || 0),
            tx.vout?.reduce((sum: number, out: any) => sum + (out.value || 0), 0).toFixed(8) || '0'
          ]}
        />}
      </div>
      <p className="text-xs sm:text-sm text-secondary">
        {data.isOrphaned
          ? 'This block is no longer part of the canonical Zcash chain.'
          : 'This block is part of the canonical Zcash chain.'}{' '}
        Full block hash:{' '}
        <code className="font-mono text-primary break-all">{data.hash}</code>
      </p>
    </div>
  );
}
