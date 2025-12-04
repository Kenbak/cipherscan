'use client';

import { useState, useEffect } from 'react';
import { NETWORK_LABEL, isTestnet } from '@/lib/config';
import { SingleTxDecrypt } from '@/components/SingleTxDecrypt';
import { ScanMyTransactions } from '@/components/ScanMyTransactions';

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
  Info: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function DecryptPage() {
  const [activeTab, setActiveTab] = useState<'single' | 'scan'>('single');

  // Check for prefill parameter
  const [prefillTxid, setPrefillTxid] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const prefill = params.get('prefill');
      const tab = params.get('tab');

      if (prefill) {
        setPrefillTxid(prefill);
        setActiveTab('single'); // Ensure we're on the Single Message tab
      } else if (tab === 'scan') {
        setActiveTab('scan'); // Open Inbox tab directly
      }
    }
  }, []);

  // Block mainnet completely
  if (!isTestnet) {
    return (
      <div className="min-h-screen text-white py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="card bg-orange-900/20 border-orange-500/30">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Icons.Info />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-orange-300 text-lg mb-2">Mainnet Not Supported</h3>
                <p className="text-gray-300 mb-4">
                  Memo decryption is currently only available on <strong>Testnet</strong>.
                  Please switch to testnet to use this feature.
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  To get a testnet viewing key, you can use:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-400 space-y-2">
                  <li>
                    • <a href="https://ywallet.app/" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                      YWallet
                    </a> - Mobile & Desktop wallet
                  </li>
                  <li>
                    • <a href="https://github.com/hhanh00/zkool2" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                      Zkool
                    </a> - Multi-platform wallet (successor to YWallet)
                  </li>
                  <li>
                    • <a href="https://github.com/zingolabs/zingolib" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                      Zingo CLI
                    </a> - Command-line wallet
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header - Full Width */}
        <div className="mb-6 sm:mb-8 text-center px-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <Icons.Lock />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-mono">
              Decrypt Shielded Memo
            </h1>
          </div>
          <p className="text-gray-400 text-sm sm:text-base md:text-lg">
            Decode encrypted memos from shielded Zcash transactions.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <div className="inline-flex bg-cipher-surface border-2 border-cipher-border rounded-lg p-1">
            <button
              onClick={() => setActiveTab('single')}
              className={`px-4 sm:px-6 py-2 rounded-md font-mono text-sm sm:text-base transition-all ${
                activeTab === 'single'
                  ? 'bg-cipher-cyan text-cipher-bg font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Single Message
            </button>
            <button
              onClick={() => setActiveTab('scan')}
              className={`px-4 sm:px-6 py-2 rounded-md font-mono text-sm sm:text-base transition-all ${
                activeTab === 'scan'
                  ? 'bg-cipher-cyan text-cipher-bg font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Inbox
            </button>
          </div>
        </div>

        {/* Privacy Notice - Full Width */}
        <div className="card mb-6 sm:mb-8 bg-green-900/20 border-green-500/30">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <Icons.Shield />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-green-300 text-base sm:text-lg mb-2">100% Client-Side Decryption</h3>
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
                Your viewing key <strong>never leaves your browser</strong>. All decryption happens locally
                using WebAssembly. Nothing is stored on our servers. Zero-knowledge, cypherpunk approved.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'single' && <SingleTxDecrypt prefillTxid={prefillTxid} />}
        {activeTab === 'scan' && <ScanMyTransactions />}

        {/* Help Card */}
        <div className="card-glass mt-6 sm:mt-8">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <Icons.Info />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-cipher-cyan text-base sm:text-lg mb-2">How to Get a Viewing Key</h3>
              <p className="text-gray-300 text-sm sm:text-base mb-3 sm:mb-4 leading-relaxed">
                To decrypt memos, you need a <strong>Unified Full Viewing Key (UFVK)</strong>.
                This key allows you to view transaction details without exposing your spending keys.
              </p>
              <p className="text-sm text-gray-400 mb-3 sm:mb-4">You can get a viewing key from:</p>
              <ul className="list-none space-y-2 sm:space-y-3 text-sm text-gray-400">
                <li>
                  • <a href="https://ywallet.app/" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                    YWallet
                  </a> - Mobile & Desktop wallet
                </li>
                <li>
                  • <a href="https://github.com/hhanh00/zkool2" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                    Zkool
                  </a> - Mobile wallet
                </li>
                <li>
                  • <a href="https://github.com/zingolabs/zingolib" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                    Zingo CLI
                  </a> - Command-line wallet
                </li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
