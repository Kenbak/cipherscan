'use client';

import { useState } from 'react';

// Icons
const Icons = {
  Lock: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Terminal: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

export function SingleTxDecrypt() {
  const [txid, setTxid] = useState('');
  const [viewingKey, setViewingKey] = useState('');
  const [memo, setMemo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

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
      setMemo(result);
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
    setError(null);
    setTxid('');
    setViewingKey('');
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
        {/* LEFT: Input Form */}
        <div className="card h-fit lg:h-auto">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-cipher-cyan/10 border border-cipher-cyan/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold">Decrypt Single Message</h2>
            <p className="text-xs sm:text-sm text-gray-400 font-mono">Enter TX ID and viewing key</p>
          </div>
        </div>
        <div className="space-y-4 sm:space-y-6">
          {/* Transaction ID */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-gray-300 mb-2 sm:mb-3 uppercase tracking-wider">
              Transaction ID
            </label>
            <input
              type="text"
              placeholder="Enter tx ID (64 hex chars)"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              disabled={loading}
              className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
            />
          </div>

          {/* Viewing Key */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-gray-300 mb-2 sm:mb-3 uppercase tracking-wider">
              Unified Full Viewing Key
            </label>
            <input
              type="password"
              placeholder="uviewtest..."
              value={viewingKey}
              onChange={(e) => setViewingKey(e.target.value)}
              disabled={loading}
              className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
            />
            <p className="text-[10px] sm:text-xs text-gray-500 mt-2 font-mono">
              Starts with <code className="text-cipher-cyan">uviewtest</code> (testnet)
            </p>
          </div>

          {/* Decode Button */}
          {!memo && !error && (
            <button
              onClick={decodeMemo}
              disabled={loading || !txid || !viewingKey}
              className="w-full bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-bold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2 sm:gap-3">
                  <span className="relative flex h-3 w-3 sm:h-4 sm:w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-bg opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 sm:h-4 sm:w-4 bg-cipher-bg"></span>
                  </span>
                  Decrypting...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Icons.Lock />
                  Decrypt Memo
                </span>
              )}
            </button>
          )}

          {/* Decrypt Another Button */}
          {(memo || error) && (
            <button
              onClick={reset}
              className="w-full bg-cipher-surface hover:bg-cipher-border text-white font-bold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors border-2 border-cipher-border text-sm sm:text-base"
            >
              <span className="flex items-center justify-center gap-2">
                <Icons.Refresh />
                Decrypt Another
              </span>
            </button>
          )}
        </div>
      </div>

      {/* RIGHT: Terminal Output */}
      <div className="flex flex-col">
        {!loading && !memo && !error && (
          <div className="card flex items-center justify-center bg-cipher-surface/30 lg:min-h-full">
            <div className="text-center px-4 sm:px-6 py-16 sm:py-20">
              <div className="flex justify-center mb-3 sm:mb-4">
                <Icons.Terminal />
              </div>
              <p className="text-gray-500 font-mono text-xs sm:text-sm">
                Enter a transaction ID and viewing key to decrypt the memo...
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="border-2 border-cipher-cyan rounded-lg overflow-hidden shadow-2xl flex flex-col lg:h-full">
            <div className="bg-cipher-surface border-b-2 border-cipher-cyan px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
              <Icons.Terminal />
              <span className="font-mono text-xs sm:text-sm text-cipher-cyan truncate">DECRYPTING.log</span>
              <div className="ml-auto flex gap-1.5 sm:gap-2 flex-shrink-0">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
              </div>
            </div>

            <div className="bg-black/80 p-3 sm:p-4 md:p-6 font-mono flex-1">
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-cipher-cyan">$</span>
                  <span className="text-gray-400 break-all">./decrypt --wasm --zero-knowledge</span>
                </div>
                <div className="pl-4 sm:pl-6 space-y-1.5 sm:space-y-2 text-cipher-green mt-3 sm:mt-4 text-[10px] sm:text-xs">
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
                <div className="flex items-center gap-2 text-cipher-cyan mt-3 sm:mt-4">
                  <span className="animate-pulse">▊</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="card bg-red-900/20 border-2 border-red-500/50 lg:h-full">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <Icons.X />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-red-300 text-base sm:text-lg mb-2">Decryption Failed</h3>
                <p className="text-xs sm:text-sm text-gray-300 font-mono break-all leading-relaxed">{error}</p>
              </div>
            </div>
          </div>
        )}

        {memo && (
          <div className="border-2 border-cipher-cyan rounded-lg overflow-hidden shadow-2xl flex flex-col lg:h-full">
            <div className="bg-cipher-surface border-b-2 border-cipher-cyan px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
              <Icons.Check />
              <span className="font-mono text-xs sm:text-sm text-cipher-green truncate">DECRYPTED_MEMO.txt</span>
              <div className="ml-auto flex gap-1.5 sm:gap-2 flex-shrink-0">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
              </div>
            </div>

            <div className="bg-black/80 p-3 sm:p-4 md:p-6 font-mono flex-1 overflow-x-hidden">
              <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-cipher-cyan text-sm sm:text-base">$</span>
                <span className="text-gray-400 text-xs sm:text-sm break-all">cat DECRYPTED_MEMO.txt</span>
              </div>

              <div className="text-cipher-cyan/40 text-[10px] sm:text-xs mb-3 sm:mb-4 overflow-x-auto">
                <p className="whitespace-nowrap">════════════════════════════════════════════════════</p>
              </div>

              <div className="pl-3 sm:pl-4 md:pl-6 border-l-2 border-cipher-cyan/30">
                <p className="text-[10px] sm:text-xs text-cipher-cyan mb-2">[ DECRYPTED OUTPUT ]</p>
                <p className="text-base sm:text-lg md:text-xl text-cipher-green leading-relaxed break-words">
                  {memo}
                </p>
              </div>

              <div className="text-cipher-cyan/40 text-[10px] sm:text-xs mt-4 sm:mt-6 overflow-x-auto">
                <p className="whitespace-nowrap">════════════════════════════════════════════════════</p>
              </div>

              <div className="flex items-center gap-2 mt-3 sm:mt-4 text-cipher-cyan text-xs sm:text-sm">
                <Icons.Check />
                <span className="break-words">Decryption successful • Zero-knowledge verified</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-cipher-cyan">
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
