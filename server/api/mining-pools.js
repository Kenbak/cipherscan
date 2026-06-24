/**
 * Mining Pool Attribution
 *
 * Maps known coinbase payout addresses to mining pool identities.
 * Sources: Zcashinfo.com labels, Shawn Murphy's peer analysis, public pool announcements.
 * Last updated: 2026-06-02
 */

const POOL_BY_ADDRESS = {
  // Foundry USA Pool — institutional, US-based, ~30% hashrate
  // Source: Zcashinfo.com, BusinessWire announcement, Odaily on-chain analysis
  't1SqwRAAdSig6dE4EBPLonAait219VmkUjP': {
    name: 'Foundry USA',
    url: 'https://foundrydigital.com',
    region: 'US',
  },

  // F2Pool — major global pool, PPS+ payout, 3% fee
  // Source: Zcashinfo.com, Odaily on-chain analysis
  't1PEp2GJLSdhDfCKqc2J211WKDUS1NfoQNy': {
    name: 'F2Pool',
    url: 'https://f2pool.com',
    region: 'HK',
  },

  // ViaBTC — long-running pool, dominant before Foundry entry
  // Source: Zcashinfo.com, Odaily on-chain analysis (confirmed main address)
  't1at7nVNsv6taLRrNRvnQdtfLNRDfsGc3Ak': {
    name: 'ViaBTC',
    url: 'https://www.viabtc.com',
    region: 'US/CN',
  },

  // Likely AntPool based on block volume (4th largest, consistent with Antpool's ~10% share)
  't1ZVi2YGk98tEGYcNpXYnJFWCoLG2oYwv3J': {
    name: 'AntPool',
    url: 'https://www.antpool.com',
    region: 'JP',
  },

  // Likely Foundry secondary address or large institutional miner
  't1K79TgQbqu74d6rBmsMu2oFEXEwAmdYiT7': {
    name: 'Unknown Pool #5',
    url: null,
    region: null,
  },

  // 2Miners
  't1bnxtY7aLCjWx9Ru1YcGwRWch3eEWUFK7u': {
    name: '2Miners',
    url: 'https://2miners.com',
    region: 'EU',
  },

  // Unknown — possibly ViaBTC Solo or similar
  't1L2b66MXbgpVMXDfUa94GCBFAN4dCxGohM': {
    name: 'Unknown Pool #7',
    url: null,
    region: null,
  },

  // Identified by Shawn Murphy's peer analysis (IP: 15.204.182.52, Reston VA)
  't1XQZdZMnzXBcL8yx2PR27dSNrqctgwLgux': {
    name: 'Unknown Pool (US)',
    url: null,
    region: 'US',
  },

  // Identified by Shawn Murphy's peer analysis (IP: 3.65.53.91, Frankfurt)
  't1egMFNkP7EfkK25y8s4GeiMkEGnqcMnTb1': {
    name: 'Unknown Pool (EU)',
    url: null,
    region: 'EU',
  },

  // Kryptex — smaller pool
  't1Mofe2EigYNfgqSTPbK4k1iJTxyCEEQCEC': {
    name: 'Kryptex',
    url: 'https://www.kryptex.com',
    region: 'EU',
  },

  // Rising pool — surged to ~27% hashrate in June 2026 (7d window)
  // Address first appeared with high block volume around mid-June 2026
  't1MKn34KBa8Xh4g8qU8psibBXvURafphVn7': {
    name: 'Unknown Pool (Rising)',
    url: null,
    region: null,
  },

  // Consistent ~5-6% hashrate, appeared in May/June 2026 data
  't1fu6KgYtHEXk2ZhTpM1XD7jbnSmW6wokDM': {
    name: 'Unknown Pool #8',
    url: null,
    region: null,
  },

  // Dev Fund recipient (not a pool, but worth labelling)
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
