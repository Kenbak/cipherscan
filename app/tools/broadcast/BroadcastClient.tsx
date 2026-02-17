'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { getApiUrl } from '@/lib/api-config';

export default function BroadcastClient() {
  const [rawHex, setRawHex] = useState('');
  const [result, setResult] = useState<{ success: boolean; txid?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link href="/tools" className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors mb-4 inline-block">
          &larr; All Tools
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cipher-green/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">Broadcast Transaction</h1>
            <p className="text-sm text-secondary">Submit a signed raw transaction to the Zcash network</p>
          </div>
        </div>
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

            <div className="flex gap-3">
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
        <div className="mt-6 animate-fade-in">
          {result.success ? (
            <div className="alert alert-success">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Transaction broadcast successfully</p>
                <p className="text-sm mt-2">
                  <span className="text-muted">TXID: </span>
                  <Link href={`/tx/${result.txid}`} className="text-cipher-cyan hover:underline font-mono break-all">
                    {result.txid}
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="alert alert-error">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>{result.error}</p>
            </div>
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
                Use a Zcash wallet or library to construct and sign a transaction offline.
                The resulting hex-encoded transaction can be pasted here to broadcast to the network.
              </p>
              <p className="text-xs text-muted leading-relaxed">
                Want to inspect a transaction before broadcasting? Use the{' '}
                <Link href="/tools/decode" className="text-cipher-cyan hover:underline">Decode Transaction</Link>{' '}
                tool to verify its contents first.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
