import Link from 'next/link';
import { ExportButton } from '@/components/ExportButton';
import { Badge } from '@/components/ui/Badge';
import type { BlockData } from './types';

/** Small pill nav button — replaces a bare arrow icon crammed next to the title. */
function BlockNavPill({ height, hash, direction }: { height: number; hash?: string; direction: 'prev' | 'next' }) {
  const disabled = !hash;
  return (
    <Link
      href={disabled ? '#' : `/block/${height}`}
      aria-disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
        disabled
          ? 'border-cipher-border text-muted cursor-not-allowed pointer-events-none'
          : 'border-cipher-border text-secondary hover:text-primary hover:border-cipher-cyan/40'
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
  // Rendered twice below (title row on desktop, status row on mobile) rather
  // than reflowed with responsive classes on one instance — a single element
  // can't sit inline in one row at one breakpoint and a different row at
  // another without either duplicating it or hand-rolling grid-area tricks,
  // and duplicating a plain button is simpler than either.
  const exportButton = !data.isOrphaned && (
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
  );

  return (
    <div className="mb-6 animate-fade-in-up">
      <span className="text-[10px] font-mono text-muted tracking-wider">&gt; BLOCK_DETAILS</span>

      {/* Title row: identity only. Export lives here on desktop, where it fits
          on the same line — on mobile it moves to the status row below instead
          of wrapping onto its own orphaned line with awkward gaps above/below. */}
      <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h1 className={`text-xl sm:text-2xl md:text-3xl font-bold font-mono ${data.isOrphaned ? 'text-cipher-orange' : 'text-primary'}`}>
            {data.isOrphaned ? 'Orphaned Zcash Block' : 'Zcash Block'} #{data.height.toLocaleString()}
          </h1>
          <Badge color={data.isOrphaned ? 'orange' : 'green'}>{data.isOrphaned ? 'ORPHAN' : 'CANONICAL'}</Badge>
        </div>
        <div className="hidden sm:block">{exportButton}</div>
      </div>

      {/* Status metadata: confirmations/finality, plus Export on mobile, sharing this row instead of stranding it alone between the title and here. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 mt-2 text-xs sm:text-sm text-secondary">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {!data.isOrphaned && (
            <>
              <span className={data.finality ? (data.finality === 'Finalized' ? 'text-cipher-green' : 'text-cipher-orange') : (data.confirmations > 6 ? 'text-cipher-green' : 'text-cipher-orange')}>
                {data.finality ?? `${data.confirmations.toLocaleString()} confirmation${data.confirmations !== 1 ? 's' : ''}`}
              </span>
              <span className="text-cipher-border">·</span>
            </>
          )}
          <span>{data.isOrphaned ? 'Not part of the canonical chain' : 'Canonical chain'}</span>
        </div>
        <div className="sm:hidden">{exportButton}</div>
      </div>

      {/* Navigation: explicit pill buttons, not bare arrow icons next to the title */}
      {!data.isOrphaned && (
        <div className="flex items-center gap-2 mt-3">
          <BlockNavPill height={data.height - 1} hash={data.previousBlockHash} direction="prev" />
          <BlockNavPill height={data.height + 1} hash={data.nextBlockHash} direction="next" />
        </div>
      )}
    </div>
  );
}
