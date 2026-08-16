'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { PrivacyRiskInline } from '@/components/PrivacyRiskInline';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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
  const checks = [
    {
      label: `Standard denomination${zip318.matchedDenomination ? ` (${zip318.matchedDenomination} ${CURRENCY})` : ''}`,
      passed: zip318.denomination,
    },
    {
      label: `Correct actions (Orchard ${zip318.orchardActions}, Ironwood ${zip318.ironwoodActions})`,
      passed: zip318.correctActions,
    },
    { label: 'Boundary-aligned anchor', passed: zip318.anchorCompliant },
  ];

  return (
    <div className="rounded-xl border border-cipher-border/70 p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-secondary">ZIP-318 privacy-set compliance</span>
        <Badge color={zip318.compliant ? 'green' : 'muted'}>
          {zip318.compliant ? 'Compliant' : `${zip318.checks}/3 checks`}
        </Badge>
      </div>
      <div className="space-y-1">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 text-xs text-muted">
            <span className={check.passed ? 'text-cipher-green' : 'text-muted'} aria-hidden>
              {check.passed ? '\u2713' : '\u2717'}
            </span>
            {check.label}
          </div>
        ))}
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
