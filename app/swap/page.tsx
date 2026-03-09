'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { isMainnet } from '@/lib/config';
import { API_CONFIG } from '@/lib/api-config';
import { TokenChainIcon } from '@/components/TokenChainIcon';
import { useWallet, type DetectedWallet } from '@/hooks/useWallet';

const BASE58_CHARS = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

function validateZecAddress(addr: string): string | null {
  if (!addr) return null;
  if (addr.startsWith('zs') || addr.startsWith('u1') || addr.startsWith('utest') || addr.startsWith('ztestsapling'))
    return 'Shielded/unified addresses not supported by NEAR Intents. Use a transparent address (t1/t3).';
  if (!addr.startsWith('t1') && !addr.startsWith('t3'))
    return 'Must start with t1 or t3';
  if (!BASE58_CHARS.test(addr))
    return 'Contains invalid characters';
  if (addr.length !== 35)
    return `Address must be 35 characters (currently ${addr.length})`;
  return null;
}

interface RecommendedAmount {
  amount: number;
  swapCount: number;
  percentage: number;
  blendingScore: 'high' | 'medium' | 'low';
}

function formatRecAmount(amount: number, token: string): string {
  const t = token.toLowerCase();
  if (['usdc', 'usdt', 'dai', 'busd', 'tusd', 'usdp'].includes(t)) {
    return amount >= 1 ? amount.toLocaleString(undefined, { maximumFractionDigits: 0 }) : amount.toString();
  }
  if (amount === 0) return '0';
  if (amount >= 100) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 });
  if (amount >= 0.01) return amount.toFixed(3);
  return amount.toFixed(4);
}

interface Recommendation {
  chain: string;
  token: string;
  recommendations: RecommendedAmount[];
  tip: string;
}

interface QuoteResponse {
  success: boolean;
  depositAddress?: string;
  amountOut?: string;
  estimatedAmountOut?: string;
  deadline?: string;
  error?: string;
}

type SwapStep = 'form' | 'quote' | 'waiting' | 'complete' | 'error';

const PENDING_SWAP_KEY = 'cipherscan_pending_swap';

interface PendingSwap {
  depositAddress: string;
  amount: string;
  token: string;
  chain: string;
  chainLabel: string;
  assetId: string;
  decimals: number;
  contractAddress?: string;
  zecAddress: string;
  estimatedZec: string;
  txHash?: string;
  createdAt: number;
}

interface SourceToken {
  id: string;
  chain: string;
  chainLabel: string;
  token: string;
  decimals: number;
  assetId: string;
  contractAddress?: string;
}

const CHAIN_EXPLORERS: Record<string, string> = {
  eth: 'https://etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
  arb: 'https://arbiscan.io/tx/',
  op: 'https://optimistic.etherscan.io/tx/',
  pol: 'https://polygonscan.com/tx/',
  avax: 'https://snowtrace.io/tx/',
  bsc: 'https://bscscan.com/tx/',
  sol: 'https://solscan.io/tx/',
  btc: 'https://mempool.space/tx/',
  near: 'https://nearblocks.io/txns/',
  gnosis: 'https://gnosisscan.io/tx/',
  bera: 'https://berascan.com/tx/',
  scroll: 'https://scrollscan.com/tx/',
  tron: 'https://tronscan.org/#/transaction/',
};

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum', base: 'Base', arb: 'Arbitrum', sol: 'Solana', btc: 'Bitcoin',
  near: 'NEAR', ton: 'TON', doge: 'Dogecoin', xrp: 'XRP', bsc: 'BNB Chain',
  pol: 'Polygon', tron: 'Tron', sui: 'Sui', op: 'Optimism', avax: 'Avalanche',
  ltc: 'Litecoin', bch: 'Bitcoin Cash', gnosis: 'Gnosis', bera: 'Berachain',
  cardano: 'Cardano', starknet: 'Starknet', zec: 'Zcash', aleo: 'Aleo',
  xlayer: 'XLayer', monad: 'Monad', adi: 'ADI', plasma: 'Plasma', scroll: 'Scroll',
  dash: 'Dash',
};

const FALLBACK_TOKEN_ORDER = ['usdc', 'eth', 'usdt', 'btc', 'sol', 'bnb', 'near', 'dai', 'doge', 'xrp', 'ton', 'ltc'];
const FALLBACK_CHAIN_ORDER = ['eth', 'sol', 'base', 'arb', 'btc', 'bsc', 'op', 'pol', 'avax', 'near', 'ton', 'doge', 'xrp', 'ltc', 'sui', 'tron'];

interface PopularPair { chain: string; token: string; swapCount: number }

