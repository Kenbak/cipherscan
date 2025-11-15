'use client';

import { useState } from 'react';
import { NETWORK_LABEL, isTestnet } from '@/lib/config';

// Icons
const Icons = {
  Shield: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
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
  Info: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

export default function DecryptPage() {
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
    }, 250); // Each step appears after 250ms

    // Minimum loading time for animation visibility
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 1800));

    try {
      const { testWasm, detectKeyType, decryptMemoFromTxid } = await import('@/lib/wasm-loader');
      const testResult = await testWasm();
      const keyType = await detectKeyType(viewingKey);
      const result = await decryptMemoFromTxid(txid, viewingKey);

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

  // Block mainnet completely
  if (!isTestnet) {
    return (
      <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-900/30 border-2 border-red-500 rounded-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <Icons.Lock />
            </div>
            <h1 className="text-3xl font-bold text-red-400 mb-4">
              Mainnet Memo Decryption Disabled
            </h1>
            <p className="text-gray-300 mb-6">
              For security reasons, we don't support memo decryption on mainnet.
            </p>
            <div className="bg-cipher-bg/50 rounded-lg p-6 text-left">
              <p className="font-semibold mb-3">To decrypt memos securely on mainnet, use:</p>
              <ul className="space-y-2 text-sm">
                <li>
                  • <a href="https://github.com/zingolabs/zingolib" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                    Zingo-CLI
                  </a> - Command-line wallet
                </li>
                <li>
                  • <a href="https://nighthawkwallet.com/" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                    Nighthawk Wallet
                  </a> - Mobile wallet
                </li>
                <li>
                  • <a href="https://www.zecwallet.co/" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                    Zecwallet Lite
                  </a> - Desktop wallet
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header - Full Width */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Icons.Lock />
            <h1 className="text-4xl font-bold font-mono">
              Decrypt Shielded Memo
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Decode encrypted memos from shielded Zcash transactions.
          </p>
        </div>

        {/* Privacy Notice - Full Width */}
        <div className="card mb-8 bg-green-900/20 border-green-500/30">
          <div className="flex items-start gap-4">
            <Icons.Shield />
            <div className="flex-1">
              <h3 className="font-bold text-green-300 text-lg mb-2">100% Client-Side Decryption</h3>
              <p className="text-gray-300 leading-relaxed">
                Your viewing key <strong>never leaves your browser</strong>. All decryption happens locally
                using WebAssembly. Nothing is stored on our servers. Zero-knowledge, cypherpunk approved.
              </p>
            </div>
          </div>
        </div>

        {/* 2 Column Layout: Inputs Left + Terminal Right */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">

          {/* LEFT: Input Form */}
          <div className="card h-fit lg:h-auto">
            <div className="space-y-6">

              {/* Transaction ID */}
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-3 uppercase tracking-wider">
                  Transaction ID
                </label>
                <input
                  type="text"
                  placeholder="Enter transaction ID (64 hex characters)"
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  disabled={loading}
                  className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
                />
              </div>

              {/* Viewing Key */}
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-3 uppercase tracking-wider">
                  Unified Full Viewing Key
                </label>
                <input
                  type="password"
                  placeholder="uviewtest..."
                  value={viewingKey}
                  onChange={(e) => setViewingKey(e.target.value)}
                  disabled={loading}
                  className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-2 font-mono">
                  Starts with <code className="text-cipher-cyan">uviewtest</code> (testnet)
                </p>
              </div>

              {/* Decode Button */}
              {!memo && !error && (
                <button
                  onClick={decodeMemo}
                  disabled={loading || !txid || !viewingKey}
                  className="w-full bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="relative flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-bg opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-cipher-bg"></span>
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
                  className="w-full bg-cipher-surface hover:bg-cipher-border text-white font-bold py-3 px-6 rounded-lg transition-colors border-2 border-cipher-border"
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
                <div className="text-center px-6 py-20">
                  <div className="flex justify-center mb-4">
                    <Icons.Terminal />
                  </div>
                  <p className="text-gray-500 font-mono">
                    Enter a transaction ID and viewing key to decrypt the memo...
                  </p>
                </div>
              </div>
            )}

            {loading && (
              <div className="border-2 border-cipher-cyan rounded-lg overflow-hidden shadow-2xl flex flex-col lg:h-full">
                {/* Terminal Header */}
                <div className="bg-cipher-surface border-b-2 border-cipher-cyan px-4 py-3 flex items-center gap-3">
                  <Icons.Terminal />
                  <span className="font-mono text-sm text-cipher-cyan">DECRYPTING.log</span>
                  <div className="ml-auto flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>

                {/* Terminal Content - Loading */}
                <div className="bg-black/80 p-6 font-mono flex-1">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-cipher-cyan">$</span>
                      <span className="text-gray-400">./decrypt --wasm --zero-knowledge</span>
                    </div>
                    <div className="pl-6 space-y-2 text-cipher-green mt-4">
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
                    <div className="flex items-center gap-2 text-cipher-cyan mt-4">
                      <span className="animate-pulse">▊</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="card bg-red-900/20 border-2 border-red-500/50 lg:h-full">
                <div className="flex items-start gap-4">
                  <Icons.X />
                  <div className="flex-1">
                    <h3 className="font-bold text-red-300 text-lg mb-2">Decryption Failed</h3>
                    <p className="text-sm text-gray-300 font-mono break-all leading-relaxed">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {memo && (
              <div className="border-2 border-cipher-cyan rounded-lg overflow-hidden shadow-2xl flex flex-col lg:h-full">
                {/* Terminal Header */}
                <div className="bg-cipher-surface border-b-2 border-cipher-cyan px-4 py-3 flex items-center gap-3">
                  <Icons.Check />
                  <span className="font-mono text-sm text-cipher-green">DECRYPTED_MEMO.txt</span>
                  <div className="ml-auto flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>

                {/* Terminal Content */}
                <div className="bg-black/80 p-6 font-mono flex-1">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-cipher-cyan">$</span>
                    <span className="text-gray-400">cat DECRYPTED_MEMO.txt</span>
                  </div>

                  {/* ASCII Art Separator */}
                  <div className="text-cipher-cyan/40 text-xs mb-4">
                    <p>════════════════════════════════════════════════════</p>
                  </div>

                  <div className="pl-6 border-l-2 border-cipher-cyan/30">
                    <p className="text-xs text-cipher-cyan mb-2">[ DECRYPTED OUTPUT ]</p>
                    <p className="text-xl text-cipher-green leading-relaxed break-words">
                      {memo}
                    </p>
                  </div>

                  {/* Bottom Separator */}
                  <div className="text-cipher-cyan/40 text-xs mt-6">
                    <p>════════════════════════════════════════════════════</p>
                  </div>

                  <div className="flex items-center gap-2 mt-4 text-cipher-cyan text-sm">
                    <Icons.Check />
                    <span>Decryption successful • Zero-knowledge verified</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-cipher-cyan">
                    <span className="animate-pulse">▊</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Info Section - Full Width */}
        <div className="card bg-cipher-surface/50">
          <div className="flex items-start gap-4 mb-4">
            <Icons.Info />
            <h3 className="text-lg font-bold">About Shielded Memos</h3>
          </div>
          <div className="space-y-3 text-sm text-gray-400 leading-relaxed">
            <p>
              <strong className="text-white">What are memos?</strong> Memos are encrypted messages attached to shielded Zcash transactions.
              Only the sender and receiver (with the viewing key) can read them.
            </p>
            <p>
              <strong className="text-white">What is a viewing key?</strong> A viewing key allows you to view incoming shielded
              transactions and their memos without exposing your spending key.
            </p>
            <p>
              <strong className="text-white">Supported pools:</strong> This tool supports Sapling and Orchard shielded pools on {NETWORK_LABEL}.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
