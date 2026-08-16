import Link from 'next/link';
import { ExportButton } from '@/components/ExportButton';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { NetworkIcon } from '@/components/icons/common';
import { getNetworkLabel } from '@/lib/network';
import type { BlockData } from './types';

const ClockIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

/** Small pill nav button — replaces a bare arrow icon crammed next to the title. Same border/hover treatment as ExportButton (no cyan tint), not a bespoke style of its own. */
function BlockNavPill({ height, hash, direction }: { height: number; hash?: string; direction: 'prev' | 'next' }) {
  const disabled = !hash;
  return (
    <Link
      href={disabled ? '#' : `/block/${height}`}
      aria-disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-mono transition-colors ${
        disabled
          ? 'border-cipher-border text-muted cursor-not-allowed pointer-events-none'
          : 'border-cipher-border text-secondary hover:text-primary hover:bg-cipher-hover'
      }`}
    >
      {direction === 'prev' && (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      )}
      #{height.toLocaleString()}
      {direction === 'next' && (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </Link>
  );
}

export function BlockPageHeader({
  data,
}: {
  data: BlockData;
}) {
  const isDeepOrFinalized = data.finality ? data.finality === 'Finalized' : data.confirmations > 6;

  return (
    <div className="mb-6 animate-fade-in-up">
      <span className="text-[10px] font-mono text-muted tracking-wider">&gt; BLOCK_DETAILS</span>

      {/* Identity: just the title, nothing competing with it on the line.
          A 3xl heading next to small pill buttons (whichever ones) always
          read as mismatched weight — separating "what this page is" from
          "things to click" onto their own rows fixes that regardless of
          which controls end up on which row. */}
      <h1
        className={`mt-1 text-xl sm:text-2xl md:text-3xl font-bold font-mono ${data.isOrphaned ? 'text-cipher-orange' : 'text-primary'}`}
      >
        {data.isOrphaned ? 'Orphaned Zcash Block' : 'Zcash Block'} #{data.height.toLocaleString()}
      </h1>

      {/* Facts (left) + controls (right), one row directly above the facts
          card — nothing between the badges and the card they describe.
          Nav pills sit right next to Export on the right since they're the
          same visual weight class (both bordered, button-styled), instead
          of pairing either one against the title or against the badges. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="muted" icon={<NetworkIcon />} variant="subtle">
            {getNetworkLabel()}
          </Badge>
          <StatusBadge status={data.isOrphaned ? 'orphan' : 'canonical'} variant="subtle" />
          {!data.isOrphaned && (
            <Badge color={isDeepOrFinalized ? 'green' : 'orange'} icon={<ClockIcon />} variant="subtle">
              {data.finality ?? `${data.confirmations.toLocaleString()} CONFIRMATION${data.confirmations !== 1 ? 'S' : ''}`}
            </Badge>
          )}
        </div>

        {!data.isOrphaned && (
          <div className="flex items-center gap-2">
            <BlockNavPill height={data.height - 1} hash={data.previousBlockHash} direction="prev" />
            <BlockNavPill height={data.height + 1} hash={data.nextBlockHash} direction="next" />
            <ExportButton
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
