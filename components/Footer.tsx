'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getNavigation, getActiveNavigationHref } from '@/lib/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import Link from 'next/link';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NETWORK, isMainnet, MAINNET_URL, TESTNET_URL, CROSSLINK_URL, NETWORK_LABEL } from '@/lib/config';

const LINK_CLASS = 'footer-link inline-block py-1.5 text-caption font-mono';
const categories = getNavigation(NETWORK, 'footer');

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
  const pathname = usePathname();
  const activeHref = getActiveNavigationHref(pathname, categories);

  return (
    <footer className="footer-container border-t border-cipher-border mt-12 sm:mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <nav aria-label="Footer navigation" className={`grid grid-cols-2 gap-x-6 gap-y-8 ${categories.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
          {categories.map(category => (
            <div key={category.id}>
              <FooterHeading>{category.label}</FooterHeading>
              <ul className="flex flex-col">
                {category.items.map(item => (
                  <li key={item.href}>
                    <Link href={item.href} className={`${LINK_CLASS} ${activeHref === item.href ? '!text-primary underline underline-offset-4' : ''}`}
                      aria-current={activeHref === item.href ? 'page' : undefined}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-8 pt-6 border-t border-cipher-border-subtle flex flex-wrap items-center gap-x-8 gap-y-4">
          <nav aria-label="Community" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="type-label text-muted">Community</span>
            <a href="https://twitter.com/cipherscan_app" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>X ↗</a>
            <a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>GitHub ↗</a>
            <a href="https://www.youtube.com/@AtmosphereLabsDev" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>YouTube ↗</a>
            <DonateButton variant="link" />
          </nav>
          <nav aria-label="Ecosystem" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="type-label text-muted">Ecosystem</span>
            {isMainnet && <a href="https://cipherswap.app/" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>CipherSwap ↗</a>}
            <a href="https://www.cipherpay.app/" target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>CipherPay ↗</a>
          </nav>
        </div>

        {/* Bottom bar. Rows rather than one dot-separated inline run: at
            mobile widths that run wrapped mid-list and orphaned a separator
            on its own line. Links are separated by gap, which cannot orphan
            a glyph; the one remaining dot sits in the attribution line, which
            fits on a single line at 390px. */}
        <div className="mt-10 pt-5 border-t border-cipher-border-subtle">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link href="/" className="inline-flex items-center" aria-label="ZecBlock home">
                <BrandLogo compact />
              </Link>
              <nav aria-label="Legal and service information" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption font-mono">
                <Link href="/privacy-policy" className="footer-link">Privacy Policy</Link>
                <Link href="/terms" className="footer-link">Terms</Link>
                <a href="https://status.cipherscan.app" target="_blank" rel="noopener noreferrer" className="footer-link">Service Status ↗</a>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <span className="text-caption font-mono text-secondary">{NETWORK_LABEL}</span>
              <nav aria-label="Switch network" className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {[
                  { id: 'mainnet', label: 'mainnet', href: MAINNET_URL },
                  { id: 'testnet', label: 'testnet', href: TESTNET_URL },
                  { id: 'crosslink', label: 'Crosslink', href: CROSSLINK_URL },
                ].filter(network => network.id !== NETWORK).map(network => (
                  <a key={network.id} href={network.href} className={LINK_CLASS}>Switch to {network.label}</a>
                ))}
              </nav>
              <ThemeToggle />
            </div>
          </div>

          <p className="mt-5 text-caption font-mono text-muted">
            © {new Date().getFullYear()} ZecBlock · Zcash blockchain explorer
          </p>
        </div>
      </div>
    </footer>
  );
}
