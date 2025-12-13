/**
 * API Endpoints configuration
 * Grouped by category for better organization
 */

export interface ApiEndpoint {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  example: string;
  response: any;
  note?: string;
  category: string;
  id: string;
}

export const getEndpoints = (baseUrl: string): ApiEndpoint[] => [
  // ============================================================================
  // BLOCKS
  // ============================================================================
  {
    id: 'block-by-height',
    category: 'Blocks',
    method: 'GET',
    path: '/api/block/:height',
    description: 'Get detailed information about a specific block by height',
    params: [
      { name: 'height', type: 'number', description: 'Block height (e.g., 3667080)' }
    ],
    example: `curl ${baseUrl}/api/block/3667080`,
    response: {
      height: 3667080,
      hash: '0000000...',
      timestamp: 1699123456,
      transactions: [],
      transactionCount: 2,
      size: 1234,
      difficulty: 1.0,
      confirmations: 5,
      previousBlockHash: '0000000...',
      nextBlockHash: '0000000...',
      version: 4,
      merkleRoot: '...',
      finalSaplingRoot: '...'
    }
  },
  {
    id: 'blocks-list',
    category: 'Blocks',
    method: 'GET',
    path: '/api/blocks',
    description: 'Get a list of recent blocks with pagination',
    params: [
      { name: 'limit', type: 'number', description: 'Number of blocks to return (default: 50, max: 100)' },
      { name: 'offset', type: 'number', description: 'Number of blocks to skip (default: 0)' }
    ],
    example: `curl '${baseUrl}/api/blocks?limit=10&offset=0'`,
    response: {
      blocks: [
        {
          height: 3667080,
          hash: '0000000...',
          timestamp: 1699123456,
          transaction_count: 2,
          size: 1234,
          difficulty: '41.58',
          total_fees: '0'
        }
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 3667080,
        hasMore: true
      }
    }
  },

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================
  {
    id: 'tx-by-txid',
    category: 'Transactions',
    method: 'GET',
    path: '/api/tx/:txid',
    description: 'Get detailed information about a specific transaction',
    params: [
      { name: 'txid', type: 'string', description: 'Transaction ID (hash)' }
    ],
    example: `curl ${baseUrl}/api/tx/abc123...`,
    response: {
      txid: 'abc123...',
      blockHeight: 3667080,
      blockHash: '0000000...',
      timestamp: 1699123456,
      confirmations: 5,
      inputs: [],
      outputs: [],
      totalInput: 0,
      totalOutput: 0,
      fee: 0,
      size: 250,
      shieldedSpends: 0,
      shieldedOutputs: 0,
      orchardActions: 0,
      hasShieldedData: false
    }
  },
  {
    id: 'tx-shielded',
    category: 'Transactions',
    method: 'GET',
    path: '/api/tx/shielded',
    description: 'Get shielded transactions with advanced filters (pool type, fully shielded vs partial, min actions)',
    params: [
      { name: 'limit', type: 'number', description: 'Number of transactions to return (default: 50, max: 100)' },
      { name: 'offset', type: 'number', description: 'Number of transactions to skip for pagination (default: 0)' },
      { name: 'pool', type: 'string', description: 'Filter by pool type: "sapling", "orchard", or omit for all (optional)' },
      { name: 'type', type: 'string', description: 'Filter by transaction type: "fully-shielded" (no transparent I/O) or "partial" (mixed), or omit for all (optional)' },
      { name: 'min_actions', type: 'number', description: 'Minimum number of shielded actions/spends/outputs (optional)' }
    ],
    example: `curl '${baseUrl}/api/tx/shielded?pool=orchard&type=fully-shielded&limit=10'`,
    response: {
      transactions: [
        {
          txid: 'abc123...',
          blockHeight: 3667080,
          blockHash: '0000000...',
          blockTime: 1699123456,
          hasSapling: false,
          hasOrchard: true,
          shieldedSpends: 0,
          shieldedOutputs: 0,
          orchardActions: 2,
          vinCount: 0,
          voutCount: 0,
          size: 2500,
          type: 'fully-shielded'
        }
      ],
      pagination: {
        total: 12564,
        limit: 10,
        offset: 0,
        hasMore: true
      },
      filters: {
        pool: 'orchard',
        type: 'fully-shielded',
        minActions: 0
      }
    },
    note: '🔒 This endpoint is useful for finding transactions to decrypt, analyzing shielded adoption trends, or building privacy-focused analytics.'
  },
  {
    id: 'address-details',
    category: 'Transactions',
    method: 'GET',
    path: '/api/address/:address',
    description: 'Get balance and transaction history for an address (transparent only)',
    params: [
      { name: 'address', type: 'string', description: 'Zcash address (t-address or unified address with transparent receiver)' }
    ],
    example: `curl ${baseUrl}/api/address/t1abc...`,
    response: {
      address: 't1abc...',
      type: 'transparent',
      balance: 123.456,
      transactionCount: 42,
      transactions: [
        {
          txid: 'abc...',
          timestamp: 1699123456,
          amount: 10.5,
          type: 'received',
          blockHeight: 3667080,
          from: 't1xyz...',
          to: 't1abc...'
        }
      ]
    },
    note: '⚠️ Shielded addresses (z-addresses) cannot be queried due to privacy. Unified addresses must have a transparent receiver.'
  },
  {
    id: 'mempool',
    category: 'Transactions',
    method: 'GET',
    path: '/api/mempool',
    description: 'Get current mempool status and pending transactions',
    params: [],
    example: `curl ${baseUrl}/api/mempool`,
    response: {
      count: 5,
      showing: 5,
      transactions: [
        {
          txid: 'abc...',
          type: 'shielded',
          vin: 1,
          vout: 2,
          saplingSpends: 1,
          saplingOutputs: 2,
          orchardActions: 0,
          size: 2500,
          time: 1699123456
        }
      ],
      stats: {
        total: 5,
        shielded: 2,
        transparent: 3,
        shieldedPercentage: 40
      }
    }
  },

  // ============================================================================
  // PRIVACY & ANALYTICS
  // ============================================================================
  {
    id: 'privacy-stats',
    category: 'Privacy & Analytics',
    method: 'GET',
    path: '/api/privacy-stats',
    description: 'Get blockchain-wide privacy statistics (shielded adoption, pool size, privacy score)',
    params: [],
    example: `curl ${baseUrl}/api/privacy-stats`,
    response: {
      totals: {
        blocks: 3667080,
        shieldedTx: 91639,
        transparentTx: 467611,
        mixedTx: 79075,
        fullyShieldedTx: 12564
      },
      shieldedPool: {
        currentSize: 1563095.76
      },
      metrics: {
        shieldedPercentage: 16.4,
        privacyScore: 11,
        avgShieldedPerDay: 1250,
        adoptionTrend: 'stable'
      },
      trends: {
        daily: [
          {
            date: '2024-11-23',
            shielded: 1234,
            transparent: 5678,
            shieldedPercentage: 17.8,
            poolSize: 1563095.76,
            privacyScore: 11
          }
        ]
      }
    }
  },
  {
    id: 'shielded-count',
    category: 'Privacy & Analytics',
    method: 'GET',
    path: '/api/stats/shielded-count',
    description: 'Get total count of shielded transactions since a specific date',
    params: [
      { name: 'since', type: 'string', description: 'Start date in ISO format (required, e.g., "2024-01-01")' },
      { name: 'detailed', type: 'boolean', description: 'If "true", returns breakdown by pool (Sapling/Orchard) and fully vs partially shielded (optional)' }
    ],
    example: `curl '${baseUrl}/api/stats/shielded-count?since=2024-01-01&detailed=true'`,
    response: {
      success: true,
      since: '2024-01-01',
      queriedAt: '2024-12-10T18:30:00.000Z',
      totalShielded: 611973,
      breakdown: {
        saplingOnly: 245000,
        orchardOnly: 312000,
        bothPools: 54973
      },
      fullyShielded: 489000,
      partiallyShielded: 122973,
      timeRange: {
        firstTx: '2024-01-01T00:05:23.000Z',
        lastTx: '2024-12-10T18:25:00.000Z'
      }
    },
    note: '📊 Use this endpoint to query historical shielded transaction counts. Without "detailed=true", returns only the total count (faster).'
  },
  {
    id: 'shielded-daily',
    category: 'Privacy & Analytics',
    method: 'GET',
    path: '/api/stats/shielded-daily',
    description: 'Get daily shielded transaction counts for a date range',
    params: [
      { name: 'since', type: 'string', description: 'Start date in ISO format (required, e.g., "2024-01-01")' },
      { name: 'until', type: 'string', description: 'End date in ISO format (optional, defaults to now)' }
    ],
    example: `curl '${baseUrl}/api/stats/shielded-daily?since=2024-11-01&until=2024-11-30'`,
    response: {
      success: true,
      since: '2024-11-01',
      until: '2024-11-30',
      totalDays: 30,
      totalShielded: 45230,
      daily: [
        { date: '2024-11-01', count: 1523 },
        { date: '2024-11-02', count: 1456 },
        { date: '2024-11-03', count: 1612 }
      ]
    },
    note: '📈 Useful for building charts and analyzing shielded adoption trends over time.'
  },

  // ============================================================================
  // NETWORK
  // ============================================================================
  {
    id: 'network-stats',
    category: 'Network',
    method: 'GET',
    path: '/api/network/stats',
    description: 'Get real-time network statistics (hashrate, peers, blockchain size)',
    params: [],
    example: `curl ${baseUrl}/api/network/stats`,
    response: {
      success: true,
      mining: {
        networkHashrate: '0.00 TH/s',
        difficulty: 1.0,
        avgBlockTime: 75,
        blocks24h: 1152,
        blockReward: 3.125,
        dailyRevenue: 3600
      },
      network: {
        peers: 8,
        height: 3667080,
        protocolVersion: 170100,
        subversion: '/Zebra:v3.0.0/'
      },
      blockchain: {
        height: 3667080,
        latestBlockTime: 1699123456,
        syncProgress: 100,
        sizeGB: 45.23,
        tx24h: 2500
      }
    }
  },
  {
    id: 'network-peers',
    category: 'Network',
    method: 'GET',
    path: '/api/network/peers',
    description: 'Get detailed information about connected Zcash network peers',
    params: [],
    example: `curl ${baseUrl}/api/network/peers`,
    response: {
      success: true,
      count: 8,
      peers: [
        {
          id: 1,
          addr: '192.168.1.1:8233',
          ip: '192.168.1.1',
          inbound: false,
          version: 170100,
          subver: '/Zebra:v3.0.0/',
          pingtime: 0.05
        }
      ]
    }
  },
  {
    id: 'network-health',
    category: 'Network',
    method: 'GET',
    path: '/api/network/health',
    description: 'Check Zebra node health status',
    params: [],
    example: `curl ${baseUrl}/api/network/health`,
    response: {
      success: true,
      zebra: {
        healthy: true,
        ready: true,
        healthEndpointAvailable: true
      },
      note: 'Zebra 3.0+ health endpoints available'
    }
  }
];

/**
 * Group endpoints by category
 */
export function getEndpointsByCategory(baseUrl: string) {
  const endpoints = getEndpoints(baseUrl);
  const categories = Array.from(new Set(endpoints.map(e => e.category)));

  return categories.map(category => ({
    name: category,
    endpoints: endpoints.filter(e => e.category === category)
  }));
}
