/**
 * API Endpoints configuration
 * Grouped by category for better organization
 *
 * Only publicly documented endpoints are listed here.
 * Internal/operational endpoints (grpc-status, scan, lightwalletd,
 * fork-monitor, bootstrap-info) are intentionally excluded.
 */

export interface ApiEndpoint {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
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
    path: '/api/block/:heightOrHash',
    description: 'Get detailed information about a specific block by height or hash, including all transactions with fee, total_input, and total_output in zatoshis.',
    params: [
      { name: 'heightOrHash', type: 'number | string', description: 'Block height (e.g., 2500000) or 64-character block hash', required: true }
    ],
    example: `curl ${baseUrl}/api/block/2500000`,
    response: {
      height: 2500000,
      hash: '0000000002c4a65a...',
      timestamp: 1699123456,
      confirmations: 15,
      size: 4821,
      difficulty: '86753422.14',
      version: 4,
      merkleRoot: 'a1b2c3...',
      previousBlockHash: '0000000...',
      nextBlockHash: '0000000...',
      transactionCount: 5,
      transactions: [
        {
          txid: 'abc123...',
          block_height: 2500000,
          block_hash: '0000000002c4a65a...',
          block_time: 1699123456,
          size: 250,
          fee: 10000,
          total_input: 150000000,
          total_output: 149990000,
          is_coinbase: false,
          vin_count: 1,
          vout_count: 2,
          has_sapling: false,
          has_orchard: true,
          orchard_actions: 2,
          value_balance_sapling: 0,
          value_balance_orchard: 0,
          inputs: [{ address: 't1abc...', value: '150000000', prev_txid: 'def456...', prev_vout: 0 }],
          outputs: [{ address: 't1xyz...', value: '100000000', vout_index: 0, spent: false }]
        }
      ]
    }
  },
  {
    id: 'blocks-list',
    category: 'Blocks',
    method: 'GET',
    path: '/api/blocks',
    description: 'Get a paginated list of recent blocks.',
    params: [
      { name: 'limit', type: 'number', description: 'Number of blocks to return (1–100, default: 10)' },
      { name: 'offset', type: 'number', description: 'Number of blocks to skip (default: 0)' }
    ],
    example: `curl '${baseUrl}/api/blocks?limit=10&offset=0'`,
    response: {
      blocks: [
        {
          height: 2500000,
          hash: '0000000...',
          timestamp: 1699123456,
          transaction_count: 5,
          size: 4821,
          difficulty: '86753422.14',
          miner_address: 't1abc...',
          total_fees: '50000'
        }
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 2500000,
        hasMore: true
      }
    }
  },
  {
    id: 'blocks-recent',
    category: 'Blocks',
    method: 'GET',
    path: '/api/network/blocks/recent',
    description: 'Get recent blocks with miner reward details.',
    params: [
      { name: 'limit', type: 'number', description: 'Number of blocks to return (1–50, default: 15)' }
    ],
    example: `curl '${baseUrl}/api/network/blocks/recent?limit=5'`,
    response: {
      success: true,
      blocks: [
        {
          height: 2500000,
          hash: '0000000...',
          timestamp: 1699123456,
          txCount: 5,
          size: 4821,
          minerAddress: 't1abc...',
          fees: '50000',
          minerReward: '1.25'
        }
      ]
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
    description: 'Get detailed information about a specific transaction, including transparent inputs/outputs, shielded activity, and cross-chain bridge data if applicable.',
    params: [
      { name: 'txid', type: 'string', description: 'Transaction ID (64-character hex hash)', required: true }
    ],
    example: `curl ${baseUrl}/api/tx/abc123...`,
    response: {
      txid: 'abc123...',
      blockHeight: 2500000,
      blockHash: '0000000...',
      blockTime: 1699123456,
      confirmations: 15,
      size: 2500,
      version: 5,
      fee: 10000,
      totalInput: 150000000,
      totalOutput: 149990000,
      isCoinbase: false,
      hasSapling: false,
      hasOrchard: true,
      hasSprout: false,
      orchardActions: 2,
      shieldedSpends: 0,
      shieldedOutputs: 0,
      inputCount: 1,
      outputCount: 2,
      inputs: [{ address: 't1abc...', value: 150000000 }],
      outputs: [{ address: 't1xyz...', value: 100000000 }, { address: 't1def...', value: 49990000 }]
    }
  },
  {
    id: 'tx-raw',
    category: 'Transactions',
    method: 'GET',
    path: '/api/tx/:txid/raw',
    description: 'Get the raw hex-encoded transaction data.',
    params: [
      { name: 'txid', type: 'string', description: 'Transaction ID', required: true }
    ],
    example: `curl ${baseUrl}/api/tx/abc123.../raw`,
    response: {
      txid: 'abc123...',
      hex: '0500000000010...'
    }
  },
  {
    id: 'tx-shielded',
    category: 'Transactions',
    method: 'GET',
    path: '/api/tx/shielded',
    description: 'Query shielded transactions with advanced filters. Filter by pool type, fully-shielded vs partial, and minimum shielded actions.',
    params: [
      { name: 'limit', type: 'number', description: 'Results per page (1–100, default: 50)' },
      { name: 'offset', type: 'number', description: 'Pagination offset (default: 0)' },
      { name: 'pool', type: 'string', description: 'Filter by pool: "sapling", "orchard", or omit for all' },
      { name: 'type', type: 'string', description: 'Filter: "fully-shielded" (no transparent I/O) or "partial" (mixed)' },
      { name: 'min_actions', type: 'number', description: 'Minimum number of shielded actions/spends/outputs' }
    ],
    example: `curl '${baseUrl}/api/tx/shielded?pool=orchard&type=fully-shielded&limit=10'`,
    response: {
      transactions: [
        {
          txid: 'abc123...',
          blockHeight: 2500000,
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
      pagination: { total: 12564, limit: 10, offset: 0, hasMore: true },
      filters: { pool: 'orchard', type: 'fully-shielded', minActions: 0 }
    }
  },
  {
    id: 'shielded-flows',
    category: 'Transactions',
    method: 'GET',
    path: '/api/shielded/list',
    description: 'Paginated list of shielded flows (shielding and deshielding events). Uses cursor-based pagination for efficient traversal.',
    params: [
      { name: 'limit', type: 'number', description: 'Results per page (1–100, default: 50)' },
      { name: 'cursor', type: 'string', description: 'Cursor for pagination (block height)' },
      { name: 'cursor_id', type: 'string', description: 'Secondary cursor (flow ID within block)' },
      { name: 'direction', type: 'string', description: '"next" (default) or "prev"' },
      { name: 'flow_type', type: 'string', description: '"all" (default), "shield", or "deshield"' },
      { name: 'pool', type: 'string', description: '"all" (default), "sapling", "orchard", or "mixed"' }
    ],
    example: `curl '${baseUrl}/api/shielded/list?flow_type=shield&pool=orchard&limit=10'`,
    response: {
      success: true,
      flows: [
        {
          id: 12345,
          txid: 'abc123...',
          blockHeight: 2500000,
          blockTime: 1699123456,
          flowType: 'shield',
          amountZec: '2.50000000',
          pool: 'orchard',
          addresses: ['t1abc...']
        }
      ],
      pagination: { total: 45000, limit: 10, hasNext: true, hasPrev: false }
    }
  },
  {
    id: 'tx-broadcast',
    category: 'Transactions',
    method: 'POST',
    path: '/api/tx/broadcast',
    description: 'Broadcast a signed raw transaction to the Zcash network.',
    params: [
      { name: 'rawTx', type: 'string', description: 'Hex-encoded signed transaction', required: true }
    ],
    example: `curl -X POST ${baseUrl}/api/tx/broadcast -H "Content-Type: application/json" -d '{"rawTx": "0500..."}'`,
    response: {
      success: true,
      txid: 'abc123...'
    },
    note: 'Returns the txid on success. If the transaction is invalid or rejected by the network, returns an error with details.'
  },

  // ============================================================================
  // MEMPOOL
  // ============================================================================
  {
    id: 'mempool',
    category: 'Mempool',
    method: 'GET',
    path: '/api/mempool',
    description: 'Get current mempool status including all pending transactions and shielded/transparent breakdown.',
    params: [],
    example: `curl ${baseUrl}/api/mempool`,
    response: {
      success: true,
      count: 5,
      showing: 5,
      transactions: [
        {
          txid: 'abc...',
          type: 'shielded',
          size: 2500,
          time: 1699123456,
          vin: 0,
          vout: 0,
          vShieldedSpend: 0,
          vShieldedOutput: 0,
          orchardActions: 2,
          totalOutput: 0,
          version: 5
        }
      ],
      stats: { total: 5, shielded: 3, transparent: 2, shieldedPercentage: 60 }
    }
  },
  {
    id: 'mempool-tx',
    category: 'Mempool',
    method: 'GET',
    path: '/api/mempool/tx/:txid',
    description: 'Check if a specific transaction is in the mempool and get its details.',
    params: [
      { name: 'txid', type: 'string', description: 'Transaction ID to look up', required: true }
    ],
    example: `curl ${baseUrl}/api/mempool/tx/abc123...`,
    response: {
      success: true,
      inMempool: true,
      transaction: {
        txid: 'abc123...',
        size: 2500,
        type: 'shielded',
        version: 5,
        firstSeen: 1699123456,
        vinCount: 0,
        voutCount: 0,
        shieldedSpends: 0,
        shieldedOutputs: 0,
        orchardActions: 2,
        totalOutput: 0,
        outputs: []
      }
    }
  },

  // ============================================================================
  // ADDRESSES
  // ============================================================================
  {
    id: 'address-details',
    category: 'Addresses',
    method: 'GET',
    path: '/api/address/:address',
    description: 'Get balance, transaction count, and paginated transaction history for a transparent address.',
    params: [
      { name: 'address', type: 'string', description: 'Zcash transparent address (t-address)', required: true },
      { name: 'page', type: 'number', description: 'Page number (default: 1)' },
      { name: 'limit', type: 'number', description: 'Transactions per page (1–100, default: 25)' }
    ],
    example: `curl '${baseUrl}/api/address/t1abc...?page=1&limit=25'`,
    response: {
      address: 't1abc...',
      balance: 12345600000,
      totalReceived: 50000000000,
      totalSent: 37654400000,
      txCount: 42,
      firstSeen: '2024-01-15T10:30:00.000Z',
      lastSeen: '2026-05-28T12:00:00.000Z',
      transactions: [
        {
          txid: 'abc...',
          timestamp: 1699123456,
          amount: 1050000000,
          type: 'received',
          blockHeight: 2500000
        }
      ],
      pagination: { page: 1, totalPages: 2, total: 42, limit: 25 }
    },
    note: 'Shielded addresses (z-addresses) cannot be queried due to privacy by design. Only transparent addresses (t-addresses) are supported. Balance is in zatoshis (1 ZEC = 100,000,000 zatoshis).'
  },
  {
    id: 'rich-list',
    category: 'Addresses',
    method: 'GET',
    path: '/api/rich-list',
    description: 'Get the top transparent addresses ranked by balance, with concentration metrics.',
    params: [
      { name: 'limit', type: 'number', description: 'Number of addresses to return (1–500, default: 100)' },
      { name: 'offset', type: 'number', description: 'Pagination offset (default: 0)' }
    ],
    example: `curl '${baseUrl}/api/rich-list?limit=10'`,
    response: {
      success: true,
      addresses: [
        {
          rank: 1,
          address: 't1abc...',
          balance: 35000000000000,
          totalReceived: 50000000000000,
          totalSent: 15000000000000,
          txCount: 1250,
          firstSeen: '2018-10-28T00:00:00.000Z',
          lastSeen: '2026-05-28T12:00:00.000Z',
          label: 'Binance Cold Wallet',
          category: 'exchange'
        }
      ],
      pagination: { limit: 10, offset: 0, total: 500 },
      concentration: {
        top10: 2500000000000000,
        top100: 5000000000000000,
        totalTransparent: 8000000000000000,
        top10Pct: 31.25,
        top100Pct: 62.5
      }
    },
    note: 'Balances are in zatoshis. Known addresses are labeled (exchanges, miners, custodians). Concentration metrics show supply distribution across the transparent pool only.'
  },
  {
    id: 'address-labels',
    category: 'Addresses',
    method: 'GET',
    path: '/api/labels',
    description: 'Get all known address labels (exchanges, miners, custodians, government seizures, etc.).',
    params: [],
    example: `curl ${baseUrl}/api/labels`,
    response: {
      labels: [
        {
          address: 't1abc...',
          label: 'Binance Cold Wallet',
          category: 'exchange',
          description: 'Primary cold storage wallet',
          verified: true,
          logoUrl: '/logos/binance.svg'
        }
      ],
      count: 25
    }
  },

  // ============================================================================
  // SUPPLY & ECONOMICS
  // ============================================================================
  {
    id: 'circulating-supply',
    category: 'Supply',
    method: 'GET',
    path: '/api/circulating-supply',
    description: 'Get the current ZEC circulating supply. Returns plain text by default (for aggregator compatibility) or JSON with the format parameter.',
    params: [
      { name: 'format', type: 'string', description: 'Set to "json" for structured response. Omit for plain text number.' }
    ],
    example: `curl '${baseUrl}/api/circulating-supply?format=json'`,
    response: {
      circulatingSupply: 16234567.89,
      circulatingSupplyZat: '1623456789000000',
      maxSupply: 21000000,
      unit: 'ZEC'
    },
    note: 'Without ?format=json, returns a plain text number (e.g., "16234567.89") for compatibility with CoinGecko, CoinMarketCap, and similar aggregators.'
  },
  {
    id: 'supply-pools',
    category: 'Supply',
    method: 'GET',
    path: '/api/supply',
    description: 'Get the current value locked in each Zcash pool (Transparent, Sprout, Sapling, Orchard).',
    params: [],
    example: `curl ${baseUrl}/api/supply`,
    response: [
      { id: 'transparent', chainValue: 6500000.12, chainValueZat: '650000012000000', monitored: true },
      { id: 'sprout', chainValue: 25000.50, chainValueZat: '2500050000000', monitored: true },
      { id: 'sapling', chainValue: 450000.75, chainValueZat: '45000075000000', monitored: true },
      { id: 'orchard', chainValue: 350000.30, chainValueZat: '35000030000000', monitored: true }
    ],
    note: 'Compatible with the zcashexplorer.app value pools format. Values in ZEC and zatoshis.'
  },
  {
    id: 'supply-transparent-breakdown',
    category: 'Supply',
    method: 'GET',
    path: '/api/supply/transparent-breakdown',
    description: 'Breakdown of transparent supply by labeled category (exchanges, miners, custodians, etc.).',
    params: [],
    example: `curl ${baseUrl}/api/supply/transparent-breakdown`,
    response: {
      success: true,
      categories: [
        { category: 'exchange', addressCount: 15, totalBalance: 2500000000000000, percentage: 38.5 },
        { category: 'mining', addressCount: 8, totalBalance: 800000000000000, percentage: 12.3 },
        { category: 'unknown', addressCount: 150000, totalBalance: 3200000000000000, percentage: 49.2 }
      ],
      transparentTotal: 6500000000000000,
      labeledTotal: 3300000000000000,
      labeledPercentage: 50.8
    }
  },
  {
    id: 'halving',
    category: 'Supply',
    method: 'GET',
    path: '/api/network/halving',
    description: 'Get information about the next Zcash block reward halving, including countdown, current/next subsidy, and funding stream breakdown.',
    params: [],
    example: `curl ${baseUrl}/api/network/halving`,
    response: {
      success: true,
      halvingBlock: 2726400,
      blocksRemaining: 226400,
      eraStartBlock: 1046400,
      eraProgress: 0.865,
      currentSubsidy: 1.5625,
      nextSubsidy: 0.78125,
      minerReward: 1.25,
      nextMinerReward: 0.625,
      fundingStreams: 0.125,
      lockbox: 0.1875,
      currentHeight: 2500000,
      estimatedSeconds: 16980000,
      estimatedDate: '2027-01-15T00:00:00.000Z'
    }
  },
  {
    id: 'emission',
    category: 'Supply',
    method: 'GET',
    path: '/api/network/emission',
    description: 'Historical supply emission curve and daily emission data.',
    params: [
      { name: 'period', type: 'string', description: 'Time range: "30d", "90d", "1y", "all" (default: "1y")' }
    ],
    example: `curl '${baseUrl}/api/network/emission?period=1y'`,
    response: {
      success: true,
      maxSupply: 21000000,
      circulating: 16234567.89,
      remaining: 4765432.11,
      circulatingPct: 77.3,
      dailyEmissionEstimate: 1800,
      supplyHistory: [
        { date: '2025-05-28', supply: 16200000 }
      ],
      dailyEmission: [
        { date: '2025-05-28', emission: 1800 }
      ]
    }
  },
  {
    id: 'pool-history',
    category: 'Supply',
    method: 'GET',
    path: '/api/network/pool-history',
    description: 'Historical shielded pool sizes over time. Shows the split between Sprout, Sapling, Orchard, and Transparent pools.',
    params: [
      { name: 'period', type: 'string', description: 'Time range: "7d", "30d", "90d", "1y", "all" (default: "1y")' }
    ],
    example: `curl '${baseUrl}/api/network/pool-history?period=90d'`,
    response: {
      success: true,
      period: '90d',
      points: [
        {
          date: '2026-03-01',
          shielded: 82500000000000,
          sprout: 2500050000000,
          sapling: 45000075000000,
          orchard: 35000030000000,
          transparent: 650000000000000,
          chainSupply: 1623456789000000,
          shieldedSupplyPct: 5.08,
          hasPoolBreakdown: true
        }
      ],
      hasPoolBreakdown: true,
      hasVerifiedPerPoolBreakdown: true
    },
    note: 'Values are in zatoshis. When hasVerifiedPerPoolBreakdown is true, per-pool values come from verified chain state (not estimates).'
  },

  // ============================================================================
  // NETWORK
  // ============================================================================
  {
    id: 'network-stats',
    category: 'Network',
    method: 'GET',
    path: '/api/network/stats',
    description: 'Comprehensive network statistics: mining (hashrate, difficulty, block times), network (peers, height), blockchain (size, tx volume), and supply (pool breakdown).',
    params: [],
    example: `curl ${baseUrl}/api/network/stats`,
    response: {
      success: true,
      mining: {
        networkHashrate: '9.52 GH/s',
        networkHashrateRaw: 9520000000,
        difficulty: '86753422.14',
        avgBlockTime: 75,
        blocks24h: 1152,
        blockReward: 1.5625,
        minerReward: 1.25,
        fundingStreams: 0.125,
        lockbox: 0.1875,
        dailyRevenue: 1800,
        dailyMinerRevenue: 1440
      },
      network: {
        peers: 35,
        height: 2500000,
        protocolVersion: 170100,
        subversion: '/Zebra:2.2.0/'
      },
      blockchain: {
        height: 2500000,
        latestBlockTime: 1699123456,
        syncProgress: 100,
        sizeBytes: 48567000000,
        sizeGB: 45.23,
        tx24h: 2500
      },
      supply: {
        chainSupply: 16234567.89,
        transparent: 6500000.12,
        sprout: 25000.50,
        sapling: 450000.75,
        orchard: 350000.30,
        totalShielded: 825001.55,
        shieldedPercentage: 5.08
      }
    },
    note: 'Cached for 60 seconds. The supply object may not be present on all networks. dailyRevenue is total daily emission from block subsidies (not transaction fees).'
  },
  {
    id: 'mining-metrics',
    category: 'Network',
    method: 'GET',
    path: '/api/network/mining-metrics',
    description: 'Rolling-window mining metrics for charting: solution rate, difficulty, block times, fees, and transaction counts over recent blocks.',
    params: [
      { name: 'window', type: 'number', description: 'Rolling average window size in blocks (5–100, default: 20)' },
      { name: 'limit', type: 'number', description: 'Number of data points to return (20–500, default: 120)' }
    ],
    example: `curl '${baseUrl}/api/network/mining-metrics?window=20&limit=60'`,
    response: {
      success: true,
      window: 20,
      latest: { solrate: 9520000000, difficulty: 86753422.14, blockTime: 74.5, txFees: 50000, txCount: 3 },
      points: [
        { height: 2500000, solrate: 9520000000, difficulty: 86753422.14, blockTime: 74.5, txFees: 50000, txCount: 3 }
      ]
    }
  },
  {
    id: 'network-health',
    category: 'Network',
    method: 'GET',
    path: '/api/network/health',
    description: 'Check the health status of the Zebra node.',
    params: [],
    example: `curl ${baseUrl}/api/network/health`,
    response: {
      success: true,
      zebra: { healthy: true, ready: true, healthEndpointAvailable: true, readyEndpointAvailable: true }
    }
  },
  {
    id: 'network-peers',
    category: 'Network',
    method: 'GET',
    path: '/api/network/peers',
    description: 'Get information about connected Zcash network peers.',
    params: [],
    example: `curl ${baseUrl}/api/network/peers`,
    response: {
      success: true,
      count: 35,
      peers: [
        { id: 1, addr: '192.168.1.1:8233', ip: '192.168.1.1', inbound: false, version: 170100, subver: '/Zebra:2.2.0/', pingtime: 0.05, conntime: 1699000000 }
      ]
    }
  },
  {
    id: 'network-nodes',
    category: 'Network',
    method: 'GET',
    path: '/api/network/nodes',
    description: 'Get geographic distribution of Zcash nodes for map visualization.',
    params: [],
    example: `curl ${baseUrl}/api/network/nodes`,
    response: {
      success: true,
      locations: [
        { country: 'United States', countryCode: 'US', city: 'New York', lat: 40.71, lon: -74.01, nodeCount: 12, avgPingMs: 45 }
      ]
    }
  },
  {
    id: 'network-fees',
    category: 'Network',
    method: 'GET',
    path: '/api/network/fees',
    description: 'Get current fee estimates based on ZIP-317 conventional fee structure.',
    params: [],
    example: `curl ${baseUrl}/api/network/fees`,
    response: {
      success: true,
      fees: { low: 0.00001, standard: 0.0001, high: 0.001 },
      unit: 'ZEC',
      zip317: { marginalFee: 5000, graceActions: 2, p2pkhInputSize: 560, p2pkhOutputSize: 34 },
      note: 'ZIP-317 conventional fees. Most wallets use the standard fee.'
    }
  },
  {
    id: 'blockchain-info',
    category: 'Network',
    method: 'GET',
    path: '/api/blockchain-info',
    description: 'Raw blockchain info from the Zebra node (getblockchaininfo RPC), including consensus rules and upgrade activation heights.',
    params: [],
    example: `curl ${baseUrl}/api/blockchain-info`,
    response: {
      chain: 'main',
      blocks: 2500000,
      bestblockhash: '0000000...',
      estimatedheight: 2500000,
      consensus: {
        chaintip: 'c2d6d0b4',
        nextblock: 'c2d6d0b4'
      },
      upgrades: {}
    }
  },
  {
    id: 'price',
    category: 'Network',
    method: 'GET',
    path: '/api/price',
    description: 'Get the current ZEC/USD price and 24-hour change (sourced from CoinGecko).',
    params: [],
    example: `curl ${baseUrl}/api/price`,
    response: {
      price: 35.42,
      change24h: -2.15,
      timestamp: 1699123456
    }
  },

  // ============================================================================
  // PRIVACY & ANALYTICS
  // ============================================================================
  {
    id: 'privacy-stats',
    category: 'Privacy',
    method: 'GET',
    path: '/api/privacy-stats',
    description: 'Blockchain-wide privacy statistics: shielded adoption rates, pool sizes, privacy score, and daily trends.',
    params: [],
    example: `curl ${baseUrl}/api/privacy-stats`,
    response: {
      totals: {
        blocks: 2500000,
        shieldedTx: 2500000,
        transparentTx: 8000000,
        coinbaseTx: 2500000,
        totalTx: 13000000,
        fullyShieldedTx: 1500000
      },
      shieldedPool: {
        currentSize: 825001.55,
        sprout: 25000.50,
        sapling: 450000.75,
        orchard: 350000.30,
        transparent: 6500000.12,
        chainSupply: 16234567.89
      },
      metrics: {
        shieldedPercentage: 19.2,
        privacyScore: 15,
        avgShieldedPerDay: 2100,
        adoptionTrend: 'growing'
      },
      trends: {
        daily: [
          { date: '2026-05-28', shielded: 2100, transparent: 5200, shieldedPercentage: 28.8, poolSize: 825001.55, privacyScore: 15 }
        ]
      },
      lastUpdated: '2026-05-28T12:00:00.000Z',
      lastBlockScanned: 2500000
    }
  },
  {
    id: 'shielded-count',
    category: 'Privacy',
    method: 'GET',
    path: '/api/stats/shielded-count',
    description: 'Total count of shielded transactions since a given date. With detailed=true, includes Sapling/Orchard breakdown.',
    params: [
      { name: 'since', type: 'string', description: 'Start date in ISO format (e.g., "2025-01-01")', required: true },
      { name: 'detailed', type: 'boolean', description: 'If "true", returns pool breakdown and fully/partially shielded counts' }
    ],
    example: `curl '${baseUrl}/api/stats/shielded-count?since=2025-01-01&detailed=true'`,
    response: {
      success: true,
      since: '2025-01-01',
      queriedAt: '2026-05-28T12:00:00.000Z',
      totalShielded: 611973,
      breakdown: { saplingOnly: 245000, orchardOnly: 312000, bothPools: 54973 },
      fullyShielded: 489000,
      partiallyShielded: 122973,
      timeRange: { firstTx: '2025-01-01T00:05:23.000Z', lastTx: '2026-05-28T12:00:00.000Z' }
    }
  },
  {
    id: 'shielded-daily',
    category: 'Privacy',
    method: 'GET',
    path: '/api/stats/shielded-daily',
    description: 'Daily shielded transaction counts for a date range. Useful for building adoption trend charts.',
    params: [
      { name: 'since', type: 'string', description: 'Start date in ISO format', required: true },
      { name: 'until', type: 'string', description: 'End date in ISO format (default: now)' }
    ],
    example: `curl '${baseUrl}/api/stats/shielded-daily?since=2026-04-01&until=2026-05-01'`,
    response: {
      success: true,
      since: '2026-04-01',
      until: '2026-05-01',
      totalDays: 30,
      totalShielded: 63000,
      daily: [
        { date: '2026-04-01', count: 2100 },
        { date: '2026-04-02', count: 2150 }
      ]
    }
  },
  {
    id: 'blend-check',
    category: 'Privacy',
    method: 'GET',
    path: '/api/blend-check',
    description: 'Check how common a ZEC amount is in shielded transactions. Higher blend scores mean better privacy — your transaction blends in with more others.',
    params: [
      { name: 'amount', type: 'number', description: 'ZEC amount to check (e.g., 1.0)', required: true }
    ],
    example: `curl '${baseUrl}/api/blend-check?amount=1.0'`,
    response: {
      amount: 1.0,
      amountZat: 100000000,
      periods: {
        '24h': { total: 45, shields: 30, deshields: 15 },
        '7d': { total: 312, shields: 200, deshields: 112 },
        '30d': { total: 1250, shields: 800, deshields: 450 },
        all: { total: 15000, shields: 9500, deshields: 5500 }
      },
      blendScore: 85,
      blendLabel: 'Excellent',
      nearbyPopular: [
        { amount: 1.0, count: 15000 },
        { amount: 0.5, count: 8500 }
      ]
    },
    note: 'Blend score ranges: 0–20 (Poor), 20–40 (Fair), 40–60 (Good), 60–80 (Very Good), 80–100 (Excellent). Using common amounts improves your transaction privacy.'
  },
  {
    id: 'blend-check-split',
    category: 'Privacy',
    method: 'GET',
    path: '/api/blend-check/split',
    description: 'Get recommendations for splitting an amount into common denominations to improve privacy.',
    params: [
      { name: 'amount', type: 'number', description: 'ZEC amount to split (e.g., 3.7)', required: true }
    ],
    example: `curl '${baseUrl}/api/blend-check/split?amount=3.7'`,
    response: {
      amount: 3.7,
      originalScore: 25,
      plans: [
        {
          pieceCount: 4,
          pieces: [1.0, 1.0, 1.0, 0.7],
          minBlendScore: 45,
          avgBlendScore: 72,
          overallLabel: 'Good',
          recommended: true
        }
      ]
    }
  },
  {
    id: 'tx-linkability',
    category: 'Privacy',
    method: 'GET',
    path: '/api/tx/:txid/linkability',
    description: 'Analyze potential linkability between a shielding transaction and subsequent deshielding transactions based on amount, timing, and other heuristics.',
    params: [
      { name: 'txid', type: 'string', description: 'Transaction ID of a shielding/deshielding tx', required: true },
      { name: 'limit', type: 'number', description: 'Max linked transactions to return (1–20, default: 5)' },
      { name: 'tolerance', type: 'number', description: 'Amount tolerance in ZEC (default: 0.001)' }
    ],
    example: `curl '${baseUrl}/api/tx/abc123.../linkability?limit=5'`,
    response: {
      success: true,
      txid: 'abc123...',
      flowType: 'shield',
      amount: 10.5,
      amountZat: 1050000000,
      blockHeight: 2500000,
      blockTime: 1699123456,
      pool: 'orchard',
      linkedTransactions: [
        {
          txid: 'def456...',
          amount: 10.499,
          timeDelta: '2h 15m',
          score: 0.85,
          warningLevel: 'high'
        }
      ],
      totalMatches: 3,
      warningLevel: 'high',
      highestScore: 0.85
    },
    note: 'Linkability analysis uses amount matching, timing correlation, and transaction graph analysis. A high score does not prove linkage — it indicates statistical correlation.'
  },

  // ============================================================================
  // CROSS-CHAIN (NEAR Intents)
  // ============================================================================
  {
    id: 'crosschain-stats',
    category: 'Cross-Chain',
    method: 'GET',
    path: '/api/crosschain/stats',
    description: 'Live cross-chain swap statistics via NEAR Intents. Shows 24h volume, inflows, outflows, and recent swaps.',
    params: [],
    example: `curl ${baseUrl}/api/crosschain/stats`,
    response: {
      success: true,
      totalVolume24h: 125000,
      totalInflow24h: 75000,
      totalOutflow24h: 50000,
      totalSwaps24h: 85,
      recentSwaps: [
        {
          direction: 'entry',
          sourceChain: 'ethereum',
          sourceToken: 'ETH',
          sourceAmount: '0.5',
          destToken: 'ZEC',
          destAmount: '45.2',
          zecAmount: '45.20000000',
          timestamp: 1699123456
        }
      ]
    }
  },
  {
    id: 'crosschain-trends',
    category: 'Cross-Chain',
    method: 'GET',
    path: '/api/crosschain/trends',
    description: 'Historical cross-chain volume trends over time.',
    params: [
      { name: 'period', type: 'string', description: '"7d", "30d", or "90d" (default: "30d")' },
      { name: 'granularity', type: 'string', description: '"daily" or "weekly" (default: "daily")' }
    ],
    example: `curl '${baseUrl}/api/crosschain/trends?period=30d&granularity=daily'`,
    response: {
      success: true,
      period: '30d',
      granularity: 'daily',
      volumeChange: 15.3,
      data: [
        { date: '2026-05-01', inflowVolume: 3500, outflowVolume: 2100, inflowCount: 25, outflowCount: 18 }
      ]
    }
  },
  {
    id: 'crosschain-history',
    category: 'Cross-Chain',
    method: 'GET',
    path: '/api/crosschain/history',
    description: 'Paginated history of all cross-chain swaps with optional filters.',
    params: [
      { name: 'page', type: 'number', description: 'Page number (default: 1)' },
      { name: 'limit', type: 'number', description: 'Results per page (default: 20)' },
      { name: 'direction', type: 'string', description: '"entry" (into ZEC) or "exit" (out of ZEC)' },
      { name: 'chain', type: 'string', description: 'Filter by chain (e.g., "ethereum", "bitcoin")' }
    ],
    example: `curl '${baseUrl}/api/crosschain/history?direction=entry&chain=ethereum&limit=10'`,
    response: {
      success: true,
      total: 500,
      page: 1,
      totalPages: 50,
      swaps: [
        {
          direction: 'entry',
          sourceChain: 'ethereum',
          sourceToken: 'ETH',
          sourceAmount: '0.5',
          destToken: 'ZEC',
          destAmount: '45.2',
          timestamp: 1699123456,
          zecAddress: 't1abc...'
        }
      ]
    }
  },

  // ============================================================================
  // NAMES (ZNS — Zcash Name Service)
  // ============================================================================
  {
    id: 'name-resolve',
    category: 'Names (ZNS)',
    method: 'GET',
    path: '/api/name/:name',
    description: 'Resolve a ZNS (Zcash Name Service) name to its registered address, along with marketplace listing if any.',
    params: [
      { name: 'name', type: 'string', description: 'ZNS name to resolve (e.g., "satoshi")', required: true }
    ],
    example: `curl ${baseUrl}/api/name/satoshi`,
    response: {
      name: 'satoshi',
      address: 'u1abc...',
      txid: '6f6fbbce...',
      height: 2450000,
      nonce: 1,
      signature: '8PEjZeZDg/...',
      listing: {
        name: 'satoshi',
        price: 10000000000,
        txid: '7ac64ad0...',
        height: 2450010,
        signature: 'eaBfFGlJ...'
      }
    },
    note: 'Returns 404 if the name is not registered. Listing is null if the name is not for sale. Price is in zatoshis (1 ZEC = 100,000,000 zatoshis).'
  },
  {
    id: 'name-events',
    category: 'Names (ZNS)',
    method: 'GET',
    path: '/api/name/:name/events',
    description: 'Get the full event history for a ZNS name: claims, listings, delistings, sales, and updates.',
    params: [
      { name: 'name', type: 'string', description: 'ZNS name (e.g., "satoshi")', required: true }
    ],
    example: `curl ${baseUrl}/api/name/satoshi/events`,
    response: {
      events: [
        { id: 7, name: 'satoshi', action: 'LIST', txid: '7ac64ad0...', height: 2450010, ua: 'u1abc...', price: 10000000000, nonce: 1, signature: 'eaBfFGlJ...' },
        { id: 6, name: 'satoshi', action: 'CLAIM', txid: '6f6fbbce...', height: 2450000, ua: 'u1abc...', price: null, nonce: null, signature: '8PEjZeZDg/...' }
      ],
      total: 2
    },
    note: 'Actions: CLAIM, LIST, DELIST, UPDATE, BUY.'
  },

  // ============================================================================
  // POOL ANALYTICS
  // ============================================================================
  {
    id: 'pools-overview',
    category: 'Pool Analytics',
    method: 'GET',
    path: '/api/pools/overview',
    description: 'Current shielded pool sizes (Sapling, Orchard, Sprout) with 24h, 7d, and 30d deltas showing supply movement between pools.',
    params: [],
    example: `curl ${baseUrl}/api/pools/overview`,
    response: {
      pools: [
        { pool: 'orchard', supply_zec: 1245678.12, delta_24h: 3412.5, delta_7d: -12340.8, delta_30d: 54210.3 },
        { pool: 'sapling', supply_zec: 3421000.45, delta_24h: -1200.0, delta_7d: 8900.2, delta_30d: -23100.7 },
        { pool: 'sprout', supply_zec: 12345.67, delta_24h: 0, delta_7d: -0.5, delta_30d: -12.3 }
      ],
      total_shielded_zec: 4679024.24,
      total_supply_zec: 15312500.0,
      shielded_percentage: 30.56
    },
    note: 'Supply values in ZEC (not zatoshis). Deltas represent net flow into the pool over the period (positive = more ZEC shielded, negative = more deshielded).'
  },
  {
    id: 'pools-flows',
    category: 'Pool Analytics',
    method: 'GET',
    path: '/api/pools/flows',
    description: 'Time-series shield/deshield volume data. Supports daily or hourly granularity with optional pool filtering.',
    params: [
      { name: 'period', type: 'string', description: 'Time window: 30d, 90d, 1y, all (default: 30d)', required: false },
      { name: 'pool', type: 'string', description: 'Filter by pool: all, orchard, sapling, sprout (default: all)', required: false },
      { name: 'granularity', type: 'string', description: 'Bucket size: daily or hourly (default: daily)', required: false }
    ],
    example: `curl "${baseUrl}/api/pools/flows?period=7d&granularity=hourly&pool=orchard"`,
    response: {
      period: '7d',
      pool: 'orchard',
      granularity: 'hourly',
      points: [
        { date: '2026-06-05T14:00:00.000Z', shield: 142.5, deshield: 89.3, shieldTx: 12, deshieldTx: 8, net: 53.2 },
        { date: '2026-06-05T15:00:00.000Z', shield: 201.8, deshield: 1250.4, shieldTx: 18, deshieldTx: 3, net: -1048.6 }
      ]
    },
    note: 'Values in ZEC. Net = shield - deshield. Hourly mode returns ISO timestamps; daily mode returns date strings (YYYY-MM-DD). Hourly cached 2min, daily cached 5min.'
  },
  {
    id: 'pools-turnstile',
    category: 'Pool Analytics',
    method: 'GET',
    path: '/api/pools/turnstile',
    description: 'Turnstile analysis: tracks where deshielded ZEC goes after exiting a shielded pool (still held, reshielded, transferred, sent to exchange, sent to bridge).',
    params: [
      { name: 'since', type: 'string', description: 'Start date in YYYY-MM-DD format (default: 2020-01-01)', required: false }
    ],
    example: `curl "${baseUrl}/api/pools/turnstile?since=2026-01-01"`,
    response: {
      summary: {
        total_deshielded_zat: 18340000000000,
        still_held_zat: 5630000000000,
        reshielded_zat: 920000000000,
        transferred_zat: 11800000000000,
        exchange_zat: 4200000000000,
        bridge_zat: 1500000000000
      },
      timeseries: [
        { date: '2026-06-01', pool: 'orchard', deshielded_zat: 450000000000, held_zat: 120000000000, reshielded_zat: 50000000000, exchange_zat: 80000000000, bridge_zat: 30000000000, transferred_zat: 170000000000, tx_count: 45 }
      ]
    },
    note: 'All amounts in zatoshis (1 ZEC = 100,000,000 zat). Categories are mutually exclusive. "Still held" means the deshielded output has not been spent yet. Updated daily at 04:00 UTC.'
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
