'use client';

import Image from 'next/image';
import Link from 'next/link';
import { DonateButton } from '@/components/DonateButton';
import { useTheme } from '@/contexts/ThemeContext';

export function Footer() {
  const { theme } = useTheme();

  return (
    <footer className="footer-container border-t border-cipher-border/30 mt-12 sm:mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-6 sm:gap-8">

          {/* Branding - Full width on mobile, 4 cols on lg */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2 mb-3 group">
              <Image
                src={theme === 'light' ? '/logo_light.png' : '/logo.png'}
                alt="CipherScan Logo"
                width={28}
                height={28}
                quality={100}
                unoptimized
                className="group-hover:scale-105 transition-transform"
              />
              <span className="font-mono text-lg font-bold text-cipher-cyan">
                CIPHERSCAN
              </span>
            </Link>
            <p className="text-sm text-secondary mb-3">
              Privacy-first Zcash blockchain explorer.
            </p>
            {/* Privacy Note */}
            <p className="text-xs text-muted font-mono flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Shielded data remains private</span>
            </p>
          </div>

          {/* Quick Links - 2 columns on mobile */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-2">
            <span className="text-xs text-muted font-mono uppercase tracking-wider block mb-3">
              Explore
            </span>
            <div className="flex flex-col gap-2">
              <Link href="/privacy" className="footer-link text-sm">
                Privacy
              </Link>
              <Link href="/network" className="footer-link text-sm">
                Network
              </Link>
              <Link href="/mempool" className="footer-link text-sm">
                Mempool
              </Link>
            </div>
          </div>

          <div className="col-span-1 sm:col-span-2 lg:col-span-2">
            <span className="text-xs text-muted font-mono uppercase tracking-wider block mb-3">
              Tools
            </span>
            <div className="flex flex-col gap-2">
              <Link href="/decrypt" className="footer-link text-sm">
                Decrypt
              </Link>
              <Link href="/learn" className="footer-link text-sm">
                Learn
              </Link>
              <Link href="/docs" className="footer-link text-sm">
                API Docs
              </Link>
            </div>
          </div>

          {/* Support & Social - Full width on mobile */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-4 flex flex-col items-start sm:items-end gap-4 mt-2 sm:mt-0">
            {/* Donate Button */}
            <DonateButton />

            {/* Social Links */}
            <div className="flex items-center gap-3">
              <a
                href="https://twitter.com/cipherscan_app"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link p-2 rounded-lg hover:bg-cipher-hover transition-colors"
                aria-label="Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com/Kenbak/cipherscan"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link p-2 rounded-lg hover:bg-cipher-hover transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
            </div>

            {/* Tech Stack */}
            <p className="text-xs text-muted font-mono">
              Powered by <span className="text-cipher-cyan">Zebrad</span>
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-cipher-border/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="text-xs text-muted font-mono">
            © {new Date().getFullYear()} CipherScan
          </p>
          <p className="text-xs text-muted">
            Privacy-first explorer for the Zcash community
          </p>
        </div>
      </div>
    </footer>
  );
}
