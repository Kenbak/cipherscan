'use client';

import type { ReactNode } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { CURRENCY } from '@/lib/config';
import type { AddressData, CrossChainActivity, PriceData } from './types';

interface AddressHeroCardProps {
  data: AddressData;
  priceData: PriceData | null;
  crossChain: CrossChainActivity | null;
  summary: ReactNode;
}

export function AddressHeroCard({
  data,
  priceData,
  crossChain,
  summary,
}: AddressHeroCardProps) {
  return (
    <div className="mb-6 animate-fade-in-up stagger-2">
      <Card>
        <CardBody>
          <div className="flex flex-col items-center text-center space-y-3 py-2">
            {/* Balance with ZEC icon */}
            <div>
              <div className="flex items-center justify-center gap-3">
                <img src="/tokens/zec.png" alt="ZEC" className="w-7 h-7 sm:w-10 sm:h-10 rounded-full" />
                <span className="text-base sm:text-2xl font-bold font-mono text-primary">
                  {data.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} {CURRENCY}
                </span>
              </div>
              {priceData ? (
                <div className="text-sm text-muted font-mono mt-1">
                  ≈ ${(data.balance * priceData.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="ml-1.5 text-xs">(@ ${priceData.price.toFixed(2)}/ZEC)</span>
                </div>
              ) : (
                <div className="text-sm text-muted mt-1">Loading price...</div>
              )}
            </div>

            <p className="text-sm text-muted leading-relaxed max-w-lg">
              {summary}
            </p>

            {/* Cross-chain summary if present */}
            {crossChain && crossChain.totalSwaps > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs font-mono text-muted border-t border-cipher-border pt-3 w-full">
                <span className="text-secondary">{crossChain.totalSwaps} bridge{crossChain.totalSwaps !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>${crossChain.totalVolumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol</span>
                <span>·</span>
                <span className="text-cipher-green">{crossChain.entryCount} in</span>
                <span>·</span>
                <span className="text-danger">{crossChain.exitCount} out</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
