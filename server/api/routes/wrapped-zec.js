/**
 * Wrapped ZEC Routes
 * /api/wrapped-zec/* — read-only tracker for ZEC representations on other chains
 *
 * None of this touches the shared PostgreSQL database or cipherscan-rust.
 * Each asset is read via a single cached, read-only view call against that
 * chain's public RPC (Base, Solana, or NEAR). No user input, no wallet
 * interaction, no writes.
 *
 * Every contract/mint/account address below was verified before being
 * added here — either by cross-referencing multiple independent sources
 * (name/symbol/decimals agreement) or by matching a live on-chain supply
 * figure against a third-party aggregator (2026-09-02). Do not add an
 * entry without doing the same; a wrong address here would misreport a
 * real asset's supply.
 */

const express = require('express');
const router = express.Router();
const { getErc20Supply } = require('../../lib/base-rpc');
const { getSplTokenSupply } = require('../../lib/solana-rpc');
const { getNep141Supply } = require('../../lib/near-rpc');
const { logSafeError } = require('../lib/safe-log');

const ASSETS = [
  {
    id: 'cbzec',
    label: 'cbZEC',
    issuer: 'Coinbase',
    chain: 'base',
    chainType: 'evm',
    address: process.env.CBZEC_CONTRACT_ADDRESS || '0xB2000000000000000000008501b13360000cb2EC',
    explorerUrl: (addr) => `https://basescan.org/token/${addr}`,
  },
  {
    id: 'uzec',
    label: 'uZEC',
    issuer: 'Universal Protocol',
    chain: 'base',
    chainType: 'evm',
    address: process.env.UZEC_CONTRACT_ADDRESS || '0x83f31af747189c2fa9e5deb253200c505eff6ed2',
    explorerUrl: (addr) => `https://basescan.org/token/${addr}`,
  },
  {
    id: 'zenzec',
    label: 'zenZEC',
    issuer: 'Zenrock',
    chain: 'sol',
    chainType: 'solana',
    address: process.env.ZENZEC_MINT_ADDRESS || 'JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS',
    explorerUrl: (addr) => `https://solscan.io/token/${addr}`,
  },
  {
    id: 'near-intents-zec',
    label: 'ZEC (NEAR Intents)',
    issuer: 'NEAR Intents / OmniBridge',
    chain: 'near',
    chainType: 'near',
    address: process.env.NEAR_ZEC_ACCOUNT_ID || 'zec.omft.near',
    explorerUrl: (addr) => `https://nearblocks.io/address/${addr}`,
  },
  {
    id: 'omnibridge-sol-zec',
    label: 'ZEC (OmniBridge)',
    issuer: 'OmniBridge',
    chain: 'sol',
    chainType: 'solana',
    address: process.env.OMNIBRIDGE_SOL_ZEC_MINT || 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
    explorerUrl: (addr) => `https://solscan.io/token/${addr}`,
  },
];

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — supply moves slowly; be gentle on public RPCs

let cache = null; // { data, ts }

// Number is safe here: ZEC's entire 21M supply, even at 18 decimals, is far
// below Number.MAX_SAFE_INTEGER once divided. BigInt division avoids float
// rounding on the raw on-chain value first.
function formatWholeUnits(raw, decimals) {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  return Number(whole) + Number(remainder) / Number(divisor);
}

async function fetchAssetSupply(asset) {
  const { totalSupplyRaw, decimals } =
    asset.chainType === 'evm' ? await getErc20Supply(asset.address)
    : asset.chainType === 'solana' ? await getSplTokenSupply(asset.address)
    : await getNep141Supply(asset.address);

  return {
    id: asset.id,
    label: asset.label,
    issuer: asset.issuer,
    chain: asset.chain,
    address: asset.address,
    decimals,
    totalSupplyRaw: totalSupplyRaw.toString(),
    totalSupply: formatWholeUnits(totalSupplyRaw, decimals),
    explorerUrl: asset.explorerUrl(asset.address),
  };
}

router.get('/api/wrapped-zec/supply', async (req, res) => {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return res.json(cache.data);
    }

    const results = await Promise.allSettled(ASSETS.map(fetchAssetSupply));

    const assets = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? ASSETS[i].id : null))
      .filter(Boolean);

    if (failed.length) {
      console.error('❌ [WRAPPED-ZEC] supply fetch failed for:', failed.join(', '));
    }

    // Partial success is still useful — don't hide the assets that did resolve.
    if (assets.length === 0) {
      throw new Error('All wrapped-ZEC supply lookups failed');
    }

    const data = {
      success: true,
      assets,
      totalWrapped: assets.reduce((sum, a) => sum + a.totalSupply, 0),
      updatedAt: new Date().toISOString(),
    };

    cache = { data, ts: Date.now() };
    res.json(data);
  } catch (error) {
    logSafeError('❌ [WRAPPED-ZEC] supply fetch error:', error);
    if (cache) {
      return res.json({ ...cache.data, stale: true });
    }
    res.status(503).json({ success: false, error: 'Wrapped ZEC supply temporarily unavailable' });
  }
});

module.exports = router;
