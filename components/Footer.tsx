'use client';

import Image from 'next/image';
import Link from 'next/link';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { isMainnet, isCrosslink, MAINNET_URL, TESTNET_URL, NETWORK_LABEL } from '@/lib/config';

export function Footer() {
  const { theme } = useTheme();

  return (
    <footer className="footer-container border-t border-cipher-border mt-12 sm:mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Links grid — centered */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {/* Explore */}
          <div>
            <span className="text-[10px] font-mono text-muted/40 uppercase tracking-widest block mb-2">Explore</span>
            <div className="flex flex-col gap-1">
              <Link href="/blocks" className="footer-link text-[11px] font-mono">Blocks</Link>
              <Link href="/txs" className="footer-link text-[11px] font-mono">Transactions</Link>
              <Link href="/network" className="footer-link text-[11px] font-mono">Network</Link>
              <Link href="/charts" className="footer-link text-[11px] font-mono">Charts</Link>
              <Link href="/mempool" className="footer-link text-[11px] font-mono">Mempool</Link>
              {!isCrosslink && <Link href="/rich-list" className="footer-link text-[11px] font-mono">Rich List</Link>}
              <Link href="/reorgs" className="footer-link text-[11px] font-mono">Forks & Reorgs</Link>
            </div>
          </div>

          {/* Analytics */}
          {!isCrosslink && (
            <div>
              <span className="text-[10px] font-mono text-muted/40 uppercase tracking-widest block mb-2">Analytics</span>
              <div className="flex flex-col gap-1">
                <Link href="/privacy" className="footer-link text-[11px] font-mono">Privacy Score</Link>
                <Link href="/pools" className="footer-link text-[11px] font-mono">Shielded Pools</Link>
                <Link href="/ironwood" className="footer-link text-[11px] font-mono">Zcash Ironwood</Link>
                <Link href="/privacy-risks" className="footer-link text-[11px] font-mono">Risk Scanner</Link>
                {isMainnet && <Link href="/zodl" className="footer-link text-[11px] font-mono">Miner ZODL</Link>}
                {isMainnet && <Link href="/crosschain" className="footer-link text-[11px] font-mono">Cross-Chain</Link>}
              </div>
            </div>
          )}

          {/* Tools */}
          <div>
            <span className="text-[10px] font-mono text-muted/40 uppercase tracking-widest block mb-2">Tools</span>
            <div className="flex flex-col gap-1">
              <Link href="/tools" className="footer-link text-[11px] font-mono">Dev Tools</Link>
              <Link href="/decrypt" className="footer-link text-[11px] font-mono">Decrypt Memo</Link>
              <Link href="/tools/blend-check" className="footer-link text-[11px] font-mono">Blend Check</Link>
              <Link href="/docs" className="footer-link text-[11px] font-mono">API Docs</Link>
              {isMainnet && <a href="https://cipherswap.app/" target="_blank" rel="noopener" className="footer-link text-[11px] font-mono">CipherSwap</a>}
              <a href="https://www.cipherpay.app/" target="_blank" rel="noopener noreferrer" className="footer-link text-[11px] font-mono">CipherPay</a>
            </div>
          </div>

          {/* Resources + Community merged */}
          <div>
            <span className="text-[10px] font-mono text-muted/40 uppercase tracking-widest block mb-2">Resources</span>
            <div className="flex flex-col gap-1">
              <Link href="/learn" className="footer-link text-[11px] font-mono">Learn Zcash</Link>
              <Link href="/newsletter" className="footer-link text-[11px] font-mono">Newsletter</Link>
              <Link href="/about" className="footer-link text-[11px] font-mono">About</Link>
              <DonateButton variant="link" />
              <a href="https://twitter.com/cipherscan_app" target="_blank" rel="noopener noreferrer" className="footer-link text-[11px] font-mono">X / Twitter</a>
              <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className="footer-link text-[11px] font-mono">GitHub</a>
              <a href="https://www.youtube.com/@AtmosphereLabsDev" target="_blank" rel="noopener noreferrer" className="footer-link text-[11px] font-mono">YouTube</a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-6 pt-4 border-t border-cipher-border/30">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted/30">
              <Link href="/" className="inline-flex items-center gap-1 mr-1">
                <Image src="/logo.png" alt="CipherScan" width={14} height={14} quality={100} unoptimized />
                <span className="font-bold text-cipher-cyan tracking-wider">CIPHERSCAN</span>
              </Link>
              <span className="text-muted/20">|</span>
              <span>© {new Date().getFullYear()} CipherScan</span>
              <span className="text-muted/20">|</span>
              <span>Powered by <span className="text-muted/50">Zebrad</span></span>
              <span className="text-muted/20">|</span>
              <Link href="/privacy-policy" className="hover:text-muted/60 transition-colors">Privacy</Link>
              <span className="text-muted/20">·</span>
              <Link href="/terms" className="hover:text-muted/60 transition-colors">Terms</Link>
            </div>

            <div className="flex items-center gap-3">
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
