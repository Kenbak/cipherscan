'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TxTypeBadge } from '@/components/ui/TxTypeBadge';
import { RedactedAmount } from '@/components/ui/RedactedAmount';
import { CopyButton } from './CopyButton';
import type { TransactionData, TxClassification } from './types';

interface OutputsSectionProps {
  data: TransactionData;
  classification: TxClassification;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function OutputsSection({
  data,
  classification,
  copiedText,
  onCopy,
}: OutputsSectionProps) {
  const { valueBalance, bridgeOutputAddresses } = classification;
  const ironwoodBalance = data.valueBalanceIronwood || 0;
  const orchardBalance = data.valueBalanceOrchard || 0;

  // valueBalance is a consensus-public field (needed for the binding signature
  // balance equation), never hidden — that's why the SHIELDED row below renders
  // its exact value instead of "encrypted". The header total must include it
  // whenever that row is shown, or it silently undercounts what's listed.
  const knownOutputTotal = data.totalOutput + (valueBalance < 0 ? Math.abs(valueBalance) : 0);

  // Which pool (if any) the aggregate "<POOL> POOL" row below already
  // represents, so the per-action placeholder loops never double-count the
  // same deposit under two rows.
  const aggregateRowPool: 'ironwood' | 'orchard' | 'sapling' | null =
    valueBalance < 0 ? (ironwoodBalance < 0 ? 'ironwood' : orchardBalance < 0 ? 'orchard' : 'sapling') : null;
  // Ambiguous only when there's no transparent or Sapling output at all to
  // anchor direction (a pure pool self-loop, or a migration) — Orchard and
  // Ironwood actions bundle spend + output into one indivisible unit, so
  // otherwise a pool's own negative balance (net deposit) is what puts its
  // action count here rather than in InputsSection.
  const ambiguousDirection = data.outputs.length === 0 && data.saplingOutputCount === 0;
  const showOrchardPlaceholder =
    (data.orchardActions || 0) > 0 && aggregateRowPool !== 'orchard' && (ambiguousDirection || orchardBalance < 0);
  const showIronwoodPlaceholder =
    (data.ironwoodActions || 0) > 0 && aggregateRowPool !== 'ironwood' && (ambiguousDirection || ironwoodBalance < 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; OUTPUTS</span>
          <Badge color="muted">
            {(() => {
              let count = data.outputs.length;
              if (valueBalance < 0) count += 1;
              if (data.saplingOutputCount > 0 && valueBalance >= 0)
                count += data.saplingOutputCount;
              if (showOrchardPlaceholder) count += data.orchardActions || 0;
              if (showIronwoodPlaceholder) count += data.ironwoodActions || 0;
              return count;
            })()}
          </Badge>
        </div>
        {knownOutputTotal > 0 && (
          <span className="text-xs text-muted font-mono ml-auto">
            {knownOutputTotal.toFixed(4)} {CURRENCY}
          </span>
        )}
      </CardHeader>
      <CardBody>
        <div className="divide-y divide-cipher-border">
          {data.outputs.map((output: any, index: number) => {
            const outputAddr = output.scriptPubKey?.addresses?.[0];
            const matchedBridge = outputAddr
              ? bridgeOutputAddresses.get(outputAddr)
              : undefined;
            return (
              <div
                key={index}
                className={`flex items-center py-2 first:pt-0 last:pb-0 gap-2 overflow-hidden ${matchedBridge ? 'bg-cipher-cyan/5 -mx-3 px-3 rounded' : ''}`}
              >
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {index}
                </span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  {outputAddr ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <Link href={`/address/${outputAddr}`} className="min-w-0 block overflow-hidden">
                        <code className="text-[11px] text-primary hover:underline transition-colors font-mono truncate block">
                          {outputAddr}
                        </code>
                      </Link>
                      <CopyButton
                        text={outputAddr}
                        label={`output-${index}`}
                        copiedText={copiedText}
                        onCopy={onCopy}
                      />
                      {matchedBridge && (
                        <Badge
                          color="cyan"
                          variant="subtle"
                          icon={
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                              />
                            </svg>
                          }
                        >
                          SWAP
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted font-mono italic">No address</span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-primary shrink-0 tabular-nums">
                  {output.value?.toFixed(8)}
                </span>
              </div>
            );
          })}

          {valueBalance < 0 && (
            <div className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
              <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                {data.outputs.length}
              </span>
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <TxTypeBadge
                  category={
                    (data.valueBalanceIronwood || 0) < 0
                      ? 'ironwood'
                      : (data.valueBalanceOrchard || 0) < 0
                        ? 'orchard'
                        : 'sapling'
                  }
                  label={`${
                    (data.valueBalanceIronwood || 0) < 0
                      ? 'IRONWOOD'
                      : (data.valueBalanceOrchard || 0) < 0
                        ? 'ORCHARD'
                        : 'SAPLING'
                  } POOL`}
                />
              </div>
              <span className="text-[11px] font-mono text-primary font-semibold shrink-0 tabular-nums">
                {Math.abs(valueBalance).toFixed(8)}
              </span>
            </div>
          )}

          {data.saplingOutputCount > 0 &&
            valueBalance >= 0 &&
            Array.from({ length: data.saplingOutputCount }).map((_, index) => (
              <div key={`s-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {data.outputs.length + index}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <TxTypeBadge category="sapling" />
                </div>
                <RedactedAmount className="shrink-0 !text-[10px]" />
              </div>
            ))}

          {showOrchardPlaceholder &&
            Array.from({ length: data.orchardActions || 0 }).map((_, index) => (
              <div key={`o-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {index}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <TxTypeBadge category="orchard" />
                </div>
                <RedactedAmount className="shrink-0 !text-[10px]" />
              </div>
            ))}

          {showIronwoodPlaceholder &&
            Array.from({ length: data.ironwoodActions || 0 }).map((_, index) => (
              <div key={`iw-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {index}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <TxTypeBadge category="ironwood" />
                </div>
                <RedactedAmount className="shrink-0 !text-[10px]" />
              </div>
            ))}

          {data.outputs.length === 0 &&
            valueBalance >= 0 &&
            data.saplingOutputCount === 0 &&
            !showOrchardPlaceholder &&
            !showIronwoodPlaceholder && (
              <p className="text-xs text-muted font-mono py-2 text-center">No outputs</p>
            )}
        </div>
      </CardBody>
    </Card>
  );
}
