'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from './CopyButton';
import { Icons } from './Icons';
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
              if (
                (data.orchardActions || 0) > 0 &&
                data.outputs.length === 0 &&
                data.saplingOutputCount === 0 &&
                valueBalance >= 0
              )
                count += data.orchardActions || 0;
              return count;
            })()}
          </Badge>
        </div>
        {data.totalOutput > 0 && (
          <span className="text-xs text-muted font-mono ml-auto">
            {data.totalOutput.toFixed(4)} {CURRENCY}
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
                        <code className="text-[11px] text-secondary hover:text-cipher-cyan transition-colors font-mono truncate block">
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
                <Badge
                  color={(data.valueBalanceIronwood || 0) < 0 ? 'amber' : 'purple'}
                  icon={<Icons.Shield />}
                >
                  SHIELDED
                </Badge>
                <span
                  className={`text-[11px] font-mono truncate ${(data.valueBalanceIronwood || 0) < 0 ? 'text-cipher-yellow' : 'text-cipher-purple'}`}
                >
                  {(data.valueBalanceIronwood || 0) < 0
                    ? 'Ironwood'
                    : (data.valueBalanceOrchard || 0) < 0
                      ? 'Orchard'
                      : 'Sapling'}{' '}
                  Pool
                </span>
              </div>
              <span className="text-[11px] font-mono text-cipher-purple font-semibold shrink-0">
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
                  <Badge color="purple" icon={<Icons.Shield />}>
                    SAPLING
                  </Badge>
                  <span className="text-[10px] text-cipher-purple/50 font-mono">encrypted</span>
                </div>
                <span className="text-[10px] text-cipher-purple/40 font-mono shrink-0">████████</span>
              </div>
            ))}

          {(data.orchardActions || 0) > 0 &&
            data.outputs.length === 0 &&
            data.saplingOutputCount === 0 &&
            valueBalance >= 0 &&
            Array.from({ length: data.orchardActions || 0 }).map((_, index) => (
              <div key={`o-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {index}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Badge color="purple" icon={<Icons.Shield />}>
                    ORCHARD
                  </Badge>
                  <span className="text-[10px] text-cipher-purple/50 font-mono">encrypted</span>
                </div>
                <span className="text-[10px] text-cipher-purple/40 font-mono shrink-0">████████</span>
              </div>
            ))}

          {(data.ironwoodActions || 0) > 0 &&
            data.outputs.length === 0 &&
            data.saplingOutputCount === 0 &&
            Array.from({ length: data.ironwoodActions || 0 }).map((_, index) => (
              <div key={`iw-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {index}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Badge color="amber" icon={<Icons.Shield />}>
                    IRONWOOD
                  </Badge>
                  <span className="text-[10px] text-cipher-yellow/50 font-mono">encrypted</span>
                </div>
                <span className="text-[10px] text-cipher-yellow/40 font-mono shrink-0">████████</span>
              </div>
            ))}

          {data.outputs.length === 0 &&
            data.saplingOutputCount === 0 &&
            (data.orchardActions || 0) === 0 &&
            (data.ironwoodActions || 0) === 0 &&
            valueBalance >= 0 && (
              <p className="text-xs text-muted font-mono py-2 text-center">No outputs</p>
            )}
        </div>
      </CardBody>
    </Card>
  );
}
