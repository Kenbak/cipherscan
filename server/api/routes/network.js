/**
 * Network Routes
 * /api/network/stats, /api/network/fees, /api/network/health, /api/network/peers
 */

const express = require('express');
const router = express.Router();

// Dependencies will be injected via middleware
let pool;
let callZebraRPC;
let redisClient;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  callZebraRPC = req.app.locals.callZebraRPC;
  redisClient = req.app.locals.redisClient;
  next();
});

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const NETWORK_STATS_CACHE_KEY = 'zcash:network_stats';
const NETWORK_STATS_CACHE_DURATION = 30; // 30 seconds (Redis uses seconds)

// Fallback in-memory cache (if Redis fails)
let networkStatsCache = null;
let networkStatsCacheTime = 0;

/**
 * Get data from Redis cache
 */
async function getFromRedisCache(key) {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return null;
    }
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis GET error:', err);
    return null;
  }
}

/**
 * Set data in Redis cache with TTL
 */
async function setInRedisCache(key, data, ttlSeconds) {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Redis SET error:', err);
    return false;
  }
}

/**
 * Fetch network stats (optimized - 1 PostgreSQL query + 1 RPC call)
 */
async function fetchNetworkStatsOptimized() {
  try {
    // Single optimized PostgreSQL query (FAST!)
    const dbStats = await pool.query(`
      WITH latest AS (
        SELECT height, timestamp, difficulty
        FROM blocks
        ORDER BY height DESC
        LIMIT 1
      ),
      last_24h AS (
        SELECT
          COUNT(*) as blocks_24h,
          AVG(difficulty) as avg_difficulty,
          SUM(transaction_count) as tx_24h
        FROM blocks
        WHERE timestamp >= EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours')
      )
      SELECT
        latest.height,
        latest.difficulty,
        latest.timestamp,
        last_24h.blocks_24h,
        last_24h.avg_difficulty,
        last_24h.tx_24h
      FROM latest, last_24h
    `);

    if (!dbStats.rows[0]) {
      throw new Error('No blockchain data available');
    }

    const { height, difficulty, timestamp, blocks_24h, avg_difficulty, tx_24h } = dbStats.rows[0];

    // Get blockchain size from DB
    const sizeResult = await pool.query(`
      SELECT SUM(size) as total_size
      FROM blocks
    `);
    const blockchainSizeBytes = parseInt(sizeResult.rows[0]?.total_size || 0);
    const blockchainSizeGB = (blockchainSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

    // Get network info (Zebra 3.0+ has more detailed info)
    const networkInfo = await callZebraRPC('getnetworkinfo').catch(() => null);
    const peerInfo = await callZebraRPC('getpeerinfo').catch(() => []);
    const blockchainInfo = await callZebraRPC('getblockchaininfo').catch(() => null);

    // Extract peer count and network details
    const peerCount = networkInfo?.connections || (Array.isArray(peerInfo) ? peerInfo.length : 0);
    const protocolVersion = networkInfo?.protocolversion || null;
    const subversion = networkInfo?.subversion || null;

    // Extract supply and pool data from getblockchaininfo
    let supplyData = null;
    if (blockchainInfo) {
      const chainSupplyZat = blockchainInfo.chainSupply?.chainValueZat || 0;
      const valuePools = blockchainInfo.valuePools || [];

      const transparent = valuePools.find(p => p.id === 'transparent')?.chainValueZat || 0;
      const sprout = valuePools.find(p => p.id === 'sprout')?.chainValueZat || 0;
      const sapling = valuePools.find(p => p.id === 'sapling')?.chainValueZat || 0;
      const orchard = valuePools.find(p => p.id === 'orchard')?.chainValueZat || 0;
      const lockbox = valuePools.find(p => p.id === 'lockbox')?.chainValueZat || 0;

      const totalShielded = sprout + sapling + orchard;
      const shieldedPercentage = chainSupplyZat > 0 ? (totalShielded / chainSupplyZat) * 100 : 0;

      // Get active upgrade
      const upgrades = blockchainInfo.upgrades || {};
      const activeUpgrades = Object.values(upgrades).filter((u) => u.status === 'active');
      const latestUpgrade = activeUpgrades.length > 0
        ? activeUpgrades.reduce((latest, u) => u.activationheight > latest.activationheight ? u : latest)
        : null;

      supplyData = {
        chainSupply: chainSupplyZat / 100000000,
        transparent: transparent / 100000000,
        sprout: sprout / 100000000,
        sapling: sapling / 100000000,
        orchard: orchard / 100000000,
        lockbox: lockbox / 100000000,
        totalShielded: totalShielded / 100000000,
        shieldedPercentage: shieldedPercentage,
        sizeOnDisk: blockchainInfo.size_on_disk || 0,
        activeUpgrade: latestUpgrade?.name || null,
        chain: blockchainInfo.chain || 'unknown',
      };
    }

    // Calculate hashrate
    const blocks24h = parseInt(blocks_24h || 0);
    const tx24h = parseInt(tx_24h || 0);
    const avgBlockTime = blocks24h > 0 ? Math.round(86400 / blocks24h) : 75;
    const difficultyNum = parseFloat(difficulty || 0);
    const networkHashrate = difficultyNum / avgBlockTime;
    const hashrateInTH = (networkHashrate / 1e12).toFixed(2);

    // Calculate daily mining revenue
    const blockReward = 3.125; // Current ZEC block reward
    const dailyRevenue = blocks24h * blockReward;

    return {
      success: true,
      mining: {
        networkHashrate: `${hashrateInTH} TH/s`,
        networkHashrateRaw: networkHashrate,
        difficulty: difficultyNum,
        avgBlockTime, // in seconds
        blocks24h,
        blockReward,
        dailyRevenue,
      },
      network: {
        peers: peerCount,
        height: parseInt(height),
        protocolVersion: protocolVersion,
        subversion: subversion,
      },
      blockchain: {
        height: parseInt(height),
        latestBlockTime: parseInt(timestamp),
        syncProgress: 100, // Assume synced if we have recent blocks
        sizeBytes: blockchainSizeBytes,
        sizeGB: parseFloat(blockchainSizeGB),
        tx24h,
      },
      supply: supplyData,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('❌ [NETWORK] Error fetching stats:', error);
    throw error;
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/network/stats
 * Get network statistics (cached for 30s)
 */
router.get('/api/network/stats', async (req, res) => {
  try {
    // Try Redis cache first
    const cachedData = await getFromRedisCache(NETWORK_STATS_CACHE_KEY);
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true,
        source: 'redis',
      });
    }

    // Fallback to in-memory cache
    const now = Date.now();
    if (networkStatsCache && (now - networkStatsCacheTime) < (NETWORK_STATS_CACHE_DURATION * 1000)) {
      return res.json({
        ...networkStatsCache,
        cached: true,
        source: 'memory',
      });
    }

    // Fetch fresh data
    const stats = await fetchNetworkStatsOptimized();

    // Update Redis cache
    await setInRedisCache(NETWORK_STATS_CACHE_KEY, stats, NETWORK_STATS_CACHE_DURATION);

    // Update in-memory cache (fallback)
    networkStatsCache = stats;
    networkStatsCacheTime = now;

    res.json(stats);
  } catch (error) {
    console.error('❌ [NETWORK] Error in API endpoint:', error);

    // Try Redis cache as fallback
    const cachedData = await getFromRedisCache(NETWORK_STATS_CACHE_KEY);
    if (cachedData) {
      return res.json({
        ...cachedData,
        cached: true,
        stale: true,
        source: 'redis',
        warning: 'Using stale Redis data due to fetch error',
      });
    }

    // Try in-memory cache as last resort
    if (networkStatsCache) {
      return res.json({
        ...networkStatsCache,
        cached: true,
        stale: true,
        source: 'memory',
        warning: 'Using stale memory data due to fetch error',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch network stats',
    });
  }
});

/**
 * GET /api/network/fees
 * Get estimated transaction fees (slow, standard, fast)
 */
router.get('/api/network/fees', async (req, res) => {
  try {
    console.log('💰 [FEES] Fetching fee estimates...');

    // For now, return static values (Zcash fees are very low and predictable)
    res.json({
      success: true,
      fees: {
        slow: 0.000005,      // ~0.0005 cents
        standard: 0.00001,   // ~0.001 cents
        fast: 0.000015,      // ~0.0015 cents
      },
      unit: 'ZEC',
      note: 'Zcash transaction fees are extremely low and predictable',
      timestamp: Date.now(),
    });

    console.log(`✅ [FEES] Fee estimates returned`);
  } catch (error) {
    console.error('❌ [FEES] Error fetching fees:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch fee estimates',
    });
  }
});

/**
 * GET /api/network/health
 * Get Zebra node health status (Zebra 3.0+)
 */
router.get('/api/network/health', async (req, res) => {
  try {
    console.log('🏥 [HEALTH] Checking Zebra node health...');

    const zebraHealthUrl = process.env.ZEBRA_HEALTH_URL || 'http://127.0.0.1:8080';

    // Try to fetch Zebra's health endpoints (Zebra 3.0+)
    const [healthyRes, readyRes] = await Promise.allSettled([
      fetch(`${zebraHealthUrl}/healthy`).then(r => ({ status: r.status, ok: r.ok })).catch(() => null),
      fetch(`${zebraHealthUrl}/ready`).then(r => ({ status: r.status, ok: r.ok })).catch(() => null),
    ]);

    const healthy = healthyRes.status === 'fulfilled' && healthyRes.value?.ok;
    const ready = readyRes.status === 'fulfilled' && readyRes.value?.ok;

    // Fallback: check via RPC if health endpoints not available
    let fallbackHealthy = false;
    if (!healthy) {
      try {
        const blockchainInfo = await callZebraRPC('getblockchaininfo');
        fallbackHealthy = blockchainInfo && blockchainInfo.blocks > 0;
      } catch (error) {
        fallbackHealthy = false;
      }
    }

    res.json({
      success: true,
      zebra: {
        healthy: healthy || fallbackHealthy,
        ready: ready,
        healthEndpointAvailable: healthy,
        readyEndpointAvailable: ready,
      },
      note: healthy ? 'Zebra 3.0+ health endpoints available' : 'Using RPC fallback (Zebra < 3.0 or health endpoints not configured)',
      timestamp: Date.now(),
    });

    console.log(`✅ [HEALTH] Node healthy: ${healthy || fallbackHealthy}, ready: ${ready}`);
  } catch (error) {
    console.error('❌ [HEALTH] Error checking health:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check node health',
    });
  }
});

