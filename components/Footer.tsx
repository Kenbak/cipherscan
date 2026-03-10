'use client';

import Image from 'next/image';
import Link from 'next/link';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { isMainnet, MAINNET_URL, TESTNET_URL, NETWORK_LABEL } from '@/lib/config';

export function Footer() {
  const { theme } = useTheme();

  return (
    <footer className="footer-container border-t border-cipher-border mt-12 sm:mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-6 sm:gap-8">

          {/* Branding */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-3">
            <Link href="/" className="inline-flex items-center gap-2 mb-3 group">
              <Image
                src="/logo.png"
                alt="CipherScan Logo"
                width={24}
                height={24}
                quality={100}
                unoptimized
                className="group-hover:scale-105 transition-transform"
              />
              <span className="font-mono text-sm font-bold text-cipher-cyan tracking-wider">
                CIPHERSCAN
              </span>
            </Link>
            <p className="text-xs text-muted leading-relaxed mb-3">
              Privacy-first Zcash blockchain explorer.
            </p>
            <p className="text-[10px] text-muted/40 font-mono flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Shielded data remains private
            </p>
          </div>

          {/* Explore */}
          <div className="col-span-1 lg:col-span-2">
            <span className="text-[10px] font-mono text-muted/50 uppercase tracking-widest block mb-3">
              Explore
            </span>
            <div className="flex flex-col gap-1.5">
              <Link href="/network" className="footer-link text-xs font-mono">Network</Link>
              <Link href="/privacy" className="footer-link text-xs font-mono">Privacy</Link>
              <Link href="/privacy-risks" className="footer-link text-xs font-mono">Privacy Risks</Link>
              {isMainnet && <Link href="/crosschain" className="footer-link text-xs font-mono">ZEC Crosschain</Link>}
              <Link href="/mempool" className="footer-link text-xs font-mono">Mempool</Link>
            </div>
          </div>

          {/* Tools */}
          <div className="col-span-1 lg:col-span-2">
            <span className="text-[10px] font-mono text-muted/50 uppercase tracking-widest block mb-3">
              Tools
            </span>
            <div className="flex flex-col gap-1.5">
              <Link href="/tools" className="footer-link text-xs font-mono">Developer Tools</Link>
              <Link href="/decrypt" className="footer-link text-xs font-mono">Decrypt Memo</Link>
              <Link href="/tools/blend-check" className="footer-link text-xs font-mono">Blend Check</Link>
              {isMainnet && <Link href="/swap" className="footer-link text-xs font-mono">Buy ZEC</Link>}
              <Link href="/docs" className="footer-link text-xs font-mono">API Docs</Link>
            </div>
          </div>

          {/* Resources */}
          <div className="col-span-1 lg:col-span-2">
            <span className="text-[10px] font-mono text-muted/50 uppercase tracking-widest block mb-3">
              Resources
            </span>
            <div className="flex flex-col gap-1.5">
              <Link href="/learn" className="footer-link text-xs font-mono">Learn Zcash</Link>
              <Link href="/about" className="footer-link text-xs font-mono">About</Link>
            </div>
          </div>

          {/* Community */}
          <div className="col-span-1 lg:col-span-3">
            <span className="text-[10px] font-mono text-muted/50 uppercase tracking-widest block mb-3">
              Community
            </span>
            <div className="flex flex-col gap-1.5">
              <DonateButton variant="link" />
              <a
                href="https://twitter.com/cipherscan_app"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link text-xs font-mono"
              >
                X / Twitter
              </a>
              <a
                href="https://github.com/Kenbak/cipherscan"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link text-xs font-mono"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-8 pt-5">
          <div className="h-px footer-border border-t mb-5" aria-hidden />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left — copyright + powered by */}
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted/30">
              <span>© {new Date().getFullYear()} CipherScan</span>
              <span className="text-muted/20">|</span>
              <span>Powered by <span className="text-muted/50">Zebrad</span></span>
            </div>

            {/* Right — terminal status toggles */}
            <div className="flex items-center gap-3">
              {/* Network toggle */}
              <div className="flex items-center gap-1">
                <a
                  href={isMainnet ? TESTNET_URL : MAINNET_URL}
                  className="text-[10px] font-mono text-muted/40 hover:text-muted transition-colors"
                >
                  {isMainnet ? 'TESTNET' : 'MAINNET'}
                </a>
                <span className={`text-[10px] font-mono ${isMainnet ? 'text-cipher-yellow' : 'text-cipher-cyan'}`}>
                  [ {NETWORK_LABEL} ]
                </span>
              </div>

              {/* Theme toggle */}
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <span className="text-[10px] font-mono text-muted/40 uppercase">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
