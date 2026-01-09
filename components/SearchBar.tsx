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
}

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

    return (
      <div
        ref={suggestionsRef}
        className="absolute top-full left-0 right-0 mt-2 suggestions-dropdown rounded-xl z-[100] overflow-hidden"
      >
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.address}
            type="button"
            onClick={() => selectSuggestion(suggestion)}
            className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-all duration-150 ${
              index === selectedIndex ? 'suggestion-item-active' : 'suggestion-item'
            }`}
          >
            {/* Icon */}
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              suggestion.isOfficial
                ? 'bg-cipher-cyan/10'
                : 'bg-purple-500/10'
            }`}>
              {suggestion.isOfficial ? (
                <svg className="w-4 h-4 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </span>
            
            {/* Label & Address */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate suggestion-label">{suggestion.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                  suggestion.isOfficial
                    ? 'bg-cipher-cyan/15 text-cipher-cyan'
                    : 'bg-purple-500/15 text-purple-400'
                }`}>
                  {suggestion.isOfficial ? 'Official' : 'Custom'}
                </span>
              </div>
              <div className="text-xs text-muted font-mono truncate mt-0.5">
                {suggestion.address.slice(0, 16)}...{suggestion.address.slice(-8)}
              </div>
            </div>
            
            {/* Arrow */}
            <svg className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
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
