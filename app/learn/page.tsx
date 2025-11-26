'use client';

import Link from 'next/link';
import { useState } from 'react';
import { isTestnet, CURRENCY } from '@/lib/config';

// Icons
const Icons = {
  Book: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Key: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Wallet: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Code: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  ExternalLink: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
};

export default function LearnPage() {
  const [selectedNetwork, setSelectedNetwork] = useState<'testnet' | 'mainnet'>('testnet');

  const addressExamples = {
    testnet: {
      unified: 'utest1qz2c9w98v9xavajc8ml5zd459902alt62tndt3sktsx0hd3gd20evhwfrqq834335a7lmw4a4mx79pnhczxvs50w5...',
      sapling: 'ztestsapling1qz7l33nnr9qnhekptmjacyj95a565tcns09xvyxmt777xnk2q6c6s0jrthgme6dke...',
      transparent: 'tmYWZuRKmdZwgKAxtV9RZRAuPsnWrLkyUtT',
    },
    mainnet: {
      unified: 'u1a7l33nnr9qnhekptmjacyj95a565tcns09xvyxmt777xnk2q6c6s0jrthgme6dkeevc24zue9yqlmspdla5fw5mjws9...',
      sapling: 'zs1a7l33nnr9qnhekptmjacyj95a565tcns09xvyxmt777xnk2q6c6s0jrthgme6dkeevc24zue9yq...',
      transparent: 't1a7l33nnr9qnhekptmjacyj95a565tcns09',
    },
  };

  return (
    <div className="min-h-screen bg-cipher-bg text-white py-8 sm:py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center gap-2 mb-3">
            <Icons.Book />
            <h1 className="text-3xl sm:text-4xl font-bold font-mono text-cipher-cyan">
              Learn Zcash
            </h1>
          </div>
          <p className="text-gray-400 text-sm sm:text-base">
            Privacy-preserving cryptocurrency. Start building today.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <a
            href="https://testnet.zecfaucet.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="card hover:border-cipher-cyan transition-all text-center group"
          >
            <div className="text-2xl mb-1">💧</div>
            <div className="text-sm font-bold text-cipher-cyan">Testnet Faucet</div>
            <div className="text-xs text-gray-500 mt-1">Get free TAZ</div>
          </a>
          <a
            href="https://forum.zcashcommunity.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="card hover:border-purple-400 transition-all text-center group"
          >
            <div className="text-2xl mb-1">💬</div>
            <div className="text-sm font-bold text-purple-400">Community</div>
            <div className="text-xs text-gray-500 mt-1">Forum & support</div>
          </a>
          <a
            href="https://discord.gg/THspb5PM"
            target="_blank"
            rel="noopener noreferrer"
            className="card hover:border-cipher-green transition-all text-center group"
          >
            <div className="text-2xl mb-1">🎮</div>
            <div className="text-sm font-bold text-cipher-green">Dev Discord</div>
            <div className="text-xs text-gray-500 mt-1">Real-time chat</div>
          </a>
        </div>

        {/* Address Types */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Icons.Key />
            <h2 className="text-xl sm:text-2xl font-bold font-mono">Address Types</h2>
          </div>

          {/* Network Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSelectedNetwork('testnet')}
              className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
                selectedNetwork === 'testnet'
                  ? 'bg-cipher-cyan text-cipher-bg font-bold'
                  : 'bg-cipher-surface text-gray-400 hover:text-cipher-cyan border border-cipher-border'
              }`}
            >
              Testnet
            </button>
            <button
              onClick={() => setSelectedNetwork('mainnet')}
              className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
                selectedNetwork === 'mainnet'
                  ? 'bg-cipher-cyan text-cipher-bg font-bold'
                  : 'bg-cipher-surface text-gray-400 hover:text-cipher-cyan border border-cipher-border'
              }`}
            >
              Mainnet
            </button>
          </div>

          <div className="space-y-3">
            {/* Unified */}
            <div className="card border-cipher-cyan/30">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">🎯</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-cipher-cyan">Unified (u...)</h3>
                    <span className="badge badge-success text-xs">BEST</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Modern standard. Contains Orchard + Sapling + Transparent receivers in one address.
                  </p>
                  <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg p-2 rounded">
                    {addressExamples[selectedNetwork].unified}
                  </code>
                </div>
              </div>
            </div>

            {/* Sapling */}
            <div className="card border-purple-500/30">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">🌿</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-purple-400 mb-1">Sapling (zs...)</h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Legacy shielded. Fully private with encrypted memos (512 bytes).
                  </p>
                  <code className="text-xs text-purple-400 break-all font-mono block bg-cipher-bg p-2 rounded">
                    {addressExamples[selectedNetwork].sapling}
                  </code>
                </div>
              </div>
            </div>

            {/* Transparent */}
            <div className="card border-orange-500/30">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">👁️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-orange-400">Transparent (t...)</h3>
                    <span className="badge badge-warning text-xs">PUBLIC</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    Like Bitcoin - fully public. Use only for exchanges, then shield immediately!
                  </p>
                  <code className="text-xs text-orange-400 break-all font-mono block bg-cipher-bg p-2 rounded">
                    {addressExamples[selectedNetwork].transparent}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Viewing Keys */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Icons.Shield />
            <h2 className="text-xl sm:text-2xl font-bold font-mono">Viewing Keys</h2>
          </div>

          <div className="card border-cipher-green/30">
            <p className="text-sm text-gray-400 mb-3">
              A <strong className="text-white">viewing key</strong> lets you view shielded transactions 
              without spending power. Perfect for auditing, transparency, and using CipherScan!
            </p>
            
            <div className="bg-cipher-bg rounded p-3 mb-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-cipher-cyan">•</span>
                <span className="text-gray-300">Accountants can audit without spending funds</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-cipher-cyan">•</span>
                <span className="text-gray-300">Organizations prove transactions publicly</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-cipher-cyan">•</span>
                <span className="text-gray-300">Block explorers decrypt YOUR transactions only</span>
              </div>
            </div>

            <Link 
              href="/decrypt"
              className="inline-flex items-center gap-2 px-4 py-2 bg-cipher-green/10 border border-cipher-green/30 hover:border-cipher-green text-cipher-green rounded text-sm transition-all"
            >
              <span>Try CipherScan's Decrypt Tool →</span>
            </Link>
          </div>
        </section>

        {/* Wallets */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Icons.Wallet />
            <h2 className="text-xl sm:text-2xl font-bold font-mono">Wallets</h2>
          </div>

          <div className="space-y-3">
            {/* Zashi */}
            <div className="card border-cipher-cyan/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold text-cipher-cyan mb-1">Zashi</h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Official ECC wallet. Modern UI, full Orchard support, auto-shielding.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <a href="https://apps.apple.com/app/zashi-zcash-wallet/id1672822094" target="_blank" rel="noopener noreferrer" className="badge badge-info hover:bg-cipher-cyan/20">iOS Mainnet</a>
                    <a href="https://testflight.apple.com/join/wFtmW9uS" target="_blank" rel="noopener noreferrer" className="badge badge-info hover:bg-cipher-cyan/20">iOS Testnet</a>
                    <a href="https://play.google.com/store/apps/details?id=co.electriccoin.zcash" target="_blank" rel="noopener noreferrer" className="badge badge-info hover:bg-cipher-cyan/20">Android Mainnet</a>
                    <a href="https://appdistribution.firebase.dev/i/b26c9d40883899e3" target="_blank" rel="noopener noreferrer" className="badge badge-info hover:bg-cipher-cyan/20">Android Testnet</a>
                  </div>
                </div>
              </div>
            </div>

            {/* Ywallet */}
            <div className="card border-purple-500/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold text-purple-400 mb-1">Ywallet</h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Advanced features: multi-sig, viewing key export, detailed history.
                  </p>
                  <a href="https://ywallet.app/" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1">
                    Download <Icons.ExternalLink />
                  </a>
                </div>
              </div>
            </div>

            {/* Zingo */}
            <div className="card border-cipher-green/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold text-cipher-green mb-1">Zingo Wallet</h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Mobile, desktop, and CLI. Perfect for developers with command-line access.
                  </p>
                  <a href="https://www.zingolabs.org/" target="_blank" rel="noopener noreferrer" className="text-xs text-cipher-green hover:underline inline-flex items-center gap-1">
                    Download <Icons.ExternalLink />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Getting Started */}
        <section className="mb-8">
          <h2 className="text-xl sm:text-2xl font-bold font-mono mb-4">Quick Start</h2>

          <div className="space-y-3">
            <div className="card border-l-4 border-cipher-cyan">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-cipher-cyan/20 border-2 border-cipher-cyan flex items-center justify-center text-sm font-bold text-cipher-cyan flex-shrink-0">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">Download a Wallet</h3>
                  <p className="text-xs text-gray-400">Get Zashi for mobile or Zingo-CLI for development.</p>
                </div>
              </div>
            </div>

            <div className="card border-l-4 border-purple-500">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center text-sm font-bold text-purple-400 flex-shrink-0">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">Get {CURRENCY}</h3>
                  <p className="text-xs text-gray-400">
                    {isTestnet ? (
                      <>
                        Use the <a href="https://testnet.zecfaucet.com/" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">testnet faucet</a> for free TAZ.
                      </>
                    ) : (
                      'Buy on Coinbase, Kraken, or Binance. Always withdraw to shielded addresses!'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="card border-l-4 border-cipher-green">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-cipher-green/20 border-2 border-cipher-green flex items-center justify-center text-sm font-bold text-cipher-green flex-shrink-0">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">Send Private Transactions</h3>
                  <p className="text-xs text-gray-400">Use shielded addresses and include encrypted memos!</p>
                </div>
              </div>
            </div>

            <div className="card border-l-4 border-orange-500">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center text-sm font-bold text-orange-400 flex-shrink-0">
                  4
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">Explore with CipherScan</h3>
                  <p className="text-xs text-gray-400 mb-2">
                    View network stats, decrypt memos, scan your transactions with viewing keys!
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/network" className="text-xs px-2 py-1 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-cipher-cyan rounded">
                      Network Stats
                    </Link>
                    <Link href="/decrypt" className="text-xs px-2 py-1 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-cipher-cyan rounded">
                      Decrypt Tool
                    </Link>
                    <Link href="/privacy" className="text-xs px-2 py-1 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-cipher-cyan rounded">
                      Privacy Dashboard
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Concepts */}
        <section className="mb-8">
          <h2 className="text-xl sm:text-2xl font-bold font-mono mb-4">Privacy Concepts</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card">
              <h3 className="text-sm font-bold text-cipher-cyan mb-1">🛡️ Shielded Pools</h3>
              <p className="text-xs text-gray-400">
                Orchard (newest) and Sapling (legacy) use zk-SNARKs to hide amounts, senders, and receivers.
              </p>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold text-purple-400 mb-1">🔐 Zero-Knowledge Proofs</h3>
              <p className="text-xs text-gray-400">
                Prove transactions are valid without revealing any information. Cryptographic magic!
              </p>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold text-cipher-green mb-1">📝 Encrypted Memos</h3>
              <p className="text-xs text-gray-400">
                Shielded transactions include up to 512 bytes of encrypted data. Only recipient can read.
              </p>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold text-orange-400 mb-1">🎯 Unified Addresses</h3>
              <p className="text-xs text-gray-400">
                Bundle multiple receivers in one address. Sender's wallet picks the best pool automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Developer Resources */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Icons.Code />
            <h2 className="text-xl sm:text-2xl font-bold font-mono">Developer Resources</h2>
          </div>

          <div className="card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-cipher-cyan mb-2">📚 Documentation</h3>
                <ul className="space-y-1 text-xs">
                  <li><a href="https://zcash.readthedocs.io/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-cipher-cyan">Protocol Docs</a></li>
                  <li><a href="https://zips.z.cash/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-cipher-cyan">ZIPs</a></li>
                  <li><Link href="/docs" className="text-gray-400 hover:text-cipher-cyan">CipherScan API</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-cipher-green mb-2">🛠️ Tools</h3>
                <ul className="space-y-1 text-xs">
                  <li><a href="https://github.com/zcash/lightwalletd" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-cipher-cyan">Lightwalletd</a></li>
                  <li><a href="https://github.com/ZcashFoundation/zebra" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-cipher-cyan">Zebra</a></li>
                  <li><a href="https://github.com/zingolabs/zingolib" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-cipher-cyan">Zingolib</a></li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-cipher-border">
              <h3 className="text-sm font-bold text-cipher-cyan mb-2">🔧 CipherScan Infrastructure</h3>
              <div className="bg-cipher-bg rounded p-3 space-y-2 text-xs font-mono">
                <div>
                  <span className="text-gray-500">Lightwalletd gRPC:</span>
                  <code className="ml-2 text-cipher-cyan">lightwalletd.mainnet.cipherscan.app:443</code>
                </div>
                <div>
                  <span className="text-gray-500">REST API:</span>
                  <code className="ml-2 text-cipher-cyan">https://api.mainnet.cipherscan.app/api/*</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="card bg-gradient-to-br from-cipher-cyan/5 to-purple-500/5 border-cipher-cyan/30 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Build?</h2>
          <p className="text-sm text-gray-400 mb-4">
            Use CipherScan to explore the blockchain, decrypt memos, and analyze privacy metrics.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/docs" className="px-4 py-2 bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-bold rounded text-sm transition-all">
              API Docs
            </Link>
            <Link href="/decrypt" className="px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-cipher-cyan rounded text-sm transition-all">
              Decrypt Tool
            </Link>
            <Link href="/network" className="px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-cipher-cyan rounded text-sm transition-all">
              Network Stats
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>
            Building on Zcash?{' '}
            <a href="https://forum.zcashcommunity.com/" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
              Share it on the forum
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
