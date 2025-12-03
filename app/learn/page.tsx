'use client';

import Link from 'next/link';
import { useState } from 'react';
import { isTestnet, CURRENCY } from '@/lib/config';

const Icons = {
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Key: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
  Shield: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Target: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  EyeOff: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ),
  Users: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Chat: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  Gift: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  ),
  Globe: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  Search: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Activity: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Book: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
};

export default function LearnPage() {
  const [openSection, setOpenSection] = useState<string | null>('addresses');
  const [unifiedNetwork, setUnifiedNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [saplingNetwork, setSaplingNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [transparentNetwork, setTransparentNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [viewingKeyNetwork, setViewingKeyNetwork] = useState<'mainnet' | 'testnet'>('mainnet');

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

  const viewingKeyExamples = {
    mainnet: 'uview1qvqqqqqhqy0j7rp...',
    testnet: 'uviewtest1qvqqqqqhqy0j7rp...',
  };

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="min-h-screen text-white">
      {/* Hero Section */}
      <div className="border-b border-cipher-border bg-gradient-to-b from-cipher-surface/50 to-cipher-bg">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold font-mono text-white mb-4">
              Learn Zcash
            </h1>
            <p className="text-lg text-gray-400 mb-8">
              Privacy-preserving cryptocurrency. Built on zero-knowledge proofs.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://forum.zcashcommunity.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-bold rounded transition-all"
              >
                <Icons.Users />
                <span>Join Zcash Forum</span>
              </a>
              <a
                href="https://testnet.zecfaucet.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 border border-cipher-border hover:border-cipher-cyan text-white rounded transition-all"
              >
                <Icons.Gift />
                <span>Get Testnet ZEC</span>
              </a>
              <a
                href="https://discord.gg/THspb5PM"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 border border-cipher-border hover:border-cipher-cyan text-white rounded transition-all"
              >
                <Icons.Chat />
                <span>Join Discord</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Address Types */}
            <section>
              <button
                onClick={() => toggleSection('addresses')}
                className="w-full flex items-center justify-between p-4 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all mb-3"
              >
                <div className="flex items-center gap-3">
                  <Icons.Key />
                  <h2 className="text-xl font-bold font-mono text-white">Address Types</h2>
                </div>
                <div className={`transform transition-transform ${openSection === 'addresses' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown />
                </div>
              </button>

              {openSection === 'addresses' && (
                <div className="space-y-4">
                  {/* Unified */}
                  <div className="card">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icons.Target />
                        <h3 className="font-bold text-cipher-cyan">Unified Address (u...)</h3>
                      </div>
                      <span className="text-xs px-2 py-1 bg-cipher-green/20 text-cipher-green rounded">RECOMMENDED</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">
                      Modern standard containing Orchard, Sapling, and Transparent receivers in one address.
                    </p>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setUnifiedNetwork('mainnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          unifiedNetwork === 'mainnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Mainnet
                      </button>
                      <button
                        onClick={() => setUnifiedNetwork('testnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          unifiedNetwork === 'testnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Testnet
                      </button>
                    </div>
                    <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg p-3 rounded border border-cipher-border">
                      {addressExamples[unifiedNetwork].unified}
                    </code>
                  </div>

                  {/* Sapling */}
                  <div className="card">
                    <div className="flex items-center gap-2 mb-2">
                      <Icons.Lock />
                      <h3 className="font-bold text-cipher-cyan">Sapling Address (zs...)</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">
                      Legacy shielded address. Fully private with encrypted memos up to 512 bytes.
                    </p>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setSaplingNetwork('mainnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          saplingNetwork === 'mainnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Mainnet
                      </button>
                      <button
                        onClick={() => setSaplingNetwork('testnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          saplingNetwork === 'testnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Testnet
                      </button>
                    </div>
                    <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg p-3 rounded border border-cipher-border">
                      {addressExamples[saplingNetwork].sapling}
                    </code>
                  </div>

                  {/* Transparent */}
                  <div className="card border-cipher-border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icons.EyeOff />
                        <h3 className="font-bold text-white">Transparent Address (t...)</h3>
                      </div>
                      <span className="text-xs px-2 py-1 bg-cipher-orange/20 text-cipher-orange rounded">NOT PRIVATE</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">
                      Public like Bitcoin. Use only for exchanges, then shield immediately.
                    </p>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setTransparentNetwork('mainnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          transparentNetwork === 'mainnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Mainnet
                      </button>
                      <button
                        onClick={() => setTransparentNetwork('testnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          transparentNetwork === 'testnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Testnet
                      </button>
                    </div>
                    <code className="text-xs text-gray-400 break-all font-mono block bg-cipher-bg p-3 rounded border border-cipher-border">
                      {addressExamples[transparentNetwork].transparent}
                    </code>
                  </div>
                </div>
              )}
            </section>

            {/* Viewing Keys */}
            <section>
              <button
                onClick={() => toggleSection('viewingkeys')}
                className="w-full flex items-center justify-between p-4 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all mb-3"
              >
                <div className="flex items-center gap-3">
                  <Icons.Eye />
                  <h2 className="text-xl font-bold font-mono text-white">Viewing Keys</h2>
                </div>
                <div className={`transform transition-transform ${openSection === 'viewingkeys' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown />
                </div>
              </button>

              {openSection === 'viewingkeys' && (
                <div className="space-y-4">
                  <div className="card">
                    <p className="text-sm text-gray-300 mb-4">
                      A <strong className="text-white">viewing key</strong> (UFVK - Unified Full Viewing Key) allows
                      read-only access to your shielded transactions without spending power.
                    </p>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-cipher-cyan mt-0.5">—</span>
                        <span className="text-gray-400">Auditing: Share with accountants for transaction history</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-cipher-cyan mt-0.5">—</span>
                        <span className="text-gray-400">Transparency: Organizations can prove their transactions</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-cipher-cyan mt-0.5">—</span>
                        <span className="text-gray-400">Block Explorer: View your transactions on CipherScan</span>
                      </div>
                    </div>

                    <div className="bg-cipher-bg border border-cipher-border rounded p-4 mb-4">
                      <h4 className="text-sm font-bold text-cipher-cyan mb-2">How to Find Your Viewing Key:</h4>
                      <div className="space-y-2 text-sm text-gray-300">
                        <p><strong className="text-white">Zashi:</strong> Settings → Backup → Export Viewing Key</p>
                        <p><strong className="text-white">Ywallet:</strong> Accounts → Select Account → Export Viewing Key</p>
                        <p><strong className="text-white">Zingo-CLI:</strong> <code className="text-xs bg-cipher-surface px-2 py-1 rounded font-mono">exportufvk</code></p>
                      </div>
                    </div>

                    <Link
                      href="/decrypt"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-cipher-cyan/10 border border-cipher-cyan hover:bg-cipher-cyan/20 text-cipher-cyan rounded transition-all text-sm"
                    >
                      Use CipherScan Decrypt Tool →
                    </Link>
                  </div>

                  {/* Viewing Key Example */}
                  <div className="card border-cipher-cyan/30">
                    <h4 className="text-sm font-bold text-cipher-cyan mb-3">Example Viewing Key:</h4>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setViewingKeyNetwork('mainnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          viewingKeyNetwork === 'mainnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Mainnet
                      </button>
                      <button
                        onClick={() => setViewingKeyNetwork('testnet')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-mono transition-all ${
                          viewingKeyNetwork === 'testnet'
                            ? 'bg-cipher-surface border border-cipher-cyan text-cipher-cyan'
                            : 'bg-cipher-surface text-gray-400 hover:text-gray-300 border border-cipher-border'
                        }`}
                      >
                        Testnet
                      </button>
                    </div>
                    <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg p-3 rounded border border-cipher-border">
                      {viewingKeyExamples[viewingKeyNetwork]}
                    </code>
                  </div>
                </div>
              )}
            </section>

            {/* Wallets */}
            <section>
              <button
                onClick={() => toggleSection('wallets')}
                className="w-full flex items-center justify-between p-4 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all mb-3"
              >
                <div className="flex items-center gap-3">
                  <Icons.Wallet />
                  <h2 className="text-xl font-bold font-mono text-white">Wallets</h2>
                </div>
                <div className={`transform transition-transform ${openSection === 'wallets' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown />
                </div>
              </button>

              {openSection === 'wallets' && (
                <div className="space-y-3">
                  {/* Zashi */}
                  <div className="card">
                    <h3 className="font-bold text-cipher-cyan mb-2">Zashi</h3>
                    <p className="text-sm text-gray-400 mb-3">
                      Official ECC wallet. Modern UI, full Orchard support, automatic shielding.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <a
                        href="https://apps.apple.com/app/zashi-zcash-wallet/id1672822094"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-center"
                      >
                        iOS Mainnet
                      </a>
                      <a
                        href="https://testflight.apple.com/join/wFtmW9uS"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-center"
                      >
                        iOS Testnet
                      </a>
                      <a
                        href="https://play.google.com/store/apps/details?id=co.electriccoin.zcash"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-center"
                      >
                        Android Mainnet
                      </a>
                      <a
                        href="https://appdistribution.firebase.dev/i/b26c9d40883899e3"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-center"
                      >
                        Android Testnet
                      </a>
                    </div>
                  </div>

                  {/* Ywallet */}
                  <div className="card">
                    <h3 className="font-bold text-cipher-cyan mb-2">Ywallet</h3>
                    <p className="text-sm text-gray-400 mb-2">
                      Advanced wallet with multi-sig, viewing key export, and detailed transaction history.
                    </p>
                    <a
                      href="https://ywallet.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-cipher-cyan hover:underline"
                    >
                      Download from ywallet.app →
                    </a>
                  </div>

                  {/* Zingo */}
                  <div className="card">
                    <h3 className="font-bold text-cipher-cyan mb-2">Zingo Wallet</h3>
                    <p className="text-sm text-gray-400 mb-2">
                      Mobile, desktop, and CLI versions. Perfect for developers.
                    </p>
                    <a
                      href="https://github.com/zingolabs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-cipher-cyan hover:underline"
                    >
                      View on GitHub →
                    </a>
                  </div>
                </div>
              )}
            </section>

            {/* Developer Resources */}
            <section>
              <button
                onClick={() => toggleSection('dev')}
                className="w-full flex items-center justify-between p-4 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan rounded-lg transition-all mb-3"
              >
                <div className="flex items-center gap-3">
                  <Icons.Code />
                  <h2 className="text-xl font-bold font-mono text-white">Developer Resources</h2>
                </div>
                <div className={`transform transition-transform ${openSection === 'dev' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown />
                </div>
              </button>

              {openSection === 'dev' && (
                <div className="space-y-4">
                  {/* CipherScan Infrastructure */}
                  <div className="card border-cipher-cyan/30">
                    <h3 className="font-bold text-cipher-cyan mb-3">CipherScan Infrastructure</h3>

                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-gray-500 font-mono mb-1">Mainnet Lightwalletd gRPC</div>
                        <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg p-2 rounded border border-cipher-border">
                          lightwalletd.mainnet.cipherscan.app:443
                        </code>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 font-mono mb-1">Mainnet REST API</div>
                        <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg p-2 rounded border border-cipher-border">
                          https://api.mainnet.cipherscan.app/api/*
                        </code>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 font-mono mb-1">Testnet Lightwalletd gRPC</div>
                        <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg p-2 rounded border border-cipher-border">
                          lightwalletd.testnet.cipherscan.app:443
                        </code>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 font-mono mb-1">Testnet REST API</div>
                        <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg p-2 rounded border border-cipher-border">
                          https://api.testnet.cipherscan.app/api/*
                        </code>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-cipher-border">
                      <Link
                        href="/docs"
                        className="text-sm text-cipher-cyan hover:underline"
                      >
                        View Full API Documentation →
                      </Link>
                    </div>
                  </div>

                  {/* External Resources */}
                  <div className="card">
                    <h3 className="font-bold text-white mb-3">Documentation & Tools</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <a
                        href="https://zcash.readthedocs.io/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        Protocol Docs
                      </a>
                      <a
                        href="https://zips.z.cash/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        ZIPs
                      </a>
                      <a
                        href="https://github.com/zcash/lightwalletd"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        Lightwalletd
                      </a>
                      <a
                        href="https://github.com/ZcashFoundation/zebra"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        Zebra
                      </a>
                      <a
                        href="https://github.com/zingolabs/zingolib"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        Zingolib
                      </a>
                      <a
                        href="https://github.com/zcash/librustzcash"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        librustzcash
                      </a>
                      <a
                        href="https://github.com/ChainSafe/WebZjs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        WebZjs (Browser)
                      </a>
                      <a
                        href="https://crates.io/teams/github:zcash:crate-publishers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-cipher-cyan transition-colors"
                      >
                        Zcash Crates (Rust)
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Privacy Concepts */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Icons.Shield />
                <h3 className="font-bold text-white">Privacy Concepts</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icons.Database />
                    <div className="font-bold text-cipher-cyan">Shielded Pools</div>
                  </div>
                  <div className="text-gray-400">Orchard and Sapling use zk-SNARKs to hide transaction data</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icons.Lock />
                    <div className="font-bold text-cipher-cyan">Zero-Knowledge Proofs</div>
                  </div>
                  <div className="text-gray-400">Prove validity without revealing information</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icons.Chat />
                    <div className="font-bold text-cipher-cyan">Encrypted Memos</div>
                  </div>
                  <div className="text-gray-400">Up to 512 bytes of private data per transaction</div>
                </div>
              </div>
            </div>

            {/* CipherScan Tools */}
            <div className="card border-cipher-cyan/30">
              <div className="flex items-center gap-2 mb-3">
                <Icons.Search />
                <h3 className="font-bold text-cipher-cyan">CipherScan Tools</h3>
              </div>
              <div className="space-y-2">
                <Link
                  href="/decrypt"
                  className="flex items-center gap-2 px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-sm"
                >
                  <Icons.Lock />
                  <span>Decrypt Shielded Memos</span>
                </Link>
                <Link
                  href="/network"
                  className="flex items-center gap-2 px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-sm"
                >
                  <Icons.Globe />
                  <span>Network Statistics</span>
                </Link>
                <Link
                  href="/privacy"
                  className="flex items-center gap-2 px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-sm"
                >
                  <Icons.Shield />
                  <span>Privacy Dashboard</span>
                </Link>
                <Link
                  href="/mempool"
                  className="flex items-center gap-2 px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-sm"
                >
                  <Icons.Activity />
                  <span>Mempool Viewer</span>
                </Link>
                <Link
                  href="/docs"
                  className="flex items-center gap-2 px-4 py-2 bg-cipher-surface border border-cipher-border hover:border-cipher-cyan text-gray-300 hover:text-cipher-cyan rounded transition-all text-sm"
                >
                  <Icons.Code />
                  <span>API Documentation</span>
                </Link>
              </div>
            </div>

            {/* Community */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Icons.Users />
                <h3 className="font-bold text-white">Community</h3>
              </div>
              <div className="space-y-2 text-sm">
                <a
                  href="https://testnet.zecfaucet.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-cipher-cyan transition-colors"
                >
                  <Icons.Gift />
                  <span>Testnet Faucet</span>
                </a>
                <a
                  href="https://forum.zcashcommunity.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-cipher-cyan transition-colors"
                >
                  <Icons.Users />
                  <span>Community Forum</span>
                </a>
                <a
                  href="https://discord.gg/THspb5PM"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-cipher-cyan transition-colors"
                >
                  <Icons.Chat />
                  <span>Developer Discord</span>
                </a>
                <a
                  href="https://www.scifi.money/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-cipher-cyan transition-colors"
                >
                  <Icons.Book />
                  <span>SciFi Money (Guides)</span>
                </a>
                <a
                  href="https://z.cash/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-gray-400 hover:text-cipher-cyan transition-colors"
                >
                  <Icons.Globe />
                  <span>Z.cash (Official)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
