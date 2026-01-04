'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { detectAddressType } from '@/lib/zcash';

interface SearchBarProps {
  compact?: boolean; // Mode compact pour la navbar
}

export function SearchBar({ compact = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

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
    } else {
      // It's a transaction ID (validate it's hex)
      if (/^[a-fA-F0-9]+$/.test(trimmedQuery)) {
        router.push(`/tx/${encodeURIComponent(trimmedQuery)}`);
      } else {
        console.warn('Invalid transaction ID format');
      }
    }
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
            placeholder="Search address, tx hash, block number..."
            className="w-full pl-8 pr-3 py-2 text-sm search-input"
          />
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search address, tx, block number..."
            className="w-full pl-8 sm:pl-10 pr-24 sm:pr-32 py-3 sm:py-5 text-sm sm:text-base search-input border-2"
          />
          <button
            type="submit"
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-cipher-cyan hover:bg-cipher-green text-white px-3 sm:px-6 py-2 sm:py-2.5 rounded-md font-mono font-semibold transition-all shadow-lg shadow-cipher-cyan/30 hover:shadow-cipher-green/30 text-xs sm:text-sm"
          >
            SEARCH
          </button>
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
