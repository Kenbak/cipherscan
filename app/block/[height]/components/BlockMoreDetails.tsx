import { Tooltip } from '@/components/Tooltip';
import { BlockInfoRow } from './BlockInfoRow';
import { Icons } from './icons';
import type { BlockData } from './types';

export function BlockMoreDetails({ data }: { data: BlockData }) {
  return (
    <div className="mt-4 pt-4 border-t block-info-border space-y-0">
      <BlockInfoRow
        icon={Icons.Code}
        label="Difficulty"
        value={data.difficulty.toFixed(8)}
        tooltip="Mining difficulty at the time this block was mined"
      />

      {data.version && (
        <BlockInfoRow
          icon={Icons.Cube}
          label="Version"
          value={data.version}
          tooltip="Block version number"
        />
      )}

      {data.bits && (
        <BlockInfoRow
          icon={Icons.Key}
          label="Bits"
          value={data.bits}
          tooltip="Compact representation of the difficulty target"
        />
      )}

      {data.nonce && (
        <BlockInfoRow
          icon={Icons.Hash}
          label="Nonce"
          value={data.nonce}
          tooltip="Random value used in mining to find a valid block hash"
        />
      )}

      {data.merkleRoot && (
        <div className="pt-3">
          <div className="flex items-center mb-2 text-secondary">
            <span className="mr-2"><Icons.Key /></span>
            <span className="text-sm">Merkle Root</span>
            <span className="ml-2">
              <Tooltip content="Cryptographic hash that proves all transparent transactions in this block are valid and unmodified. Calculated from the transaction tree." />
            </span>
          </div>
          <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
            <code className="text-xs text-muted break-all">{data.merkleRoot}</code>
          </div>
        </div>
      )}

      {data.finalSaplingRoot && (
        <div className="pt-3">
          <div className="flex items-center mb-2">
            <span className="mr-2 text-cipher-purple"><Icons.Shield /></span>
            <span className="text-sm text-secondary">Final Sapling Root</span>
            <span className="ml-2">
              <Tooltip content="Root hash of the Sapling note commitment tree after processing this block. This proves the existence of all shielded (private) transactions without revealing their details." />
            </span>
          </div>
          <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
            <code className="text-xs text-secondary break-all">{data.finalSaplingRoot}</code>
          </div>
        </div>
      )}

      {data.finalOrchardRoot && (
        <div className="pt-3">
          <div className="flex items-center mb-2">
            <span className="mr-2 text-cipher-purple"><Icons.Shield /></span>
            <span className="text-sm text-secondary">Final Orchard Root</span>
            <span className="ml-2">
              <Tooltip content="Root hash of the Orchard note commitment tree after processing this block. Used by wallets as an anchor when constructing shielded spends." />
            </span>
          </div>
          <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
            <code className="text-xs text-secondary break-all">{data.finalOrchardRoot}</code>
          </div>
        </div>
      )}

      {data.finalIronwoodRoot && (
        <div className="pt-3">
          <div className="flex items-center mb-2">
            <span className="mr-2 text-cipher-yellow"><Icons.Shield /></span>
            <span className="text-sm text-secondary">Final Ironwood Root</span>
            <span className="ml-2">
              <Tooltip content="Root hash of the Ironwood note commitment tree after processing this block. The successor to Orchard with enhanced privacy properties." />
            </span>
          </div>
          <div className="block-hash-bg p-3 rounded-lg border border-cipher-border">
            <code className="text-xs text-secondary break-all">{data.finalIronwoodRoot}</code>
          </div>
        </div>
      )}
    </div>
  );
}
