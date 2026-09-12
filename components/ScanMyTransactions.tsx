'use client';

import { useState, useRef, useEffect } from 'react';
import { scanInbox } from '@/lib/inbox-scan';
import type { ScanMemo } from '@/lib/scan-records';
import { useWasmWorkerPool } from '@/hooks/useWasmWorkerPool';
import { getApiUrl } from '@/lib/api-config';
import { CURRENCY, isMainnet } from '@/lib/config';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HashLink } from '@/components/ui/HashLink';

const VIEWING_KEY_PREFIX = isMainnet ? 'uview' : 'uviewtest';

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

type ScanResult = ScanMemo;

export function ScanMyTransactions() {
  const [viewingKey, setViewingKey] = useState('');
  const [scanPeriod, setScanPeriod] = useState<'1h' | '6h' | '24h' | '7d' | 'birthday'>('1h');
  const [birthdayBlock, setBirthdayBlock] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPhase, setScanPhase] = useState<'fetching' | 'filtering' | 'decrypting' | ''>('');
  const [cancelRequested, setCancelRequested] = useState(false);
  const [blocksProcessed, setBlocksProcessed] = useState(0);
  const [matchesFound, setMatchesFound] = useState(0);

  // Multi-threaded Web Worker pool for WASM filtering (parallel scanning!)
  const wasmWorkerPool = useWasmWorkerPool();

  // AbortController for cancelling fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortControllerRef.current?.abort(); }, []);

  // Ref to scroll to results
  const resultsRef = useRef<HTMLDivElement>(null);

  // Bounded download/filter/decrypt pipeline; viewing keys remain in workers.
  const scanFromBirthday = async (sanitizedKey: string, birthdayHeight: number | null, blocksToScan = 48) => {
    if (abortControllerRef.current) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setScanning(true);
    setScanError(null);
    setScanResults([]);
    setScanProgress(0);
    setTotalBlocks(0);
    setScanPhase('fetching');
    setCancelRequested(false);
    setBlocksProcessed(0);
    setMatchesFound(0);
    try {
      const apiUrl = getApiUrl();
      const infoRes = await fetch(`${apiUrl}/api/info`, { signal: controller.signal });
      if (!infoRes.ok) throw new Error(`Failed to fetch blockchain info: ${infoRes.status}`);
      const info = await infoRes.json();
      const endHeight = Number(info.blocks ?? info.height);
      const startHeight = Math.max(1, birthdayHeight ?? endHeight - blocksToScan + 1);
      if (!Number.isSafeInteger(endHeight) || startHeight > endHeight) throw new Error('Birthday block is above the current chain height');
      const total = endHeight - startHeight + 1;
      setTotalBlocks(total);
      controller.signal.throwIfAborted();
      setScanPhase('filtering');
      const result = await scanInbox({
        apiUrl, startHeight, endHeight, signal: controller.signal, scanner: wasmWorkerPool,
        initialize: () => wasmWorkerPool.begin(sanitizedKey),
        onProgress: (processed, matches) => {
          setBlocksProcessed(processed);
          setMatchesFound(matches);
          setScanProgress(Math.round(processed / total * 100));
        },
        onMessages: setScanResults,
      });
      setScanProgress(100);
      if (!result.matches) setScanError(`Scanned ${total.toLocaleString()} blocks but found no transactions matching your viewing key.`);
      else if (!result.messages.length) setScanError(`Found ${result.matches} matching transactions but none had readable memos.`);
      else resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error: unknown) {
      controller.abort();
      // A failed or cancelled range must never look like a complete inbox.
      setScanResults([]);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setScanError(error instanceof Error ? error.message : 'Unable to scan transactions');
      }
    } finally {
      wasmWorkerPool.cancel();
      setScanPhase('');
      setCancelRequested(false);
      setScanning(false);
      abortControllerRef.current = null;
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
      const birthday = Number(birthdayBlock);
      if (!birthdayBlock || !Number.isSafeInteger(birthday) || birthday < 0) {
        setScanError('Please enter a valid birthday block number.');
        return;
      }
      return scanFromBirthday(sanitizedKey, birthday);
    }

    const periodToBlocks = { '1h': 48, '6h': 288, '24h': 1152, '7d': 8064 };
    return scanFromBirthday(sanitizedKey, null, periodToBlocks[scanPeriod]);
  };

  const resetScan = () => {
    setScanResults([]);
    setScanError(null);
    setScanProgress(0);
    setTotalBlocks(0);
    setScanPhase('');
    setCancelRequested(false);
    setBlocksProcessed(0);
    setMatchesFound(0);
  };

  const cancelScan = () => {
    setCancelRequested(true);
    wasmWorkerPool.cancel(); // Cancel all workers in the pool

    // Abort any ongoing fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Input Card */}
      <Card>
        <CardBody>
          <SectionHeader label="ENCRYPTED_INBOX_SCANNER" className="mb-2" />
          <p className="text-xs sm:text-sm text-muted font-mono mb-4 sm:mb-6">Decrypt your shielded messages</p>

          <div className="space-y-4 sm:space-y-6">
            {/* Viewing Key */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-secondary mb-2 sm:mb-3 uppercase tracking-wider">
                Unified Full Viewing Key
              </label>
              <input
                type="password"
                placeholder={`${VIEWING_KEY_PREFIX}...`}
                value={viewingKey}
                onChange={(e) => setViewingKey(e.target.value)}
                disabled={scanning}
                className="input-field disabled:opacity-50"
              />
              <p className="text-[10px] sm:text-xs text-muted mt-2 font-mono">
                Starts with <code className="text-cipher-cyan">{VIEWING_KEY_PREFIX}</code> ({isMainnet ? 'mainnet' : 'testnet'}) — never leaves your browser
              </p>
            </div>

            {/* Scan Period */}
            <div>
              <label className="block text-xs sm:text-sm font-bold text-secondary mb-2 sm:mb-3 uppercase tracking-wider">
                Scan Period <span className="text-danger">*</span>
              </label>
              <select
                value={scanPeriod}
                onChange={(e) => setScanPeriod(e.target.value as '1h' | '6h' | '24h' | '7d' | 'birthday')}
                disabled={scanning}
                className="input-field disabled:opacity-50"
              >
                <option value="1h">Last 1 hour (~48 blocks)</option>
                <option value="6h">Last 6 hours (~288 blocks)</option>
                <option value="24h">Last 24 hours (~1,152 blocks)</option>
                <option value="7d">Last 7 days (~8,064 blocks)</option>
                <option value="birthday">Since wallet birthday 🎂</option>
              </select>
              <p className="text-[10px] sm:text-xs text-muted mt-2 font-mono">
                {scanPeriod === 'birthday'
                  ? 'Scan from wallet creation (may take 1-2 minutes)'
                  : 'How far back to scan for your transactions'}
              </p>
            </div>

            {/* Birthday Block Input (only show if birthday is selected) */}
            {scanPeriod === 'birthday' && (
              <div>
                <label className="block text-xs sm:text-sm font-bold text-secondary mb-2 sm:mb-3 uppercase tracking-wider">
                  Wallet Birthday Block <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  placeholder="e.g., 3121131"
                  value={birthdayBlock}
                  onChange={(e) => setBirthdayBlock(e.target.value)}
                  disabled={scanning}
                  className="input-field disabled:opacity-50"
                />
                <p className="text-[10px] sm:text-xs text-muted mt-2 font-mono">
                  Find this in your wallet settings (e.g., Zingo CLI: <code className="text-cipher-cyan">birthday</code>)
                </p>
              </div>
            )}

            {/* Scan Button */}
            {!scanning && scanResults.length === 0 && (
              <Button onClick={scanMyTransactions} disabled={!viewingKey} icon={<Icons.Search />} variant="secondary" fullWidth>
                Scan My Transactions
              </Button>
            )}

            {/* Progress with animated loading messages */}
            {scanning && (
              <div className="space-y-4">
                {/* Phase indicator with animated dots */}
                <div className="scan-progress-bg border border-cipher-cyan/30 rounded-lg p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Animated spinner */}
                      <div className="relative w-8 h-8 sm:w-10 sm:h-10">
                        <div className="absolute inset-0 border-4 border-cipher-cyan/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-cipher-cyan border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-bold text-primary">
                          {scanPhase === 'fetching' && (
                            <>Fetching blocks<AnimatedDots /></>
                          )}
                          {scanPhase === 'filtering' && (
                            <>
                              Scanning {blocksProcessed > 0 && `${blocksProcessed.toLocaleString()} / `}
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
                        <div className="text-xs text-muted font-mono mt-1">
                          {scanProgress}% complete
                          {matchesFound > 0 && scanPhase === 'filtering' && (
                            <span className="text-cipher-green ml-2">• {matchesFound} found</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Cancel button */}
                    <Button
                      onClick={cancelScan}
                      disabled={cancelRequested}
                      variant="danger"
                      size="sm"
                      icon={<Icons.X />}
                    >
                      <span className="hidden sm:inline">Cancel</span>
                    </Button>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 sm:h-3 progress-bar-bg rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-cipher-cyan to-cipher-green transition-[width] duration-300"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>

                  {/* Warning message */}
                  <div className="flex items-start gap-2 text-xs warning-box rounded px-3 py-2">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-bold mb-1 warning-title">Please don't close this page</p>
                      <p className="warning-text font-mono">
                        This may take a moment. Your viewing key never leaves your browser.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {scanError && (
              <div className="alert alert-error">
                <Icons.X />
                <div>
                  <p className="font-medium">Scan Result</p>
                  <p className="text-sm text-secondary mt-1 leading-relaxed">
                    {scanError}
                  </p>
                  <button
                    onClick={resetScan}
                    className="mt-3 text-xs sm:text-sm text-cipher-cyan hover:text-cipher-green font-mono flex items-center gap-1 transition-colors"
                  >
                    <Icons.Refresh />
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Results - Encrypted Mail Client */}
      {scanResults.length > 0 && (
        <div ref={resultsRef} className="scroll-mt-8 border border-cipher-cyan/40 rounded-2xl overflow-hidden shadow-lg inbox-container">
          {/* Terminal-Style Header */}
          <div className="inbox-header border-b border-cipher-cyan/30 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-cipher-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-mono text-xs sm:text-sm text-cipher-cyan truncate">~/encrypted_inbox</span>
              <span className="hidden sm:inline text-xs text-muted font-mono">
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
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cipher-yellow"></div>
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cipher-green"></div>
              </div>
            </div>
          </div>

          {/* Messages List */}
          <div className="inbox-body p-4 space-y-3">
            {scanResults.map((result, idx) => (
              <div
                key={`${result.txid}:${result.output_index}`}
                className="inbox-message border border-cipher-cyan/20 rounded-xl overflow-hidden hover:border-cipher-cyan/50 transition-colors duration-200 animate-fade-in"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Message Header - Old School Email Style (Single Line) */}
                <div className="inbox-message-header px-4 py-3 border-b border-cipher-border">
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    {/* From */}
                    <div className="flex items-center gap-2">
                      <span className="text-muted font-bold uppercase tracking-wider">From:</span>
                      <StatusBadge status="shielded" />
                    </div>

                    {/* Separator */}
                    <span className="text-muted">•</span>

                    {/* Amount */}
                    {result.amount > 0 && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted font-bold uppercase tracking-wider">Amount:</span>
                          <span className="text-cipher-green font-mono font-semibold">
                            +{result.amount.toString().replace(/\.?0+$/, '')} {CURRENCY}
                          </span>
                        </div>
                        <span className="text-muted">•</span>
                      </>
                    )}

                    {/* Transaction */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-muted font-bold uppercase tracking-wider whitespace-nowrap">TX:</span>
                      <HashLink value={result.txid} href={`/tx/${result.txid}`} lead={12} tail={8} copy={false} />
                    </div>

                    {/* Separator */}
                    <span className="text-muted hidden sm:inline">•</span>

                    {/* Block */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted font-bold uppercase tracking-wider">Block:</span>
                      <span className="text-secondary font-mono">
                        #{result.height.toLocaleString()}
                      </span>
                    </div>

                    {/* Separator */}
                    <span className="text-muted hidden sm:inline">•</span>

                    {/* Time */}
                    <div className="text-primary font-semibold ml-auto">
                      {formatTime(result.timestamp)}
                    </div>
                  </div>
                </div>

                {/* Message Body - Email Content Area */}
                {result.memo && (
                  <div className="p-5 inbox-message-body">
                    <div className="text-sm text-muted uppercase tracking-wider mb-3 font-bold">
                      Message:
                    </div>
                    <p className="text-base text-primary leading-relaxed break-words pl-4 border-l-2 border-cipher-purple/30">
                      {result.memo}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Terminal Footer */}
          <div className="inbox-footer px-4 py-3 border-t border-cipher-cyan/30">
            <div className="flex items-center justify-between text-xs text-muted font-mono">
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
