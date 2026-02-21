'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/Tooltip';
import { getApiUrl } from '@/lib/api-config';

const Icons = {
  Hash: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Database: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Bolt: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
};

// Known error patterns from Zebra with human-readable explanations
function getErrorHint(error: string): string | null {
  const lower = error.toLowerCase();
  if (lower.includes('already in state') || lower.includes('already in block'))
    return 'This transaction has already been mined and included in the blockchain.';
  if (lower.includes('expired'))
    return 'The transaction expiry height has passed. Create a new transaction with a later expiry.';
  if (lower.includes('bad-txns'))
    return 'The transaction is malformed or has an invalid signature. Verify it was signed correctly.';
  if (lower.includes('insufficient') || lower.includes('missing inputs'))
    return 'One or more inputs referenced by this transaction have already been spent.';
  if (lower.includes('mempool'))
    return 'A conflicting transaction is already in the mempool. Wait for it to confirm or expire.';
  return null;
}

function InfoRow({
  icon: Icon,
  label,
  value,
  tooltip,
  valueClass = 'text-primary',
}: {
  icon: React.ComponentType;
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b block-info-border last:border-0 gap-2 sm:gap-0">
      <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-secondary">
        <span className="mr-2">
          <Icon />
        </span>
        <span className="text-xs sm:text-sm">{label}</span>
        {tooltip && (
          <span className="ml-2">
            <Tooltip content={tooltip} />
          </span>
        )}
      </div>
      <div className={`flex-1 font-mono text-xs sm:text-sm ${valueClass} break-all`}>{value}</div>
    </div>
  );
}

