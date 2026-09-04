'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from './CopyButton';
import { Icons } from './icons';

interface EmptyAddressViewProps {
  address: string;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function EmptyAddressView({ address, copiedText, onCopy }: EmptyAddressViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
      <div className="mb-8 animate-fade-in-up">
        <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_LOOKUP</span>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary mt-1 mb-3">Address Details</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="muted">TRANSPARENT</Badge>
          <code className="text-xs text-secondary break-all font-mono">{address}</code>
          <CopyButton text={address} label="address" copiedText={copiedText} onCopy={onCopy} />
        </div>
      </div>

      <Card className="animate-fade-in-up stagger-2" role="status" ariaLive="polite">
        <CardBody>
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-cipher-surface border border-glass-4 flex items-center justify-center" aria-hidden="true">
              <svg className="w-7 h-7 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-primary mb-2">No Transactions Yet</h2>
            <p className="text-sm text-secondary max-w-md mx-auto mb-6">
              Valid transparent address with no transaction history.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-cipher-surface rounded-lg text-xs text-muted font-mono border border-glass-4">
              <span className="w-1.5 h-1.5 rounded-full bg-cipher-cyan" />
              Balance: 0 ZEC
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

interface IndexingIssueViewProps {
  address: string;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function IndexingIssueView({ address, copiedText, onCopy }: IndexingIssueViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
      <div className="mb-8 animate-fade-in-up">
        <span className="text-xs font-mono text-muted tracking-wider">&gt; ADDRESS_LOOKUP</span>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-primary mt-1 mb-3">Address Details</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs text-secondary break-all font-mono">{address}</code>
          <CopyButton text={address} label="address" copiedText={copiedText} onCopy={onCopy} />
        </div>
      </div>

      <Card className="animate-fade-in-up stagger-2" role="alert" ariaLive="assertive">
        <CardBody>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-mono text-muted tracking-wider">&gt; STATUS</span>
            <Badge color="orange">LIMITED DATA</Badge>
          </div>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cipher-orange/10 border border-cipher-orange/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg className="w-5 h-5 text-cipher-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary mb-1">Address valid, but history unavailable</h2>
              <p className="text-sm text-secondary leading-relaxed">
                The explorer node doesn&apos;t have address indexing enabled. Transaction data can only be retrieved by specific transaction ID.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-cipher-surface/50 border border-glass-4 mb-4">
            <span className="text-[10px] text-muted font-mono uppercase tracking-wider block mb-3">&gt; TECHNICAL_DETAILS</span>
            <ul className="text-xs text-secondary space-y-2 font-mono">
              <li className="flex items-start gap-2">
                <span className="text-muted mt-0.5">$</span>
                <span>RPC methods <code className="text-cipher-cyan">getaddressbalance</code> / <code className="text-cipher-cyan">getaddresstxids</code> unavailable</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted mt-0.5">$</span>
                <span>Requires <code className="text-cipher-cyan">addressindex=1</code> in node config</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted mt-0.5">$</span>
                <span>Zebrad may not support these methods</span>
              </li>
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-cipher-cyan/5 border border-cipher-cyan/10">
            <p className="text-xs text-cipher-cyan font-mono">
              &gt; TIP: Search by transaction hash (txid) to view individual transactions
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
