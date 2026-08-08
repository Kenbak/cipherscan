'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from './CopyButton';
import { Icons } from './icons';
import { UnifiedAddressViewer } from './UnifiedAddressViewer';
import type { UnifiedAddressComponents, UnifiedAddressTab } from './types';

interface ShieldedAddressViewProps {
  address: string;
  isUnified: boolean;
  uaComponents: UnifiedAddressComponents | null;
  uaLoading: boolean;
  selectedAddressTab: UnifiedAddressTab;
  onSelectTab: (tab: UnifiedAddressTab) => void;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function ShieldedAddressView({
  address,
  isUnified,
  uaComponents,
  uaLoading,
  selectedAddressTab,
  onSelectTab,
  copiedText,
  onCopy,
}: ShieldedAddressViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
      {/* Cypherpunk Header */}
      <div className="mb-8 animate-fade-in-up">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_SHIELDED</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary">
            Shielded Address
          </h2>
          <div className="flex items-center gap-2">
            <Badge color="purple" icon={<Icons.Shield />}>
              {isUnified ? 'UNIFIED' : 'SHIELDED'}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-secondary">
          Zero-knowledge encrypted address — balance and history are private
        </p>
      </div>

      {/* Address Component Viewer */}
      {isUnified && (
        <UnifiedAddressViewer
          address={address}
          uaComponents={uaComponents}
          uaLoading={uaLoading}
          selectedAddressTab={selectedAddressTab}
          onSelectTab={onSelectTab}
          copiedText={copiedText}
          onCopy={onCopy}
        />
      )}

      {/* Non-unified shielded addresses */}
      {!isUnified && (
        <div className="mb-6 animate-fade-in-up stagger-2">
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS</span>
              </div>
              <div className="flex items-start gap-2 p-4 rounded-lg bg-cipher-surface/50 border border-glass-4">
                <code className="text-xs text-secondary break-all font-mono flex-1">{address}</code>
                <CopyButton text={address} label="address" copiedText={copiedText} onCopy={onCopy} />
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Privacy Status Card */}
      <Card className="mb-6 overflow-hidden relative animate-fade-in-up stagger-3">
        {/* Atmospheric overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-cipher-purple/[0.06] via-transparent to-cipher-cyan/[0.02] pointer-events-none" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgb(var(--color-purple-rgb)_/_0.015)_10px,rgb(var(--color-purple-rgb)_/_0.015)_20px)] pointer-events-none" />
        {/* Scan line */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-cipher-purple/30 to-transparent animate-scan" />
        </div>

        <CardBody className="relative">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-mono text-muted tracking-wider">&gt; PRIVACY_STATUS</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-1.5 h-1.5 rounded-full bg-cipher-purple animate-pulse" />
              <span className="text-[10px] font-mono text-cipher-purple uppercase tracking-wider">Protected</span>
            </div>
          </div>

          <div className="flex items-start gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-cipher-purple/10 border border-cipher-purple/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-cipher-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary mb-1">
                Privacy by Design
              </h2>
              <p className="text-sm text-secondary leading-relaxed">
                This address uses <span className="text-cipher-purple font-medium">zero-knowledge proofs</span> to encrypt all transaction data.
                Balance and history are only visible to holders of the viewing key.
              </p>
            </div>
          </div>

          {/* Redacted data visualization */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {[
              { label: 'BALANCE', redacted: '████████ ZEC' },
              { label: 'TX_COUNT', redacted: '████' },
              { label: 'LAST_ACTIVE', redacted: '████-██-██' },
              { label: 'MEMO_FIELD', redacted: '██████████████' },
            ].map((field) => (
              <div key={field.label} className="flex items-center gap-3 p-3 rounded-lg bg-cipher-purple/[0.04] border border-cipher-purple/[0.08]">
                <svg className="w-3.5 h-3.5 text-cipher-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-muted font-mono uppercase tracking-wider block">{field.label}</span>
                  <span className="text-xs text-cipher-purple/40 font-mono tracking-tight">{field.redacted}</span>
                </div>
                <span className="text-[9px] text-cipher-purple/60 font-mono uppercase">encrypted</span>
              </div>
            ))}
          </div>

          {/* Privacy feature badges */}
          <div className="flex flex-wrap gap-2">
            {['Zero-Knowledge Proofs', 'Encrypted Amounts', 'Hidden Parties', 'Private Memos'].map((feature) => (
              <span key={feature} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cipher-purple/[0.06] border border-cipher-purple/[0.08] text-[11px] text-cipher-purple-glow font-mono">
                <svg className="w-3 h-3 text-cipher-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Decrypt Tools — compact inline */}
      <div className="p-4 rounded-xl bg-cipher-surface/50 border border-glass-4 animate-fade-in-up stagger-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <svg className="w-4 h-4 text-cipher-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="text-sm text-secondary">
              <span className="text-primary font-medium">Your address?</span> Decrypt with your viewing key.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/decrypt"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-cipher-cyan/30 text-cipher-cyan hover:bg-cipher-cyan/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Decrypt TX
            </Link>
            <Link
              href="/decrypt?tab=scan"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-cipher-border text-secondary hover:text-cipher-cyan hover:border-cipher-cyan/30 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Scan History
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
