'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TxTypeBadge } from '@/components/ui/TxTypeBadge';
import { RedactedAmount } from '@/components/ui/RedactedAmount';
import { CopyButton } from './CopyButton';
import type { TransactionData } from './types';

interface InputsSectionProps {
  data: TransactionData;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function InputsSection({ data, copiedText, onCopy }: InputsSectionProps) {
  const ironwoodActions = data.ironwoodActions || 0;
  const orchardActions = data.orchardActions || 0;
  const saplingSpends = data.saplingSpendCount;
  const hasTransparent = data.inputs.length > 0;
  const ironwoodBalance = data.valueBalanceIronwood || 0;
  const orchardBalance = data.valueBalanceOrchard || 0;

  // Ironwood/Orchard don't separate "spends" from "outputs" the way Sapling
  // does — each action is one combined note. That pool's own value balance
  // is the only reliable direction signal: positive means it's a net source
  // (show here as an input), even when a transparent input also exists —
  // e.g. combining a transparent UTXO with an existing shielded note. With
  // no transparent input and no Sapling spends at all to anchor direction
  // (a pure pool self-loop, or a Sapling->Ironwood migration), spend vs.
  // output can't be told apart, so both sections show the full count.
  const ambiguousDirection = !hasTransparent && saplingSpends === 0;
  const showIronwood = ironwoodActions > 0 && (ambiguousDirection || ironwoodBalance > 0);
  const showOrchard = orchardActions > 0 && (ambiguousDirection || orchardBalance > 0);

  const totalCount = data.inputs.length + saplingSpends + (showOrchard ? orchardActions : 0) + (showIronwood ? ironwoodActions : 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; INPUTS</span>
          <Badge color="muted">{totalCount}</Badge>
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

          {saplingSpends > 0 &&
            Array.from({ length: saplingSpends }).map((_, index) => (
              <div key={`s-${index}`} className="flex items-center py-2 first:pt-0 last:pb-0 gap-2">
                <span className="text-[10px] text-muted font-mono w-4 shrink-0 text-right">
                  {data.inputs.length + index}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <TxTypeBadge category="sapling" />
                </div>
                <RedactedAmount className="shrink-0 !text-[10px]" />
              </div>
            ))}

          {showOrchard &&
            Array.from({ length: orchardActions }).map((_, index) => (
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

          {showIronwood &&
            Array.from({ length: ironwoodActions }).map((_, index) => (
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

          {totalCount === 0 && (
            <p className="text-xs text-muted font-mono py-2 text-center">No inputs</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
