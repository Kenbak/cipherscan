'use client';

import { ReactNode } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import Link from 'next/link';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isMainnet, isCrosslink, MAINNET_URL, TESTNET_URL, NETWORK_LABEL } from '@/lib/config';

const LINK_CLASS = 'footer-link text-caption font-mono';

/**
 * Column key. Same `> KEY` device as PageHeader's eyebrow and SectionHeader,
 * so the footer reads as part of the same system rather than a separate
 * plain-uppercase treatment.
 */
function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <p className="type-label text-muted uppercase mb-3">
      <span className="opacity-50">{'>'}</span> {children}
    </p>
  );
}

export function Footer() {
  const otherNetworkUrl = isMainnet ? TESTNET_URL : MAINNET_URL;
  const otherNetworkLabel = isMainnet ? 'Testnet' : 'Mainnet';

  return (
    <footer className="footer-container border-t border-cipher-border mt-12 sm:mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        {/* Full container width, left-anchored: the previous max-w-3xl centered
            block sat inboard of the logo, hero and feed tables above it. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-8">
          <div>
            <FooterHeading>Explore</FooterHeading>
            <div className="flex flex-col gap-1.5">
              <Link href="/blocks" className={LINK_CLASS}>Blocks</Link>
              <Link href="/txs" className={LINK_CLASS}>Transactions</Link>
              <Link href="/network" className={LINK_CLASS}>Network</Link>
              <Link href="/charts" className={LINK_CLASS}>Charts</Link>
              <Link href="/mempool" className={LINK_CLASS}>Mempool</Link>
              {!isCrosslink && <Link href="/rich-list" className={LINK_CLASS}>Rich List</Link>}
              <Link href="/reorgs" className={LINK_CLASS}>Forks &amp; Reorgs</Link>
            </div>
          </div>

          {!isCrosslink && (
            <div>
              <FooterHeading>Analytics</FooterHeading>
              <div className="flex flex-col gap-1.5">
                <Link href="/privacy" className={LINK_CLASS}>Privacy Score</Link>
                <Link href="/pools" className={LINK_CLASS}>Shielded Pools</Link>
                <Link href="/turnstile" className={LINK_CLASS}>Turnstile</Link>
                <Link href="/ironwood" className={LINK_CLASS}>Zcash Ironwood</Link>
                <Link href="/privacy-risks" className={LINK_CLASS}>Risk Scanner</Link>
                {isMainnet && <Link href="/zodl" className={LINK_CLASS}>Miner ZODL</Link>}
                {isMainnet && <Link href="/crosschain" className={LINK_CLASS}>Cross-Chain</Link>}
              </div>
            </div>
          )}

          <div>
            <FooterHeading>Tools</FooterHeading>
            <div className="flex flex-col gap-1.5">
              <Link href="/tools" className={LINK_CLASS}>Dev Tools</Link>
              <Link href="/decrypt" className={LINK_CLASS}>Decrypt Memo</Link>
              <Link href="/tools/blend-check" className={LINK_CLASS}>Blend Check</Link>
              <Link href="/docs" className={LINK_CLASS}>API Docs</Link>
              {isMainnet && <a href="https://cipherswap.app/" target="_blank" rel="noopener" className={LINK_CLASS}>CipherSwap</a>}
              <a href="https://www.cipherpay.app/" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>CipherPay</a>
            </div>
          </div>

          <div>
            <FooterHeading>Resources</FooterHeading>
            <div className="flex flex-col gap-1.5">
              <Link href="/learn" className={LINK_CLASS}>Learn Zcash</Link>
              <Link href="/newsletter" className={LINK_CLASS}>Newsletter</Link>
              <Link href="/about" className={LINK_CLASS}>About</Link>
              <Link href="/press" className={LINK_CLASS}>Press &amp; Brand</Link>
              <DonateButton variant="link" />
              <a href="https://twitter.com/cipherscan_app" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>X / Twitter</a>
              <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>GitHub</a>
              <a href="https://www.youtube.com/@AtmosphereLabsDev" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>YouTube</a>
            </div>
          </div>
        </div>

        {/* Bottom bar. Rows rather than one dot-separated inline run: at
            mobile widths that run wrapped mid-list and orphaned a separator
            on its own line. Links are separated by gap, which cannot orphan
            a glyph; the one remaining dot sits in the attribution line, which
            fits on a single line at 390px. */}
        <div className="mt-10 pt-5 border-t border-cipher-border-subtle">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link href="/" className="inline-flex items-center" aria-label="ZecBlock home">
                <BrandLogo compact />
              </Link>
              <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption font-mono">
                <Link href="/privacy-policy" className="footer-link">Privacy</Link>
                <Link href="/terms" className="footer-link">Terms</Link>
                <a href="https://status.cipherscan.app" target="_blank" rel="noopener noreferrer" className="footer-link">Status</a>
              </nav>
            </div>

            {/* State the current network, and give the cross-link a verb. A
                bare "Testnet" here reads as a status label — you cannot tell
                whether it names where you are or where the link goes. */}
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-caption font-mono text-secondary">{NETWORK_LABEL}</span>
              <a href={otherNetworkUrl} className="footer-link text-caption font-mono">
                Switch to {otherNetworkLabel.toLowerCase()}
              </a>
              <ThemeToggle />
            </div>
          </div>

          <p className="mt-5 text-caption font-mono text-muted">
            © {new Date().getFullYear()} ZecBlock · Powered by Zebrad
          </p>
        </div>
      </div>
    </footer>
  );
}
