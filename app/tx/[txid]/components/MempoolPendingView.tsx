'use client';

import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/CopyButton';
interface MempoolPendingViewProps {
  txid: string;
  mempoolTx: any;
  mempoolConfirming: boolean;
  mempoolElapsed: number;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function MempoolPendingView({
  txid,
  mempoolTx,
  mempoolConfirming,
  mempoolElapsed,
  copiedText,
  onCopy,
}: MempoolPendingViewProps) {
  const txTypeLabel =
    mempoolTx.type === 'shielded' ? 'SHIELDED' : mempoolTx.type === 'mixed' ? 'MIXED' : 'TRANSPARENT';
  const txTypeColor =
    mempoolTx.type === 'shielded' ? 'purple' : mempoolTx.type === 'mixed' ? 'yellow' : 'cyan';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <div className="mb-6">
        <span className="text-xs font-mono text-muted tracking-wider">&gt; TX_DETAILS</span>
        <div className="flex items-center gap-3 mt-2">
          <StatusBadge status="pending" />
          <Badge color={txTypeColor as any}>{txTypeLabel}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <p className="text-sm sm:text-base font-mono text-primary break-all">{txid}</p>
          <CopyButton text={txid} label="txid" copiedText={copiedText} onCopy={onCopy} />
        </div>
      </div>

      <Card>
        <CardBody>
          <div className="text-center py-8">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div
                className={`absolute inset-0 rounded-full border-2 animate-ping ${mempoolConfirming ? 'border-cipher-green/30' : 'border-cipher-yellow/30'}`}
                style={{ animationDuration: '2s' }}
              />
              <div
                className={`absolute inset-1 rounded-full border-2 animate-ping ${mempoolConfirming ? 'border-cipher-green/20' : 'border-cipher-yellow/20'}`}
                style={{ animationDuration: '2.5s', animationDelay: '0.3s' }}
              />
              <div
                className={`absolute inset-0 rounded-full border-2 flex items-center justify-center ${mempoolConfirming ? 'border-cipher-green/40' : 'border-cipher-yellow/40'}`}
              >
                {mempoolConfirming ? (
                  <svg
                    className="w-8 h-8 text-cipher-green"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-8 h-8 text-cipher-yellow"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>
            </div>

            <h2 className="text-lg font-semibold text-primary mb-2">
              {mempoolConfirming ? 'Confirming...' : 'Pending in Mempool'}
            </h2>
            <p className="text-sm text-secondary mb-1 max-w-md mx-auto">
              {mempoolConfirming
                ? 'This transaction has been included in a block and is being indexed.'
                : 'This transaction is waiting to be included in a block.'}
            </p>
            <p className="text-xs font-mono text-muted mb-6">
              This page will auto-refresh when the transaction is ready.
            </p>

            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-8 ${
                mempoolConfirming
                  ? 'bg-cipher-green/5 border border-cipher-green/20'
                  : 'bg-cipher-yellow/5 border border-cipher-yellow/20'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full animate-pulse ${mempoolConfirming ? 'bg-cipher-green' : 'bg-cipher-yellow'}`}
              />
              <span
                className={`text-xs font-mono ${mempoolConfirming ? 'text-cipher-green' : 'text-cipher-yellow'}`}
              >
                {mempoolConfirming ? 'Indexing...' : `Waiting ${formatElapsed(mempoolElapsed)}`}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <span className="text-xs font-mono text-muted tracking-wider">&gt; MEMPOOL_DATA</span>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-cipher-border">
              <span className="text-xs font-mono text-muted">Type</span>
              <Badge color={txTypeColor as any}>{txTypeLabel}</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-cipher-border">
              <span className="text-xs font-mono text-muted">Size</span>
              <span className="text-sm font-mono text-primary">
                {(mempoolTx.size || 0).toLocaleString()} bytes
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-cipher-border">
              <span className="text-xs font-mono text-muted">Version</span>
              <span className="text-sm font-mono text-primary">{mempoolTx.version}</span>
            </div>
            {mempoolTx.vinCount > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-cipher-border">
                <span className="text-xs font-mono text-muted">Transparent Inputs</span>
                <span className="text-sm font-mono text-primary">{mempoolTx.vinCount}</span>
              </div>
            )}
            {mempoolTx.voutCount > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-cipher-border">
                <span className="text-xs font-mono text-muted">Transparent Outputs</span>
                <span className="text-sm font-mono text-primary">{mempoolTx.voutCount}</span>
              </div>
            )}
            {mempoolTx.saplingSpendCount > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-cipher-border">
                <span className="text-xs font-mono text-muted">Sapling Spends</span>
                <span className="text-sm font-mono text-primary">{mempoolTx.saplingSpendCount}</span>
              </div>
            )}
            {mempoolTx.saplingOutputCount > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-cipher-border">
                <span className="text-xs font-mono text-muted">Sapling Outputs</span>
                <span className="text-sm font-mono text-primary">{mempoolTx.saplingOutputCount}</span>
              </div>
            )}
            {mempoolTx.orchardActions > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-cipher-border">
                <span className="text-xs font-mono text-muted">Orchard Actions</span>
                <span className="text-sm font-mono text-primary">{mempoolTx.orchardActions}</span>
              </div>
            )}
            {mempoolTx.outputs && mempoolTx.outputs.length > 0 && mempoolTx.totalOutput > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-cipher-border">
                <span className="text-xs font-mono text-muted">Transparent Value</span>
                <span className="text-sm font-mono text-primary">
                  {mempoolTx.totalOutput.toFixed(8)} {CURRENCY}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-mono text-muted">Confirmations</span>
              <span className="text-sm font-mono text-cipher-yellow">0 (unconfirmed)</span>
            </div>
          </div>

          {mempoolTx.outputs && mempoolTx.outputs.filter((o: any) => o.address).length > 0 && (
            <div className="mt-6 pt-4 border-t border-cipher-border">
              <span className="text-xs font-mono text-muted tracking-wider">&gt; OUTPUTS</span>
              <div className="mt-3 space-y-2">
                {mempoolTx.outputs
                  .filter((o: any) => o.address)
                  .map((out: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-glass-2"
                    >
                      <Link
                        href={`/address/${out.address}`}
                        className="text-xs font-mono text-cipher-cyan hover:underline truncate max-w-[60%]"
                      >
                        {out.address}
                      </Link>
                      <span className="text-xs font-mono text-primary">
                        {out.value.toFixed(8)} {CURRENCY}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 text-center">
        <Link
          href="/mempool"
          className="text-cipher-cyan hover:text-cipher-yellow transition-colors font-mono text-sm"
        >
          View Mempool &rarr;
        </Link>
      </div>
    </div>
  );
}