function sortTokens(tokens: SourceToken[], popularPairs: PopularPair[]): SourceToken[] {
  if (popularPairs.length > 0) {
    const pairRank = new Map<string, number>();
    popularPairs.forEach((p, i) => {
      pairRank.set(`${p.chain.toLowerCase()}:${p.token.toLowerCase()}`, i);
    });
    return [...tokens].sort((a, b) => {
      const aKey = `${a.chain.toLowerCase()}:${a.token.toLowerCase()}`;
      const bKey = `${b.chain.toLowerCase()}:${b.token.toLowerCase()}`;
      const aRank = pairRank.get(aKey) ?? 9999;
      const bRank = pairRank.get(bKey) ?? 9999;
      if (aRank !== bRank) return aRank - bRank;
      const aToken = FALLBACK_TOKEN_ORDER.indexOf(a.token.toLowerCase());
      const bToken = FALLBACK_TOKEN_ORDER.indexOf(b.token.toLowerCase());
      if ((aToken >= 0 ? aToken : 999) !== (bToken >= 0 ? bToken : 999))
        return (aToken >= 0 ? aToken : 999) - (bToken >= 0 ? bToken : 999);
      return a.chainLabel.localeCompare(b.chainLabel);
    });
  }
  return [...tokens].sort((a, b) => {
    const aToken = FALLBACK_TOKEN_ORDER.indexOf(a.token.toLowerCase());
    const bToken = FALLBACK_TOKEN_ORDER.indexOf(b.token.toLowerCase());
    const aRank = aToken >= 0 ? aToken : 999;
    const bRank = bToken >= 0 ? bToken : 999;
    if (aRank !== bRank) return aRank - bRank;
    const aChain = FALLBACK_CHAIN_ORDER.indexOf(a.chain.toLowerCase());
    const bChain = FALLBACK_CHAIN_ORDER.indexOf(b.chain.toLowerCase());
    if ((aChain >= 0 ? aChain : 999) !== (bChain >= 0 ? bChain : 999))
      return (aChain >= 0 ? aChain : 999) - (bChain >= 0 ? bChain : 999);
    return a.chainLabel.localeCompare(b.chainLabel);
  });
}

function apiTokensToSourceTokens(apiTokens: any[]): SourceToken[] {
  return apiTokens
    .filter(t => {
      if (!t.assetId || !t.symbol || !t.blockchain || t.decimals == null) return false;
      const id = t.assetId.toLowerCase();
      if (id.includes('zec') || t.blockchain === 'zec') return false;
      return true;
    })
    .map(t => {
      let contractAddress: string | undefined;
      if (t.address) contractAddress = t.address;
      else if (t.contractAddress) contractAddress = t.contractAddress;
      else if (t.assetId) {
        const evmMatch = t.assetId.match(/0x[a-fA-F0-9]{40}/);
        if (evmMatch) {
          contractAddress = evmMatch[0];
        } else {
          const solMatch = t.assetId.match(/sol-([A-HJ-NP-Za-km-z1-9]{32,44})\./);
          if (solMatch) contractAddress = solMatch[1];
        }
      }
      return {
        id: `${t.blockchain}-${t.symbol.toLowerCase()}-${t.assetId}`,
        chain: t.blockchain,
        chainLabel: CHAIN_LABELS[t.blockchain] || t.blockchain,
        token: t.symbol,
        decimals: t.decimals,
        assetId: t.assetId,
        contractAddress,
      };
    });
}

