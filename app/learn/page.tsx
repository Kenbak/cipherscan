'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// Icons with consistent className prop
const Icons = {
  ChevronDown: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Key: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  Eye: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Wallet: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Code: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  Shield: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Target: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  EyeOff: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ),
  Users: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Chat: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  Gift: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  ),
  Globe: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  Search: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Chart: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Activity: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  Database: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Book: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="border-b border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Icons.Book className="w-7 h-7 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-primary">
                Learn Zcash
              </h1>
              <p className="text-secondary">
                Privacy-preserving cryptocurrency built on zero-knowledge proofs
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://forum.zcashcommunity.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-medium rounded-lg transition-colors"
            >
              <Icons.Users className="w-4 h-4" />
              <span>Join Forum</span>
            </a>
            <a
              href="https://testnet.zecfaucet.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-cipher-border hover:border-cipher-cyan text-secondary hover:text-cipher-cyan rounded-lg transition-colors"
            >
              <Icons.Gift className="w-4 h-4" />
              <span>Get Testnet ZEC</span>
            </a>
            <a
              href="https://discord.gg/THspb5PM"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-cipher-border hover:border-cipher-cyan text-secondary hover:text-cipher-cyan rounded-lg transition-colors"
            >
              <Icons.Chat className="w-4 h-4" />
              <span>Discord</span>
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Address Types */}
            <section>
              <button
                onClick={() => toggleSection('addresses')}
                className="w-full card card-interactive flex items-center justify-between !p-4 mb-3"
              >
                <div className="flex items-center gap-3 text-primary">
                  <span className="w-8 h-8 rounded-lg bg-cipher-cyan/10 flex items-center justify-center">
                    <Icons.Key className="w-4 h-4 text-cipher-cyan" />
                  </span>
                  <h2 className="text-lg font-bold text-primary">Address Types</h2>
                </div>
                <div className={`transform transition-transform duration-200 text-muted ${openSection === 'addresses' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown className="w-5 h-5" />
                </div>
              </button>

              {openSection === 'addresses' && (
                <div className="space-y-3 animate-fade-in">
                  {/* Unified */}
                  <Card variant="compact">
                    <CardBody>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icons.Target className="w-4 h-4 text-cipher-cyan" />
                          <h3 className="font-bold text-cipher-cyan font-mono text-sm">Unified Address (u...)</h3>
                        </div>
                        <Badge color="green">RECOMMENDED</Badge>
                      </div>
                      <p className="text-sm text-secondary mb-4">
                        Modern standard containing Orchard, Sapling, and Transparent receivers in one address.
                      </p>
                      <div className="filter-group mb-3">
                        <button
                          onClick={() => setUnifiedNetwork('mainnet')}
                          className={`filter-btn flex-1 ${unifiedNetwork === 'mainnet' ? 'filter-btn-active !bg-cipher-cyan !text-cipher-bg' : ''}`}
                        >
                          Mainnet
                        </button>
                        <button
                          onClick={() => setUnifiedNetwork('testnet')}
                          className={`filter-btn flex-1 ${unifiedNetwork === 'testnet' ? 'filter-btn-active !bg-cipher-cyan !text-cipher-bg' : ''}`}
                        >
                          Testnet
                        </button>
                      </div>
                      <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border">
                        {addressExamples[unifiedNetwork].unified}
                      </code>
                    </CardBody>
                  </Card>

                  {/* Sapling */}
                  <Card variant="compact">
                    <CardBody>
                      <div className="flex items-center gap-2 mb-3">
                        <Icons.Lock className="w-4 h-4 text-purple-400" />
                        <h3 className="font-bold text-purple-400 font-mono text-sm">Sapling Address (zs...)</h3>
                      </div>
                      <p className="text-sm text-secondary mb-4">
                        Legacy shielded address. Fully private with encrypted memos up to 512 bytes.
                      </p>
                      <div className="filter-group mb-3">
                        <button
                          onClick={() => setSaplingNetwork('mainnet')}
                          className={`filter-btn flex-1 ${saplingNetwork === 'mainnet' ? 'filter-btn-active !bg-purple-500 !text-white' : ''}`}
                        >
                          Mainnet
                        </button>
                        <button
                          onClick={() => setSaplingNetwork('testnet')}
                          className={`filter-btn flex-1 ${saplingNetwork === 'testnet' ? 'filter-btn-active !bg-purple-500 !text-white' : ''}`}
                        >
                          Testnet
                        </button>
                      </div>
                      <code className="text-xs text-purple-400 break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border">
                        {addressExamples[saplingNetwork].sapling}
                      </code>
                    </CardBody>
                  </Card>

                  {/* Transparent */}
                  <Card variant="compact">
                    <CardBody>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icons.EyeOff className="w-4 h-4 text-muted" />
                          <h3 className="font-bold text-primary font-mono text-sm">Transparent Address (t...)</h3>
                        </div>
                        <Badge color="orange">NOT PRIVATE</Badge>
                      </div>
                      <p className="text-sm text-secondary mb-4">
                        Public like Bitcoin. Use only for exchanges, then shield immediately.
                      </p>
                      <div className="filter-group mb-3">
                        <button
                          onClick={() => setTransparentNetwork('mainnet')}
                          className={`filter-btn flex-1 ${transparentNetwork === 'mainnet' ? 'filter-btn-active' : ''}`}
                        >
                          Mainnet
                        </button>
                        <button
                          onClick={() => setTransparentNetwork('testnet')}
                          className={`filter-btn flex-1 ${transparentNetwork === 'testnet' ? 'filter-btn-active' : ''}`}
                        >
                          Testnet
                        </button>
                      </div>
                      <code className="text-xs text-muted break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border">
                        {addressExamples[transparentNetwork].transparent}
                      </code>
                    </CardBody>
                  </Card>
                </div>
              )}
            </section>

            {/* Viewing Keys */}
            <section>
              <button
                onClick={() => toggleSection('viewingkeys')}
                className="w-full card card-interactive flex items-center justify-between !p-4 mb-3"
              >
                <div className="flex items-center gap-3 text-primary">
                  <span className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Icons.Eye className="w-4 h-4 text-purple-400" />
                  </span>
                  <h2 className="text-lg font-bold text-primary">Viewing Keys</h2>
                </div>
                <div className={`transform transition-transform duration-200 text-muted ${openSection === 'viewingkeys' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown className="w-5 h-5" />
                </div>
              </button>

              {openSection === 'viewingkeys' && (
                <div className="space-y-3 animate-fade-in">
                  <Card variant="compact">
                    <CardBody>
                      <p className="text-sm text-secondary mb-4">
                        A <strong className="text-primary">viewing key</strong> (UFVK - Unified Full Viewing Key) allows
                        read-only access to your shielded transactions without spending power.
                      </p>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-cipher-cyan font-mono">—</span>
                          <span className="text-secondary"><strong className="text-primary">Auditing:</strong> Share with accountants for transaction history</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-cipher-cyan font-mono">—</span>
                          <span className="text-secondary"><strong className="text-primary">Transparency:</strong> Organizations can prove their transactions</span>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-cipher-cyan font-mono">—</span>
                          <span className="text-secondary"><strong className="text-primary">Explorer:</strong> View your transactions on CipherScan</span>
                        </div>
                      </div>

                      <div className="bg-cipher-bg/50 border border-cipher-border rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-bold text-cipher-cyan mb-3 font-mono">How to Find Your Viewing Key:</h4>
                        <div className="space-y-2 text-sm text-secondary">
                          <p><strong className="text-primary">Zashi:</strong> Settings → Backup → Export Viewing Key</p>
                          <p><strong className="text-primary">Ywallet:</strong> Accounts → Select Account → Export Viewing Key</p>
                          <p><strong className="text-primary">Zingo-CLI:</strong> <code className="text-xs bg-cipher-surface px-2 py-1 rounded font-mono text-cipher-cyan">exportufvk</code></p>
                        </div>
                      </div>

                      <Link href="/decrypt" className="btn btn-primary btn-sm">
                        Use Decrypt Tool →
                      </Link>
                    </CardBody>
                  </Card>

                  {/* Viewing Key Example */}
                  <Card variant="compact">
                    <CardBody>
                      <h4 className="text-sm font-bold text-cipher-cyan mb-3 font-mono">Example Viewing Key:</h4>
                      <div className="filter-group mb-3">
                        <button
                          onClick={() => setViewingKeyNetwork('mainnet')}
                          className={`filter-btn flex-1 ${viewingKeyNetwork === 'mainnet' ? 'filter-btn-active !bg-cipher-cyan !text-cipher-bg' : ''}`}
                        >
                          Mainnet
                        </button>
                        <button
                          onClick={() => setViewingKeyNetwork('testnet')}
                          className={`filter-btn flex-1 ${viewingKeyNetwork === 'testnet' ? 'filter-btn-active !bg-cipher-cyan !text-cipher-bg' : ''}`}
                        >
                          Testnet
                        </button>
                      </div>
                      <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border">
                        {viewingKeyExamples[viewingKeyNetwork]}
                      </code>
                    </CardBody>
                  </Card>
                </div>
              )}
            </section>

            {/* Wallets */}
            <section>
              <button
                onClick={() => toggleSection('wallets')}
                className="w-full card card-interactive flex items-center justify-between !p-4 mb-3"
              >
                <div className="flex items-center gap-3 text-primary">
                  <span className="w-8 h-8 rounded-lg bg-cipher-green/10 flex items-center justify-center">
                    <Icons.Wallet className="w-4 h-4 text-cipher-green" />
                  </span>
                  <h2 className="text-lg font-bold text-primary">Wallets</h2>
                </div>
                <div className={`transform transition-transform duration-200 text-muted ${openSection === 'wallets' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown className="w-5 h-5" />
                </div>
              </button>

              {openSection === 'wallets' && (
                <div className="space-y-3 animate-fade-in">
                  {/* Zashi */}
                  <Card variant="compact">
                    <CardBody>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-cipher-cyan">Zashi</h3>
                        <Badge color="green">OFFICIAL</Badge>
                      </div>
                      <p className="text-sm text-secondary mb-4">
                        Official ECC wallet. Modern UI, full Orchard support, automatic shielding.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href="https://apps.apple.com/app/zashi-zcash-wallet/id1672822094"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm justify-center"
                        >
                          iOS Mainnet
                        </a>
                        <a
                          href="https://testflight.apple.com/join/wFtmW9uS"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm justify-center"
                        >
                          iOS Testnet
                        </a>
                        <a
                          href="https://play.google.com/store/apps/details?id=co.electriccoin.zcash"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm justify-center"
                        >
                          Android Mainnet
                        </a>
                        <a
                          href="https://appdistribution.firebase.dev/i/b26c9d40883899e3"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm justify-center"
                        >
                          Android Testnet
                        </a>
                      </div>
                    </CardBody>
                  </Card>

                  {/* Ywallet */}
                  <Card variant="compact">
                    <CardBody>
                      <h3 className="font-bold text-cipher-cyan mb-2">Ywallet</h3>
                      <p className="text-sm text-secondary mb-3">
                        Advanced wallet with multi-sig, viewing key export, and detailed transaction history.
                      </p>
                      <a
                        href="https://ywallet.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-cipher-cyan hover:text-cipher-green transition-colors"
                      >
                        Download from ywallet.app →
                      </a>
                    </CardBody>
                  </Card>

                  {/* Zingo */}
                  <Card variant="compact">
                    <CardBody>
                      <h3 className="font-bold text-cipher-cyan mb-2">Zingo Wallet</h3>
                      <p className="text-sm text-secondary mb-3">
                        Mobile, desktop, and CLI versions. Perfect for developers.
                      </p>
                      <a
                        href="https://github.com/zingolabs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-cipher-cyan hover:text-cipher-green transition-colors"
                      >
                        View on GitHub →
                      </a>
                    </CardBody>
                  </Card>
                </div>
              )}
            </section>

            {/* Developer Resources */}
            <section>
              <button
                onClick={() => toggleSection('dev')}
                className="w-full card card-interactive flex items-center justify-between !p-4 mb-3"
              >
                <div className="flex items-center gap-3 text-primary">
                  <span className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Icons.Code className="w-4 h-4 text-orange-400" />
                  </span>
                  <h2 className="text-lg font-bold text-primary">Developer Resources</h2>
                </div>
                <div className={`transform transition-transform duration-200 text-muted ${openSection === 'dev' ? 'rotate-180' : ''}`}>
                  <Icons.ChevronDown className="w-5 h-5" />
                </div>
              </button>

              {openSection === 'dev' && (
                <div className="space-y-3 animate-fade-in">
                  {/* CipherScan Infrastructure */}
                  <Card variant="compact">
                    <CardBody>
                      <div className="flex items-center gap-2 mb-4">
                        <Icons.Database className="w-4 h-4 text-cipher-cyan" />
                        <h3 className="font-bold text-cipher-cyan">CipherScan Infrastructure</h3>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-muted font-mono mb-1 uppercase tracking-wide">Mainnet Lightwalletd gRPC</div>
                          <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg/50 p-2.5 rounded-lg border border-cipher-border">
                            lightwalletd.mainnet.cipherscan.app:443
                          </code>
                        </div>

                        <div>
                          <div className="text-xs text-muted font-mono mb-1 uppercase tracking-wide">Mainnet REST API</div>
                          <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg/50 p-2.5 rounded-lg border border-cipher-border">
                            https://api.mainnet.cipherscan.app/api/*
                          </code>
                        </div>

                        <div>
                          <div className="text-xs text-muted font-mono mb-1 uppercase tracking-wide">Testnet Lightwalletd gRPC</div>
                          <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg/50 p-2.5 rounded-lg border border-cipher-border">
                            lightwalletd.testnet.cipherscan.app:443
                          </code>
                        </div>

                        <div>
                          <div className="text-xs text-muted font-mono mb-1 uppercase tracking-wide">Testnet REST API</div>
                          <code className="text-xs text-cipher-cyan font-mono block bg-cipher-bg/50 p-2.5 rounded-lg border border-cipher-border">
                            https://api.testnet.cipherscan.app/api/*
                          </code>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-cipher-border">
                        <Link href="/docs" className="btn btn-primary btn-sm">
                          View API Documentation →
                        </Link>
                      </div>
                    </CardBody>
                  </Card>

                  {/* External Resources */}
                  <Card variant="compact">
                    <CardBody>
                      <h3 className="font-bold text-primary mb-4">Documentation & Tools</h3>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <a
                          href="https://zcash.readthedocs.io/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          Protocol Docs
                        </a>
                        <a
                          href="https://zips.z.cash/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          ZIPs
                        </a>
                        <a
                          href="https://github.com/zcash/lightwalletd"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          Lightwalletd
                        </a>
                        <a
                          href="https://github.com/ZcashFoundation/zebra"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          Zebra
                        </a>
                        <a
                          href="https://github.com/zingolabs/zingolib"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          Zingolib
                        </a>
                        <a
                          href="https://github.com/zcash/librustzcash"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          librustzcash
                        </a>
                        <a
                          href="https://github.com/ChainSafe/WebZjs"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          WebZjs (Browser)
                        </a>
                        <a
                          href="https://crates.io/teams/github:zcash:crate-publishers"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-cipher-cyan transition-colors"
                        >
                          Zcash Crates (Rust)
                        </a>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Privacy Concepts */}
            <Card variant="compact">
              <CardBody>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                    <Icons.Shield className="w-3.5 h-3.5 text-purple-400" />
                  </span>
                  <h3 className="font-bold text-primary">Privacy Concepts</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Icons.Database className="w-3.5 h-3.5 text-cipher-cyan" />
                      <div className="font-medium text-cipher-cyan text-sm">Shielded Pools</div>
                    </div>
                    <div className="text-xs text-secondary pl-5">Orchard and Sapling use zk-SNARKs to hide transaction data</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Icons.Lock className="w-3.5 h-3.5 text-cipher-cyan" />
                      <div className="font-medium text-cipher-cyan text-sm">Zero-Knowledge Proofs</div>
                    </div>
                    <div className="text-xs text-secondary pl-5">Prove validity without revealing information</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Icons.Chat className="w-3.5 h-3.5 text-cipher-cyan" />
                      <div className="font-medium text-cipher-cyan text-sm">Encrypted Memos</div>
                    </div>
                    <div className="text-xs text-secondary pl-5">Up to 512 bytes of private data per transaction</div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* CipherScan Tools */}
            <Card variant="compact">
              <CardBody>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-6 h-6 rounded-md bg-cipher-cyan/10 flex items-center justify-center">
                    <Icons.Search className="w-3.5 h-3.5 text-cipher-cyan" />
                  </span>
                  <h3 className="font-bold text-cipher-cyan">CipherScan Tools</h3>
                </div>
                <div className="space-y-1.5">
                  <Link
                    href="/decrypt"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Lock className="w-4 h-4" />
                    <span>Decrypt Shielded Memos</span>
                  </Link>
                  <Link
                    href="/network"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Globe className="w-4 h-4" />
                    <span>Network Statistics</span>
                  </Link>
                  <Link
                    href="/privacy"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Shield className="w-4 h-4" />
                    <span>Privacy Dashboard</span>
                  </Link>
                  <Link
                    href="/mempool"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Activity className="w-4 h-4" />
                    <span>Mempool Viewer</span>
                  </Link>
                  <Link
                    href="/docs"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Code className="w-4 h-4" />
                    <span>API Documentation</span>
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* Community */}
            <Card variant="compact">
              <CardBody>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-6 h-6 rounded-md bg-cipher-green/10 flex items-center justify-center">
                    <Icons.Users className="w-3.5 h-3.5 text-cipher-green" />
                  </span>
                  <h3 className="font-bold text-primary">Community</h3>
                </div>
                <div className="space-y-1.5">
                  <a
                    href="https://testnet.zecfaucet.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Gift className="w-4 h-4" />
                    <span>Testnet Faucet</span>
                  </a>
                  <a
                    href="https://forum.zcashcommunity.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Users className="w-4 h-4" />
                    <span>Community Forum</span>
                  </a>
                  <a
                    href="https://discord.gg/THspb5PM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Chat className="w-4 h-4" />
                    <span>Developer Discord</span>
                  </a>
                  <a
                    href="https://www.scifi.money/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Book className="w-4 h-4" />
                    <span>SciFi Money (Guides)</span>
                  </a>
                  <a
                    href="https://zechub.wiki/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Book className="w-4 h-4" />
                    <span>ZecHub Wiki</span>
                  </a>
                  <a
                    href="https://maxdesalle.com/mastering-zcash/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Book className="w-4 h-4" />
                    <span>Mastering Zcash (Deep Dive)</span>
                  </a>
                  <a
                    href="https://z.cash/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-secondary hover:text-cipher-cyan hover:bg-cipher-hover rounded-lg transition-all text-sm"
                  >
                    <Icons.Globe className="w-4 h-4" />
                    <span>Z.cash (Official)</span>
                  </a>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
