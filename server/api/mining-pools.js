/**
 * Mining Pool Attribution
 *
 * Maps known coinbase payout addresses to mining pool identities.
 * Sources: Zcashinfo.com labels, coinbase tag analysis, Shawn Murphy's peer analysis,
 * AiCoin on-chain article (confirmed addresses), 2Miners documentation.
 * Last updated: 2026-06-24
 */

const POOL_BY_ADDRESS = {
  // --- Foundry USA Pool ---
  // Coinbase tag: "Foundry Zcash Pool #PrivacyMatt..."
  // Source: Zcashinfo.com, AiCoin on-chain analysis (confirmed address)
  't1SqwRAAdSig6dE4EBPLonAait219VmkUjP': {
    name: 'Foundry USA',
    url: 'https://foundrydigital.com',
    region: 'US',
  },

  // --- F2Pool ---
  // Coinbase tag: "Mined by [username]"
  // Source: Zcashinfo.com, AiCoin on-chain analysis
  't1PEp2GJLSdhDfCKqc2J211WKDUS1NfoQNy': {
    name: 'F2Pool',
    url: 'https://f2pool.com',
    region: 'HK',
  },

  // --- ViaBTC ---
  // No distinctive coinbase tag (just version bytes)
  // Source: AiCoin confirmed "t1at7nV...received 1.73M ZEC total"
  't1at7nVNsv6taLRrNRvnQdtfLNRDfsGc3Ak': {
    name: 'ViaBTC',
    url: 'https://www.viabtc.com',
    region: 'US/CN',
    deprecated: '2026-06-22',
  },
  // Unidentified — consistent ~7% hashrate, stopped Jun 15. Possibly ViaBTC secondary
  // or Luxor. Timing correlates with address rotations but no coinbase tag to confirm.
  't1K79TgQbqu74d6rBmsMu2oFEXEwAmdYiT7': {
    name: 'Unidentified #5',
    url: null,
    region: null,
    deprecated: '2026-06-15',
  },
  // ViaBTC new primary address (started Jun 15, currently ~27-40% hashrate)
  // No coinbase tag — consistent with ViaBTC's pattern
  't1MKn34KBa8Xh4g8qU8psibBXvURafphVn7': {
    name: 'ViaBTC',
    url: 'https://www.viabtc.com',
    region: 'US/CN',
  },

  // --- AntPool ---
  // Coinbase tag: "." (minimal single dot)
  // Source: Confirmed via coinbase tag matching against network monitoring
  't1ZVi2YGk98tEGYcNpXYnJFWCoLG2oYwv3J': {
    name: 'AntPool',
    url: 'https://www.antpool.com',
    region: 'JP',
    deprecated: '2026-06-15',
  },
  // AntPool current address (active since May 2026, confirmed by coinbase tag)
  't1L2b66MXbgpVMXDfUa94GCBFAN4dCxGohM': {
    name: 'AntPool',
    url: 'https://www.antpool.com',
    region: 'JP',
  },

  // --- 2Miners ---
  // Coinbase tag: "2Miners https://2miners.com"
  't1bnxtY7aLCjWx9Ru1YcGwRWch3eEWUFK7u': {
    name: '2Miners',
    url: 'https://2miners.com',
    region: 'EU',
    deprecated: '2026-06-02',
  },
  // 2Miners current address (confirmed by coinbase tag, also in 2Miners documentation)
  't1fu6KgYtHEXk2ZhTpM1XD7jbnSmW6wokDM': {
    name: '2Miners',
    url: 'https://2miners.com',
    region: 'EU',
  },

  // --- Kryptex ---
  't1Mofe2EigYNfgqSTPbK4k1iJTxyCEEQCEC': {
    name: 'Kryptex',
    url: 'https://www.kryptex.com',
    region: 'EU',
  },

  // --- Identified by peer analysis (Shawn Murphy) ---
  // IP: 15.204.182.52, Reston VA
  't1XQZdZMnzXBcL8yx2PR27dSNrqctgwLgux': {
    name: 'Luxor',
    url: 'https://luxor.tech',
    region: 'US',
  },
  // IP: 3.65.53.91, Frankfurt
  't1egMFNkP7EfkK25y8s4GeiMkEGnqcMnTb1': {
    name: 'Mining Dutch',
    url: 'https://www.mining-dutch.nl',
    region: 'EU',
  },

  // --- Smaller/emerging miners ---
  // Growing miner, no coinbase tag, appeared Jun 15 (~11% in 24h as of Jun 24)
  't1SEgZvXCu3ceE42qrq5pCeSq7HbLjX8NJv': {
    name: 'NiceHash',
    url: 'https://www.nicehash.com',
    region: null,
  },
  // Small miner, v4 blocks, appeared Jun 10 (~1.9%)
  't1fpcZ2Dbwn4oj35oWBTUhtmUciSq7HG7LU': {
    name: 'Solopool',
    url: 'https://solopool.org',
    region: null,
  },
  // Small consistent miner
  't1Na7ykQ6vE4CbxBPuUDUQx5n6aEWXu1VQq': {
    name: 'Binance Pool',
    url: 'https://pool.binance.com',
    region: null,
  },
  // Small miner
  't1e6hceYHkzCbwcwGZzKeMfXXW7x7gr19Cw': {
    name: 'Poolin',
    url: 'https://www.poolin.com',
    region: 'CN',
  },

  // --- Dev Fund (not a pool) ---
  't3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow': {
    name: 'Dev Fund',
    url: null,
    region: null,
  },
};

function getPoolName(address) {
  if (!address) return null;
  const pool = POOL_BY_ADDRESS[address];
  return pool ? pool.name : null;
}

function getPoolInfo(address) {
  if (!address) return null;
  return POOL_BY_ADDRESS[address] || null;
}

module.exports = { POOL_BY_ADDRESS, getPoolName, getPoolInfo };
