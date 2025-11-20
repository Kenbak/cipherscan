'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { NETWORK_LABEL, NETWORK_COLOR, isMainnet, MAINNET_URL, TESTNET_URL } from '@/lib/config';

interface PriceData {
  price: number;
  change24h: number;
}

export function NavBar() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        // Call CoinGecko directly (no need for proxy API)
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

    // Refresh price every 60 seconds
    const priceInterval = setInterval(fetchPrice, 60000);

    return () => clearInterval(priceInterval);
  }, []);

  return (
    <nav className="bg-cipher-surface/80 backdrop-blur-md border-b border-cipher-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3 group flex-shrink-0">
            <Image
              src="/logo.png"
              alt="CipherScan Logo"
              width={32}
              height={32}
              className="transition-transform group-hover:scale-110 sm:w-10 sm:h-10"
            />
            <div>
              <h1 className="text-sm sm:text-xl font-bold font-mono text-cipher-cyan group-hover:text-cipher-green transition-colors">
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
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-cipher-cyan transition-colors"
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

            {/* Tools Dropdown (Desktop) - Only on Testnet */}
            {!isMainnet && (
              <div className="hidden md:block relative">
                <button
                  onClick={() => setToolsOpen(!toolsOpen)}
                  onBlur={() => setTimeout(() => setToolsOpen(false), 200)}
                  className="flex items-center gap-1 text-xs font-mono text-gray-400 hover:text-cipher-cyan transition-colors px-3 py-2 rounded-lg hover:bg-cipher-surface"
                >
                  <span>Tools</span>
                <svg
                  className={`w-3 h-3 transition-transform ${toolsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
                {toolsOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-cipher-surface border border-cipher-border rounded-lg shadow-xl py-2 z-50">
                    <Link
                      href="/network"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors"
                    >
                      <span>Network Stats</span>
                    </Link>
                    <Link
                      href="/privacy"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors"
                    >
                      <span>Privacy Dashboard</span>
                    </Link>
                    <Link
                      href="/mempool"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors"
                    >
                      <span>Mempool Viewer</span>
                    </Link>
                    <Link
                      href="/decrypt"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors"
                    >
                      <span>Decrypt Memo</span>
                    </Link>
                    <div className="border-t border-cipher-border my-2"></div>
                    <Link
                      href="/docs"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors"
                    >
                      <span>API Docs</span>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Price Display */}
            {priceData && (
              <div className="hidden lg:flex items-center space-x-2 border-l border-cipher-border pl-4">
                <span className="text-xs font-mono text-gray-500">ZEC</span>
                <span className="text-sm font-bold font-mono text-white">
                  ${priceData.price.toFixed(2)}
                </span>
                <span className={`text-xs font-mono ${priceData.change24h >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}`}>
                  {priceData.change24h >= 0 ? '↑' : '↓'} {Math.abs(priceData.change24h).toFixed(2)}%
                </span>
              </div>
            )}

            {/* Network Switcher (Desktop) */}
            <div className="hidden md:flex items-center space-x-1 bg-cipher-surface border border-cipher-border rounded-lg px-1 sm:px-2 py-1">
              <a
                href={TESTNET_URL}
                className={`text-[10px] sm:text-xs font-mono px-1.5 sm:px-2 py-1 rounded transition-colors ${
                  !isMainnet
                    ? 'bg-cipher-cyan text-cipher-bg font-bold'
                    : 'text-gray-400 hover:text-cipher-cyan'
                }`}
              >
                TESTNET
              </a>
              <a
                href={MAINNET_URL}
                className={`text-[10px] sm:text-xs font-mono px-1.5 sm:px-2 py-1 rounded transition-colors ${
                  isMainnet
                    ? 'bg-cipher-green text-cipher-bg font-bold'
                    : 'text-gray-400 hover:text-cipher-green'
                }`}
              >
                MAINNET
              </a>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-cipher-border py-4 space-y-2">
            {/* Tools Links - Only on Testnet */}
            {!isMainnet && (
              <>
                <Link
                  href="/network"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors rounded"
                >
                  Network Stats
                </Link>
                <Link
                  href="/privacy"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors rounded"
                >
                  Privacy Dashboard
                </Link>
            <Link
              href="/mempool"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors rounded"
            >
              Mempool Viewer
            </Link>
            <Link
              href="/decrypt"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors rounded"
            >
              Decrypt Memo
            </Link>
                <Link
                  href="/docs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2 text-sm font-mono text-gray-300 hover:bg-cipher-bg hover:text-cipher-cyan transition-colors rounded"
                >
                  API Docs
                </Link>
              </>
            )}

            {/* Network Switcher */}
            <div className="px-4 pt-4 border-t border-cipher-border">
              <p className="text-xs text-gray-500 font-mono mb-2">NETWORK</p>
              <div className="flex items-center space-x-2">
                <a
                  href={TESTNET_URL}
                  className={`flex-1 text-center text-xs font-mono px-3 py-2 rounded transition-colors ${
                    !isMainnet
                      ? 'bg-cipher-cyan text-cipher-bg font-bold'
                      : 'bg-cipher-surface text-gray-400 hover:text-cipher-cyan border border-cipher-border'
                  }`}
                >
                  TESTNET
                </a>
                <a
                  href={MAINNET_URL}
                  className={`flex-1 text-center text-xs font-mono px-3 py-2 rounded transition-colors ${
                    isMainnet
                      ? 'bg-cipher-green text-cipher-bg font-bold'
                      : 'bg-cipher-surface text-gray-400 hover:text-cipher-green border border-cipher-border'
                  }`}
                >
                  MAINNET
                </a>
              </div>
            </div>

            {/* Price Display (Mobile) */}
            {priceData && (
              <div className="px-4 pt-4 border-t border-cipher-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-500">ZEC Price</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold font-mono text-white">
                      ${priceData.price.toFixed(2)}
                    </span>
                    <span className={`text-xs font-mono ${priceData.change24h >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}`}>
                      {priceData.change24h >= 0 ? '↑' : '↓'} {Math.abs(priceData.change24h).toFixed(2)}%
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
