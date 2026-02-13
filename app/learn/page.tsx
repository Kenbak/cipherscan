'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// Icons with consistent className prop
const Icons = {
  ChevronRight: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
  Zap: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Layers: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  ExternalLink: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
};

// Address network toggle component
function NetworkToggle({ value, onChange, accentColor = 'cyan' }: {
  value: 'mainnet' | 'testnet';
  onChange: (v: 'mainnet' | 'testnet') => void;
  accentColor?: 'cyan' | 'purple' | 'default';
}) {
  const activeClass = accentColor === 'purple'
    ? 'filter-btn-active !bg-purple-500 !text-white'
    : accentColor === 'cyan'
      ? 'filter-btn-active !bg-cipher-cyan !text-cipher-bg'
      : 'filter-btn-active';

  return (
    <div className="filter-group">
      <button
        onClick={() => onChange('mainnet')}
        className={`filter-btn flex-1 ${value === 'mainnet' ? activeClass : ''}`}
      >
        Mainnet
      </button>
      <button
        onClick={() => onChange('testnet')}
        className={`filter-btn flex-1 ${value === 'testnet' ? activeClass : ''}`}
      >
        Testnet
      </button>
    </div>
  );
}

export default function LearnPage() {
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

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════ */}
      {/* HERO — matches network page style */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-b border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
          <div className="mb-6 animate-fade-in">
            <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
              <span className="opacity-50">{'>'}</span> LEARN_ZCASH
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Learn Zcash
            </h1>
          </div>

          {/* Quick intro */}
          <p className="text-secondary max-w-3xl leading-relaxed mb-8">
            Zcash is the leading privacy cryptocurrency. Unlike Bitcoin, where every transaction is public,
            Zcash lets you send and receive money with <strong className="text-primary">encrypted amounts, addresses, and memos</strong>,all
            verified by zero-knowledge proofs without revealing any private data.
          </p>

          {/* CTA buttons */}
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

      {/* ═══════════════════════════════════════ */}
      {/* KEY CONCEPTS — 3 cards at a glance */}
      {/* ═══════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-xs font-mono text-muted uppercase tracking-wider mb-6">{'>'} KEY_CONCEPTS</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Zero-Knowledge Proofs */}
          <Card variant="glass">
            <CardBody>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                <Icons.Layers className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="font-bold text-primary mb-2">Zero-Knowledge Proofs</h3>
              <p className="text-sm text-secondary leading-relaxed">
                Zcash uses zero-knowledge proofs to mathematically prove a transaction is valid
                without revealing the sender, receiver, or amount.
              </p>
            </CardBody>
          </Card>

          {/* Shielded Pools */}
          <Card variant="glass">
            <CardBody>
              <div className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center mb-4">
                <Icons.Database className="w-5 h-5 text-cipher-cyan" />
              </div>
              <h3 className="font-bold text-primary mb-2">Shielded Pools</h3>
              <p className="text-sm text-secondary leading-relaxed">
                ZEC lives in two worlds: <strong className="text-purple-400">Orchard</strong> (newest, most private)
                and <strong className="text-purple-400">Sapling</strong> pools use encryption, while
                the transparent pool works like Bitcoin. Always shield your ZEC.
              </p>
            </CardBody>
          </Card>

          {/* Encrypted Memos */}
          <Card variant="glass">
            <CardBody>
              <div className="w-10 h-10 rounded-xl bg-cipher-green/10 flex items-center justify-center mb-4">
                <Icons.Lock className="w-5 h-5 text-cipher-green" />
              </div>
              <h3 className="font-bold text-primary mb-2">Encrypted Memos</h3>
              <p className="text-sm text-secondary leading-relaxed">
                Every shielded transaction can include a 512-byte encrypted memo, visible only
                to the recipient. Send messages, payment references, or structured data
                with complete privacy.
              </p>
              <Link href="/decrypt" className="inline-flex items-center gap-1 text-sm text-cipher-cyan hover:text-cipher-green mt-3 transition-colors">
                <span>Try the Decrypt Tool</span>
                <Icons.ChevronRight className="w-3 h-3" />
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* ADDRESS TYPES */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Icons.Key className="w-5 h-5 text-cipher-cyan" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} ADDRESS_TYPES</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Zcash supports three address formats. Unified addresses are the modern standard, they bundle
            all receivers into one address for maximum compatibility and privacy.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Unified */}
            <Card variant="compact">
              <CardBody>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icons.Target className="w-4 h-4 text-cipher-cyan" />
                    <h3 className="font-bold text-cipher-cyan font-mono text-sm">Unified (u...)</h3>
                  </div>
                  <Badge color="green">RECOMMENDED</Badge>
                </div>
                <p className="text-sm text-secondary mb-4 leading-relaxed">
                  Contains Orchard, Sapling, and Transparent receivers in one address.
                  Wallets automatically pick the most private option.
                </p>
                <NetworkToggle value={unifiedNetwork} onChange={setUnifiedNetwork} accentColor="cyan" />
                <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border mt-3">
                  {addressExamples[unifiedNetwork].unified}
                </code>
              </CardBody>
            </Card>

            {/* Sapling */}
            <Card variant="compact">
              <CardBody>
                <div className="flex items-center gap-2 mb-3">
                  <Icons.Lock className="w-4 h-4 text-purple-400" />
                  <h3 className="font-bold text-purple-400 font-mono text-sm">Sapling (zs...)</h3>
                </div>
                <p className="text-sm text-secondary mb-4 leading-relaxed">
                  Legacy shielded address. Fully private with encrypted memos.
                  Still widely supported by exchanges and wallets.
                </p>
                <NetworkToggle value={saplingNetwork} onChange={setSaplingNetwork} accentColor="purple" />
                <code className="text-xs text-purple-400 break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border mt-3">
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
                    <h3 className="font-bold text-primary font-mono text-sm">Transparent (t...)</h3>
                  </div>
                  <Badge color="orange">NOT PRIVATE</Badge>
                </div>
                <p className="text-sm text-secondary mb-4 leading-relaxed">
                  Public like Bitcoin, amounts and addresses are visible.
                  Use only for exchanges, then shield immediately.
                </p>
                <NetworkToggle value={transparentNetwork} onChange={setTransparentNetwork} accentColor="default" />
                <code className="text-xs text-muted break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border mt-3">
                  {addressExamples[transparentNetwork].transparent}
                </code>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* VIEWING KEYS */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Icons.Eye className="w-5 h-5 text-purple-400" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} VIEWING_KEYS</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            A <strong className="text-primary">Unified Full Viewing Key (UFVK)</strong> gives read-only
            access to your shielded transactions. It cannot spend funds, only view them.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Use cases */}
            <Card variant="compact">
              <CardBody>
                <h3 className="font-bold text-primary mb-4">When to use a Viewing Key</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icons.Eye className="w-3.5 h-3.5 text-cipher-cyan" />
                    </span>
                    <div>
                      <div className="font-medium text-primary text-sm">Auditing</div>
                      <div className="text-xs text-secondary mt-0.5">Share with accountants for transaction history without spending access</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icons.Shield className="w-3.5 h-3.5 text-cipher-cyan" />
                    </span>
                    <div>
                      <div className="font-medium text-primary text-sm">Transparency</div>
                      <div className="text-xs text-secondary mt-0.5">Organizations can prove their transactions while keeping spending keys safe</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icons.Lock className="w-3.5 h-3.5 text-cipher-cyan" />
                    </span>
                    <div>
                      <div className="font-medium text-primary text-sm">Decrypt Memos</div>
                      <div className="text-xs text-secondary mt-0.5">Read encrypted messages on CipherScan without exposing your spending key</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-cipher-border">
                  <Link href="/decrypt" className="btn btn-primary btn-sm">
                    Use Decrypt Tool
                    <Icons.ChevronRight className="w-3 h-3 ml-1" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* How to get one */}
            <Card variant="compact">
              <CardBody>
                <h3 className="font-bold text-primary mb-4">How to Export Your Viewing Key</h3>
                <div className="space-y-3 text-sm">
                  <div className="bg-cipher-bg/50 border border-cipher-border rounded-lg p-3">
                    <div className="font-medium text-primary mb-1">Zashi</div>
                    <div className="text-secondary">More &rarr; Export Private Data</div>
                  </div>
                  <div className="bg-cipher-bg/50 border border-cipher-border rounded-lg p-3">
                    <div className="font-medium text-primary mb-1">YWallet</div>
                    <div className="text-secondary">More &rarr; Seed & Keys &rarr; Show Sub Keys</div>
                  </div>
                  <div className="bg-cipher-bg/50 border border-cipher-border rounded-lg p-3">
                    <div className="font-medium text-primary mb-1">Zingo CLI</div>
                    <code className="text-xs text-cipher-cyan font-mono bg-cipher-surface px-2 py-1 rounded">exportufvk</code>
                  </div>
                </div>

                {/* Example key */}
                <div className="mt-4 pt-4 border-t border-cipher-border">
                  <div className="text-xs text-muted font-mono uppercase tracking-wide mb-2">Example Viewing Key</div>
                  <NetworkToggle value={viewingKeyNetwork} onChange={setViewingKeyNetwork} accentColor="cyan" />
                  <code className="text-xs text-cipher-cyan break-all font-mono block bg-cipher-bg/50 p-3 rounded-lg border border-cipher-border mt-3">
                    {viewingKeyExamples[viewingKeyNetwork]}
                  </code>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* WALLETS */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Icons.Wallet className="w-5 h-5 text-cipher-green" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} WALLETS</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Choose a wallet that supports shielded transactions. All wallets below support Unified Addresses
            and full Orchard privacy.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Zashi */}
            <Card variant="compact" className="card-interactive">
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-primary text-lg">Zashi</h3>
                  <Badge color="green">OFFICIAL</Badge>
                </div>
                <p className="text-sm text-secondary mb-5 leading-relaxed">
                  Official ECC wallet. Modern UI, full Orchard support, automatic shielding.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <a href="https://apps.apple.com/app/zashi-zcash-wallet/id1672822094" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm justify-center">
                    iOS
                  </a>
                  <a href="https://play.google.com/store/apps/details?id=co.electriccoin.zcash" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm justify-center">
                    Android
                  </a>
                </div>
              </CardBody>
            </Card>

            {/* YWallet */}
            <Card variant="compact" className="card-interactive">
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-primary text-lg">YWallet</h3>
                  <Badge color="cyan">ADVANCED</Badge>
                </div>
                <p className="text-sm text-secondary mb-5 leading-relaxed">
                  Multi-sig, viewing key export, detailed transaction history. Power user favorite.
                </p>
                <a href="https://ywallet.app/" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm w-full justify-center">
                  <Icons.ExternalLink className="w-3.5 h-3.5" />
                  ywallet.app
                </a>
              </CardBody>
            </Card>

            {/* Zingo */}
            <Card variant="compact" className="card-interactive">
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-primary text-lg">Zingo</h3>
                  <Badge color="purple">DEVELOPER</Badge>
                </div>
                <p className="text-sm text-secondary mb-5 leading-relaxed">
                  Mobile, desktop, and CLI. Full node mode available. Perfect for developers.
                </p>
                <a href="https://github.com/zingolabs" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm w-full justify-center">
                  <Icons.Code className="w-3.5 h-3.5" />
                  GitHub
                </a>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* DEVELOPER RESOURCES */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Icons.Code className="w-5 h-5 text-orange-400" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} DEVELOPER_RESOURCES</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Build on Zcash using CipherScan&apos;s infrastructure or the official Zcash developer tools.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* CipherScan Infrastructure */}
            <Card variant="compact">
              <CardBody>
                <div className="flex items-center gap-2 mb-5">
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

                <div className="mt-5 pt-4 border-t border-cipher-border">
                  <Link href="/docs" className="btn btn-primary btn-sm">
                    View API Documentation
                    <Icons.ChevronRight className="w-3 h-3 ml-1" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* External Resources */}
            <Card variant="compact">
              <CardBody>
                <h3 className="font-bold text-primary mb-5">Documentation & Libraries</h3>
                <div className="space-y-1">
                  {[
                    { href: 'https://zcash.readthedocs.io/', label: 'Protocol Documentation', desc: 'Official Zcash protocol specs' },
                    { href: 'https://zips.z.cash/', label: 'ZIPs (Improvement Proposals)', desc: 'Technical proposals and standards' },
                    { href: 'https://github.com/ZcashFoundation/zebra', label: 'Zebra', desc: 'Rust-based Zcash node implementation' },
                    { href: 'https://github.com/zcash/lightwalletd', label: 'Lightwalletd', desc: 'Light client gRPC server' },
                    { href: 'https://github.com/zcash/librustzcash', label: 'librustzcash', desc: 'Core Zcash Rust libraries' },
                    { href: 'https://github.com/zingolabs/zingolib', label: 'Zingolib', desc: 'Wallet library for Zcash' },
                    { href: 'https://github.com/ChainSafe/WebZjs', label: 'WebZjs', desc: 'Zcash in the browser (WASM)' },
                    { href: 'https://crates.io/teams/github:zcash:crate-publishers', label: 'Zcash Crates', desc: 'Published Rust crates' },
                  ].map(item => (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-cipher-hover transition-all group"
                    >
                      <div>
                        <div className="text-sm text-primary group-hover:text-cipher-cyan transition-colors">{item.label}</div>
                        <div className="text-xs text-muted mt-0.5">{item.desc}</div>
                      </div>
                      <Icons.ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-cipher-cyan transition-colors flex-shrink-0 ml-3" />
                    </a>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* COMMUNITY & LEARNING */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Icons.Users className="w-5 h-5 text-cipher-green" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} COMMUNITY</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Join the Zcash community and dive deeper into privacy technology.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: 'https://z.cash/', icon: Icons.Globe, label: 'Z.cash', desc: 'Official website', color: 'text-cipher-cyan' },
              { href: 'https://forum.zcashcommunity.com/', icon: Icons.Users, label: 'Community Forum', desc: 'Discussions & proposals', color: 'text-cipher-cyan' },
              { href: 'https://zechub.wiki/', icon: Icons.Book, label: 'ZecHub Wiki', desc: 'Community knowledge base', color: 'text-cipher-cyan' },
              { href: 'https://www.scifi.money/', icon: Icons.Book, label: 'SciFi Money', desc: 'Interactive guides', color: 'text-cipher-cyan' },
              { href: 'https://discord.gg/THspb5PM', icon: Icons.Chat, label: 'Developer Discord', desc: 'Real-time chat', color: 'text-cipher-green' },
              { href: 'https://testnet.zecfaucet.com/', icon: Icons.Gift, label: 'Testnet Faucet', desc: 'Free test ZEC', color: 'text-cipher-green' },
              { href: 'https://maxdesalle.com/mastering-zcash/', icon: Icons.Book, label: 'Mastering Zcash', desc: 'Deep technical dive', color: 'text-purple-400' },
              { href: 'https://electriccoin.co/', icon: Icons.Zap, label: 'Electric Coin Co.', desc: 'Core development team', color: 'text-purple-400' },
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="card card-compact card-interactive flex items-start gap-3 !p-4"
              >
                <span className={`w-8 h-8 rounded-lg bg-cipher-hover flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-medium text-primary">{item.label}</div>
                  <div className="text-xs text-muted mt-0.5">{item.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* EXPLORE CIPHERSCAN — bottom CTA */}
      {/* ═══════════════════════════════════════ */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <Icons.Zap className="w-5 h-5 text-cipher-cyan" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} EXPLORE_CIPHERSCAN</h2>
          </div>
          <p className="text-secondary mb-6 max-w-2xl">
            Put your knowledge to work with CipherScan&apos;s privacy intelligence tools.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { href: '/decrypt', icon: Icons.Lock, label: 'Decrypt Memos', desc: 'Decode shielded messages', color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { href: '/privacy', icon: Icons.Shield, label: 'Privacy Dashboard', desc: 'Shielded pool metrics', color: 'text-cipher-cyan', bg: 'bg-cipher-cyan/10' },
              { href: '/network', icon: Icons.Globe, label: 'Network Stats', desc: 'Nodes, hashrate & peers', color: 'text-cipher-green', bg: 'bg-cipher-green/10' },
              { href: '/docs', icon: Icons.Code, label: 'API Docs', desc: 'Developer reference', color: 'text-orange-400', bg: 'bg-orange-500/10' },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="card card-compact card-interactive flex items-center gap-3 !p-4"
              >
                <span className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0 ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-medium text-primary">{item.label}</div>
                  <div className="text-xs text-muted mt-0.5">{item.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
