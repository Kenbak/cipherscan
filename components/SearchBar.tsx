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
  isKnown: boolean;
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
      // Only search if query is not a valid address/tx/block
      const addressType = detectAddressType(query);
      const isNumber = !isNaN(Number(query));
      const isHex = /^[a-fA-F0-9]+$/.test(query);

      if (addressType === 'invalid' && !isNumber && !isHex) {
        const results = searchAddressesByLabel(query);
        setSuggestions(results.slice(0, 5)); // Max 5 suggestions
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

    // Sanitize input: remove any HTML/script tags and dangerous characters
    const trimmedQuery = query.trim()
      .replace(/[<>\"']/g, '') // Remove HTML-related characters
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers

    // Validate length (prevent extremely long inputs)
    // Unified addresses can be 300+ characters, so we allow up to 500
    if (trimmedQuery.length > 500) {
      console.warn('Query too long, truncating');
      return;
    }

    // Check if it's an address using the proper detection function
    const addressType = detectAddressType(trimmedQuery);

    if (addressType !== 'invalid') {
      // It's a valid address (transparent, shielded, or unified)
      router.push(`/address/${encodeURIComponent(trimmedQuery)}`);
    } else if (!isNaN(Number(trimmedQuery))) {
      // It's a block number
      router.push(`/block/${encodeURIComponent(trimmedQuery)}`);
    } else if (/^[a-fA-F0-9]+$/.test(trimmedQuery)) {
      // It's a transaction ID (hex format)
      router.push(`/tx/${encodeURIComponent(trimmedQuery)}`);
    } else {
      // Try to find an address by label (e.g., "Lockbox", "Foundation")
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
        className="absolute top-full left-0 right-0 mt-1 suggestions-dropdown rounded-lg shadow-xl border z-50 overflow-hidden"
      >
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.address}
            type="button"
            onClick={() => selectSuggestion(suggestion)}
            className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
              index === selectedIndex ? 'suggestion-item-active' : 'suggestion-item'
            }`}
          >
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
              suggestion.isKnown
                ? 'bg-cipher-cyan/20 text-cipher-cyan'
                : 'bg-cipher-purple/20 text-cipher-purple'
            }`}>
              {suggestion.isKnown ? '🏛️' : '👤'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate suggestion-label">{suggestion.label}</div>
              <div className="text-xs text-muted font-mono truncate">
                {suggestion.address.slice(0, 12)}...{suggestion.address.slice(-8)}
              </div>
            </div>
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

  // Full version for homepage
  return (
    <form onSubmit={handleSearch} className="max-w-3xl mx-auto px-2 sm:px-0">
      <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-cipher-cyan/20 to-cipher-purple/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="relative">
          <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-cipher-cyan font-mono text-base sm:text-lg">
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
            className="w-full pl-8 sm:pl-10 pr-24 sm:pr-32 py-3 sm:py-5 text-sm sm:text-base search-input border-2"
          />
          <button
            type="submit"
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-cipher-cyan hover:bg-cipher-green text-white px-3 sm:px-6 py-2 sm:py-2.5 rounded-md font-mono font-semibold transition-all shadow-lg shadow-cipher-cyan/30 hover:shadow-cipher-green/30 text-xs sm:text-sm"
          >
            SEARCH
          </button>
          <SuggestionsDropdown />
        </div>
      </div>
      <div className="mt-2 sm:mt-4 flex flex-wrap gap-1.5 sm:gap-3 justify-center items-center text-[10px] sm:text-xs">
        <span className="text-gray-500 font-mono uppercase tracking-wider">Examples:</span>
        <button
          type="button"
          onClick={() => setQuery('354939')}
          className="text-cipher-cyan hover:text-cipher-green example-btn px-1.5 sm:px-2 py-0.5 sm:py-1"
        >
          Block #354939
        </button>
        <span className="text-gray-600 hidden sm:inline">|</span>
        <button
          type="button"
          onClick={() => setQuery('t1abc...')}
          className="text-gray-400 hover:text-cipher-cyan example-btn px-1.5 sm:px-2 py-0.5 sm:py-1"
        >
          t-address
        </button>
        <span className="text-gray-600 hidden sm:inline">|</span>
        <button
          type="button"
          onClick={() => setQuery('zs1...')}
          className="text-cipher-green hover:text-cipher-cyan example-btn px-1.5 sm:px-2 py-0.5 sm:py-1"
        >
          z-address 🛡️
        </button>
      </div>
    </form>
  );
}