/**
 * GET /api/network/peers
 * Get detailed information about connected peers
 */
router.get('/api/network/peers', async (req, res) => {
  try {
    console.log('🌐 [PEERS] Fetching peer information...');

    // Get detailed peer info from Zebra
    const peerInfo = await callZebraRPC('getpeerinfo').catch(() => []);

    if (!Array.isArray(peerInfo)) {
      return res.json({
        success: true,
        count: 0,
        peers: [],
      });
    }

    // Format peer data for frontend
    const peers = peerInfo.map((peer, index) => {
      const addr = peer.addr || peer.address || 'unknown';
      const ip = addr.split(':')[0];

      return {
        id: index + 1,
        addr: addr,
        ip: ip,
        inbound: peer.inbound !== undefined ? peer.inbound : false,
        version: peer.version || null,
        subver: peer.subver || null,
        pingtime: peer.pingtime || null,
        conntime: peer.conntime || null,
      };
    });

    res.json({
      success: true,
      count: peers.length,
      peers,
      timestamp: Date.now(),
    });

    console.log(`✅ [PEERS] Returned ${peers.length} peers`);
  } catch (error) {
    console.error('❌ [PEERS] Error fetching peers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch peer information',
    });
  }
});

// ============================================================================
// SUPPLY & BLOCKCHAIN INFO APIs
// ============================================================================

