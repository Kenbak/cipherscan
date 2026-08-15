'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from './CopyButton';
import { Icons } from './Icons';
import type { TransactionData } from './types';

interface InputsSectionProps {
  data: TransactionData;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function InputsSection({ data, copiedText, onCopy }: InputsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; INPUTS</span>
          <Badge color="muted">
            {(() => {
              let count = data.inputs.length + data.saplingSpendCount;
              if (
                (data.orchardActions || 0) > 0 &&
                data.inputs.length === 0 &&
                data.saplingSpendCount === 0
              ) {
                count += data.orchardActions || 0;
              }
              return count;
            })()}
          </Badge>
        </div>
        {data.totalInput > 0 && (
          <span className="text-xs text-muted font-mono ml-auto">
            {data.totalInput.toFixed(4)} {CURRENCY}
          </span>
        )}
      </CardHeader>
      <CardBody>
        <div className="divide-y divide-cipher-border">
          {data.inputs.map((input: any, index: number) => (
            <div
              key={index}
              className="flex items-center py-2 first:pt-0 last:pb-0 gap-2 overflow-hidden"
            >
              <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                {index}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                {input.coinbase ? (
                  <div className="space-y-1">
                    <span className="text-xs text-muted font-mono">Block Reward</span>
                    {data.coinbaseText && (
                      <div className="block-hash-bg px-2 py-1 rounded border border-cipher-border">
                        <code className="text-[10px] text-cipher-cyan break-all">
                          {data.coinbaseText}
                        </code>
                      </div>
                    )}
                  </div>
                ) : input.address ? (
                  <div className="flex items-center gap-1 min-w-0">
                    <Link href={`/address/${input.address}`} className="min-w-0 block overflow-hidden">
                      <code className="text-[11px] text-secondary hover:text-primary transition-colors font-mono truncate block">
                        {input.address}
                      </code>
                    </Link>
                    <CopyButton
                      text={input.address}
                      label={`input-${index}`}
                      copiedText={copiedText}
                      onCopy={onCopy}
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted font-mono italic">Unknown</span>
                )}
              </div>
              {!input.coinbase && (
                <span className="text-[11px] font-mono text-primary shrink-0 tabular-nums">
                  {input.value?.toFixed(8)}
                </span>
              )}
            </div>
          ))}

          {data.saplingSpendCount > 0 &&
            Array.from({ length: data.saplingSpendCount }).map((_, index) => (
              <div key={`s-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {data.inputs.length + index}
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
            data.inputs.length === 0 &&
            data.saplingSpendCount === 0 &&
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

          {data.inputs.length === 0 &&
            data.saplingSpendCount === 0 &&
            (data.orchardActions || 0) === 0 && (
              <p className="text-xs text-muted font-mono py-2 text-center">No inputs</p>
            )}
        </div>
      </CardBody>
    </Card>
  );
}
