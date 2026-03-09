'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { parseUnits, type Chain } from 'viem';
import { mainnet, base, arbitrum, polygon, optimism, avalanche, bsc } from 'viem/chains';

type WalletType = 'evm' | 'solana' | 'bitcoin' | null;

const SOLANA_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY || ''}`;

export interface DetectedWallet {
  type: WalletType;
  name: string;
  icon?: string;
  providerKey: string;
}

interface WalletState {
  connected: boolean;
  address: string | null;
  walletType: WalletType;
  walletName: string | null;
  chainId: number | null;
}

interface UseWalletReturn extends WalletState {
  connect: (wallet: DetectedWallet) => Promise<void>;
  disconnect: () => void;
  sendTransaction: (to: string, amount: string, decimals: number) => Promise<string>;
  getNativeBalance: (evmChainKey?: string) => Promise<string | null>;
  getTokenBalance: (contractAddress: string, decimals: number, evmChainKey?: string) => Promise<string | null>;
  switchEvmChain: (chainKey: string) => Promise<boolean>;
  getWalletsForChain: (chainId: string) => DetectedWallet[];
  allWallets: DetectedWallet[];
  switching: boolean;
}

const EVM_CHAINS: Record<string, Chain> = {
  eth: mainnet, base, arb: arbitrum, pol: polygon, op: optimism, avax: avalanche, bsc,
};

// ── EIP-6963 types ──
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
interface EIP6963Detail {
  info: EIP6963ProviderInfo;
  provider: any;
}

// Stored EIP-6963 providers (populated by event listener)
let eip6963Providers: EIP6963Detail[] = [];
let eip6963Requested = false;

function requestEIP6963() {
  if (typeof window === 'undefined' || eip6963Requested) return;
  eip6963Requested = true;
  window.addEventListener('eip6963:announceProvider', ((e: CustomEvent<EIP6963Detail>) => {
    const existing = eip6963Providers.find(p => p.info.uuid === e.detail.info.uuid);
    if (!existing) eip6963Providers.push(e.detail);
  }) as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

function identifyProvider(p: any): string {
  // Check in priority order — Phantom & Rabby both set isMetaMask=true
  if (p.isPhantom) return 'Phantom';
  if (p.isRabby) return 'Rabby';
  if (p.isBraveWallet) return 'Brave Wallet';
  if (p.isCoinbaseWallet) return 'Coinbase Wallet';
  if (p.isTrust) return 'Trust Wallet';
  if (p.isMetaMask) return 'MetaMask';
  return 'Browser Wallet';
}

function getEvmProviders(): { name: string; icon?: string; key: string; provider: any }[] {
  if (typeof window === 'undefined') return [];

  // Prefer EIP-6963 — each wallet announces itself with real name & icon
  if (eip6963Providers.length > 0) {
    return eip6963Providers.map((entry, i) => ({
      name: entry.info.name,
      icon: entry.info.icon,
      key: `eip6963-${entry.info.rdns || entry.info.uuid}`,
      provider: entry.provider,
    }));
  }

  // Legacy fallback: probe window.ethereum
  const results: { name: string; key: string; provider: any }[] = [];
  const seen = new WeakSet();
  const ethereum = (window as any).ethereum;
  if (!ethereum) return results;

  if (ethereum.providers?.length) {
    for (let i = 0; i < ethereum.providers.length; i++) {
      const p = ethereum.providers[i];
      if (seen.has(p)) continue;
      seen.add(p);
      const name = identifyProvider(p);
      results.push({ name, key: `evm-${name.toLowerCase().replace(/\s+/g, '-')}-${i}`, provider: p });
    }
  }

  // Check dedicated injection points for wallets that may not appear in providers[]
  const dedicated: { flag: string; obj: any; name: string }[] = [
    { flag: 'phantom', obj: (window as any).phantom?.ethereum, name: 'Phantom' },
    { flag: 'rabby', obj: ethereum?.isRabby ? ethereum : null, name: 'Rabby' },
  ];

  for (const { obj, name } of dedicated) {
    if (obj && !seen.has(obj)) {
      seen.add(obj);
      results.push({ name, key: `evm-${name.toLowerCase()}-dedicated`, provider: obj });
    }
  }

  // If nothing found from providers[] or dedicated, use the main ethereum object
  if (results.length === 0 && ethereum) {
    const name = identifyProvider(ethereum);
    results.push({ name, key: 'evm-default', provider: ethereum });
  }

  return results;
}

// ── Wallet Standard (Solana) — icon discovery only ──
interface StandardWallet { name: string; icon: string; chains: readonly string[]; features: Record<string, any>; }

let standardWallets: StandardWallet[] = [];
let standardWalletsRequested = false;

function requestStandardWallets() {
  if (typeof window === 'undefined' || standardWalletsRequested) return;
  standardWalletsRequested = true;

  const register = (...wallets: StandardWallet[]) => {
    for (const w of wallets) {
      if (!standardWallets.find(sw => sw.name === w.name)) {
        standardWallets.push(w);
      }
    }
  };

  window.addEventListener('wallet-standard:register-wallet', ((e: CustomEvent) => {
    if (typeof e.detail === 'function') e.detail(register);
  }) as EventListener);

  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: register }));
}

function getIconFromAnySource(name: string): string | undefined {
  // 1. Wallet Standard
  const std = standardWallets.find(sw => sw.name.toLowerCase() === name.toLowerCase());
  if (std?.icon) return std.icon;

  // 2. EIP-6963 (Phantom registers on both EVM and Solana — reuse its EVM icon)
  const eip = eip6963Providers.find(p => p.info.name.toLowerCase().includes(name.toLowerCase()));
  if (eip?.info.icon) return eip.info.icon;

  return undefined;
}

function getSolanaProviders(): { name: string; icon?: string; key: string; provider: any }[] {
  if (typeof window === 'undefined') return [];
  const results: { name: string; icon?: string; key: string; provider: any }[] = [];

  const phantom = (window as any).phantom?.solana || (window as any).solana;
  if (phantom?.isPhantom) {
    const icon = getIconFromAnySource('Phantom');
    results.push({ name: 'Phantom', icon, key: 'sol-phantom', provider: phantom });
  }
  const solflare = (window as any).solflare;
  if (solflare?.isSolflare) {
    const icon = getIconFromAnySource('Solflare');
    results.push({ name: 'Solflare', icon, key: 'sol-solflare', provider: solflare });
  }

  return results;
}

function getBitcoinProviders(): { name: string; icon?: string; key: string; provider: any }[] {
  if (typeof window === 'undefined') return [];
  const results: { name: string; icon?: string; key: string; provider: any }[] = [];
  const unisat = (window as any).unisat;
  if (unisat) results.push({ name: 'Unisat', icon: (unisat as any).icon, key: 'btc-unisat', provider: unisat });
  const xverse = (window as any).XverseProviders?.BitcoinProvider;
  if (xverse) results.push({ name: 'Xverse', key: 'btc-xverse', provider: xverse });
  return results;
}

function getAllProviders() {
  return {
    evm: getEvmProviders(),
    solana: getSolanaProviders(),
    bitcoin: getBitcoinProviders(),
  };
}

function chainToWalletType(chainId: string): WalletType {
  if (['eth', 'base', 'arb', 'pol', 'op', 'avax', 'bnb', 'bsc'].includes(chainId)) return 'evm';
  if (chainId === 'sol') return 'solana';
  if (['btc', 'doge', 'ltc'].includes(chainId)) return 'bitcoin';
  // near, xrp, ton, trx: no browser wallet integration — manual send
  return null;
}

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    connected: false, address: null, walletType: null, walletName: null, chainId: null,
  });
  const [switching, setSwitching] = useState(false);
  const [rawProvider, setRawProvider] = useState<any>(null);
  const [allWallets, setAllWallets] = useState<DetectedWallet[]>([]);

  const detectWallets = useCallback(() => {
    const providers = getAllProviders();
    const wallets: DetectedWallet[] = [];
    for (const p of providers.evm) wallets.push({ type: 'evm', name: p.name, icon: p.icon, providerKey: p.key });
    for (const p of providers.solana) wallets.push({ type: 'solana', name: p.name, icon: p.icon, providerKey: p.key });
    for (const p of providers.bitcoin) wallets.push({ type: 'bitcoin', name: p.name, icon: p.icon, providerKey: p.key });
    setAllWallets(wallets);
  }, []);

  useEffect(() => {
    requestEIP6963();
    requestStandardWallets();

    const onAnnounce = () => detectWallets();
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.addEventListener('wallet-standard:register-wallet', onAnnounce);

    const t1 = setTimeout(detectWallets, 150);
    const t2 = setTimeout(detectWallets, 600);
    const t3 = setTimeout(detectWallets, 2000);

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      window.removeEventListener('wallet-standard:register-wallet', onAnnounce);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [detectWallets]);

  const getWalletsForChain = useCallback((chainId: string): DetectedWallet[] => {
    const wType = chainToWalletType(chainId);
    if (!wType) return [];
    return allWallets.filter(w => w.type === wType);
  }, [allWallets]);

  const connect = useCallback(async (wallet: DetectedWallet) => {
    if (!wallet.type) return;
    setSwitching(true);
    try {
      if (wallet.type === 'evm') {
        const providers = getEvmProviders();
        const match = providers.find(p => p.key === wallet.providerKey);
        if (!match) throw new Error(`${wallet.name} not found. Is the extension enabled?`);

        const accounts = await match.provider.request({ method: 'eth_requestAccounts' });
        const chainId = await match.provider.request({ method: 'eth_chainId' });

        setRawProvider(match.provider);
        setState({
          connected: true,
          address: accounts[0],
          walletType: 'evm',
          walletName: match.name,
          chainId: parseInt(chainId, 16),
        });
      } else if (wallet.type === 'solana') {
        const providers = getSolanaProviders();
        const match = providers.find(p => p.key === wallet.providerKey);
        if (!match) throw new Error(`${wallet.name} not found. Is the extension enabled?`);

        const resp = await match.provider.connect();
        setRawProvider(match.provider);
        setState({
          connected: true,
          address: resp.publicKey.toString(),
          walletType: 'solana',
          walletName: match.name,
          chainId: null,
        });
      } else if (wallet.type === 'bitcoin') {
        const providers = getBitcoinProviders();
        const match = providers.find(p => p.key === wallet.providerKey);
        if (!match) throw new Error(`${wallet.name} not found. Is the extension enabled?`);

        if (match.key.includes('unisat')) {
          const accounts = await match.provider.requestAccounts();
          setRawProvider(match.provider);
          setState({ connected: true, address: accounts[0], walletType: 'bitcoin', walletName: match.name, chainId: null });
        } else {
          const resp = await match.provider.connect();
          setRawProvider(match.provider);
          setState({ connected: true, address: resp?.address || resp?.addresses?.[0]?.address, walletType: 'bitcoin', walletName: match.name, chainId: null });
        }
      }
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      const code = err?.code;
      const userRejected = code === 4001 || code === -32603
        || msg.includes('user rejected') || msg.includes('user denied')
        || msg.includes('user cancelled') || msg.includes('user canceled')
        || msg.includes('rejected the request');
      if (!userRejected) {
        console.error('Wallet connection failed:', err);
        throw err;
      }
    } finally {
      setSwitching(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (state.walletType === 'solana' && rawProvider?.disconnect) rawProvider.disconnect();
    setRawProvider(null);
    setState({ connected: false, address: null, walletType: null, walletName: null, chainId: null });
  }, [state.walletType, rawProvider]);

  const sendTransaction = useCallback(async (to: string, amount: string, decimals: number): Promise<string> => {
    if (!state.connected || !rawProvider) throw new Error('Wallet not connected');

    if (state.walletType === 'evm') {
      const value = parseUnits(amount, decimals);
      return await rawProvider.request({
        method: 'eth_sendTransaction',
        params: [{ from: state.address, to, value: '0x' + value.toString(16) }],
      });
    }

    if (state.walletType === 'solana') {
      const { PublicKey, SystemProgram, Transaction, Connection } = await import('@solana/web3.js');
      const connection = new Connection(SOLANA_RPC);
      const lamports = Math.round(parseFloat(amount) * Math.pow(10, decimals));
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: new PublicKey(state.address!), toPubkey: new PublicKey(to), lamports })
      );
      tx.feePayer = new PublicKey(state.address!);
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await rawProvider.signAndSendTransaction(tx);
      return signed.signature;
    }

    if (state.walletType === 'bitcoin') {
      const satoshis = Math.round(parseFloat(amount) * 1e8);
      return await rawProvider.sendBitcoin(to, satoshis);
    }

    throw new Error('Unknown wallet type');
  }, [state, rawProvider]);

  const switchEvmChain = useCallback(async (chainKey: string): Promise<boolean> => {
    if (state.walletType !== 'evm' || !rawProvider) return false;
    const target = EVM_CHAINS[chainKey];
    if (!target) return false;
    const targetHex = '0x' + target.id.toString(16);
    try {
      const currentHex = await rawProvider.request({ method: 'eth_chainId' });
      if (parseInt(currentHex, 16) === target.id) return true;
      await rawProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] });
      setState(prev => ({ ...prev, chainId: target.id }));
      return true;
    } catch (err: any) {
      if (err?.code === 4902) {
        try {
          await rawProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetHex,
              chainName: target.name,
              rpcUrls: target.rpcUrls?.default?.http ? [...target.rpcUrls.default.http] : [],
              nativeCurrency: target.nativeCurrency,
              blockExplorers: target.blockExplorers?.default ? [{ url: target.blockExplorers.default.url }] : [],
            }],
          });
          setState(prev => ({ ...prev, chainId: target.id }));
          return true;
        } catch { /* user rejected add */ }
      }
      console.error('[wallet] Chain switch failed:', err);
      return false;
    }
  }, [state.walletType, rawProvider]);

  const getTokenBalance = useCallback(async (contractAddress: string, decimals: number, evmChainKey?: string): Promise<string | null> => {
    if (!state.connected || !state.address) return null;
    try {
      if (state.walletType === 'evm' && rawProvider) {
        if (evmChainKey) await switchEvmChain(evmChainKey);
        const data = '0x70a08231' + state.address.slice(2).padStart(64, '0');
        const hex = await rawProvider.request({
          method: 'eth_call',
          params: [{ to: contractAddress, data }, 'latest'],
        });
        const raw = BigInt(hex);
        const bal = (Number(raw) / Math.pow(10, decimals)).toFixed(6);
        return bal;
      }
      if (state.walletType === 'solana') {
        console.log('[wallet] Fetching SPL balance:', { address: state.address, mint: contractAddress });
        const rpcRes = await fetch(SOLANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getTokenAccountsByOwner',
            params: [state.address, { mint: contractAddress }, { encoding: 'jsonParsed' }],
          }),
        });
        const rpcData = await rpcRes.json();
        console.log('[wallet] SPL RPC response:', JSON.stringify(rpcData).slice(0, 500));
        const accounts = rpcData.result?.value || [];
        if (accounts.length > 0) {
          const info = accounts[0].account.data.parsed.info;
          const bal = (Number(info.tokenAmount.amount) / Math.pow(10, info.tokenAmount.decimals)).toFixed(6);
          return bal;
        }
        return '0';
      }
    } catch (err) {
      console.error('[wallet] Token balance fetch failed:', err);
    }
    return null;
  }, [state, rawProvider, switchEvmChain]);

  const getNativeBalance = useCallback(async (evmChainKey?: string): Promise<string | null> => {
    if (!state.connected || !rawProvider || !state.address) return null;
    try {
      if (state.walletType === 'evm') {
        if (evmChainKey) await switchEvmChain(evmChainKey);
        const hex = await rawProvider.request({ method: 'eth_getBalance', params: [state.address, 'latest'] });
        const wei = BigInt(hex);
        const bal = (Number(wei) / 1e18).toFixed(6);
        return bal;
      }
      if (state.walletType === 'solana') {
        const rpcRes = await fetch(SOLANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [state.address] }),
        });
        const rpcData = await rpcRes.json();
        if (rpcData.result?.value != null) {
          const bal = (rpcData.result.value / 1e9).toFixed(6);
          return bal;
        }
      }
      if (state.walletType === 'bitcoin') {
        if (rawProvider.getBalance) {
          const sats = await rawProvider.getBalance();
          const bal = (sats / 1e8).toFixed(8);
          return bal;
        }
      }
    } catch (err) {
      console.error('[wallet] Balance fetch failed:', err);
    }
    return null;
  }, [state, rawProvider, switchEvmChain]);

  return {
    ...state,
    connect,
    disconnect,
    sendTransaction,
    getNativeBalance,
    getTokenBalance,
    switchEvmChain,
    getWalletsForChain,
    allWallets,
    switching,
  };
}