/**
 * GET /api/supply
 * Get value pool breakdown (transparent, sprout, sapling, orchard, lockbox)
 * Compatible with zcashexplorer.app /api/v1/supply format
 */
router.get('/api/supply', async (req, res) => {
  try {
    const blockchainInfo = await callZebraRPC('getblockchaininfo');

    if (!blockchainInfo || !blockchainInfo.valuePools) {
      return res.status(500).json({ error: 'Could not fetch supply data' });
    }

    // Return in same format as zcashexplorer.app
    const pools = blockchainInfo.valuePools.map(pool => ({
      id: pool.id,
      chainValue: pool.chainValue,
      chainValueZat: pool.chainValueZat,
      monitored: pool.monitored,
    }));

    res.json(pools);
  } catch (error) {
    console.error('❌ [SUPPLY] Error:', error);
    res.status(500).json({ error: 'Failed to fetch supply data' });
  }
});

/**
 * GET /api/blockchain-info
 * Full blockchain info (supply, difficulty, upgrades, softforks, etc.)
 * Compatible with zcashexplorer.app /api/v1/blockchain-info format
 */
router.get('/api/blockchain-info', async (req, res) => {
  try {
    const [blockchainInfo, networkInfo] = await Promise.all([
      callZebraRPC('getblockchaininfo'),
      callZebraRPC('getnetworkinfo').catch(() => null),
    ]);

    if (!blockchainInfo) {
      return res.status(500).json({ error: 'Could not fetch blockchain info' });
    }

    // Add build version from networkinfo if available
    if (networkInfo?.subversion) {
      blockchainInfo.build = networkInfo.subversion;
    }

    res.json(blockchainInfo);
  } catch (error) {
    console.error('❌ [BLOCKCHAIN-INFO] Error:', error);
    res.status(500).json({ error: 'Failed to fetch blockchain info' });
  }
});

