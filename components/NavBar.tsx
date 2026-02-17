'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { NETWORK_LABEL, NETWORK_COLOR, isMainnet, MAINNET_URL, TESTNET_URL } from '@/lib/config';

interface PriceData {
  price: number;
  change24h: number;
}

export function NavBar() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const { theme } = useTheme();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true'
        );
        if (response.ok) {
          const data = await response.json();
          setPriceData({
            price: data.zcash.usd,
            change24h: data.zcash.usd_24h_change,
          });
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      }
    };

    fetchPrice();
    const priceInterval = setInterval(fetchPrice, 60000);
    return () => clearInterval(priceInterval);
  }, []);

  const menuItems = [
    { sectionLabel: 'Analytics' },
    { href: '/network', label: 'Network Stats', desc: 'Nodes, hashrate & peers' },
    { href: '/privacy', label: 'Privacy Dashboard', desc: 'Shielded pool metrics' },
    { href: '/privacy-risks', label: 'Privacy Risks', desc: 'Detect risky patterns' },
    ...(isMainnet ? [{ href: '/flows', label: 'ZEC Flows', desc: 'Shielding & deshielding' }] : []),
    { href: '/mempool', label: 'Mempool', desc: 'Pending transactions' },
    { divider: true },
    { sectionLabel: 'Tools' },
    { href: '/tools', label: 'Developer Tools', desc: 'All tools & API reference' },
    { href: '/decrypt', label: 'Decrypt Memo', desc: 'Decode shielded messages' },
    { divider: true },
    { sectionLabel: 'Resources' },
    { href: '/learn', label: 'Learn Zcash', desc: 'Beginner guide' },
    { href: '/docs', label: 'API Docs', desc: 'Developer reference' },
  ];

  return (
    <nav className="navbar-container backdrop-blur-xl border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3 group flex-shrink-0">
            <Image
              src={theme === 'light' ? '/logo_light.png' : '/logo.png'}
              alt="CipherScan Logo"
              width={32}
              height={32}
              quality={100}
              unoptimized
              className="transition-transform duration-200 group-hover:scale-105 sm:w-10 sm:h-10"
            />
            <div>
              <h1 className="text-sm sm:text-lg font-bold font-mono text-cipher-cyan group-hover:text-cipher-green transition-colors duration-200">
                CIPHERSCAN
              </h1>
              <p className={`text-[10px] sm:text-xs font-mono ${NETWORK_COLOR}`}>[ {NETWORK_LABEL} ]</p>
            </div>
          </Link>

          {/* Search Bar (only on non-home pages) */}
          {!isHomePage && (
            <div className="hidden md:block flex-1 max-w-md mx-4">
              <SearchBar compact />
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-muted hover:text-cipher-cyan hover:bg-cipher-hover transition-all duration-150"
              aria-label="Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Tools Dropdown (Desktop) */}
            <div className="hidden md:block relative" ref={toolsRef}>
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                className="tools-btn flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-md"
              >
                <span>Explore</span>
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {toolsOpen && (
                <div className="absolute right-0 mt-2 w-60 dropdown-menu rounded-lg shadow-xl border p-1.5 z-50 animate-scale-in origin-top-right">
                  {menuItems.map((item, index) =>
                    'divider' in item ? (
                      <div key={`divider-${index}`} className="border-t border-cipher-border my-1.5" />
                    ) : 'sectionLabel' in item ? (
                      <div key={`section-${index}`} className="px-3 pt-2 pb-1">
                        <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{item.sectionLabel}</span>
                      </div>
                    ) : (
                      <Link
                        key={item.href}
                        href={item.href!}
                        onClick={() => setToolsOpen(false)}
                        className="flex flex-col px-3 py-2 dropdown-item rounded-md transition-colors duration-150"
                      >
                        <span className="text-sm font-mono">{item.label}</span>
                        {'desc' in item && item.desc && (
                          <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
                        )}
                      </Link>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Price Display */}
            {priceData && (
              <div className="hidden lg:flex items-center space-x-2 border-l navbar-border pl-3">
                <span className="text-xs font-mono text-muted">ZEC</span>
                <span className="text-sm font-bold font-mono price-value">
                  ${priceData.price.toFixed(2)}
                </span>
                <span className={`text-xs font-mono ${priceData.change24h >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}`}>
                  {priceData.change24h >= 0 ? '↑' : '↓'} {Math.abs(priceData.change24h).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Network Switcher (Desktop) */}
            <div className="hidden md:flex items-center network-switcher border rounded-lg p-0.5">
              <a
                href={TESTNET_URL}
                className={`text-[10px] sm:text-xs font-mono px-2 py-1 rounded-md transition-all duration-150 ${
                  !isMainnet
                    ? 'bg-cipher-cyan text-cipher-bg font-bold shadow-sm'
                    : 'network-link hover:bg-cipher-hover'
                }`}
              >
                TESTNET
              </a>
              <a
                href={MAINNET_URL}
                className={`text-[10px] sm:text-xs font-mono px-2 py-1 rounded-md transition-all duration-150 ${
                  isMainnet
                    ? 'bg-cipher-green text-white font-bold shadow-sm'
                    : 'network-link hover:bg-cipher-hover'
                }`}
              >
                MAINNET
              </a>
            </div>

            {/* Theme Toggle (Desktop) */}
            <div className="hidden md:block">
              <ThemeToggle />
            </div>

            {/* Donate Button (Desktop) */}
            <div className="hidden md:block">
              <DonateButton compact />
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t navbar-border py-4 space-y-1 animate-fade-in">
            {/* Theme Toggle + Donate (Mobile) */}
            <div className="px-2 pb-3 flex items-center justify-between gap-2">
              <DonateButton />
              <ThemeToggle />
            </div>

            {/* Tools Links */}
            {menuItems.map((item, index) =>
              'divider' in item ? (
                <div key={`divider-${index}`} className="border-t navbar-border my-2" />
              ) : 'sectionLabel' in item ? (
                <div key={`section-${index}`} className="px-3 pt-3 pb-1">
                  <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{item.sectionLabel}</span>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href!}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col px-3 py-2.5 mobile-menu-item rounded-md transition-colors duration-150"
                >
                  <span className="text-sm font-mono">{item.label}</span>
                  {'desc' in item && item.desc && (
                    <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
                  )}
                </Link>
              )
            )}

            {/* Network Switcher */}
            <div className="px-3 pt-4 border-t navbar-border">
              <p className="text-xs text-muted font-mono mb-2">NETWORK</p>
              <div className="flex items-center space-x-2">
                <a
                  href={TESTNET_URL}
                  className={`flex-1 text-center text-xs font-mono px-3 py-2 rounded-md transition-all duration-150 ${
                    !isMainnet
                      ? 'bg-cipher-cyan text-cipher-bg font-bold'
                      : 'network-switcher-inactive'
                  }`}
                >
                  TESTNET
                </a>
                <a
                  href={MAINNET_URL}
                  className={`flex-1 text-center text-xs font-mono px-3 py-2 rounded-md transition-all duration-150 ${
                    isMainnet
                      ? 'bg-cipher-green text-white font-bold'
                      : 'network-switcher-inactive'
                  }`}
                >
                  MAINNET
                </a>
              </div>
            </div>

            {/* Price Display (Mobile) */}
            {priceData && (
              <div className="px-3 pt-4 border-t navbar-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted">ZEC Price</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold font-mono price-value">
                      ${priceData.price.toFixed(2)}
                    </span>
                    <span className={`text-xs font-mono ${priceData.change24h >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}`}>
                      {priceData.change24h >= 0 ? '↑' : '↓'} {Math.abs(priceData.change24h).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Search (only on non-home pages) */}
        {!isHomePage && (
          <div className="md:hidden pb-3">
            <SearchBar compact />
          </div>
        )}
      </div>
    </nav>
  );
}
