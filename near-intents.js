/**
 * NEAR Intents API Client
 *
 * Fetches cross-chain swap data for ZEC via NEAR Intents Explorer API
 * Docs: https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api
 * Swagger: https://explorer.near-intents.org/api/docs
 */

const NEAR_INTENTS_API_BASE = 'https://explorer.near-intents.org/api/v0';

// Chain ID mapping
const CHAIN_IDS = {
  zec: 'zec',
  btc: 'btc',
  eth: 'eth',
  sol: 'sol',
  near: 'near',
  doge: 'doge',
  xrp: 'xrp',
  usdc: 'usdc', // This would be token-based, not chain
};

// Chain display config
const CHAIN_CONFIG = {
  btc: { color: '#F7931A', symbol: 'BTC', name: 'Bitcoin' },
  eth: { color: '#627EEA', symbol: 'ETH', name: 'Ethereum' },
  sol: { color: '#14F195', symbol: 'SOL', name: 'Solana' },
  near: { color: '#00C08B', symbol: 'NEAR', name: 'NEAR' },
  doge: { color: '#C2A633', symbol: 'DOGE', name: 'Dogecoin' },
  xrp: { color: '#23292F', symbol: 'XRP', name: 'Ripple' },
  zec: { color: '#F4B728', symbol: 'ZEC', name: 'Zcash' },
  base: { color: '#0052FF', symbol: 'BASE', name: 'Base' },
  arb: { color: '#28A0F0', symbol: 'ARB', name: 'Arbitrum' },
  pol: { color: '#8247E5', symbol: 'POL', name: 'Polygon' },
  bsc: { color: '#F3BA2F', symbol: 'BNB', name: 'BNB Chain' },
  avax: { color: '#E84142', symbol: 'AVAX', name: 'Avalanche' },
};

/**
 * NEAR Intents API Client
 */
class NearIntentsClient {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.NEAR_INTENTS_API_KEY;
    this.baseUrl = NEAR_INTENTS_API_BASE;