const FALLBACK_TOKENS: SourceToken[] = [
  { id: 'eth-usdc', chain: 'eth', chainLabel: 'Ethereum', token: 'USDC', decimals: 6, assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near' },
  { id: 'eth-eth', chain: 'eth', chainLabel: 'Ethereum', token: 'ETH', decimals: 18, assetId: 'nep141:eth.omft.near' },
  { id: 'btc-btc', chain: 'btc', chainLabel: 'Bitcoin', token: 'BTC', decimals: 8, assetId: 'nep141:btc.omft.near' },
  { id: 'sol-sol', chain: 'sol', chainLabel: 'Solana', token: 'SOL', decimals: 9, assetId: 'nep141:sol.omft.near' },
  { id: 'near-near', chain: 'near', chainLabel: 'NEAR', token: 'NEAR', decimals: 24, assetId: 'nep141:wrap.near' },
];

const ZEC_ASSET_ID = 'nep141:zec.omft.near';
const ZEC_DECIMALS = 8;

function WalletIcon({ wallet: w, size = 24 }: { wallet: DetectedWallet; size?: number }) {
  if (w.icon) {
    return <img src={w.icon} alt="" className="rounded-full" style={{ width: size, height: size }} />;
  }
  const chainFallback: Record<string, string> = {
    evm: '/chains/eth.png', solana: '/chains/sol.png', bitcoin: '/chains/btc.png',
  };
  const fallback = chainFallback[w.type || ''];
  if (fallback) {
    return <img src={fallback} alt="" className="rounded-full" style={{ width: size, height: size }} />;
  }
  return (
    <div className="bg-gray-500 rounded-full flex items-center justify-center text-white font-bold"
         style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {w.name.charAt(0).toUpperCase()}
    </div>
  );
}

function ctaLabel(state: {
  loading: boolean;
  amount: string;
  zecAddress: string;
  walletConnected: boolean;
  switching: boolean;
  insufficientBalance: boolean;
}): string {
  if (state.loading) return 'Getting quote...';
  if (state.switching) return 'Connecting...';
  if (!state.amount) return 'Enter amount';
  if (state.insufficientBalance) return 'Insufficient balance';
  if (!state.zecAddress) return 'Enter ZEC address';
  const addrErr = validateZecAddress(state.zecAddress);
  if (addrErr) return 'Invalid ZEC address';
  return 'Get Quote';
}

export default function SwapPage() {
  const [step, setStep] = useState<SwapStep>('form');
  const [availableTokens, setAvailableTokens] = useState<SourceToken[]>(FALLBACK_TOKENS);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<SourceToken>(FALLBACK_TOKENS[0]);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [zecAddress, setZecAddress] = useState('');
  const [refundAddress, setRefundAddress] = useState('');
  const [slippage, setSlippage] = useState(100);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [estimatedZec, setEstimatedZec] = useState('');
  const [depositAddress, setDepositAddress] = useState('');
  const [swapStatus, setSwapStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [sendingTx, setSendingTx] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [walletError, setWalletError] = useState('');
  const [showSlippage, setShowSlippage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [quoteExpiry, setQuoteExpiry] = useState<number>(0);
  const [quoteTimeLeft, setQuoteTimeLeft] = useState<number>(0);
  const wallet = useWallet();
  const pickerRef = useRef<HTMLDivElement>(null);
  const tokenPickerRef = useRef<HTMLDivElement>(null);

  // Restore pending swap from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_SWAP_KEY);
      if (!raw) return;
      const pending: PendingSwap = JSON.parse(raw);
      const age = Date.now() - pending.createdAt;
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(PENDING_SWAP_KEY);
        return;
      }
      setDepositAddress(pending.depositAddress);
      setAmount(pending.amount);
      setZecAddress(pending.zecAddress);
      setEstimatedZec(pending.estimatedZec);
      if (pending.txHash) setTxHash(pending.txHash);
      const restored: SourceToken = {
        id: `${pending.chain}:${pending.token}`,
        chain: pending.chain,
        chainLabel: pending.chainLabel,
        token: pending.token,
        decimals: pending.decimals,
        assetId: pending.assetId,
        contractAddress: pending.contractAddress,
      };
      setSelectedToken(restored);
      setStep('waiting');
    } catch {
      localStorage.removeItem(PENDING_SWAP_KEY);
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowWalletPicker(false);
      if (tokenPickerRef.current && !tokenPickerRef.current.contains(e.target as Node)) { setShowTokenPicker(false); setTokenSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch available tokens and popularity ranking from API
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const [tokensRes, pairsRes] = await Promise.all([
          fetch(`${API_CONFIG.POSTGRES_API_URL}/api/swap/tokens`),
          fetch(`${API_CONFIG.POSTGRES_API_URL}/api/crosschain/popular-pairs`).catch(() => null),
        ]);
        const tokensData = await tokensRes.json();
        const pairsData = pairsRes ? await pairsRes.json().catch(() => null) : null;
        const popularPairs: PopularPair[] = pairsData?.success ? pairsData.pairs : [];

        if (tokensData.success && tokensData.tokens?.length) {
          const mapped = apiTokensToSourceTokens(tokensData.tokens);
          if (mapped.length > 0) {
            const sorted = sortTokens(mapped, popularPairs);
            setAvailableTokens(sorted);
            setSelectedToken(sorted[0]);
          }
        }
      } catch { /* fallback list stays */ }
      finally { setTokensLoading(false); }
    };
    if (isMainnet) fetchTokens();
    else setTokensLoading(false);
  }, []);

  // Sync refund address with connected wallet
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      setRefundAddress(wallet.address);
    } else {
      setRefundAddress('');
    }
  }, [wallet.connected, wallet.address]);

  // Quote countdown timer
  useEffect(() => {
    if (step !== 'quote' || !quoteExpiry) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((quoteExpiry - Date.now()) / 1000));
      setQuoteTimeLeft(left);
      if (left === 0) {
        setStep('form');
        setError('Quote expired — please get a new one');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [step, quoteExpiry]);

  const NATIVE_TOKENS = ['eth', 'sol', 'btc', 'bnb', 'doge', 'ltc', 'avax', 'matic', 'pol'];
  const isNativeToken = NATIVE_TOKENS.includes(selectedToken.token.toLowerCase()) && !selectedToken.contractAddress;

  const evmChains = ['eth', 'base', 'arb', 'pol', 'op', 'avax', 'bsc'];
  const chainKey = selectedToken.chain;

  useEffect(() => {
    setNativeBalance(null);
    if (!wallet.connected) return;
    let cancelled = false;
    const fetchBal = async () => {
      let bal: string | null = null;
      const isEvm = evmChains.includes(chainKey);
      if (isNativeToken) {
        bal = await wallet.getNativeBalance(isEvm ? chainKey : undefined);
      } else if (selectedToken.contractAddress) {
        bal = await wallet.getTokenBalance(selectedToken.contractAddress, selectedToken.decimals, isEvm ? chainKey : undefined);
      } else {
        bal = await wallet.getNativeBalance(isEvm ? chainKey : undefined);
      }
      if (!cancelled) setNativeBalance(bal);
    };
    fetchBal();
    return () => { cancelled = true; };
  }, [wallet.connected, wallet.address, selectedToken]);

  // Fetch privacy recommendations
  useEffect(() => {
    const fetchRecs = async () => {
      try {
        const res = await fetch(`${API_CONFIG.POSTGRES_API_URL}/api/privacy/recommended-swap-amounts?chain=${selectedToken.chain}&token=${selectedToken.token}`);
        const data = await res.json();
        if (data.success) setRecommendations(data);
        else setRecommendations(null);
      } catch {
        setRecommendations(null);
      }
    };
    if (isMainnet) fetchRecs();
  }, [selectedToken]);

  // Persist pending swap to localStorage
  useEffect(() => {
    if (step === 'waiting' && depositAddress) {
      const pending: PendingSwap = {
        depositAddress,
        amount,
        token: selectedToken.token,
        chain: selectedToken.chain,
        chainLabel: selectedToken.chainLabel,
        assetId: selectedToken.assetId,
        decimals: selectedToken.decimals,
        contractAddress: selectedToken.contractAddress,
        zecAddress,
        estimatedZec,
        txHash: txHash || undefined,
        createdAt: Date.now(),
      };
      localStorage.setItem(PENDING_SWAP_KEY, JSON.stringify(pending));
    }
  }, [step, depositAddress, txHash]);

  // Poll swap status
  useEffect(() => {
    if (step !== 'waiting' || !depositAddress) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_CONFIG.POSTGRES_API_URL}/api/swap/status?depositAddress=${encodeURIComponent(depositAddress)}`);
        const data = await res.json();
        if (data.status === 'COMPLETE' || data.status === 'SUCCESS') {
          setSwapStatus('complete');
          setStep('complete');
          localStorage.removeItem(PENDING_SWAP_KEY);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === 'FAILED' || data.status === 'REFUNDED') {
          setSwapStatus(data.status.toLowerCase());
          setStep('error');
          setError(`Swap ${data.status.toLowerCase()}. Funds will be returned to your refund address.`);
          localStorage.removeItem(PENDING_SWAP_KEY);
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setSwapStatus(data.status || 'processing');
        }
      } catch { /* keep polling */ }
    };
    poll();
    pollRef.current = setInterval(poll, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, depositAddress]);

  const connectToWallet = async (w: DetectedWallet) => {
    setWalletError('');
    setShowWalletPicker(false);
    try {
      await wallet.connect(w);
    } catch (err: any) {
      setWalletError(err.message || 'Connection failed');
    }
  };

  const chainWallets = wallet.getWalletsForChain(selectedToken.chain);

  const filteredTokens = availableTokens.filter(t => {
    if (!tokenSearch) return true;
    const q = tokenSearch.toLowerCase();
    return t.token.toLowerCase().includes(q) || t.chainLabel.toLowerCase().includes(q) || t.chain.includes(q);
  });

  const getQuote = async () => {
    if (!amount || !zecAddress || validateZecAddress(zecAddress)) return;
    setLoading(true);
    setError('');
    try {
      const amountSmallest = BigInt(Math.round(parseFloat(amount) * Math.pow(10, selectedToken.decimals))).toString();
      const res = await fetch(`${API_CONFIG.POSTGRES_API_URL}/api/swap/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originAsset: selectedToken.assetId,
          destinationAsset: ZEC_ASSET_ID,
          amount: amountSmallest,
          recipient: zecAddress,
          refundTo: refundAddress || zecAddress,
          slippageBps: slippage,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to get quote');
      const q = data.quote || data;
      setQuote(data);
      setDepositAddress(q.depositAddress || data.depositAddress || '');
      const outAmount = q.amountOut || q.estimatedAmountOut || data.amountOut;
      if (outAmount) {
        setEstimatedZec((parseInt(outAmount) / Math.pow(10, ZEC_DECIMALS)).toFixed(4));
      }
      setQuoteExpiry(Date.now() + 60_000);
      setStep('quote');
    } catch (err: any) {
      setError(err.message || 'Failed to get quote');
    } finally {
      setLoading(false);
    }
  };

  const sendFromWallet = async () => {
    setSendingTx(true);
    setWalletError('');
    try {
      const hash = await wallet.sendTransaction(depositAddress, amount, selectedToken.decimals, selectedToken.contractAddress);
      setTxHash(hash);
    } catch (err: any) {
      setWalletError(err.message || 'Transaction rejected');
    } finally {
      setSendingTx(false);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetSwap = () => {
    setStep('form');
    setQuote(null);
    setDepositAddress('');
    setEstimatedZec('');
    setSwapStatus('');
    setError('');
    setTxHash('');
    setWalletError('');
    setCopied(false);
    localStorage.removeItem(PENDING_SWAP_KEY);
  };

  const insufficientBalance = !!(wallet.connected && nativeBalance && amount && parseFloat(amount) > parseFloat(nativeBalance));
  const zecAddrError = validateZecAddress(zecAddress);
  const ctaDisabled = loading || !amount || !zecAddress || !!zecAddrError || wallet.switching || insufficientBalance;
  const ctaText = ctaLabel({ loading, amount, zecAddress, walletConnected: wallet.connected, switching: wallet.switching, insufficientBalance });

  // -- Testnet fallback --
  if (!isMainnet) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-md mx-auto text-center">
          <div className="card py-16 px-8">
            <div className="w-12 h-12 rounded-full bg-cipher-cyan/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-6 h-6 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold font-mono text-primary mb-3">Mainnet Only</h1>
            <p className="text-sm text-muted mb-6">Cross-chain swaps require mainnet ZEC.</p>
            <a href="https://cipherscan.app/swap" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-sm text-cipher-cyan bg-cipher-cyan/10 hover:bg-cipher-cyan/15 transition-colors">
              Go to Mainnet
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header — cypherpunk style, consistent with other pages */}
        <div className="mb-8 animate-fade-in">
          <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
            <span className="opacity-50">{'>'}</span> CROSS_CHAIN_SWAP
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold font-mono text-primary">Buy ZEC</h1>
            <p className="text-sm text-secondary">
              Swap from 15+ chains via{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">NEAR Intents</a>
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fade-in-up">

          {/* ─── Main Swap Card ─── */}
          <div className="lg:col-span-3">
            <div className="card p-0 overflow-hidden">

              {/* Card header */}
              <div className="px-6 pt-5 pb-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted tracking-wider">&gt; SWAP</span>

                  {/* Wallet pill / picker */}
                  <div className="relative" ref={pickerRef}>
                    <button
                      onClick={() => setShowWalletPicker(!showWalletPicker)}
                      disabled={wallet.switching || chainWallets.length === 0}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono transition-all disabled:opacity-40 ${
                        wallet.connected
                          ? 'bg-cipher-green/8 hover:bg-white/[0.06] text-secondary'
                          : 'text-muted hover:text-cipher-cyan'
                      }`}
                      title={chainWallets.length === 0 ? 'No wallet detected for this chain' : undefined}
                    >
                      {wallet.connected ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-cipher-green" />
                          <span>{wallet.walletName} · {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span>{wallet.switching ? 'Connecting...' : chainWallets.length === 0 ? 'No wallet' : 'Connect'}</span>
                        </>
                      )}
                    </button>

                    {/* Wallet picker dropdown */}
                    {showWalletPicker && chainWallets.length > 0 && (
                      <div className="absolute right-0 top-full mt-2 z-50 min-w-[220px] rounded-xl bg-[var(--bg-surface,#14161F)] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in">
                        <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
                          <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Select wallet</span>
                          {wallet.connected && (
                            <button
                              onClick={() => { wallet.disconnect(); setShowWalletPicker(false); }}
                              className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors"
                            >
                              Disconnect
                            </button>
                          )}
                        </div>
                        {chainWallets.map((w) => (
                          <button
                            key={w.providerKey}
                            onClick={() => connectToWallet(w)}
                            className={`w-full flex items-center gap-3 px-3 py-3 transition-colors text-left ${
                              wallet.connected && wallet.walletName === w.name
                                ? 'bg-white/[0.06]'
                                : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <WalletIcon wallet={w} size={24} />
                            <div className="flex-1">
                              <div className="text-sm font-mono text-primary">{w.name}</div>
                              <div className="text-[10px] text-muted capitalize">{w.type}</div>
                            </div>
                            {wallet.connected && wallet.walletName === w.name && (
                              <span className="w-1.5 h-1.5 rounded-full bg-cipher-green shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6">

                {/* ─── FORM ─── */}
                {step === 'form' && (
                  <div className="space-y-6">

                    {/* From — token selector + amount in one row */}
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <label className="text-[11px] font-mono text-muted uppercase tracking-wider">You send</label>
                        {wallet.connected && nativeBalance && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted">
                              Bal: {parseFloat(nativeBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedToken.token}
                            </span>
                            <button
                              onClick={() => setAmount(String(parseFloat(nativeBalance) * 0.5))}
                              className="text-[10px] font-mono text-cipher-cyan hover:text-cipher-cyan/80 transition-colors"
                            >
                              50%
                            </button>
                            <button
                              onClick={() => setAmount(nativeBalance)}
                              className="text-[10px] font-mono text-cipher-cyan hover:text-cipher-cyan/80 transition-colors"
                            >
                              MAX
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex rounded-xl bg-white/[0.03] border border-white/[0.06] focus-within:border-cipher-cyan/40 focus-within:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all">
                        {/* Amount input */}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                          }}
                          placeholder="0.00"
                          className="flex-1 min-w-0 px-4 py-4 bg-transparent text-primary font-mono text-xl placeholder:text-muted/30 focus:outline-none"
                        />
                        {/* Token selector button */}
                        <div className="relative" ref={tokenPickerRef}>
                          <button
                            onClick={() => { setShowTokenPicker(!showTokenPicker); setTokenSearch(''); }}
                            className="flex items-center gap-2 px-4 py-4 hover:bg-white/[0.04] transition-colors h-full"
                          >
                            <TokenChainIcon token={selectedToken.token} chain={selectedToken.chain} size={24} />
                            <div className="text-left">
                              <div className="text-sm font-mono font-semibold text-primary leading-tight">{selectedToken.token}</div>
                              <div className="text-[10px] text-muted leading-tight">{selectedToken.chainLabel}</div>
                            </div>
                            <svg className="w-3.5 h-3.5 text-muted ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Token picker dropdown */}
                          {showTokenPicker && (
                            <div className="absolute right-0 top-full mt-1 z-50 w-[280px] max-h-[360px] rounded-xl bg-[var(--bg-surface,#14161F)] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-in">
                              <div className="p-2 border-b border-white/[0.04]">
                                <input
                                  type="text"
                                  value={tokenSearch}
                                  onChange={(e) => setTokenSearch(e.target.value)}
                                  placeholder="Search token or chain..."
                                  autoFocus
                                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] text-primary font-mono text-sm placeholder:text-muted/40 focus:outline-none"
                                />
                              </div>
                              <div className="overflow-y-auto max-h-[340px]">
                                {tokensLoading ? (
                                  <div className="px-3 py-8 text-center">
                                    <div className="w-5 h-5 mx-auto mb-2 rounded-full border-2 border-white/10 border-t-cipher-cyan animate-spin" />
                                    <div className="text-[11px] text-muted font-mono">Loading tokens...</div>
                                  </div>
                                ) : filteredTokens.length === 0 ? (
                                  <div className="px-3 py-6 text-center text-xs text-muted">No tokens found</div>
                                ) : (
                                  filteredTokens.map(t => (
                                    <button
                                      key={t.id}
                                      onClick={() => {
                                        setSelectedToken(t);
                                        setAmount('');
                                        setShowTokenPicker(false);
                                        setTokenSearch('');
                                        setShowWalletPicker(false);
                                        const newWallets = wallet.getWalletsForChain(t.chain);
                                        const sameType = newWallets.some(w => w.type === wallet.walletType);
                                        if (wallet.connected && !sameType) wallet.disconnect();
                                      }}
                                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                        selectedToken.id === t.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                                      }`}
                                    >
                                      <TokenChainIcon token={t.token} chain={t.chain} size={28} />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-mono text-primary">{t.token}</div>
                                        <div className="text-[10px] text-muted">{t.chainLabel}</div>
                                      </div>
                                      {selectedToken.id === t.id && (
                                        <svg className="w-4 h-4 text-cipher-cyan shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Privacy recommendation chips */}
                      {recommendations && recommendations.recommendations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {recommendations.recommendations.slice(0, 4).map((rec, i) => (
                            <button
                              key={i}
                              onClick={() => setAmount(String(rec.amount))}
                              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border ${
                                rec.blendingScore === 'high'
                                  ? 'border-cipher-green/30 text-cipher-green hover:bg-cipher-green/10'
                                  : rec.blendingScore === 'medium'
                                  ? 'border-amber-400/30 text-amber-400 hover:bg-amber-400/10'
                                  : 'border-white/10 text-muted hover:bg-white/[0.06]'
                              }`}
                            >
                              {formatRecAmount(rec.amount, recommendations.token)} {recommendations.token}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Arrow divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/[0.04]" />
                      <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center">
                        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                      <div className="flex-1 h-px bg-white/[0.04]" />
                    </div>

                    {/* To section */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-[11px] font-mono text-muted uppercase tracking-wider">You receive</label>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04]">
                          <TokenChainIcon token="zec" chain="zec" size={14} />
                          <span className="text-[11px] font-mono text-primary">ZEC</span>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={zecAddress}
                        onChange={(e) => setZecAddress(e.target.value)}
                        placeholder="t1... or t3..."
                        className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-primary font-mono text-sm placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/40 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all"
                      />
                      {zecAddress && zecAddrError ? (
                        <p className="mt-1.5 text-[10px] text-red-400 font-mono">{zecAddrError}</p>
                      ) : (
                        <p className="mt-1.5 text-[10px] text-muted/60 font-mono">Transparent address only (t1 or t3).</p>
                      )}
                    </div>

                    {/* Refund address — collapsed by default, shown if wallet connected or user opts in */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1.5">
                          Refund address
                          {wallet.connected && refundAddress === wallet.address && (
                            <span className="text-[10px] text-cipher-green normal-case tracking-normal">(wallet)</span>
                          )}
                        </label>
                        <button onClick={() => setShowSlippage(!showSlippage)} className="text-[10px] font-mono text-muted hover:text-secondary transition-colors">
                          {showSlippage ? 'Less options' : 'More options'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={refundAddress}
                        onChange={(e) => setRefundAddress(e.target.value)}
                        placeholder={wallet.connected ? 'Auto-filled from wallet' : `Your ${selectedToken.chainLabel} address (optional)`}
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-primary font-mono text-sm placeholder:text-muted/30 focus:outline-none focus:border-cipher-cyan/40 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all"
                      />
                    </div>

                    {/* Slippage (expandable) */}
                    {showSlippage && (
                      <div className="animate-fade-in">
                        <label className="text-[11px] font-mono text-muted uppercase tracking-wider mb-2 block">Slippage</label>
                        <div className="flex gap-1.5">
                          {[{ label: '0.5%', value: 50 }, { label: '1%', value: 100 }, { label: '2%', value: 200 }].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setSlippage(opt.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                slippage === opt.value
                                  ? 'bg-cipher-cyan/10 text-cipher-cyan'
                                  : 'text-muted hover:text-secondary bg-white/[0.02] hover:bg-white/[0.04]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {(error || walletError) && (
                      <div className="px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/20 text-sm text-red-400">
                        {error || walletError}
                      </div>
                    )}

                    {/* CTA — smart contextual button */}
                    <button
                      onClick={getQuote}
                      disabled={ctaDisabled}
                      className="w-full py-4 rounded-xl font-mono font-semibold text-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-b from-cipher-cyan to-[#00B8E0] text-[#08090F] hover:shadow-[0_4px_20px_rgba(0,212,255,0.25)] hover:-translate-y-[1px] active:translate-y-0 active:shadow-none"
                    >
                      {ctaText}
                    </button>

                    {/* Fee note */}
                    <p className="text-center text-[10px] font-mono text-muted/60">
                      Powered by NEAR Intents · Slippage: {slippage / 100}%
                    </p>
                  </div>
                )}

                {/* ─── QUOTE REVIEW ─── */}
                {step === 'quote' && quote && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Summary */}
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <TokenChainIcon token={selectedToken.token} chain={selectedToken.chain} size={28} />
                          <div>
                            <div className="text-lg font-bold font-mono text-primary">{amount} {selectedToken.token}</div>
                            <div className="text-[11px] text-muted">{selectedToken.chainLabel}</div>
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-lg font-bold font-mono text-foreground">{estimatedZec || '~'} ZEC</div>
                            <div className="text-[11px] text-muted">Estimated</div>
                          </div>
                          <TokenChainIcon token="zec" chain="zec" size={28} />
                        </div>
                      </div>

                      <div className="border-t border-white/[0.04] pt-3 space-y-1.5">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted">Slippage</span>
                          <span className="text-secondary">{slippage / 100}%</span>
                        </div>
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted">Destination</span>
                          <span className="text-secondary">{zecAddress.slice(0, 10)}...{zecAddress.slice(-6)}</span>
                        </div>
                      </div>
                    </div>

                    {quoteTimeLeft > 0 && (
                      <div className="flex items-center justify-center gap-2 text-xs font-mono">
                        <div className={`w-1.5 h-1.5 rounded-full ${quoteTimeLeft > 30 ? 'bg-cipher-green' : quoteTimeLeft > 10 ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
                        <span className={quoteTimeLeft > 30 ? 'text-muted' : quoteTimeLeft > 10 ? 'text-yellow-500' : 'text-red-500'}>
                          Quote expires in {Math.floor(quoteTimeLeft / 60)}:{(quoteTimeLeft % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button onClick={resetSwap} className="flex-1 py-3.5 rounded-xl font-mono text-sm text-muted hover:text-secondary border border-white/[0.06] hover:border-white/[0.12] transition-all">
                        Back
                      </button>
                      <button
                        onClick={() => setStep('waiting')}
                        className="flex-[2] py-3.5 rounded-xl font-mono font-semibold text-sm bg-gradient-to-b from-cipher-green to-[#00C870] text-[#08090F] hover:shadow-[0_4px_20px_rgba(0,230,118,0.2)] hover:-translate-y-[1px] active:translate-y-0 transition-all"
                      >
                        {wallet.connected ? 'Confirm & Send' : 'Confirm Swap'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── WAITING FOR DEPOSIT ─── */}
                {step === 'waiting' && (
                  <div className="space-y-5 animate-fade-in">
                    {/* Swap summary row */}
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <TokenChainIcon token={selectedToken.token} chain={selectedToken.chain} size={24} />
                          <div>
                            <div className="text-base font-bold font-mono text-primary">{amount} {selectedToken.token}</div>
                            <div className="text-[10px] text-muted">{selectedToken.chainLabel}</div>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base font-bold font-mono text-foreground">{estimatedZec || '~'} ZEC</div>
                            <div className="text-[10px] text-muted">Estimated</div>
                          </div>
                          <TokenChainIcon token="zec" chain="zec" size={24} />
                        </div>
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="flex items-center justify-center gap-2.5 py-1">
                      <div className="w-2 h-2 rounded-full bg-cipher-cyan animate-pulse" />
                      <span className="text-xs font-mono text-secondary uppercase tracking-wider">
                        {swapStatus ? swapStatus.replace(/_/g, ' ') : 'Waiting for deposit'}
                      </span>
                    </div>

                    {/* One-click wallet send */}
                    {wallet.connected && !txHash && (
                      <button
                        onClick={sendFromWallet}
                        disabled={sendingTx}
                        className="w-full py-3.5 rounded-xl font-mono font-semibold text-sm bg-gradient-to-b from-cipher-green to-[#00C870] text-[#08090F] hover:shadow-[0_4px_20px_rgba(0,230,118,0.2)] hover:-translate-y-[1px] active:translate-y-0 transition-all disabled:opacity-50"
                      >
                        {sendingTx ? 'Confirm in wallet...' : `Send ${amount} ${selectedToken.token}`}
                      </button>
                    )}

                    {txHash && (
                      <div className="rounded-xl bg-cipher-green/[0.06] border border-cipher-green/20 p-4">
                        <div className="flex items-center gap-2 justify-center mb-2">
                          <svg className="w-3.5 h-3.5 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          <span className="text-xs font-mono text-cipher-green font-semibold">Transaction sent</span>
                        </div>
                        {CHAIN_EXPLORERS[selectedToken.chain] ? (
                          <a
                            href={`${CHAIN_EXPLORERS[selectedToken.chain]}${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-cipher-cyan hover:text-cipher-cyan/80 break-all block text-center font-mono underline underline-offset-2 decoration-cipher-cyan/30"
                          >
                            {txHash} ↗
                          </a>
                        ) : (
                          <code className="text-[10px] text-muted break-all block text-center">{txHash}</code>
                        )}
                      </div>
                    )}

                    {walletError && <p className="text-xs text-red-400 text-center font-mono">{walletError}</p>}

                    {/* Manual deposit section */}
                    {(!wallet.connected || (wallet.connected && !txHash)) && (
                      <>
                        {wallet.connected && (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-white/[0.04]" />
                            <span className="text-[10px] font-mono text-muted">or send manually</span>
                            <div className="flex-1 h-px bg-white/[0.04]" />
                          </div>
                        )}

                        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
                          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Deposit address</div>
                          <div className="flex items-center gap-2">
                            <code className="text-[11px] text-secondary break-all font-mono flex-1 leading-relaxed">{depositAddress}</code>
                            <button
                              onClick={copyAddress}
                              className="shrink-0 p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                            >
                              {copied ? (
                                <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4 text-muted hover:text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {txHash ? (
                      <>
                        <p className="text-[10px] font-mono text-muted/60 text-center">
                          Your swap is processing and will complete automatically
                        </p>
                        <button onClick={resetSwap} className="w-full py-2.5 rounded-xl text-xs font-mono text-muted hover:text-secondary border border-white/[0.06] hover:border-white/[0.12] transition-all">
                          Start New Swap
                        </button>
                      </>
                    ) : (
                      <button onClick={resetSwap} className="w-full py-2.5 rounded-xl text-xs font-mono text-muted hover:text-secondary border border-white/[0.06] hover:border-white/[0.12] transition-all">
                        Cancel
                      </button>
                    )}
                  </div>
                )}

                {/* ─── COMPLETE ─── */}
                {step === 'complete' && (
                  <div className="text-center py-8 space-y-5 animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-cipher-green/10 flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold font-mono text-cipher-green mb-1">Swap Complete</h2>
                      <p className="text-sm text-muted">{estimatedZec} ZEC sent to your address</p>
                    </div>
                    <button onClick={resetSwap} className="px-6 py-2.5 rounded-xl font-mono text-sm text-cipher-cyan bg-cipher-cyan/10 hover:bg-cipher-cyan/15 transition-colors">
                      New Swap
                    </button>
                  </div>
                )}

                {/* ─── ERROR ─── */}
                {step === 'error' && (
                  <div className="text-center py-8 space-y-5 animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold font-mono text-red-400 mb-1">Swap Failed</h2>
                      <p className="text-sm text-muted">{error}</p>
                    </div>
                    <button onClick={resetSwap} className="px-6 py-2.5 rounded-xl font-mono text-sm text-muted hover:text-secondary border border-white/[0.06] hover:border-white/[0.12] transition-colors">
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Sidebar ─── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Privacy tips */}
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.04]">
                <span className="text-xs font-mono text-muted tracking-wider">&gt; PRIVACY_TIPS</span>
              </div>
              <div className="p-5">
                {recommendations && recommendations.recommendations.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted mb-3 leading-relaxed">
                      Popular {selectedToken.token} amounts this week. Common amounts make your swap harder to trace.
                    </p>
                    <div className="space-y-1.5">
                      {recommendations.recommendations.map((rec, i) => (
                        <button
                          key={i}
                          onClick={() => setAmount(String(rec.amount))}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.03] transition-all group text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-mono font-semibold text-primary group-hover:text-cipher-cyan transition-colors">
                              {formatRecAmount(rec.amount, recommendations.token)} {recommendations.token}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              rec.blendingScore === 'high' ? 'bg-cipher-green/10 text-cipher-green' :
                              rec.blendingScore === 'medium' ? 'bg-amber-400/10 text-amber-400' :
                              'bg-white/[0.04] text-muted'
                            }`}>
                              {rec.blendingScore}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-muted">{rec.swapCount} swaps</span>
                        </button>
                      ))}
                    </div>
                    {recommendations.tip && (
                      <p className="mt-4 text-[11px] text-muted/70 leading-relaxed">{recommendations.tip}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted text-center py-6">
                    Privacy recommendations appear once swap data is collected.
                  </p>
                )}
              </div>
            </div>

            <Link href="/flows" className="block text-center py-2.5 text-xs font-mono text-muted hover:text-cipher-cyan transition-colors">
              View all ZEC Flows →
            </Link>
          </div>
        </div>
      </div>
  );
}
