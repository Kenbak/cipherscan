'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { getApiUrl } from '@/lib/api-config';

export default function DecodeClient() {
  const [rawHex, setRawHex] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDecode = async () => {
    const hex = rawHex.trim();
    if (!hex) {
      setError('Please enter a raw transaction hex.');
      return;
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      setError('Invalid hex string. Only characters 0-9 and a-f are allowed.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/tx/decode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawTx: hex }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to decode transaction.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error. Could not reach the API.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setRawHex('');
    setResult(null);
    setError('');
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link href="/tools" className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors mb-4 inline-block">
          &larr; All Tools
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cipher-cyan/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">Decode Raw Transaction</h1>
            <p className="text-sm text-secondary">Parse a raw transaction hex into human-readable fields</p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="alert alert-info mb-6">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="font-medium">Inspect without broadcasting</p>
          <p className="text-sm text-secondary mt-1">
            This tool decodes a raw transaction hex into readable fields — inputs, outputs, shielded data, and more.
            The transaction is <strong className="text-primary">not broadcast</strong> to the network.
          </p>
        </div>
      </div>

      {/* Input */}
      <Card>
        <CardBody>
          <div className="space-y-4">
            <div>
              <label className="input-label mb-2 block font-mono uppercase tracking-wider text-xs">
                Raw Transaction Hex
              </label>
              <textarea
                value={rawHex}
                onChange={(e) => setRawHex(e.target.value)}
                placeholder="Paste raw transaction hex here (e.g., 0400008085202f89...)"
                className="textarea-field"
                spellCheck={false}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDecode}
                disabled={loading || !rawHex.trim()}
                className="btn btn-primary px-6 py-3 text-sm"
              >
                {loading ? 'Decoding...' : 'Decode Transaction'}
              </button>
              {(rawHex || result || error) && (
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

      {/* Error */}
      {error && (
        <div className="alert alert-error mt-6">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-6 animate-fade-in">
          {/* Success banner */}
          <div className="alert alert-success">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>Transaction decoded successfully ({result.size} bytes)</p>
          </div>

          {/* Summary */}
          <Card>
            <CardBody>
              {/* TXID */}
              {result.transaction.txid && (
                <div className="mb-4 pb-4 border-b border-white/[0.06]">
                  <span className="text-xs font-mono text-muted uppercase tracking-wider">TXID</span>
                  <p className="text-sm font-mono text-cipher-cyan mt-1 break-all">{result.transaction.txid}</p>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-wider">Version</span>
                  <p className="text-sm font-mono text-primary mt-1">{result.transaction.version}</p>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-wider">Locktime</span>
                  <p className="text-sm font-mono text-primary mt-1">{result.transaction.locktime}</p>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-wider">Inputs</span>
                  <p className="text-sm font-mono text-primary mt-1">{result.transaction.vin?.length || 0}</p>
                </div>
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-wider">Outputs</span>
                  <p className="text-sm font-mono text-primary mt-1">{result.transaction.vout?.length || 0}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Transparent Inputs */}
          {result.transaction.vin && result.transaction.vin.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-wider">&gt; TRANSPARENT_INPUTS</h3>
                <div className="space-y-3">
                  {result.transaction.vin.map((vin: any, i: number) => (
                    <div key={i} className="card-dark p-4 rounded-xl">
                      {vin.coinbase ? (
                        <div className="text-sm font-mono">
                          <span className="text-muted">coinbase: </span>
                          <span className="text-amber-400">{vin.coinbase}</span>
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm font-mono">
                          <div>
                            <span className="text-muted">txid: </span>
                            <span className="text-primary break-all">{vin.txid}</span>
                          </div>
                          <div>
                            <span className="text-muted">vout: </span>
                            <span className="text-primary">{vin.vout}</span>
                          </div>
                          {vin.scriptSig?.hex && (
                            <div>
                              <span className="text-muted">scriptSig: </span>
                              <span className="text-primary break-all">
                                {vin.scriptSig.hex.length > 80
                                  ? `${vin.scriptSig.hex.slice(0, 80)}...`
                                  : vin.scriptSig.hex}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Transparent Outputs */}
          {result.transaction.vout && result.transaction.vout.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-wider">&gt; TRANSPARENT_OUTPUTS</h3>
                <div className="space-y-3">
                  {result.transaction.vout.map((vout: any, i: number) => (
                    <div key={i} className="card-dark p-4 rounded-xl flex justify-between items-start gap-4">
                      <div className="space-y-1 text-sm font-mono min-w-0">
                        <div>
                          <span className="text-muted">n: </span>
                          <span className="text-primary">{vout.n}</span>
                        </div>
                        {vout.scriptPubKey?.addresses?.[0] && (
                          <div>
                            <span className="text-muted">address: </span>
                            <Link
                              href={`/address/${vout.scriptPubKey.addresses[0]}`}
                              className="text-cipher-cyan hover:underline break-all"
                            >
                              {vout.scriptPubKey.addresses[0]}
                            </Link>
                          </div>
                        )}
                        {vout.scriptPubKey?.type && (
                          <div>
                            <span className="text-muted">type: </span>
                            <span className="text-primary">{vout.scriptPubKey.type}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-mono text-cipher-green whitespace-nowrap">
                        {vout.value} ZEC
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Shielded Data */}
          {(result.transaction.vShieldedSpend?.length > 0 ||
            result.transaction.vShieldedOutput?.length > 0 ||
            result.transaction.orchard?.actions?.length > 0) && (
            <Card>
              <CardBody>
                <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-wider">&gt; SHIELDED_DATA</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {result.transaction.vShieldedSpend?.length > 0 && (
                    <div className="card-dark p-4 rounded-xl border border-purple-500/20">
                      <span className="text-xs font-mono text-purple-400 uppercase tracking-wider">Sapling Spends</span>
                      <p className="text-2xl font-mono text-primary mt-2">{result.transaction.vShieldedSpend.length}</p>
                    </div>
                  )}
                  {result.transaction.vShieldedOutput?.length > 0 && (
                    <div className="card-dark p-4 rounded-xl border border-purple-500/20">
                      <span className="text-xs font-mono text-purple-400 uppercase tracking-wider">Sapling Outputs</span>
                      <p className="text-2xl font-mono text-primary mt-2">{result.transaction.vShieldedOutput.length}</p>
                    </div>
                  )}
                  {result.transaction.orchard?.actions?.length > 0 && (
                    <div className="card-dark p-4 rounded-xl border border-purple-500/20">
                      <span className="text-xs font-mono text-purple-400 uppercase tracking-wider">Orchard Actions</span>
                      <p className="text-2xl font-mono text-primary mt-2">{result.transaction.orchard.actions.length}</p>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Raw JSON */}
          <Card variant="dark">
            <CardBody>
              <details className="group">
                <summary className="text-xs font-mono text-muted cursor-pointer hover:text-primary transition-colors select-none">
                  &gt; VIEW_RAW_JSON
                </summary>
                <pre className="mt-4 text-xs font-mono text-primary overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
                  {JSON.stringify(result.transaction, null, 2)}
                </pre>
              </details>
            </CardBody>
          </Card>
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
              <h3 className="font-semibold text-primary mb-2">What is a raw transaction?</h3>
              <p className="text-sm text-secondary leading-relaxed mb-3">
                A raw transaction is a hex-encoded representation of a Zcash transaction containing all
                inputs, outputs, and signatures. You can obtain one from a wallet, the{' '}
                <code className="text-xs font-mono text-cipher-cyan">getrawtransaction</code>{' '}
                RPC call, or by constructing one programmatically.
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <Link href="/tools/broadcast" className="text-cipher-cyan hover:underline font-mono">
                  &gt; Broadcast a transaction
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
