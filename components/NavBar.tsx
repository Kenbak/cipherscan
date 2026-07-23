'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { DonateButton } from '@/components/DonateButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { NETWORK_LABEL, NETWORK_COLOR, isMainnet, isCrosslink, MAINNET_URL, TESTNET_URL, CROSSLINK_URL } from '@/lib/config';

interface MenuItem {
  href: string;
  label: string;
  desc: string;
}

interface NavCategory {
  id: string;
  label: string;
  items: MenuItem[];
}

export function NavBar() {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAccordion, setMobileAccordion] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const { theme } = useTheme();

  const closeAll = useCallback(() => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
    setMobileAccordion(null);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    closeAll();
  }, [pathname, closeAll]);

  // Build category arrays (network-aware)
  const exploreItems: MenuItem[] = [
    { href: '/blocks', label: 'Blocks', desc: 'Latest blocks' },
    { href: '/txs', label: 'Transactions', desc: 'Recent transactions' },
    { href: '/network', label: 'Network', desc: 'Hashrate, peers & difficulty' },
    { href: '/charts', label: 'Charts', desc: 'All metrics in one place' },
    ...(isCrosslink
      ? [
          { href: '/chain', label: 'Chain View', desc: 'PoW + PoS chain visualizer' },
          { href: '/validators', label: 'Validators', desc: 'Finalizer roster & staking' },
          { href: '/bootstrap', label: 'Node Bootstrap', desc: 'Skip genesis resync' },
        ]
      : [
          { href: '/mining', label: 'Mining', desc: 'Pool distribution & miner behavior' },
        ]),
    ...(isCrosslink ? [] : [{ href: '/rich-list', label: 'Rich List', desc: 'Top addresses by balance' }]),
    { href: '/reorgs', label: 'Forks & Reorgs', desc: 'Chain forks & orphaned blocks' },
    ...(isCrosslink ? [{ href: '/fork-monitor', label: 'Fork Monitor', desc: 'Chain forks & node health' }] : []),
  ];

  const analyticsItems: MenuItem[] = isCrosslink
    ? []
    : [
        { href: '/privacy', label: 'Privacy Score', desc: 'Network privacy health' },
        { href: '/pools', label: 'Shielded Pools', desc: 'Supply, flows & turnstile' },
        { href: '/turnstile', label: 'Turnstile', desc: 'Where deshielded ZEC goes' },
        { href: '/ironwood', label: 'Zcash Ironwood', desc: 'NU6.3 upgrade & migration tracker' },
        { href: '/privacy-risks', label: 'Risk Scanner', desc: 'Detect risky patterns' },
        { href: '/privacy/wallets', label: 'Wallet Analysis', desc: 'Fingerprints & anonymity sets' },
        ...(isMainnet ? [{ href: '/zodl', label: 'Miner ZODL', desc: 'Which pools stack vs sell' }] : []),
        ...(isMainnet ? [{ href: '/usage-clock', label: 'Usage Clock', desc: 'Activity rhythm vs geography' }] : []),
        ...(isMainnet ? [{ href: '/crosschain', label: 'Cross-Chain', desc: 'Cross-chain swap analytics' }] : []),
      ];

  const toolsItems: MenuItem[] = [
    { href: '/tools', label: 'Dev Tools', desc: 'All tools & API reference' },
    { href: '/decrypt', label: 'Decrypt Memo', desc: 'Decode shielded messages' },
    { href: '/tools/blend-check', label: 'Blend Check', desc: 'See if your amount blends in' },
  ];

  const resourcesItems: MenuItem[] = [
    { href: '/docs', label: 'API Docs', desc: 'Developer reference' },
    { href: '/learn', label: 'Learn Zcash', desc: 'Beginner guide' },
    ...(isCrosslink ? [{ href: '/learn/crosslink', label: 'Learn Crosslink', desc: 'PoW+PoS finality & staking' }] : []),
    { href: '/newsletter', label: 'Newsletter', desc: 'Weekly Zcash intelligence' },
    { href: '/about', label: 'About', desc: 'Our story & mission' },
  ];

  const categories: NavCategory[] = [
    { id: 'explore', label: 'Explore', items: exploreItems },
    ...(analyticsItems.length > 0 ? [{ id: 'analytics', label: 'Analytics', items: analyticsItems }] : []),
    { id: 'tools', label: 'Tools', items: toolsItems },
    { id: 'resources', label: 'Resources', items: resourcesItems },
  ];

  const toggleDropdown = (id: string) => {
    setOpenDropdown(prev => prev === id ? null : id);
  };

  const DropdownLink = ({ item, onClick }: { item: MenuItem; onClick: () => void }) => (
    <Link
      href={item.href}
      onClick={onClick}
      className="flex flex-col px-3 py-2 dropdown-item rounded-md transition-colors duration-150"
    >
      <span className="text-[13px] font-mono">{item.label}</span>
      <span className="text-[10px] text-muted leading-tight">{item.desc}</span>
    </Link>
  );

  return (
    <>
      <nav className="navbar-container backdrop-blur-xl border-b sticky top-0 z-50" ref={navRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-3">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2 group flex-shrink-0">
              <Image
                src="/logo.png"
                alt="CipherScan Logo"
                width={24}
                height={24}
                quality={100}
                unoptimized
                className="transition-transform duration-200 group-hover:scale-105 sm:w-8 sm:h-8 object-contain"
              />
              <div>
                <span className="text-base sm:text-lg font-bold font-mono text-cipher-cyan-bright group-hover:text-cipher-yellow transition-colors duration-200">
                  CIPHERSCAN
                </span>
                <p className={`text-[10px] sm:text-[11px] font-mono ${NETWORK_COLOR} leading-tight`}>[ {NETWORK_LABEL} ]</p>
              </div>
            </Link>

            {/* Desktop: Horizontal category dropdowns */}
            <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
              {categories.map(cat => (
                <div key={cat.id} className="relative">
                  <button
                    onClick={() => toggleDropdown(cat.id)}
                    className={`flex items-center gap-1 text-[13px] font-mono px-2.5 py-1.5 rounded-md transition-colors duration-150 ${
                      openDropdown === cat.id ? 'text-cipher-cyan bg-cipher-hover' : 'text-muted hover:text-primary'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <svg
                      className={`w-3 h-3 transition-transform duration-200 ${openDropdown === cat.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {openDropdown === cat.id && (
                    <div className="absolute left-0 mt-1 w-56 dropdown-menu rounded-lg shadow-xl border p-1 z-50 animate-scale-in origin-top-left">
                      {cat.items.map(item => (
                        <DropdownLink key={item.href} item={item} onClick={() => setOpenDropdown(null)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}

            </div>

            {/* Desktop: Search (non-home) */}
            {!isHomePage && (
              <div className="hidden md:block flex-1 max-w-xs">
                <SearchBar compact />
              </div>
            )}

            {/* Right: utilities */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Buy ZEC — mainnet only, desktop */}
              {isMainnet && (
                <a
                  href="https://cipherswap.app/"
                  target="_blank"
                  rel="noopener"
                  title="Buy ZEC on CipherSwap"
                  className="hidden md:flex items-center gap-1 text-xs font-mono font-bold text-cipher-yellow hover:opacity-80 transition-opacity duration-150 px-2 py-1"
                >
                  <span className="text-cipher-yellow/50">&gt;</span>
                  Buy ZEC
                </a>
              )}

              {/* Network switcher — globe icon dropdown, desktop only */}
              <div className="hidden md:block relative">
                <button
                  onClick={() => toggleDropdown('network')}
                  className={`p-2 rounded-md transition-colors duration-150 ${
                    openDropdown === 'network' ? 'text-primary bg-cipher-hover' : 'text-muted hover:text-primary'
                  }`}
                  title={isMainnet ? 'Mainnet' : isCrosslink ? 'Crosslink' : 'Testnet'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.6 9h16.8M3.6 15h16.8" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z" />
                  </svg>
                </button>

                {openDropdown === 'network' && (
                  <div className="absolute right-0 mt-1 w-36 dropdown-menu rounded-lg shadow-xl border p-1 z-50 animate-scale-in origin-top-right">
                    <a
                      href={MAINNET_URL}
                      className={`block px-3 py-2 rounded-md text-[12px] font-mono transition-colors ${
                        isMainnet ? 'text-primary bg-cipher-hover' : 'text-secondary dropdown-item'
                      }`}
                    >
                      Mainnet
                    </a>
                    <a
                      href={TESTNET_URL}
                      className={`block px-3 py-2 rounded-md text-[12px] font-mono transition-colors ${
                        !isMainnet && !isCrosslink ? 'text-primary bg-cipher-hover' : 'text-secondary dropdown-item'
                      }`}
                    >
                      Testnet
                    </a>
                    <a
                      href={CROSSLINK_URL}
                      className={`block px-3 py-2 rounded-md text-[12px] font-mono transition-colors ${
                        isCrosslink ? 'text-primary bg-cipher-hover' : 'text-secondary dropdown-item'
                      }`}
                    >
                      Crosslink
                    </a>
                  </div>
                )}
              </div>

              {/* Theme + Donate — desktop only */}
              <div className="hidden md:flex items-center gap-1">
                <ThemeToggle />
                <DonateButton compact />
              </div>

              {/* Mobile: hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-muted hover:text-cipher-cyan transition-all duration-150"
                aria-label="Menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
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

      {/* Mobile Full-Screen Overlay Drawer with Accordion Categories */}
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body with accordion categories */}
            <div className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {categories.map(cat => (
                <div key={cat.id}>
                  <button
                    onClick={() => setMobileAccordion(prev => prev === cat.id ? null : cat.id)}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-md transition-colors duration-150 text-left mobile-menu-item"
                  >
                    <span className="text-[10px] font-mono text-muted tracking-widest uppercase">{cat.label}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${mobileAccordion === cat.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {mobileAccordion === cat.id && (
                    <div className="pb-2 animate-fade-in">
                      {cat.items.map(item => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex flex-col px-3 py-2 ml-2 mobile-menu-item rounded-md transition-colors duration-150"
                        >
                          <span className="text-sm font-mono">{item.label}</span>
                          <span className="text-[10px] text-muted mt-0.5">{item.desc}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}


              {/* Buy ZEC — mainnet only */}
              {isMainnet && (
                <div className="px-3 pt-3">
                  <a
                    href="https://cipherswap.app/"
                    target="_blank"
                    rel="noopener"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg font-mono text-sm font-bold text-cipher-yellow border border-cipher-yellow/30 hover:bg-cipher-yellow/10 transition-all"
                  >
                    <span className="text-cipher-yellow/50">&gt;</span>
                    Buy ZEC
                  </a>
                </div>
              )}

              {/* Footer — network switcher + utilities */}
              <div className="pt-4 mt-2 border-t navbar-border">
                <div className="flex flex-col gap-3 px-3">
                  {/* Network links */}
                  <div className="flex items-center gap-2">
                    <a
                      href={MAINNET_URL}
                      className={`text-[11px] font-mono px-2.5 py-1.5 rounded-md transition-all ${
                        isMainnet ? 'bg-cipher-hover text-primary' : 'text-muted hover:text-primary'
                      }`}
                    >
                      Mainnet
                    </a>
                    <a
                      href={TESTNET_URL}
                      className={`text-[11px] font-mono px-2.5 py-1.5 rounded-md transition-all ${
                        !isMainnet && !isCrosslink ? 'bg-cipher-hover text-primary' : 'text-muted hover:text-primary'
                      }`}
                    >
                      Testnet
                    </a>
                    <a
                      href={CROSSLINK_URL}
                      className={`text-[11px] font-mono px-2.5 py-1.5 rounded-md transition-all ${
                        isCrosslink ? 'bg-cipher-hover text-primary' : 'text-muted hover:text-primary'
                      }`}
                    >
                      Crosslink
                    </a>
                  </div>

                  {/* Theme + Donate */}
                  <div className="flex items-center justify-end gap-2">
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
