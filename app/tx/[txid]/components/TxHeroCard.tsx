'use client';

import Link from 'next/link';
import { PrivacyRiskInline } from '@/components/PrivacyRiskInline';
import { Card, CardBody } from '@/components/ui/Card';
import {
  BridgeExplorerLinks,
} from './BridgeExplorerLinks';
import { generateTxSummary } from './tx-summary';
import { TxHeroFlow } from './TxHeroFlow';
import type { TransactionData, TxClassification } from './types';

interface MigrationBannerProps {
  zip318: NonNullable<TransactionData['zip318']>;
}

export function MigrationBanner({ zip318 }: MigrationBannerProps) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs font-mono ${
        zip318.compliant
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-cipher-border/30 bg-glass-3'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`font-semibold ${zip318.compliant ? 'text-emerald-400' : 'text-secondary'}`}
        >
          ZIP-318 {zip318.compliant ? 'compliant' : `(${zip318.checks}/3)`}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted">
        <span>
          {zip318.denomination ? '\u2713' : '\u2717'} Standard denomination
          {zip318.matchedDenomination ? ` (${zip318.matchedDenomination} ZEC)` : ''}
        </span>
        <span>
          {zip318.correctActions ? '\u2713' : '\u2717'} Correct actions (O:
          {zip318.orchardActions} I:{zip318.ironwoodActions})
        </span>
        <span>{zip318.anchorCompliant ? '\u2713' : '\u2717'} Boundary-aligned anchor</span>
      </div>
    </div>
  );
}

interface TxHeroCardProps {
  data: TransactionData;
  classification: TxClassification;
}

export function TxHeroCard({ data, classification }: TxHeroCardProps) {
  const { txType, allBridges } = classification;

  return (
    <div className="mb-6 animate-fade-in-up">
      <Card>
        <CardBody>
          <div className="space-y-3">
            <div className="flex justify-center">
              <TxHeroFlow data={data} classification={classification} />
            </div>

            <p className="text-sm text-muted leading-relaxed">
              {generateTxSummary(data, classification)}
              {data.blockHeight > 0 && (
                <>
                  {' '}
                  Included in canonical Zcash block{' '}
                  <Link
                    href={`/block/${data.blockHeight}`}
                    className="text-primary hover:underline"
                  >
                    #{data.blockHeight.toLocaleString()}
                  </Link>{' '}
                  with {data.confirmations.toLocaleString()} confirmation
                  {data.confirmations !== 1 ? 's' : ''}.
                </>
              )}
            </p>

            {txType === 'MIGRATION' && data.zip318 && <MigrationBanner zip318={data.zip318} />}

            {allBridges.length > 0 && <BridgeExplorerLinks bridges={allBridges} />}

            <PrivacyRiskInline txid={data.txid} variant="full" embedded />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