    // In-memory cache
    this.cache = {
      inflows: null,
      outflows: null,
      lastFetch: 0,
    };
    this.cacheDuration = 60 * 1000; // 1 minute cache
  }

  /**
   * Check if API key is configured
   */
  hasApiKey() {
    return !!this.apiKey;
  }

  /**
   * Make authenticated request to NEAR Intents API
   */
  async request(endpoint, params = {}) {
    if (!this.apiKey) {
      throw new Error('NEAR_INTENTS_API_KEY not configured. Get one at: https://docs.google.com/forms/d/e/1FAIpQLSdrSrqSkKOMb_a8XhwF0f7N5xZ0Y5CYgyzxiAuoC2g4a2N68g/viewform');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    console.log(`🔗 [NEAR-INTENTS] Fetching: ${url.pathname}?${url.searchParams.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (response.status === 401) {
      throw new Error('Invalid NEAR Intents API key');
    }

    if (response.status === 429) {
      throw new Error('Rate limit exceeded (max 1 request per 5 seconds)');
    }

    if (!response.ok) {
      throw new Error(`NEAR Intents API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get ZEC inflows (other chains → ZEC)
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of transactions (max 1000)
   * @param {string} options.startTimestamp - ISO 8601 start date
   * @param {string} options.endTimestamp - ISO 8601 end date
   */
  async getZecInflows(options = {}) {
    const params = {
      toChainId: 'zec',
      statuses: 'SUCCESS',
      perPage: options.limit || 100,
      page: options.page || 1,
      ...(options.startTimestamp && { startTimestamp: options.startTimestamp }),
      ...(options.endTimestamp && { endTimestamp: options.endTimestamp }),
    };

    const data = await this.request('/transactions-pages', params);
    return {
      transactions: data.data || [],
      total: data.total || 0,
      page: data.page,
      totalPages: data.totalPages,
    };
  }

  /**
   * Get ZEC outflows (ZEC → other chains)
   */
  async getZecOutflows(options = {}) {
    const params = {
      fromChainId: 'zec',
      statuses: 'SUCCESS',
      perPage: options.limit || 100,
      page: options.page || 1,
      ...(options.startTimestamp && { startTimestamp: options.startTimestamp }),
      ...(options.endTimestamp && { endTimestamp: options.endTimestamp }),
    };

    const data = await this.request('/transactions-pages', params);
    return {
      transactions: data.data || [],
      total: data.total || 0,
      page: data.page,
      totalPages: data.totalPages,
    };
  }

  /**
   * Get aggregated cross-chain stats for ZEC
   * Combines inflows and outflows with caching
   */
  async getCrossChainStats() {
    const now = Date.now();

    // Return cached data if fresh
    if (this.cache.lastFetch && (now - this.cache.lastFetch) < this.cacheDuration) {
      console.log('📦 [NEAR-INTENTS] Returning cached stats');
      return this.cache.stats;
    }

    console.log('🔄 [NEAR-INTENTS] Fetching fresh cross-chain stats...');

    // Calculate timestamps for 24h and 7d
    const now24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const now7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch inflows and outflows in parallel
    const [inflows24h, outflows24h, inflows7d] = await Promise.all([
      this.getZecInflows({ startTimestamp: now24h, limit: 1000 }),
      this.getZecOutflows({ startTimestamp: now24h, limit: 1000 }),
      this.getZecInflows({ startTimestamp: now7d, limit: 1 }), // Just to get total count
    ]);

    // Aggregate by source/destination chain
    const inflowsByChain = this.aggregateByChain(inflows24h.transactions, 'from');
    const outflowsByChain = this.aggregateByChain(outflows24h.transactions, 'to');

    // Calculate totals
    const totalInflow24h = Object.values(inflowsByChain).reduce((sum, c) => sum + c.volumeUsd, 0);
    const totalOutflow24h = Object.values(outflowsByChain).reduce((sum, c) => sum + c.volumeUsd, 0);
    const totalVolume24h = totalInflow24h + totalOutflow24h;

    // Calculate 7d trend (simplified - compare totals)
    const volumeChange7d = 0; // Would need historical data to calculate properly

    // Format recent swaps
    const recentSwaps = this.formatRecentSwaps([
      ...inflows24h.transactions.slice(0, 10),
      ...outflows24h.transactions.slice(0, 5),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 15));

    const stats = {
      totalVolume24h,
      totalInflow24h,
      totalOutflow24h,
      volumeChange7d,
      totalSwaps24h: inflows24h.total + outflows24h.total,
      inflows: Object.values(inflowsByChain).sort((a, b) => b.volumeUsd - a.volumeUsd),
      outflows: Object.values(outflowsByChain).sort((a, b) => b.volumeUsd - a.volumeUsd),
      recentSwaps,
      lastUpdated: new Date().toISOString(),
    };

    // Update cache
    this.cache.stats = stats;
    this.cache.lastFetch = now;

    console.log(`✅ [NEAR-INTENTS] Stats: ${stats.totalSwaps24h} swaps, $${totalVolume24h.toFixed(2)} volume`);

    return stats;
  }

  /**
   * Aggregate transactions by chain
   */
  aggregateByChain(transactions, direction) {
    const byChain = {};

    transactions.forEach(tx => {
      // Parse chain from asset (e.g., "nep141:eth-0x..." → "eth")
      const asset = direction === 'from' ? tx.originAsset : tx.destinationAsset;
      let chainId = this.parseChainFromAsset(asset);

      // Skip ZEC (we're aggregating other chains)
      if (chainId === 'zec') return;

      if (!byChain[chainId]) {
        const config = CHAIN_CONFIG[chainId] || { color: '#888', symbol: chainId.toUpperCase(), name: chainId };
        byChain[chainId] = {
          chain: chainId,
          symbol: config.symbol,
          name: config.name,
          color: config.color,
          volumeUsd: 0,
          volumeZec: 0,
          count: 0,
        };
      }

      // Add volume
      const usdAmount = parseFloat(direction === 'from' ? tx.amountInUsd : tx.amountOutUsd) || 0;
      const zecAmount = parseFloat(direction === 'from' ? tx.amountOutFormatted : tx.amountInFormatted) || 0;

      byChain[chainId].volumeUsd += usdAmount;
      byChain[chainId].volumeZec += zecAmount;
      byChain[chainId].count += 1;
    });

    return byChain;
  }

  /**
   * Parse chain ID from NEAR asset string
   * e.g., "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near" → "eth"
   */
  parseChainFromAsset(asset) {
    if (!asset) return 'unknown';

    // Handle ZEC
    if (asset.includes('zec') || asset.includes('zcash')) return 'zec';

    // Handle chain prefixes
    const chainPrefixes = ['eth', 'btc', 'sol', 'near', 'doge', 'xrp', 'base', 'arb', 'pol', 'bsc', 'avax'];
    for (const prefix of chainPrefixes) {
      if (asset.toLowerCase().includes(prefix)) return prefix;
    }

    return 'other';
  }

  /**
   * Format recent swaps for frontend
   */
  formatRecentSwaps(transactions) {
    return transactions.map(tx => {
      const fromChain = this.parseChainFromAsset(tx.originAsset);
      const toChain = this.parseChainFromAsset(tx.destinationAsset);
      const isInflow = toChain === 'zec';

      return {
        id: tx.depositAddress || tx.intentHashes,
        timestamp: new Date(tx.createdAt).getTime(),
        fromChain: isInflow ? fromChain : 'zec',
        toChain: isInflow ? 'zec' : toChain,
        fromAmount: parseFloat(tx.amountInFormatted) || 0,
        fromSymbol: isInflow ? (CHAIN_CONFIG[fromChain]?.symbol || fromChain.toUpperCase()) : 'ZEC',
        toAmount: parseFloat(tx.amountOutFormatted) || 0,
        toSymbol: isInflow ? 'ZEC' : (CHAIN_CONFIG[toChain]?.symbol || toChain.toUpperCase()),
        amountUsd: parseFloat(tx.amountInUsd) || 0,
        direction: isInflow ? 'in' : 'out',
        status: tx.status,
        // We don't know if it was shielded after - would need to check Zcash chain
        shielded: null,
      };
    });
  }
}

// Singleton instance
let clientInstance = null;

/**
 * Get NEAR Intents client instance
 */
function getNearIntentsClient() {
  if (!clientInstance) {
    clientInstance = new NearIntentsClient();
  }
  return clientInstance;
}

module.exports = {
  NearIntentsClient,
  getNearIntentsClient,
  CHAIN_CONFIG,
};
