'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

// Animated dots component for loading states (pure CSS for performance)
function AnimatedDots() {
  return (
    <span className="inline-block w-6 text-left">
      <style jsx>{`
        @keyframes dots {
          0%, 20% { content: ''; }
          40% { content: '.'; }
          60% { content: '..'; }
          80%, 100% { content: '...'; }
        }
        .animated-dots::after {
          content: '';
          animation: dots 2s infinite;
        }
      `}</style>
      <span className="animated-dots"></span>
    </span>
  );
}

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
  amount: number; // Amount in ZEC
}

export function ScanMyTransactions() {
  const [viewingKey, setViewingKey] = useState('');
  const [scanPeriod, setScanPeriod] = useState<'1h' | '6h' | '24h' | '7d' | 'birthday'>('1h');
  const [birthdayBlock, setBirthdayBlock] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<'fetching' | 'filtering' | 'decrypting' | ''>('');
  const [cancelRequested, setCancelRequested] = useState(false);
  const [blocksProcessed, setBlocksProcessed] = useState(0);
  const [matchesFound, setMatchesFound] = useState(0);

  // Ref to scroll to results
  const resultsRef = useRef<HTMLDivElement>(null);

  // Birthday scan using Lightwalletd (FAST!)
  const scanFromBirthday = async (sanitizedKey: string, birthdayHeight: number) => {
    console.log('🎂 [BIRTHDAY SCAN] Starting scan from block', birthdayHeight);
    setScanning(true);
    setScanError(null);
    setScanResults([]);
    setScanProgress(0);
    setTotalBlocks(0);
    setCurrentBlock(0);
    setScanPhase('fetching');
    setCancelRequested(false);
    setBlocksProcessed(0);
    setMatchesFound(0);

    const startTime = Date.now();
    const minScanTime = 1500;

    try {
      const { filterCompactOutputs, decryptMemo } = await import('@/lib/wasm-loader');
      const apiUrl = process.env.NEXT_PUBLIC_POSTGRES_API_URL || 'https://api.testnet.cipherscan.app';

      // Check for cancellation
      if (cancelRequested) {
        setScanError('Scan cancelled by user');
        return;
      }

      // Get current block height
      console.log('📊 [BIRTHDAY SCAN] Fetching current block height...');
      setScanPhase('fetching');
      const infoRes = await fetch(`${apiUrl}/api/info`);
      if (!infoRes.ok) {
        throw new Error(`Failed to fetch blockchain info: ${infoRes.status}`);
      }
      const infoData = await infoRes.json();
      const currentHeight = parseInt(infoData.blocks || infoData.height || 0);

      const totalBlocks = currentHeight - birthdayHeight;
      setTotalBlocks(totalBlocks);
      console.log(`📦 [BIRTHDAY SCAN] Scanning ${totalBlocks.toLocaleString()} blocks (${birthdayHeight} → ${currentHeight})`);

      // Check for cancellation
      if (cancelRequested) {
        setScanError('Scan cancelled by user');
        return;
      }

      // Step 1: Fetch compact blocks from Lightwalletd (FAST!)
      console.log('⚡ [BIRTHDAY SCAN] Fetching compact blocks from Lightwalletd...');
      setScanProgress(10);
      const compactRes = await fetch(`${apiUrl}/api/lightwalletd/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({
          startHeight: birthdayHeight,
          endHeight: currentHeight,
        }),
      });

      if (!compactRes.ok) {
        throw new Error(`Failed to fetch compact blocks: ${compactRes.status}`);
      }

      const compactData = await compactRes.json();
      console.log(`✅ [BIRTHDAY SCAN] Received ${compactData.blocksScanned} compact blocks`);
      setScanProgress(30);

      // Check for cancellation
      if (cancelRequested) {
        setScanError('Scan cancelled by user');
        return;
      }

      // Step 2: Filter compact outputs to find matching TXs (WASM BATCH filtering - FAST!)
      console.log('🚀 [BIRTHDAY SCAN] Filtering compact outputs with WASM BATCH API...');
      setScanPhase('filtering');
      setBlocksProcessed(0);
      const { filterCompactOutputsBatch } = await import('@/lib/wasm-loader');
      const matchingTxs = await filterCompactOutputsBatch(
        compactData.blocks,
        sanitizedKey,
        (blocksProcessed, totalBlocks, matchesFound) => {
          // Update progress from 30% to 50% during filtering
          const filterProgress = Math.round(30 + (blocksProcessed / totalBlocks) * 20);
          setScanProgress(filterProgress);
          setCurrentBlock(birthdayHeight + blocksProcessed);
          setBlocksProcessed(blocksProcessed);
          setMatchesFound(matchesFound);
        },
        () => cancelRequested // Pass cancel check function
      );
      console.log(`✅ [BIRTHDAY SCAN] Found ${matchingTxs.length} matching transactions`);
      setScanProgress(50);
      setMatchesFound(matchingTxs.length);

      // Check for cancellation
      if (cancelRequested) {
        setScanError('Scan cancelled by user');
        return;
      }

      if (matchingTxs.length === 0) {
        console.log('❌ [BIRTHDAY SCAN] No matching transactions found');
        setScanError(`Scanned ${totalBlocks.toLocaleString()} blocks but found no transactions matching your viewing key.`);
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < minScanTime) {
          await new Promise(resolve => setTimeout(resolve, minScanTime - elapsedTime));
        }
        setScanPhase('');
        setScanning(false);
        return;
      }

      // Step 3: Fetch raw hex for matching TXs (batch)
      console.log(`📥 [BIRTHDAY SCAN] Fetching raw hex for ${matchingTxs.length} transactions...`);
      setScanPhase('decrypting');
      const txids = matchingTxs.map(tx => tx.txid);
      const batchSize = 1000;
      const allRawTxs = new Map<string, string>();

      for (let i = 0; i < txids.length; i += batchSize) {
        // Check for cancellation
        if (cancelRequested) {
          setScanError('Scan cancelled by user');
          return;
        }

        const batch = txids.slice(i, i + batchSize);
        console.log(`📦 [BIRTHDAY SCAN] Fetching batch ${Math.floor(i / batchSize) + 1} (${batch.length} TXs)...`);
        const batchRes = await fetch(`${apiUrl}/api/tx/raw/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txids: batch }),
        });

        if (!batchRes.ok) {
          throw new Error(`Failed to fetch raw transactions: ${batchRes.status}`);
        }

        const batchData = await batchRes.json();
        batchData.transactions.forEach((tx: any) => {
          allRawTxs.set(tx.txid, tx.hex);
        });

        setScanProgress(50 + Math.round((i / txids.length) * 30));
      }
      console.log(`✅ [BIRTHDAY SCAN] Fetched ${allRawTxs.size} raw transactions`);

      // Step 4: Decrypt memos with WASM
      console.log('🔓 [BIRTHDAY SCAN] Decrypting memos...');
      const foundMessages: ScanResult[] = [];
      let processed = 0;

      for (const matchingTx of matchingTxs) {
        // Check for cancellation
        if (cancelRequested) {
          setScanError('Scan cancelled by user');
          return;
        }

        try {
          const rawHex = allRawTxs.get(matchingTx.txid);
          if (rawHex) {
            const decrypted = await decryptMemo(rawHex, sanitizedKey);
            foundMessages.push({
              txid: matchingTx.txid,
              height: matchingTx.height,
              timestamp: matchingTx.timestamp,
              memo: decrypted.memo,
              amount: decrypted.amount,
            });
            console.log(`✅ [BIRTHDAY SCAN] Decrypted memo for TX ${matchingTx.txid.slice(0, 8)}...`);
          }
        } catch (err) {
          console.log(`⚠️  [BIRTHDAY SCAN] Failed to decrypt TX ${matchingTx.txid.slice(0, 8)}...`);
        }

        processed++;
        setScanProgress(80 + Math.round((processed / matchingTxs.length) * 20));
      }
      console.log(`✅ [BIRTHDAY SCAN] Decrypted ${foundMessages.length} memos out of ${matchingTxs.length} transactions`);

      setScanProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200));

      if (foundMessages.length === 0) {
        setScanError(`Found ${matchingTxs.length} matching transactions but none had readable memos.`);
      } else {
        setScanResults(foundMessages);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minScanTime) {
        await new Promise(resolve => setTimeout(resolve, minScanTime - elapsedTime));
      }
    } catch (err: any) {
      console.error('❌ [BIRTHDAY SCAN] Fatal error:', err);
      setScanProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200));
      setScanError(err.message || 'Failed to scan from birthday');

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minScanTime) {
        await new Promise(resolve => setTimeout(resolve, minScanTime - elapsedTime));
      }
    } finally {
      setScanPhase('');
      setCancelRequested(false);
      setScanning(false);
    }
  };

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

    // Validate birthday block if birthday mode
    if (scanPeriod === 'birthday') {
      const birthday = parseInt(birthdayBlock);
      if (!birthdayBlock || isNaN(birthday) || birthday < 0) {
        setScanError('Please enter a valid birthday block number.');
        return;
      }
      // Use birthday scan method
      return scanFromBirthday(sanitizedKey, birthday);
    }

    setScanning(true);
    setScanError(null);
    setScanResults([]);
    setScanProgress(0);
    setTotalBlocks(0);
    setCurrentBlock(0);

    // Minimum loading time for smooth animation
    const startTime = Date.now();
    const minScanTime = 1500; // 1.5 seconds minimum

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
        // Simulate progress for smooth animation
        setScanProgress(50);
        await new Promise(resolve => setTimeout(resolve, 300));
        setScanProgress(100);
        await new Promise(resolve => setTimeout(resolve, 200));

        setScanError(`No Orchard transactions found in the last ${scanPeriod}.`);

        // Ensure minimum time
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < minScanTime) {
          await new Promise(resolve => setTimeout(resolve, minScanTime - elapsedTime));
        }

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
      const foundMessages: ScanResult[] = []; // Store results locally

      for (const tx of orchardTxs) {
        try {
          // Update current block being processed
          setCurrentBlock(tx.block_height);

          // Get raw hex from our batch
          const rawHex = allRawTxs.get(tx.txid);
          if (rawHex) {
            const decrypted = await decryptMemo(rawHex, sanitizedKey);

            // Success! This tx belongs to user
            foundCount++; // Increment local counter
            foundMessages.push({
              txid: tx.txid,
              height: tx.block_height,
              timestamp: tx.timestamp,
              memo: decrypted.memo,
              amount: decrypted.amount,
            });
          }
        } catch (err) {
          // Not our tx, skip silently
        }

        txsProcessed++;
        const newProgress = Math.round((txsProcessed / totalTxs) * 100);
        setScanProgress(newProgress);

        // Force UI update every 5 TXs or at key milestones
        if (txsProcessed % 5 === 0 || newProgress === 25 || newProgress === 50 || newProgress === 75) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Ensure progress bar reaches 100%
      setScanProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Now display results after progress is complete
      if (foundCount === 0) {
        setScanError(`Scanned ${totalTxs} Orchard transactions in the last ${scanPeriod} but none matched your viewing key.`);
      } else {
        setScanResults(foundMessages);
        // Scroll to results after a short delay to let state update
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }

      // Ensure minimum scan time for smooth animation
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minScanTime) {
        await new Promise(resolve => setTimeout(resolve, minScanTime - elapsedTime));
      }
    } catch (err: any) {
      console.error('❌ [SCAN] Fatal error:', err);

      // Simulate progress for smooth animation even on error
      const currentProgress = scanProgress;
      if (currentProgress < 50) {
        setScanProgress(50);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      setScanProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200));

      setScanError(err.message || 'Failed to scan transactions');

      // Ensure minimum time even on error
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minScanTime) {
        await new Promise(resolve => setTimeout(resolve, minScanTime - elapsedTime));
      }
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
    setScanPhase('');
    setCancelRequested(false);
    setBlocksProcessed(0);
    setMatchesFound(0);
  };

  const cancelScan = () => {
    setCancelRequested(true);
    setScanError('Cancelling scan...');
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
              onChange={(e) => setScanPeriod(e.target.value as '1h' | '6h' | '24h' | '7d' | 'birthday')}
              disabled={scanning}
              className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
            >
              <option value="1h">Last 1 hour (~48 blocks)</option>
              <option value="6h">Last 6 hours (~288 blocks)</option>
              <option value="24h">Last 24 hours (~1,152 blocks)</option>
              <option value="7d">Last 7 days (~8,064 blocks)</option>
              <option value="birthday">Since wallet birthday 🎂</option>
            </select>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-2 font-mono">
              {scanPeriod === 'birthday'
                ? 'Scan from wallet creation (may take 1-2 minutes)'
                : 'How far back to scan for your transactions'}
            </p>
          </div>

          {/* Birthday Block Input (only show if birthday is selected) */}
          {scanPeriod === 'birthday' && (
            <div>
              <label className="block text-xs sm:text-sm font-bold text-gray-300 mb-2 sm:mb-3 uppercase tracking-wider">
                Wallet Birthday Block <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                placeholder="e.g., 3121131"
                value={birthdayBlock}
                onChange={(e) => setBirthdayBlock(e.target.value)}
                disabled={scanning}
                className="w-full bg-cipher-bg border-2 border-cipher-border rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-white font-mono text-xs sm:text-sm focus:outline-none focus:border-cipher-cyan transition-colors disabled:opacity-50"
              />
              <p className="text-[10px] sm:text-xs text-gray-500 mt-2 font-mono">
                Find this in your wallet settings (e.g., Zingo CLI: <code className="text-cipher-cyan">birthday</code>)
              </p>
            </div>
          )}

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

          {/* Progress with animated loading messages */}
          {scanning && (
            <div className="space-y-4">
              {/* Phase indicator with animated dots */}
              <div className="bg-cipher-surface/50 border-2 border-cipher-cyan/30 rounded-lg p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Animated spinner */}
                    <div className="relative w-8 h-8 sm:w-10 sm:h-10">
                      <div className="absolute inset-0 border-4 border-cipher-cyan/20 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-cipher-cyan border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div>
                      <div className="text-sm sm:text-base font-bold text-white">
                        {scanPhase === 'fetching' && (
                          <>Fetching compact blocks<AnimatedDots /></>
                        )}
                        {scanPhase === 'filtering' && (
                          <>
                            Filtering {blocksProcessed > 0 && `${blocksProcessed.toLocaleString()} / `}
                            {totalBlocks > 0 ? `${totalBlocks.toLocaleString()} blocks` : 'blocks'}
                            <AnimatedDots />
                          </>
                        )}
                        {scanPhase === 'decrypting' && (
                          <>Decrypting {matchesFound} {matchesFound === 1 ? 'memo' : 'memos'}<AnimatedDots /></>
                        )}
                        {!scanPhase && (
                          <>Scanning<AnimatedDots /></>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-mono mt-1">
                        {scanProgress}% complete
                        {matchesFound > 0 && scanPhase === 'filtering' && (
                          <span className="text-cipher-green ml-2">• {matchesFound} found</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Cancel button */}
                  <button
                    onClick={cancelScan}
                    disabled={cancelRequested}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-lg text-red-400 hover:text-red-300 font-mono text-xs sm:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Cancel scan"
                  >
                    <Icons.X />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                </div>

                {/* Progress bar */}
                <div className="h-2 sm:h-3 bg-cipher-bg rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-cipher-cyan to-cipher-green transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>

                {/* Warning message */}
                <div className="flex items-start gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded px-3 py-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-bold mb-1">Please don't close this page</p>
                    <p className="text-yellow-400/60 font-mono">
                      {scanPeriod === 'birthday'
                        ? 'Scanning large range may take 1-2 minutes. Your viewing key stays in your browser.'
                        : 'This may take a moment. Your viewing key never leaves your device.'}
                    </p>
                  </div>
                </div>
              </div>
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

      {/* Results - Encrypted Mail Client */}
      {scanResults.length > 0 && (
        <div ref={resultsRef} className="scroll-mt-8 border-2 border-cipher-cyan rounded-lg overflow-hidden shadow-2xl">
          {/* Terminal-Style Header */}
          <div className="bg-cipher-surface border-b-2 border-cipher-cyan px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-cipher-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-mono text-xs sm:text-sm text-cipher-cyan truncate">~/encrypted_inbox</span>
              <span className="hidden sm:inline text-xs text-gray-500 font-mono">
                [{scanResults.length} msg{scanResults.length > 1 ? 's' : ''}]
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {!scanning && (
                <button
                  onClick={scanMyTransactions}
                  className="text-xs text-cipher-cyan hover:text-cipher-green font-mono flex items-center gap-1 transition-colors"
                  title="Refresh inbox"
                >
                  <Icons.Refresh />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              )}
              <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500"></div>
              </div>
            </div>
          </div>

          {/* Messages List */}
          <div className="bg-black/80 p-4 space-y-3">
            {[...scanResults].reverse().map((result, idx) => (
              <div
                key={idx}
                className="bg-cipher-surface/50 border-2 border-cipher-cyan/30 rounded overflow-hidden hover:border-cipher-cyan/60 transition-colors duration-200 animate-fade-in"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Message Header - Old School Email Style (Single Line) */}
                <div className="bg-gradient-to-r from-cipher-surface/80 to-cipher-surface/60 px-4 py-3 border-b-2 border-cipher-border">
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    {/* From */}
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-bold uppercase tracking-wider">From:</span>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cipher-purple/20 border border-cipher-purple/40 rounded">
                        <svg className="w-2.5 h-2.5 text-cipher-purple flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs font-semibold text-cipher-purple uppercase">
                          Shielded
                        </span>
                      </div>
                    </div>

                    {/* Separator */}
                    <span className="text-gray-600">•</span>

                    {/* Amount */}
                    {result.amount > 0 && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500 font-bold uppercase tracking-wider">Amount:</span>
                          <span className="text-cipher-green font-mono font-semibold">
                            +{result.amount.toString().replace(/\.?0+$/, '')} ZEC
                          </span>
                        </div>
                        <span className="text-gray-600">•</span>
                      </>
                    )}

                    {/* Transaction */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">TX:</span>
                      <Link
                        href={`/tx/${result.txid}`}
                        className="font-mono text-cipher-cyan hover:text-cipher-green hover:underline truncate transition-colors"
                      >
                        {result.txid.slice(0, 12)}...{result.txid.slice(-8)}
                      </Link>
                    </div>

                    {/* Separator */}
                    <span className="text-gray-600 hidden sm:inline">•</span>

                    {/* Block */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-500 font-bold uppercase tracking-wider">Block:</span>
                      <span className="text-gray-400 font-mono">
                        #{result.height.toLocaleString()}
                      </span>
                    </div>

                    {/* Separator */}
                    <span className="text-gray-600 hidden sm:inline">•</span>

                    {/* Time */}
                    <div className="text-white font-semibold ml-auto">
                      {formatTime(result.timestamp)}
                    </div>
                  </div>
                </div>

                {/* Message Body - Email Content Area */}
                {result.memo && (
                  <div className="p-5 bg-white/[0.02]">
                    <div className="text-sm text-gray-400 uppercase tracking-wider mb-3 font-bold">
                      Message:
                    </div>
                    <p className="text-base text-white leading-relaxed break-words pl-4 border-l-2 border-cipher-purple/30">
                      {result.memo}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Terminal Footer */}
          <div className="bg-black/80 px-4 py-3 border-t-2 border-cipher-cyan">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span>
                ✓ {scanResults.length} message{scanResults.length > 1 ? 's' : ''} decrypted
              </span>
              <span className="text-cipher-green">
                🔐 client-side
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
