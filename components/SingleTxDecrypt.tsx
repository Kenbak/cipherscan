'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { isMainnet } from '@/lib/config';

const VIEWING_KEY_PREFIX = isMainnet ? 'uview' : 'uviewtest';

// Icons
const Icons = {
  Lock: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Terminal: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Check: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

export function SingleTxDecrypt({ prefillTxid }: { prefillTxid?: string | null }) {
  const [txid, setTxid] = useState('');
  const [viewingKey, setViewingKey] = useState('');
  const [memo, setMemo] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  // Prefill TXID if provided
  useEffect(() => {
    if (prefillTxid) {
      setTxid(prefillTxid);
    }
  }, [prefillTxid]);

  const decodeMemo = async () => {
    if (!txid || !viewingKey) {
      setError('Please enter both Transaction ID and Viewing Key');
      return;
    }

    // Sanitize inputs
    const sanitizedTxid = txid.trim().replace(/[^a-fA-F0-9]/g, '');
    const sanitizedViewingKey = viewingKey.trim();

    // Validate txid (should be 64 hex characters)
    if (!/^[a-fA-F0-9]{64}$/.test(sanitizedTxid)) {
      setError('Invalid transaction ID format. Must be 64 hexadecimal characters.');
      return;
    }

    // Validate viewing key format
    if (!sanitizedViewingKey.startsWith('uviewtest') && !sanitizedViewingKey.startsWith('uview')) {
      setError('Invalid viewing key format. Must start with "uviewtest" or "uview".');
      return;
    }

    setLoading(true);
    setError(null);
    setMemo(null);
    setLoadingStep(0);

    // Animate loading steps
    const steps = [0, 1, 2, 3, 4];
    const stepInterval = setInterval(() => {
      setLoadingStep(prev => {
        if (prev >= steps.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 250);

    // Minimum loading time for animation visibility
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 1800));

    try {
      const { testWasm, detectKeyType, decryptMemoFromTxid } = await import('@/lib/wasm-loader');
      const testResult = await testWasm();
      const keyType = await detectKeyType(sanitizedViewingKey);
      const result = await decryptMemoFromTxid(sanitizedTxid, sanitizedViewingKey);

      // Wait for minimum time
      await minLoadTime;
      clearInterval(stepInterval);
      setMemo(result.memo);
      setAmount(result.amount);
    } catch (err: any) {
      await minLoadTime;
      clearInterval(stepInterval);
      setError(err.message || err.toString() || 'Failed to decode memo');
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  };

  const reset = () => {
    setMemo(null);
    setAmount(0);
    setError(null);
    setTxid('');
    setViewingKey('');
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
        {/* LEFT: Input Form */}
        <Card className="h-fit lg:h-auto">
          <CardBody>
            <SectionHeader label="DECRYPT_SINGLE_MESSAGE" className="mb-2" />
            <p className="text-xs sm:text-sm text-muted font-mono mb-4 sm:mb-6">Enter TX ID and viewing key</p>
            <div className="space-y-4 sm:space-y-6">
              {/* Transaction ID */}
              <div>
                <label className="block text-xs sm:text-sm font-bold text-secondary mb-2 sm:mb-3 uppercase tracking-wider">
                  Transaction ID
                </label>
                <input
                  type="text"
                  placeholder="Enter tx ID (64 hex chars)"
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  disabled={loading}
                  className="input-field disabled:opacity-50"
                />
              </div>

              {/* Viewing Key */}
              <div>
                <label className="block text-xs sm:text-sm font-bold text-secondary mb-2 sm:mb-3 uppercase tracking-wider">
                  Unified Full Viewing Key
                </label>
                <input
                  type="password"
                  placeholder={`${VIEWING_KEY_PREFIX}...`}
                  value={viewingKey}
                  onChange={(e) => setViewingKey(e.target.value)}
                  disabled={loading}
                  className="input-field disabled:opacity-50"
                />
                <p className="text-[10px] sm:text-xs text-muted mt-2 font-mono">
                  Starts with <code className="text-cipher-cyan">{VIEWING_KEY_PREFIX}</code> ({isMainnet ? 'mainnet' : 'testnet'})
                </p>
              </div>

              {/* Decode Button */}
              {!memo && !error && (
                <Button
                  onClick={decodeMemo}
                  disabled={!txid || !viewingKey}
                  loading={loading}
                  icon={!loading ? <Icons.Lock /> : undefined}
                  variant="secondary"
                  fullWidth
                >
                  {loading ? 'Decrypting…' : 'Decrypt Memo'}
                </Button>
              )}

              {/* Decrypt Another Button */}
              {(memo || error) && (
                <Button onClick={reset} variant="secondary" icon={<Icons.Refresh />} fullWidth>
                  Decrypt Another
                </Button>
              )}
            </div>
          </CardBody>
        </Card>

        {/* RIGHT: Terminal Output */}
        <div className="flex flex-col">
          {!loading && !memo && !error && (
            <Card className="flex items-center justify-center lg:min-h-full">
              <EmptyState
                icon={<Icons.Terminal className="w-8 h-8 mx-auto text-muted" />}
                title="Enter a transaction ID and viewing key to decrypt the memo…"
              />
            </Card>
          )}

          {loading && (
            <div className="border border-cipher-cyan-bright/40 rounded-2xl overflow-hidden shadow-lg flex flex-col lg:h-full terminal-container">
              <div className="terminal-header border-b border-cipher-cyan-bright/30 px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
                <Icons.Terminal className="w-4 h-4 sm:w-5 sm:h-5 text-cipher-cyan-bright" />
                <span className="font-mono text-xs sm:text-sm text-cipher-cyan-bright truncate">DECRYPTING.log</span>
                <div className="ml-auto flex gap-1.5 sm:gap-2 flex-shrink-0">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cipher-yellow-bright"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cipher-green-bright"></div>
                </div>
              </div>

              <div className="terminal-body p-3 sm:p-4 md:p-6 font-mono flex-1">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-cipher-cyan-bright">$</span>
                    <span className="text-gray-400 break-all">./decrypt --wasm --zero-knowledge</span>
                  </div>
                  <div className="pl-4 sm:pl-6 space-y-1.5 sm:space-y-2 text-cipher-green-bright mt-3 sm:mt-4 text-[10px] sm:text-xs">
                    {loadingStep >= 0 && <p>[✓] Initializing WASM cryptographic engine...</p>}
                    {loadingStep >= 1 && <p>[✓] Parsing unified viewing key...</p>}
                    {loadingStep >= 2 && <p>[✓] Deriving zero-knowledge proof keys...</p>}
                    {loadingStep >= 3 && <p>[✓] Fetching shielded transaction data...</p>}
                    {loadingStep >= 4 && (
                      <p className="flex items-center gap-2">
                        [~] Decrypting memo with ChaCha20Poly1305
                        <span className="inline-flex gap-1">
                          <span className="animate-pulse">.</span>
                          <span className="animate-pulse delay-100">.</span>
                          <span className="animate-pulse delay-200">.</span>
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-cipher-cyan-bright mt-3 sm:mt-4">
                    <span className="animate-pulse">▊</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <Icons.X className="w-5 h-5" />
              <div>
                <p className="font-medium">Decryption Failed</p>
                <p className="text-xs sm:text-sm font-mono break-all leading-relaxed mt-1">{error}</p>
              </div>
            </div>
          )}

          {memo && (
            <div className="border border-cipher-cyan-bright/40 rounded-2xl overflow-hidden shadow-lg flex flex-col lg:h-full terminal-container">
              <div className="terminal-header border-b border-cipher-cyan-bright/30 px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
                <Icons.Check className="w-4 h-4 sm:w-5 sm:h-5 text-cipher-green-bright" />
                <span className="font-mono text-xs sm:text-sm text-cipher-green-bright truncate">DECRYPTED_MEMO.txt</span>
                <div className="ml-auto flex gap-1.5 sm:gap-2 flex-shrink-0">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cipher-yellow-bright"></div>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cipher-green-bright"></div>
                </div>
              </div>

              <div className="terminal-body p-3 sm:p-4 md:p-6 font-mono flex-1 overflow-x-hidden">
                <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <span className="text-cipher-cyan-bright text-sm sm:text-base">$</span>
                  <span className="text-gray-400 text-xs sm:text-sm break-all">cat DECRYPTED_MEMO.txt</span>
                </div>

                <div className="h-px bg-gradient-to-r from-cipher-cyan-bright/40 to-transparent mb-3 sm:mb-4" />

                <div className="pl-3 sm:pl-4 md:pl-6 border-l-2 border-cipher-cyan-bright/30">
                  <p className="text-[10px] sm:text-xs text-cipher-cyan-bright mb-2">[ DECRYPTED OUTPUT ]</p>

                  {/* Amount */}
                  {amount > 0 && (
                    <div className="mb-3 sm:mb-4">
                      <span className="text-xs sm:text-sm text-gray-400">Amount: </span>
                      <span className="text-lg sm:text-xl font-bold text-cipher-green-bright font-mono">
                        +{amount.toString().replace(/\.?0+$/, '')} ZEC
                      </span>
                    </div>
                  )}

                  {/* Memo */}
                  <p className="text-base sm:text-lg md:text-xl text-cipher-green-bright leading-relaxed break-words">
                    {memo}
                  </p>
                </div>

                <div className="h-px bg-gradient-to-r from-cipher-cyan-bright/40 to-transparent mt-4 sm:mt-6" />

                <div className="flex items-center gap-2 mt-3 sm:mt-4 text-cipher-cyan-bright text-xs sm:text-sm">
                  <Icons.Check className="w-4 h-4" />
                  <span className="break-words">Decryption successful • Zero-knowledge verified</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-cipher-cyan-bright">
                  <span className="animate-pulse">▊</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
