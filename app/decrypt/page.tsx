'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NETWORK_LABEL, isTestnet } from '@/lib/config';

export default function DecryptPage() {
  const [txid, setTxid] = useState('');
  const [viewingKey, setViewingKey] = useState('');
  const [memo, setMemo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decodeMemo = async () => {
    if (!txid || !viewingKey) {
      setError('Please enter both Transaction ID and Viewing Key');
      return;
    }

    setLoading(true);
    setError(null);
    setMemo(null);

    try {
      // Load WASM module
      console.log('🦀 Loading WASM module...');
      const { testWasm, detectKeyType, decryptMemoFromTxid } = await import('@/lib/wasm-loader');

      // Test WASM is working
      const testResult = await testWasm();
      console.log('✅ WASM test:', testResult);

      // Detect key type
      const keyType = await detectKeyType(viewingKey);
      console.log('🔑 Key type:', keyType);

      // Try to decrypt memo (fetches raw hex from API first)
      console.log('🔓 Attempting decryption...');
      const result = await decryptMemoFromTxid(txid, viewingKey);
      setMemo(result);
      console.log('✅ Decryption successful!');
    } catch (err: any) {
      console.error('❌ Decryption error:', err);
      setError(err.message || err.toString() || 'Failed to decode memo');
    } finally {
      setLoading(false);
    }
  };

  // Block mainnet completely
  if (!isTestnet) {
    return (
      <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="text-cipher-cyan hover:underline text-sm mb-4 inline-block">
            ← Back to Explorer
          </Link>

          <div className="bg-red-900/30 border-2 border-red-500 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-3xl font-bold text-red-400 mb-4">
              Mainnet Memo Decryption Disabled
            </h1>
            <p className="text-gray-300 mb-6">
              For security reasons, we don't support memo decryption on mainnet.
              Your viewing key would need to be sent to our server, which is a privacy risk.
            </p>
            <div className="bg-cipher-bg/50 rounded-lg p-6 text-left">
              <p className="font-semibold mb-3">To decrypt memos securely on mainnet, use:</p>
              <ul className="space-y-2 text-sm">
                <li>
                  • <a
                    href="https://github.com/zingolabs/zingolib"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cipher-cyan hover:underline"
                  >
                    Zingo-CLI
                  </a> - Command-line wallet
                </li>
                <li>
                  • <a
                    href="https://nighthawkwallet.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cipher-cyan hover:underline"
                  >
                    Nighthawk Wallet
                  </a> - Mobile wallet
                </li>
                <li>
                  • <a
                    href="https://www.zecwallet.co/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cipher-cyan hover:underline"
                  >
                    Zecwallet Lite
                  </a> - Desktop wallet
                </li>
              </ul>
              <p className="text-xs text-gray-500 mt-4">
                These wallets decrypt memos locally on your device, ensuring your viewing key never leaves your control.
              </p>
            </div>
            <p className="text-sm text-gray-400 mt-6">
              Want to test this feature? Visit{' '}
              <a href="https://testnet.cipherscan.app/decrypt" className="text-cipher-cyan hover:underline">
                testnet.cipherscan.app/decrypt
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
      <div className="max-w-3xl mx-auto">


        {/* Development Notice */}
        <div className="mb-8 bg-blue-900/30 border-2 border-blue-500 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="text-4xl">🚧</div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-blue-400 mb-2">
                Feature Under Development
              </h3>
              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  <strong>Client-side memo decryption using WebAssembly is currently being implemented.</strong>
                </p>
                <p>
                  This feature will decrypt memos <strong>directly in your browser</strong>, ensuring your viewing key <strong>never leaves your device</strong>.
                </p>
                <p className="mt-3 pt-3 border-t border-blue-700">
                  <strong>In the meantime, use these secure alternatives:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    <a
                      href="https://github.com/zingolabs/zingolib"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cipher-cyan hover:underline"
                    >
                      Zingo-CLI
                    </a> - Command-line wallet
                  </li>
                  <li>
                    <a
                      href="https://nighthawkwallet.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cipher-cyan hover:underline"
                    >
                      Nighthawk Wallet
                    </a> - Mobile wallet
                  </li>
                  <li>
                    <a
                      href="https://www.zecwallet.co/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cipher-cyan hover:underline"
                    >
                      Zecwallet Lite
                    </a> - Desktop wallet
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-cipher-cyan hover:underline text-sm mb-4 inline-block">
            ← Back to Explorer
          </Link>
          <h1 className="text-4xl font-bold mb-4 font-mono">
            🔓 Decrypt Shielded Memo
          </h1>
          <p className="text-gray-400">
            Decode encrypted memos from shielded Zcash transactions using your viewing key.
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="card mb-6 bg-purple-900/20 border-purple-500/30">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔐</div>
            <div>
              <h3 className="font-bold text-purple-300 mb-2">Privacy Notice</h3>
              <p className="text-sm text-gray-300">
                Your viewing key is sent to our server to decrypt the memo, but it is{' '}
                <strong>never stored or logged</strong>. The decryption happens in real-time
                and your key is immediately discarded after use.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                For maximum privacy, you can run your own Zcash node and use the{' '}
                <code className="bg-cipher-bg px-1 py-0.5 rounded">z_getnotescount</code> RPC command.
              </p>
            </div>
          </div>
        </div>

        {/* Input Form */}
        <div className="card mb-6">
          <div className="space-y-4">

            {/* Transaction ID */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">
                Transaction ID
              </label>
              <input
                type="text"
                placeholder="Enter transaction ID (64 hex characters)"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                className="w-full bg-cipher-bg border border-cipher-border rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cipher-cyan transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                Example: 0a1b2c3d4e5f...
              </p>
            </div>

            {/* Viewing Key */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">
                Viewing Key
              </label>
              <input
                type="password"
                placeholder={`Enter your viewing key (uviewtest... or zxviewtestsapling...)`}
                value={viewingKey}
                onChange={(e) => setViewingKey(e.target.value)}
                className="w-full bg-cipher-bg border border-cipher-border rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cipher-cyan transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your viewing key starts with <code className="bg-cipher-bg px-1 rounded">uview</code> or <code className="bg-cipher-bg px-1 rounded">zxviews</code> (mainnet)
                or <code className="bg-cipher-bg px-1 rounded">uviewtest</code> or <code className="bg-cipher-bg px-1 rounded">zxviewtestsapling</code> (testnet)
              </p>
            </div>

            {/* Decode Button */}
            <button
              onClick={decodeMemo}
              disabled={loading || !txid || !viewingKey}
              className="w-full bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Decoding...
                </span>
              ) : (
                '🔓 Decode Memo'
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="card bg-red-900/20 border-red-500/30 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-2xl">❌</div>
              <div>
                <h3 className="font-bold text-red-300 mb-1">Error</h3>
                <p className="text-sm text-gray-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success - Decoded Memo */}
        {memo && (
          <div className="card bg-green-900/20 border-green-500/30">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-2xl">✅</div>
              <div>
                <h3 className="font-bold text-green-300">Memo Decoded Successfully!</h3>
              </div>
            </div>
            <div className="bg-cipher-bg border border-green-500/30 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Decrypted Message:</p>
              <p className="font-mono text-white break-all">{memo}</p>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="card mt-8 bg-cipher-surface/50">
          <h3 className="text-lg font-bold mb-3">ℹ️ About Shielded Memos</h3>
          <div className="space-y-2 text-sm text-gray-400">
            <p>
              <strong className="text-white">What are memos?</strong> Memos are encrypted messages
              attached to shielded Zcash transactions. Only the sender and receiver (with the viewing key)
              can read them.
            </p>
            <p>
              <strong className="text-white">What is a viewing key?</strong> A viewing key allows you
              to view incoming shielded transactions and their memos without exposing your spending key.
            </p>
            <p>
              <strong className="text-white">Supported pools:</strong> This tool supports Sapling and
              Orchard shielded pools on {NETWORK_LABEL}.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
