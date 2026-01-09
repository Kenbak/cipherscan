'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { detectAddressType } from '@/lib/zcash';
import { findAddressByLabel, searchAddressesByLabel } from '@/lib/address-labels';

interface SearchBarProps {
  compact?: boolean; // Mode compact pour la navbar
}

interface LabelSuggestion {
  address: string;
  label: string;
  isOfficial: boolean;
  category?: string;
}

// Category styling config
const categoryConfig: Record<string, { icon: string; color: string; bg: string }> = {
  'Exchange': { icon: 'exchange', color: 'text-cipher-cyan', bg: 'bg-cipher-cyan/10' },
  'Mining Pool': { icon: 'mining', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  'Foundation': { icon: 'foundation', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  'Donation': { icon: 'heart', color: 'text-pink-400', bg: 'bg-pink-400/10' },
  'Service': { icon: 'service', color: 'text-cipher-green', bg: 'bg-cipher-green/10' },
  'Faucet': { icon: 'faucet', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  'Custom': { icon: 'user', color: 'text-gray-400', bg: 'bg-gray-400/10' },
};

export function SearchBar({ compact = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<LabelSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Search for label suggestions as user types
  useEffect(() => {
    if (query.length >= 2) {
      const addressType = detectAddressType(query);
      const isNumber = !isNaN(Number(query));
      const isHex = /^[a-fA-F0-9]+$/.test(query);

      if (addressType === 'invalid' && !isNumber && !isHex) {
        const results = searchAddressesByLabel(query);
        setSuggestions(results.slice(0, 5));
        setShowSuggestions(results.length > 0);
        setSelectedIndex(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query]);

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: LabelSuggestion) => {
    setShowSuggestions(false);
    setQuery('');
    router.push(`/address/${encodeURIComponent(suggestion.address)}`);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) return;

    const trimmedQuery = query.trim()
      .replace(/[<>\"']/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');

    if (trimmedQuery.length > 500) {
      console.warn('Query too long, truncating');
      return;
    }

    const addressType = detectAddressType(trimmedQuery);

    if (addressType !== 'invalid') {
      router.push(`/address/${encodeURIComponent(trimmedQuery)}`);
    } else if (!isNaN(Number(trimmedQuery))) {
      router.push(`/block/${encodeURIComponent(trimmedQuery)}`);
    } else if (/^[a-fA-F0-9]+$/.test(trimmedQuery)) {
      router.push(`/tx/${encodeURIComponent(trimmedQuery)}`);
    } else {
      const addressByLabel = findAddressByLabel(trimmedQuery);
      if (addressByLabel) {
        router.push(`/address/${encodeURIComponent(addressByLabel)}`);
      } else {
        console.warn('No matching address, transaction, or label found');
      }
    }
  };

  // Suggestions dropdown component
  const SuggestionsDropdown = () => {
    if (!showSuggestions || suggestions.length === 0) return null;

    const getCategoryIcon = (category: string) => {
      switch (category) {
        case 'Exchange':
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          );
        case 'Mining Pool':
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          );
        case 'Foundation':
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          );
        case 'Donation':
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          );
        case 'Service':
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          );
        case 'Faucet':
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          );
        default: // Custom or unknown
          return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          );
      }
    };

    const getCategoryStyle = (category: string) => {
      return categoryConfig[category] || categoryConfig['Custom'];
    };

    return (
      <div
        ref={suggestionsRef}
        className="absolute top-full left-0 right-0 mt-2 suggestions-dropdown rounded-xl z-[100] overflow-hidden"
      >
        {suggestions.map((suggestion, index) => {
          const category = suggestion.category || 'Custom';
          const style = getCategoryStyle(category);
          
          return (
            <button
              key={suggestion.address}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-all duration-150 ${
                index === selectedIndex ? 'suggestion-item-active' : 'suggestion-item'
              }`}
            >
              {/* Icon */}
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.bg}`}>
                <span className={style.color}>
                  {getCategoryIcon(category)}
                </span>
              </span>
              
              {/* Label & Address */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate suggestion-label">{suggestion.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${style.bg} ${style.color}`}>
                    {category}
                  </span>
                </div>
                <div className="text-xs text-muted font-mono truncate mt-0.5">
                  {suggestion.address.slice(0, 16)}...{suggestion.address.slice(-8)}
                </div>
              </div>
              
              {/* Arrow */}
              <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>
    );
  };

  // Compact version for navbar
  if (compact) {
    return (
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-cipher-cyan font-mono text-sm">
            {'>'}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search address, tx hash, block number..."
            className="w-full pl-8 pr-3 py-2 text-sm search-input"
          />
          <SuggestionsDropdown />
        </div>
      </form>
    );
  }

  // Full version for homepage - Enhanced
  return (
    <form onSubmit={handleSearch} className="max-w-3xl mx-auto px-2 sm:px-0 relative z-20">
      {/* Search Container with Glow Effect */}
      <div className="relative group">
        {/* Glow effect on focus */}
        <div
          className={`absolute -inset-1 bg-gradient-to-r from-cipher-cyan/30 via-purple-500/20 to-cipher-cyan/30 rounded-xl blur-lg transition-opacity duration-500 ${
            isFocused ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Search Input Container */}
        <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.01]' : ''}`}>
          {/* Terminal prompt */}
          <div className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-cipher-cyan font-mono text-lg sm:text-xl font-bold">
            {'>'}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              if (query.length >= 2 && suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => setIsFocused(false)}
            placeholder="Search address, tx, block, or label..."
            className={`w-full pl-10 sm:pl-12 pr-28 sm:pr-36 py-4 sm:py-5 text-sm sm:text-base font-mono
              search-input-hero border-2 rounded-xl text-primary
              placeholder:text-muted transition-all duration-300
              ${isFocused
                ? 'border-cipher-cyan shadow-lg shadow-cipher-cyan/10'
                : 'border-cipher-border hover:border-cipher-cyan/50'
              }
              focus:outline-none`}
          />

          {/* Keyboard shortcut hint */}
          <div className="hidden sm:flex absolute right-28 sm:right-36 top-1/2 -translate-y-1/2 items-center gap-1 text-muted">
            <kbd className="kbd-hint">⌘</kbd>
            <kbd className="kbd-hint">K</kbd>
          </div>

          {/* Search Button */}
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2
              inline-flex items-center justify-center
              px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg
              font-mono font-bold text-xs sm:text-sm
              bg-gradient-to-b from-cipher-cyan to-[#00B8E0]
              text-[#08090F]
              hover:from-[#00E0FF] hover:to-cipher-cyan
              transition-colors duration-150"
          >
            SEARCH
          </button>

          <SuggestionsDropdown />
        </div>
      </div>

      {/* Example Buttons */}
      <div className="mt-4 sm:mt-6 flex flex-wrap gap-2 sm:gap-3 justify-center items-center">
        <span className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider">Try:</span>
        <button
          type="button"
          onClick={() => setQuery('354939')}
          className="example-tag example-tag-cyan"
        >
          Block #354939
        </button>
        <button
          type="button"
          onClick={() => setQuery('t1abc...')}
          className="example-tag example-tag-default"
        >
          t-address
        </button>
        <button
          type="button"
          onClick={() => setQuery('zs1...')}
          className="example-tag example-tag-purple"
        >
          z-address
          <span>🛡️</span>
        </button>
      </div>
    </form>
  );
}
