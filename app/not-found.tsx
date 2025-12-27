'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NotFound() {
  const [glitchText, setGlitchText] = useState('404');

  // Glitch effect for the 404 text
  useEffect(() => {
    const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?0123456789';
    let interval: NodeJS.Timeout;

    const startGlitch = () => {
      let iterations = 0;
      interval = setInterval(() => {
        setGlitchText(
          '404'.split('').map((char, index) => {
            if (iterations > index * 3) return char;
            return glitchChars[Math.floor(Math.random() * glitchChars.length)];
          }).join('')
        );
        iterations += 1;
        if (iterations > 12) {
          clearInterval(interval);
          setGlitchText('404');
        }
      }, 50);
    };

    startGlitch();
    const repeatInterval = setInterval(startGlitch, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(repeatInterval);
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
      <div className="text-center animate-fade-in">
        {/* Glitchy 404 */}
        <div className="relative mb-6">
          <h1 className="text-[100px] sm:text-[150px] font-mono font-black text-transparent bg-clip-text bg-gradient-to-r from-cipher-cyan via-purple-500 to-cipher-green leading-none select-none">
            {glitchText}
          </h1>
          {/* Scan line effect */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-cipher-cyan to-transparent animate-scan"></div>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3 mb-8">
          <h2 className="text-xl sm:text-2xl font-bold font-mono text-cipher-cyan">
            PAGE_NOT_FOUND
          </h2>
          <p className="text-secondary text-base sm:text-lg max-w-lg mx-auto">
            This page doesn't exist on the blockchain. It may have been shielded,
            or perhaps it never existed at all.
          </p>
        </div>

        {/* Quick Links */}
        <div className="card max-w-2xl mx-auto !p-6">
          <p className="text-sm text-muted font-mono mb-6">
            <span className="text-cipher-cyan">TIP:</span> Search for a block height, transaction hash, or address above.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              href="/"
              className="card-bg hover:border-cipher-cyan border border-transparent rounded-lg p-3 transition-all group"
            >
              <div className="text-2xl mb-2">🏠</div>
              <div className="text-xs font-mono text-secondary group-hover:text-cipher-cyan transition-colors">Home</div>
            </Link>
            <Link
              href="/privacy"
              className="card-bg hover:border-purple-500 border border-transparent rounded-lg p-3 transition-all group"
            >
              <div className="text-2xl mb-2">🛡️</div>
              <div className="text-xs font-mono text-secondary group-hover:text-purple-400 transition-colors">Privacy Stats</div>
            </Link>
            <Link
              href="/network"
              className="card-bg hover:border-cipher-green border border-transparent rounded-lg p-3 transition-all group"
            >
              <div className="text-2xl mb-2">📊</div>
              <div className="text-xs font-mono text-secondary group-hover:text-cipher-green transition-colors">Network</div>
            </Link>
            <Link
              href="/docs"
              className="card-bg hover:border-amber-500 border border-transparent rounded-lg p-3 transition-all group"
            >
              <div className="text-2xl mb-2">📚</div>
              <div className="text-xs font-mono text-secondary group-hover:text-amber-400 transition-colors">API Docs</div>
            </Link>
          </div>
        </div>

        {/* Footer message */}
        <div className="mt-10">
          <p className="text-xs text-muted font-mono">
            Meanwhile, the Zcash network continues to process{' '}
            <span className="text-purple-400">private transactions</span> at this very moment...
          </p>
        </div>
      </div>
    </div>
  );
}
