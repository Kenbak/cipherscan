'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from './CopyButton';
import type { UnifiedAddressComponents, UnifiedAddressTab } from './types';

interface UnifiedAddressViewerProps {
  address: string;
  uaComponents: UnifiedAddressComponents | null;
  uaLoading: boolean;
  selectedAddressTab: UnifiedAddressTab;
  onSelectTab: (tab: UnifiedAddressTab) => void;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function UnifiedAddressViewer({
  address,
  uaComponents,
  uaLoading,
  selectedAddressTab,
  onSelectTab,
  copiedText,
  onCopy,
}: UnifiedAddressViewerProps) {
  return (
    <div className="mb-6 animate-fade-in-up stagger-2">
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_COMPONENTS</span>
          </div>

          {uaLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <div className="animate-spin rounded-full h-3 w-3 border border-cipher-cyan border-t-transparent" />
              <span className="font-mono">Decoding unified address...</span>
            </div>
          ) : uaComponents ? (
            <>
              {/* Tabs */}
              <div className="inline-flex">
                <div className="filter-group inline-flex mb-4">
                  <button
                    onClick={() => onSelectTab('unified')}
                    className={`filter-btn ${selectedAddressTab === 'unified' ? 'filter-btn-active' : ''}`}
                  >
                    Unified
                  </button>
                  <button
                    onClick={() => uaComponents.has_transparent && onSelectTab('transparent')}
                    disabled={!uaComponents.has_transparent}
                    className={`filter-btn ${selectedAddressTab === 'transparent' ? 'filter-btn-active' : ''} ${!uaComponents.has_transparent ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    Transparent
                  </button>
                  <button
                    onClick={() => uaComponents.has_sapling && onSelectTab('sapling')}
                    disabled={!uaComponents.has_sapling}
                    className={`filter-btn ${selectedAddressTab === 'sapling' ? 'filter-btn-active' : ''} ${!uaComponents.has_sapling ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    Sapling
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-4 rounded-lg bg-cipher-surface/50 border border-glass-4">
                {selectedAddressTab === 'unified' && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge color="purple">UNIFIED</Badge>
                      <span className="text-[10px] text-muted font-mono">contains all receivers</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <code className="text-xs text-secondary break-all font-mono flex-1 leading-relaxed">{address}</code>
                      <CopyButton text={address} label="unified" copiedText={copiedText} onCopy={onCopy} />
                    </div>
                  </div>
                )}

                {selectedAddressTab === 'transparent' && uaComponents.has_transparent && uaComponents.transparent_address && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge color="cyan">TRANSPARENT</Badge>
                      <span className="text-[10px] text-muted font-mono">public on-chain</span>
                    </div>
                    <div className="flex items-start gap-2 mb-4">
                      <code className="text-xs text-cipher-cyan break-all font-mono flex-1 leading-relaxed">{uaComponents.transparent_address}</code>
                      <CopyButton text={uaComponents.transparent_address} label="transparent" copiedText={copiedText} onCopy={onCopy} />
                    </div>
                    <Link
                      href={`/address/${uaComponents.transparent_address}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cipher-cyan/10 text-cipher-cyan text-sm font-medium hover:bg-cipher-cyan/20 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View Transactions
                    </Link>
                  </div>
                )}

                {selectedAddressTab === 'sapling' && uaComponents.has_sapling && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge color="purple">SAPLING</Badge>
                      <span className="text-[10px] text-muted font-mono">shielded receiver</span>
                    </div>
                    {uaComponents.sapling_address ? (
                      <div className="flex items-start gap-2">
                        <code className="text-xs text-cipher-purple break-all font-mono flex-1 leading-relaxed">{uaComponents.sapling_address}</code>
                        <CopyButton text={uaComponents.sapling_address} label="sapling" copiedText={copiedText} onCopy={onCopy} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted font-mono">Receiver present — address encoding unavailable</p>
                    )}
                  </div>
                )}

              </div>
            </>
          ) : (
            <div className="p-4 rounded-lg bg-cipher-surface/50 border border-glass-4">
              <div className="flex items-start gap-2">
                <code className="text-xs text-secondary break-all font-mono flex-1">{address}</code>
                <CopyButton text={address} label="address" copiedText={copiedText} onCopy={onCopy} />
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
