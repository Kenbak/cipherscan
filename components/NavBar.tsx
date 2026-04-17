'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { NETWORK_LABEL, NETWORK_COLOR, isMainnet, isCrosslink, MAINNET_URL, TESTNET_URL, CROSSLINK_URL } from '@/lib/config';
import { API_CONFIG, getApiUrl, usePostgresApiClient } from '@/lib/api-config';


interface PriceData {
  price: number;
  change24h: number;
}

interface MenuItem {
  href: string;
  label: string;
  desc: string;
}

export function NavBar() {
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [mempoolCount, setMempoolCount] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const { theme } = useTheme();

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
        const response = await fetch(`${API_CONFIG.POSTGRES_API_URL}/api/price`);
        if (response.ok) {
          const data = await response.json();
          setPriceData({
            price: data.price,
            change24h: data.change24h,
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

  const usePostgresApi = usePostgresApiClient();

  useEffect(() => {
    const fetchMempoolCount = async () => {
      try {
        const apiUrl = usePostgresApi
          ? `${getApiUrl()}/api/mempool`
          : '/api/mempool';

        const response = await fetch(apiUrl);
        if (!response.ok) return;

        const result = await response.json();
        if (result.success) {
          setMempoolCount(result.count ?? result.transactions?.length ?? 0);
        }
      } catch {}
    };

    fetchMempoolCount();
    const interval = setInterval(fetchMempoolCount, 15000);
    return () => clearInterval(interval);
  }, [usePostgresApi]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setToolsOpen(false);
  }, [pathname]);

  const analyticsItems: MenuItem[] = [
    { href: '/network', label: 'Network Stats', desc: 'Nodes, hashrate & peers' },
    ...(isCrosslink
      ? [
          { href: '/chain', label: 'Chain View', desc: 'PoW + PoS chain visualizer' },
          { href: '/validators', label: 'Validators', desc: 'Finalizer roster & staking' },
        ]
      : [
          { href: '/privacy', label: 'Privacy Dashboard', desc: 'Shielded pool metrics' },
          { href: '/privacy-risks', label: 'Privacy Risks', desc: 'Detect risky patterns' },
        ]),
    ...(isMainnet ? [{ href: '/crosschain', label: 'ZEC Crosschain', desc: 'Cross-chain swap analytics' }] : []),
  ];

  const toolsItems: MenuItem[] = [
    { href: '/tools', label: 'Developer Tools', desc: 'All tools & API reference' },
    { href: '/decrypt', label: 'Decrypt Memo', desc: 'Decode shielded messages' },
    { href: '/tools/blend-check', label: 'Blend Check', desc: 'See if your amount blends in' },
  ];

  const resourcesItems: MenuItem[] = [
    { href: '/learn', label: 'Learn Zcash', desc: 'Beginner guide' },
    ...(isCrosslink
      ? [{ href: '/learn/crosslink', label: 'Learn Crosslink', desc: 'PoW+PoS finality & staking' }]
      : []),
    { href: '/newsletter', label: 'Newsletter', desc: 'Weekly Zcash intelligence' },
    { href: '/docs', label: 'API Docs', desc: 'Developer reference' },
    { href: '/about', label: 'About', desc: 'Our story & mission' },
  ];

  const DropdownLink = ({ item, onClick }: { item: MenuItem; onClick: () => void }) => (
    <Link
      href={item.href}
      onClick={onClick}
      className="flex flex-col px-2.5 py-2 dropdown-item rounded-md transition-colors duration-150"
    >
      <span className="text-sm font-mono">{item.label}</span>
      <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
    </Link>
  );

  const SectionLabel = ({ label }: { label: string }) => (
    <div className="px-2.5 pt-2 pb-1">
      <span className="text-[10px] font-mono text-muted tracking-widest uppercase">{label}</span>
    </div>
  );

  return (
    <>
      <nav className="navbar-container backdrop-blur-xl border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-4">
            {/* Logo — clean, no subtitle */}
            <Link href="/" className="flex items-center space-x-2 sm:space-x-3 group flex-shrink-0">
              <Image
                src={theme === 'light' ? '/logo.png' : '/logo.png'}
                alt="CipherScan Logo"
                width={24}
                height={24}
                quality={100}
                unoptimized
                className="transition-transform duration-200 group-hover:scale-105 sm:w-10 sm:h-10 object-contain"
              />
              <div>
                <h1 className="text-sm sm:text-lg font-bold font-mono text-cipher-cyan-bright group-hover:text-cipher-yellow transition-colors duration-200">
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

            {/* Right side — 5 elements max: Explore, Price, Buy ZEC, hamburger (mobile) */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-muted hover:text-cipher-cyan transition-all duration-150"
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

              {/* Mempool link (Desktop) */}
              <Link
                href="/mempool"
                className="hidden md:flex items-center gap-1.5 text-xs font-mono text-muted hover:text-cipher-cyan px-2 py-2 rounded-md transition-colors duration-150"
              >
                {mempoolCount !== null && mempoolCount > 0 && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-50"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cipher-green"></span>
                  </span>
                )}
                <span>Mempool</span>
                {mempoolCount !== null && mempoolCount > 0 && (
                  <span className="text-secondary">{mempoolCount}</span>
                )}
              </Link>

              {/* Explore Dropdown (Desktop) — the "everything drawer" */}
              <div className="hidden md:block relative" ref={toolsRef}>
                <button
                  onClick={() => setToolsOpen(!toolsOpen)}
                  className="flex items-center gap-1.5 text-xs font-mono text-muted hover:text-cipher-cyan px-2 py-2 rounded-md transition-colors duration-150"
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

                {toolsOpen && (
                  <div className="absolute right-0 mt-2 w-[420px] dropdown-menu rounded-lg shadow-xl border p-2 z-50 animate-scale-in origin-top-right">
                    <div className="grid grid-cols-2 gap-1">
                      {/* Left column — Analytics */}
                      <div>
                        <SectionLabel label="Analytics" />
                        {analyticsItems.map((item) => (
                          <DropdownLink key={item.href} item={item} onClick={() => setToolsOpen(false)} />
                        ))}
                      </div>

                      {/* Right column — Tools + Resources */}
                      <div>
                        <SectionLabel label="Tools" />
                        {toolsItems.map((item) => (
                          <DropdownLink key={item.href} item={item} onClick={() => setToolsOpen(false)} />
                        ))}
                        <div className="border-t border-cipher-border my-1.5 mx-2.5" />
                        <SectionLabel label="Resources" />
                        {resourcesItems.map((item) => (
                          <DropdownLink key={item.href} item={item} onClick={() => setToolsOpen(false)} />
                        ))}
                      </div>
                    </div>

                    {/* Utility footer — Network, Theme, Donate */}
                    <div className="border-t border-cipher-border mt-2 pt-2 px-1">
                      <div className="flex items-center justify-between">
                        {/* Network switcher */}
                        <div className="flex items-center gap-1">
                          <a
                            href={TESTNET_URL}
                            className={`text-[10px] font-mono px-2 py-1 rounded transition-all duration-150 ${
                              !isMainnet && !isCrosslink
                                ? 'bg-cipher-cyan/15 text-cipher-cyan'
                                : 'text-muted hover:text-primary'
                            }`}
                          >
                            TESTNET
                          </a>
                          <a
                            href={MAINNET_URL}
                            className={`text-[10px] font-mono px-2 py-1 rounded transition-all duration-150 ${
                              isMainnet
                                ? 'bg-cipher-yellow/15 text-cipher-yellow'
                                : 'text-muted hover:text-primary'
                            }`}
                          >
                            MAINNET
                          </a>
                          <a
                            href={CROSSLINK_URL}
                            className={`text-[10px] font-mono px-2 py-1 rounded transition-all duration-150 ${
                              isCrosslink
                                ? 'bg-purple-500/15 text-purple-400'
                                : 'text-muted hover:text-primary'
                            }`}
                          >
                            CROSSLINK
                          </a>
                        </div>

                        {/* Theme + Donate */}
                        <div className="flex items-center gap-1">
                          <ThemeToggle />
                          <DonateButton compact />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Conversion zone — divider + price + Buy ZEC as plain text */}
              <div className="hidden md:flex items-center gap-3">
                <div className="w-px h-4 bg-gray-500/30" />

                {priceData && (
                  <div className="hidden lg:flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-muted">ZEC</span>
                    <span className="text-muted">${priceData.price.toFixed(2)}</span>
                    <span className={priceData.change24h >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}>
                      [{priceData.change24h >= 0 ? '↑' : '↓'}{Math.abs(priceData.change24h).toFixed(1)}%]
                    </span>
                  </div>
                )}

                {priceData && isMainnet && <div className="hidden lg:block w-px h-4 bg-gray-500/30" />}

                {isMainnet && (
                  <Link
                    href="/swap"
                    className="flex items-center gap-1 text-xs font-mono font-bold text-cipher-yellow hover:opacity-80 transition-opacity duration-150"
                  >
                    <span className="text-cipher-yellow/50">&gt;</span>
                    Buy ZEC
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Search (only on non-home pages) */}
          {!isHomePage && (
            <div className="md:hidden pb-3">
              <SearchBar compact />
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Full-Screen Overlay Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 w-full max-w-sm flex flex-col mobile-drawer shadow-2xl animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b navbar-border flex-shrink-0">
              <span className="text-sm font-bold font-mono text-cipher-cyan-bright">CIPHERSCAN</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md text-muted hover:text-cipher-cyan transition-all"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {/* Market zone — price + Buy ZEC on one line */}
              <div className="flex items-center mx-2.5 mb-3 pb-3 border-b navbar-border gap-3">
                {priceData && (
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-muted">ZEC</span>
                    <span className="text-muted">${priceData.price.toFixed(2)}</span>
                    <span className={priceData.change24h >= 0 ? 'text-cipher-green' : 'text-cipher-orange'}>
                      [{priceData.change24h >= 0 ? '↑' : '↓'}{Math.abs(priceData.change24h).toFixed(1)}%]
                    </span>
                  </div>
                )}
                {priceData && isMainnet && <div className="w-px h-4 bg-gray-500/30" />}
                {isMainnet && (
                  <Link
                    href="/swap"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-1 font-mono text-xs font-bold text-cipher-yellow"
                  >
                    <span className="text-cipher-yellow/50">&gt;</span>
                    Buy ZEC
                  </Link>
                )}
              </div>

              {/* Mempool — promoted link */}
              <Link
                href="/mempool"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2.5 mobile-menu-item rounded-md transition-colors duration-150 mb-1"
              >
                {mempoolCount !== null && mempoolCount > 0 && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-50"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cipher-green"></span>
                  </span>
                )}
                <span className="text-sm font-mono">Mempool</span>
                {mempoolCount !== null && mempoolCount > 0 && (
                  <span className="text-[11px] font-mono text-muted">{mempoolCount}</span>
                )}
              </Link>

              <div className="border-t navbar-border my-2" />

              {/* Analytics */}
              <SectionLabel label="Analytics" />
              {analyticsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col px-2.5 py-2.5 mobile-menu-item rounded-md transition-colors duration-150"
                >
                  <span className="text-sm font-mono">{item.label}</span>
                  <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
                </Link>
              ))}

              <div className="border-t navbar-border my-2" />

              {/* Tools */}
              <SectionLabel label="Tools" />
              {toolsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col px-2.5 py-2.5 mobile-menu-item rounded-md transition-colors duration-150"
                >
                  <span className="text-sm font-mono">{item.label}</span>
                  <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
                </Link>
              ))}

              <div className="border-t navbar-border my-2" />

              {/* Resources */}
              <SectionLabel label="Resources" />
              {resourcesItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col px-2.5 py-2.5 mobile-menu-item rounded-md transition-colors duration-150"
                >
                  <span className="text-sm font-mono">{item.label}</span>
                  <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
                </Link>
              ))}

              {/* Status bar — terminal style */}
              <div className="pt-4 mt-2 border-t navbar-border">
                <div className="flex items-center justify-between px-2.5">
                  {/* Network */}
                  <div className="flex items-center gap-1.5">
                    {!isMainnet && !isCrosslink && (
                      <span className="text-[10px] font-mono text-cipher-cyan">[ TESTNET ]</span>
                    )}
                    {isMainnet && (
                      <span className="text-[10px] font-mono text-cipher-yellow">[ MAINNET ]</span>
                    )}
                    {isCrosslink && (
                      <span className="text-[10px] font-mono text-purple-400">[ CROSSLINK ]</span>
                    )}
                    {!isCrosslink && (
                      <a href={CROSSLINK_URL} className="text-[10px] font-mono text-muted/40 hover:text-muted transition-colors">
                        CROSSLINK
                      </a>
                    )}
                    {!isMainnet && (
                      <a href={MAINNET_URL} className="text-[10px] font-mono text-muted/40 hover:text-muted transition-colors">
                        MAINNET
                      </a>
                    )}
                    {isMainnet && (
                      <a href={TESTNET_URL} className="text-[10px] font-mono text-muted/40 hover:text-muted transition-colors">
                        TESTNET
                      </a>
                    )}
                  </div>

                  {/* Theme + Donate */}
                  <div className="flex items-center gap-2">
                    <DonateButton compact />
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
