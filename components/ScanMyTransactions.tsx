'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

// Icons
const Icons = {
  Search: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  X: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

// Time display helper (Gmail style)
function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // If today, show time
  if (msgDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // If this year, show "Nov 14"
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Otherwise show "Nov 14, 2023"
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface ScanResult {
  txid: string;
  height: number;
  timestamp: number;
  memo: string;
}

export function ScanMyTransactions() {
  const [viewingKey, setViewingKey] = useState('');
  const [scanPeriod, setScanPeriod] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Ref to scroll to results
  const resultsRef = useRef<HTMLDivElement>(null);

  const scanMyTransactions = async () => {
    if (!viewingKey) {
      setScanError('Please enter your Viewing Key');
      return;
    }

    // Validate viewing key format
    const sanitizedKey = viewingKey.trim();
    if (!sanitizedKey.startsWith('uviewtest') && !sanitizedKey.startsWith('uview')) {
      setScanError('Invalid viewing key format. Must start with "uviewtest" or "uview".');
      return;
    }

    setScanning(true);
    setScanError(null);
    setScanResults([]);
    setScanProgress(0);
    setTotalBlocks(0);
    setCurrentBlock(0);

    try {
      const { decryptMemo } = await import('@/lib/wasm-loader');

      const apiUrl = process.env.NEXT_PUBLIC_POSTGRES_API_URL || 'https://api.testnet.cipherscan.app';

      // Get current block height
      const infoRes = await fetch(`${apiUrl}/api/info`);
      if (!infoRes.ok) {
        throw new Error(`Failed to fetch blockchain info: ${infoRes.status}`);
      }
      const infoData = await infoRes.json();
      const currentHeight = infoData.blocks || infoData.height || 0;

      // Calculate start height based on time period
      const periodToBlocks = {
        '1h': 48,     // ~1 hour (75s per block)
        '6h': 288,    // ~6 hours
        '24h': 1152,  // ~24 hours
        '7d': 8064,   // ~7 days
      };

      const blocksToScan = periodToBlocks[scanPeriod];
      const startHeight = Math.max(0, currentHeight - blocksToScan);

      setTotalBlocks(blocksToScan);

      // Fetch all Orchard TXs in this range using batch API
      const scanRes = await fetch(`${apiUrl}/api/scan/orchard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startHeight,
          endHeight: currentHeight,
        }),
      });

      if (!scanRes.ok) {
        throw new Error(`Failed to scan Orchard transactions: ${scanRes.status}`);
      }

      const scanData = await scanRes.json();
      const orchardTxs = scanData.transactions || [];

      if (orchardTxs.length === 0) {
        setScanError(`No Orchard transactions found in the last ${scanPeriod}.`);
        setScanning(false);
        return;
      }

      // Fetch raw TXs in batch
      const txids = orchardTxs.map((tx: any) => tx.txid);

      const batchRes = await fetch(`${apiUrl}/api/tx/raw/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txids }),
      });

      if (!batchRes.ok) {
        throw new Error(`Failed to fetch raw transactions: ${batchRes.status}`);
      }

      const batchData = await batchRes.json();
      const allRawTxs = new Map<string, string>();
      batchData.transactions.forEach((tx: any) => {
        allRawTxs.set(tx.txid, tx.hex);
      });

      // Now decrypt each TX
      let txsProcessed = 0;
      const totalTxs = orchardTxs.length;
      let foundCount = 0; // Track locally

      for (const tx of orchardTxs) {
        try {
          // Update current block being processed
          setCurrentBlock(tx.block_height);

          // Get raw hex from our batch
          const rawHex = allRawTxs.get(tx.txid);
          if (rawHex) {
            const memoText = await decryptMemo(rawHex, sanitizedKey);

            // Success! This tx belongs to user
            foundCount++; // Increment local counter
            setScanResults(prev => [...prev, {
              txid: tx.txid,
              height: tx.block_height,
              timestamp: tx.timestamp,
              memo: memoText,
            }]);
          }
        } catch (err) {
          // Not our tx, skip silently
        }

        txsProcessed++;
        setScanProgress(Math.round((txsProcessed / totalTxs) * 100));
      }

      // Use local counter instead of state
      if (foundCount === 0) {
        setScanError(`Scanned ${totalTxs} Orchard transactions in the last ${scanPeriod} but none matched your viewing key.`);
      } else {
        // Scroll to results after a short delay to let state update
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    } catch (err: any) {
      console.error('❌ [SCAN] Fatal error:', err);
      setScanError(err.message || 'Failed to scan transactions');
    } finally {
      setScanning(false);
    }
  };

  const resetScan = () => {
    setScanResults([]);
    setScanError(null);
    setScanProgress(0);
    setTotalBlocks(0);
    setCurrentBlock(0);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Input Card */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-cipher-cyan/10 border border-cipher-cyan/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold">Encrypted Inbox Scanner</h2>
            <p className="text-xs sm:text-sm text-gray-400 font-mono">Decrypt your shielded messages</p>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Viewing Key */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-gray-300 mb-2 sm:mb-3 uppercase tracking-wider">
              Unified Full Viewing Key
            </label>
            <input
              type="password"
              placeholder="uviewtest..."
              value={viewingKey}
              onChange={(e) => setViewingKey(e.target.value)}
              disabled={scanning}
              className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
            />
            <p className="text-[10px] sm:text-xs text-gray-500 mt-2 font-mono">
              Your viewing key never leaves your browser
            </p>
          </div>

          {/* Scan Period */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-gray-300 mb-2 sm:mb-3 uppercase tracking-wider">
              Scan Period <span className="text-red-400">*</span>
            </label>
            <select
              value={scanPeriod}
              onChange={(e) => setScanPeriod(e.target.value as '1h' | '6h' | '24h' | '7d')}
              disabled={scanning}
              className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
            >
              <option value="1h">Last 1 hour (~48 blocks)</option>
              <option value="6h">Last 6 hours (~288 blocks)</option>
              <option value="24h">Last 24 hours (~1,152 blocks)</option>
              <option value="7d">Last 7 days (~8,064 blocks)</option>
            </select>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-2 font-mono">
              How far back to scan for your transactions
            </p>
          </div>

          {/* Scan Button */}
          {!scanning && scanResults.length === 0 && (
            <button
              onClick={scanMyTransactions}
              disabled={!viewingKey}
              className="w-full bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-bold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              <span className="flex items-center justify-center gap-2">
                <Icons.Search />
                Scan My Transactions
              </span>
            </button>
          )}

          {/* Progress */}
          {scanning && (
            <div>
              <div className="flex justify-between text-xs sm:text-sm mb-2">
                <span className="text-gray-400">
                  Checking TX {scanProgress}%
                </span>
                <span className="text-cipher-cyan font-bold">
                  {scanResults.length} found
                </span>
              </div>
              <div className="h-2 sm:h-3 bg-cipher-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cipher-cyan to-cipher-green transition-all duration-300"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 font-mono">
                Scanning last {scanPeriod} of Orchard transactions...
              </p>
            </div>
          )}

          {/* Error */}
          {scanError && (
            <div className="bg-red-900/10 border border-red-500/30 rounded-lg p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                  <Icons.X />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-red-300 text-sm sm:text-base mb-2">No Messages Found</h3>
                  <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
                    {scanError}
                  </p>
                  <button
                    onClick={resetScan}
                    className="mt-4 text-xs sm:text-sm text-cipher-cyan hover:text-cipher-green font-mono flex items-center gap-1 transition-colors"
                  >
                    <Icons.Refresh />
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {scanResults.length > 0 && (
        <div ref={resultsRef} className="card scroll-mt-8">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Icons.Check />
              Encrypted Messages ({scanResults.length})
            </h2>
            {!scanning && (
              <button
                onClick={scanMyTransactions}
                className="text-xs sm:text-sm text-cipher-cyan hover:text-cipher-green font-mono flex items-center gap-1"
              >
                <Icons.Refresh />
                Refresh
              </button>
            )}
          </div>

          <div className="space-y-3 sm:space-y-4">
            {scanResults.map((result, idx) => (
              <div
                key={idx}
                className="bg-cipher-bg border border-cipher-border rounded-lg overflow-hidden hover:border-cipher-purple/50 transition-all duration-300 group animate-fade-in"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Compact Header */}
                <div className="bg-cipher-surface/30 px-4 py-2.5 flex items-center justify-between border-b border-cipher-border/50">
                  {/* Left: Lock + TX */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-cipher-purple/10 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-cipher-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <span className="text-[9px] text-gray-600 font-mono">tx:</span>
                    <Link
                      href={`/tx/${result.txid}`}
                      className="font-mono text-[10px] sm:text-xs text-cipher-cyan hover:underline truncate"
                    >
                      {result.txid.slice(0, 12)}...{result.txid.slice(-8)}
                    </Link>
                    <span className="hidden md:inline-flex items-center gap-1 text-[9px] text-gray-500 font-mono">
                      <span className="text-gray-600">from:</span>
                      <span className="px-1.5 py-0.5 bg-cipher-purple/10 rounded text-cipher-purple uppercase tracking-wide">
                        Shielded
                      </span>
                    </span>
                  </div>

                  {/* Right: Block + Date */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-[10px] text-gray-400 font-mono">
                      #{result.height.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-gray-500 font-mono">
                      {formatTime(result.timestamp)}
                    </div>
                  </div>
                </div>

                {/* Message Body */}
                {result.memo && (
                  <div className="p-4">
                    <div className="bg-black/20 border-l-2 border-cipher-purple rounded-r p-3">
                      <p className="text-sm sm:text-base text-white font-mono break-words leading-relaxed">
                        {result.memo}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