/**
 * GET /api/circulating-supply
 * Returns just the circulating supply number (plain text or JSON)
 * Useful for CoinGecko, CoinMarketCap integrations
 */
router.get('/api/circulating-supply', async (req, res) => {
  try {
    const blockchainInfo = await callZebraRPC('getblockchaininfo');

    if (!blockchainInfo?.chainSupply) {
      return res.status(500).json({ error: 'Could not fetch supply data' });
    }

    const supply = blockchainInfo.chainSupply.chainValue;

    // If ?format=json, return JSON; otherwise plain text (for aggregators)
    if (req.query.format === 'json') {
      res.json({
        circulatingSupply: supply,
        circulatingSupplyZat: blockchainInfo.chainSupply.chainValueZat,
        maxSupply: 21000000,
        unit: 'ZEC',
      });
    } else {
      res.type('text/plain').send(supply.toString());
    }
  } catch (error) {
    console.error('❌ [CIRCULATING-SUPPLY] Error:', error);
    res.status(500).json({ error: 'Failed to fetch circulating supply' });
  }
});

// ============================================================================
// NODE MAP (Aggregated by location for privacy)
// ============================================================================

/**
 * GET /api/network/nodes
 * Get node locations aggregated by city (for privacy)
 */
router.get('/api/network/nodes', async (req, res) => {
  try {
    // Return nodes aggregated by city/country (no individual IPs exposed)
    const result = await pool.query(`
      SELECT 
        country,
        country_code,
        city,
        ROUND(lat::numeric, 2) as lat,
        ROUND(lon::numeric, 2) as lon,
        COUNT(*) as node_count,
        ROUND(AVG(ping_ms)::numeric, 1) as avg_ping_ms
      FROM nodes 
      WHERE is_active = TRUE AND lat IS NOT NULL
      GROUP BY country, country_code, city, ROUND(lat::numeric, 2), ROUND(lon::numeric, 2)
      ORDER BY node_count DESC
    `);

    res.json({
      success: true,
      locations: result.rows.map(row => ({
        country: row.country,
        countryCode: row.country_code,
        city: row.city,
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        nodeCount: parseInt(row.node_count),
        avgPingMs: row.avg_ping_ms ? parseFloat(row.avg_ping_ms) : null,
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('❌ [NODES] Error fetching node locations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch node locations',
    });
  }
});

/**
 * GET /api/network/nodes/stats
 * Get aggregated node statistics
 */
router.get('/api/network/nodes/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active) as active_nodes,
        COUNT(*) as total_nodes,
        COUNT(DISTINCT country_code) FILTER (WHERE is_active) as countries,
        COUNT(DISTINCT city) FILTER (WHERE is_active) as cities,
        ROUND(AVG(ping_ms) FILTER (WHERE is_active)::numeric, 1) as avg_ping_ms,
        MAX(last_seen) as last_updated
      FROM nodes
    `);

    // Top countries by node count
    const topCountries = await pool.query(`
      SELECT 
        country,
        country_code,
        COUNT(*) as node_count
      FROM nodes 
      WHERE is_active = TRUE
      GROUP BY country, country_code
      ORDER BY node_count DESC
      LIMIT 10
    `);

    const row = stats.rows[0];
    
    res.json({
      success: true,
      stats: {
        activeNodes: parseInt(row.active_nodes) || 0,
        totalNodes: parseInt(row.total_nodes) || 0,
        countries: parseInt(row.countries) || 0,
        cities: parseInt(row.cities) || 0,
        avgPingMs: row.avg_ping_ms ? parseFloat(row.avg_ping_ms) : null,
        lastUpdated: row.last_updated,
      },
      topCountries: topCountries.rows.map(r => ({
        country: r.country,
        countryCode: r.country_code,
        nodeCount: parseInt(r.node_count),
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('❌ [NODES] Error fetching node stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch node stats',
    });
  }
});

module.exports = router;
