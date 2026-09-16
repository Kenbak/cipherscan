'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getNavigation, getActiveNavigationHref } from '@/lib/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import Link from 'next/link';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NETWORK, isMainnet, MAINNET_URL, TESTNET_URL, CROSSLINK_URL } from '@/lib/config';

const LINK_CLASS = 'footer-link inline-block py-1.5 text-caption font-mono';
const SECONDARY_LINK_CLASS = 'inline-flex min-h-9 items-center text-caption font-mono text-secondary hover:text-primary hover:underline underline-offset-4 transition-colors';
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

        <div className="mt-8 pt-6 border-t border-cipher-border-subtle grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-[max-content_max-content] md:gap-x-16">
          <nav aria-label="Community">
            <FooterHeading>Community</FooterHeading>
            <ul className="flex flex-col items-start md:flex-row md:flex-wrap md:items-center md:gap-x-5">
              <li><a href="https://twitter.com/cipherscan_app" target="_blank" rel="noopener noreferrer" className={SECONDARY_LINK_CLASS}>X ↗</a></li>
              <li><a href="https://github.com/Kenbak/cipherscan" target="_blank" rel="noopener noreferrer" className={SECONDARY_LINK_CLASS}>GitHub ↗</a></li>
              <li><a href="https://www.youtube.com/@AtmosphereLabsDev" target="_blank" rel="noopener noreferrer" className={SECONDARY_LINK_CLASS}>YouTube ↗</a></li>
              <li className="[&>button]:min-h-9 [&>button]:text-secondary [&>button:hover]:text-primary [&>button:hover]:underline [&>button]:underline-offset-4"><DonateButton variant="link" /></li>
            </ul>
          </nav>
          <nav aria-label="Ecosystem">
            <FooterHeading>Ecosystem</FooterHeading>
            <ul className="flex flex-col items-start md:flex-row md:flex-wrap md:items-center md:gap-x-5">
              {isMainnet && <li><a href="https://cipherswap.app/" target="_blank" rel="noopener noreferrer" className={SECONDARY_LINK_CLASS}>CipherSwap ↗</a></li>}
              <li><a href="https://www.cipherpay.app/" target="_blank" rel="noopener noreferrer" className={SECONDARY_LINK_CLASS}>CipherPay ↗</a></li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 pt-5 border-t border-cipher-border-subtle">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex min-h-11 items-center" aria-label="ZecBlock home">
              <BrandLogo compact />
            </Link>
            <div className="[&>button]:min-h-11 [&>button]:min-w-11 [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center">
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6">
            <nav aria-label="Network" className="inline-flex max-w-full flex-wrap items-center gap-x-4 text-caption font-mono">
              {[
                { id: 'mainnet', label: 'Mainnet', href: MAINNET_URL },
                { id: 'testnet', label: 'Testnet', href: TESTNET_URL },
                { id: 'crosslink', label: 'Crosslink', href: CROSSLINK_URL },
              ].map(network => network.id === NETWORK ? (
                <span key={network.id} aria-current="true" className="inline-flex min-h-9 items-center text-secondary underline decoration-cipher-border underline-offset-4">
                  {network.label}
                </span>
              ) : (
                <a key={network.id} href={network.href} className="footer-link inline-flex min-h-9 items-center">
                  {network.label}
                </a>
              ))}
            </nav>
            <nav aria-label="Legal and service information" className="flex flex-wrap items-center gap-x-5 sm:order-first text-caption font-mono">
              <Link href="/privacy-policy" className="footer-link inline-flex min-h-11 items-center">Privacy Policy</Link>
              <Link href="/terms" className="footer-link inline-flex min-h-11 items-center">Terms</Link>
              <a href="https://status.cipherscan.app" target="_blank" rel="noopener noreferrer" className="footer-link inline-flex min-h-11 items-center" aria-label="Service status (opens in a new tab)">Status ↗</a>
            </nav>
          </div>

          <p className="mt-5 text-caption text-muted">
            <span className="block sm:inline">© {new Date().getFullYear()} ZecBlock</span>
            <span className="hidden sm:inline" aria-hidden="true"> · </span>
            <span className="mt-1 block sm:mt-0 sm:inline">Zcash blockchain explorer</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