export default function BroadcastClient() {
  const [rawHex, setRawHex] = useState('');
  const [result, setResult] = useState<{ success: boolean; txid?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [txidCopied, setTxidCopied] = useState(false);

  const handleBroadcast = async () => {
    const hex = rawHex.trim();
    if (!hex) return;
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      setResult({ success: false, error: 'Invalid hex string. Only characters 0-9 and a-f are allowed.' });
      return;
    }

    if (!confirm('Are you sure you want to broadcast this transaction? This action is irreversible.')) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/tx/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawTx: hex }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: 'Network error. Could not reach the API.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setRawHex('');
    setResult(null);
  };

  const copyTxid = (txid: string) => {
    navigator.clipboard.writeText(txid);
    setTxidCopied(true);
    setTimeout(() => setTxidCopied(false), 2000);
  };

  const txSize = rawHex.trim().length / 2;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link href="/tools" className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors mb-4 inline-block">
          &larr; All Tools
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-primary">Broadcast Transaction</h1>
        <p className="text-sm text-secondary mt-1">Submit a signed raw transaction to the Zcash network</p>
      </div>

      {/* Warning */}
      <div className="alert alert-warning mb-6">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div>
          <p className="font-medium">Pre-signed transactions only</p>
          <p className="text-sm text-secondary mt-1">
            The transaction must be fully constructed and signed before pasting here.
            No private keys are sent to the server — this endpoint only relays
            the raw hex to a Zebra node.
          </p>
        </div>
      </div>

      {/* Input */}
      <Card>
        <CardBody>
          <div className="space-y-4">
            <div>
              <label className="input-label mb-2 block font-mono uppercase tracking-wider text-xs">
                Signed Transaction Hex
              </label>
              <textarea
                value={rawHex}
                onChange={(e) => setRawHex(e.target.value)}
                placeholder="Paste signed raw transaction hex here..."
                className="textarea-field"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleBroadcast}
                disabled={loading || !rawHex.trim()}
                className="btn btn-primary px-6 py-3 text-sm"
              >
                {loading ? 'Broadcasting...' : 'Broadcast Transaction'}
              </button>
              {(rawHex || result) && (
                <button
                  onClick={handleClear}
                  className="btn btn-secondary px-4 py-3 text-sm"
                >
                  Clear
                </button>
              )}

            </div>
          </div>
        </CardBody>
      </Card>

      {/* Result */}
      {result && (
        <div className="mt-6 space-y-6 animate-fade-in">
          {result.success ? (
            <>
              {/* Success banner */}
              <div className="alert alert-success">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Transaction broadcast successfully</p>
              </div>

              {/* Result card */}
              <Card>
                <CardBody className="space-y-0">
                  <InfoRow
                    icon={Icons.Check}
                    label="Status"
                    value={<Badge color="green" icon={<Icons.Bolt />}>BROADCAST</Badge>}
                    tooltip="Transaction has been submitted to the Zcash network"
                  />

                  {/* TXID row with hash display */}
                  <div className="py-3 border-b block-info-border">
                    <div className="flex items-center mb-2 text-secondary">
                      <span className="mr-2"><Icons.Hash /></span>
                      <span className="text-xs sm:text-sm">Transaction ID</span>
                      <span className="ml-2">
                        <Tooltip content="Unique identifier for this transaction on the blockchain" />
                      </span>
                    </div>
                    <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border w-fit flex items-center gap-2">
                      <code className="text-xs text-cipher-cyan break-all block">{result.txid}</code>
                      <button
                        onClick={() => copyTxid(result.txid!)}
                        className={`p-1 rounded transition-colors flex-shrink-0 ${txidCopied ? 'text-cipher-green' : 'text-muted hover:text-cipher-cyan'}`}
                        title="Copy TXID"
                      >
                        {txidCopied ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {txSize > 0 && (
                    <InfoRow
                      icon={Icons.Database}
                      label="Size"
                      value={`${txSize.toLocaleString()} bytes (${(txSize / 1024).toFixed(2)} KB)`}
                      tooltip="Raw transaction size in bytes"
                    />
                  )}
                </CardBody>
              </Card>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/mempool"
                  className="btn btn-primary px-6 text-sm inline-flex items-center gap-2 h-11"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  View in Mempool
                </Link>
                <Link
                  href={`/tx/${result.txid}`}
                  className="btn btn-secondary px-6 text-sm inline-flex items-center gap-2 h-11"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View Transaction
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Error banner */}
              <div className="alert alert-error">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Broadcast failed</p>
              </div>

              {/* Error detail card */}
              <Card>
                <CardBody className="space-y-0">
                  <InfoRow
                    icon={Icons.Bolt}
                    label="Status"
                    value={<Badge color="orange">REJECTED</Badge>}
                    tooltip="The transaction was rejected by the Zebra node"
                  />

                  <div className="py-3 border-b block-info-border last:border-0">
                    <div className="flex items-center mb-2 text-secondary">
                      <span className="mr-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      <span className="text-xs sm:text-sm">Error</span>
                    </div>
                    <div className="block-hash-bg px-3 py-2 rounded border border-cipher-border">
                      <code className="text-xs text-red-400 break-all block">{result.error}</code>
                    </div>
                    {(() => {
                      const hint = getErrorHint(result.error || '');
                      return hint ? (
                        <p className="text-xs text-secondary mt-2 leading-relaxed">{hint}</p>
                      ) : null;
                    })()}
                  </div>
                </CardBody>
              </Card>

              {/* Suggestion */}
              <div className="tx-summary-box border border-cipher-border rounded-lg p-3 md:p-4">
                <div className="flex items-start gap-2 md:gap-3">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-cipher-cyan flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-secondary text-xs md:text-sm leading-relaxed">
                    Try using the{' '}
                    <Link href="/tools/decode" className="text-cipher-cyan hover:underline">Decode tool</Link>
                    {' '}to inspect the transaction before broadcasting. This can help identify issues with the transaction format.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Help */}
      <Card variant="glass" className="mt-8">
        <CardBody>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-primary mb-2">How to create a signed transaction</h3>
              <p className="text-sm text-secondary leading-relaxed mb-3">
                Use a Zcash library (<code className="text-xs font-mono text-cipher-cyan">zcash_primitives</code>,{' '}
                <code className="text-xs font-mono text-cipher-cyan">librustzcash</code>) or{' '}
                <code className="text-xs font-mono text-cipher-cyan">zcash-cli</code> to construct and sign
                a transaction offline. The resulting hex can be pasted here.
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <Link href="/tools/decode" className="text-cipher-cyan hover:underline font-mono">
                  &gt; Decode a transaction
                </Link>
                <Link href="/docs" className="text-cipher-cyan hover:underline font-mono">
                  &gt; API documentation
                </Link>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
