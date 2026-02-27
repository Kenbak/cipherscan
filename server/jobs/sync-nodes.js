/**
 * Node Sync Job
 * Fetches peers from Zebra RPC and updates GeoIP data in PostgreSQL
 * Run: node server/jobs/sync-nodes.js
 * Or schedule via cron: 0 * * * * (every hour)
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Load .env from jobs folder first, then fallback to api folder
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });

const { Pool } = require('pg');

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ),
  database: process.env.DB_NAME ,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Configuration from environment
const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL;
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE;
const GEOIP_RATE_LIMIT_MS = 1500; // ip-api.com: 45 req/min = 1.33s between requests
const INACTIVE_THRESHOLD_HOURS = 24; // Mark nodes inactive after 24h

// Validate required env vars
if (!ZEBRA_RPC_URL || !ZEBRA_COOKIE_FILE) {
  console.error('❌ Missing required environment variables:');
  if (!ZEBRA_RPC_URL) console.error('   - ZEBRA_RPC_URL');
  if (!ZEBRA_COOKIE_FILE) console.error('   - ZEBRA_RPC_COOKIE_FILE');
  process.exit(1);
}

console.log(`📁 Cookie file: ${ZEBRA_COOKIE_FILE}`);
console.log(`🔗 Zebra RPC: ${ZEBRA_RPC_URL}`);

/**
 * Call Zebra RPC with cookie authentication
 */
async function callZebraRPC(method, params = []) {
  // Read cookie from file
  let auth = '';
  try {
    const cookie = fs.readFileSync(ZEBRA_COOKIE_FILE, 'utf8').trim();
    auth = Buffer.from(cookie).toString('base64');
  } catch (err) {
    console.error('❌ Could not read Zebra cookie file:', err.message);
    throw err;
  }

  const requestBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 'node-sync',
    method,
    params,
  });

  const url = new URL(ZEBRA_RPC_URL);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length,
        'Authorization': `Basic ${auth}`,
      },
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'RPC error'));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(new Error(`Failed to parse RPC response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`RPC request failed: ${error.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Fetch GeoIP data for an IP address
 * Uses ip-api.com (free, 45 req/min)
 */
async function fetchGeoIP(ip) {
  return new Promise((resolve, reject) => {
    const url = `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon,isp`;

    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const geo = JSON.parse(data);
          if (geo.status === 'success') {
            resolve({
              country: geo.country,
              countryCode: geo.countryCode,
              city: geo.city,
              lat: geo.lat,
              lon: geo.lon,
              isp: geo.isp,
            });
          } else {
            resolve(null); // IP not found or private
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolve DNS seeder to get additional node IPs
 */
async function resolveSeeder(hostname) {
  const dns = require('dns').promises;
  try {
    const addresses = await dns.resolve4(hostname);
    return addresses;
  } catch (err) {
    console.warn(`⚠️  [NodeSync] Could not resolve seeder ${hostname}: ${err.message}`);
    return [];
  }
}

/**
 * Main sync function
 */
async function syncNodes() {
  console.log('🌐 [NodeSync] Starting node synchronization...');
  const startTime = Date.now();

  try {
    // 1. Fetch peers from Zebra RPC
    console.log('📡 [NodeSync] Fetching peers from Zebra RPC...');
    const peers = await callZebraRPC('getpeerinfo');

    if (!Array.isArray(peers)) {
      throw new Error('Invalid peer info response');
    }

    console.log(`📊 [NodeSync] Found ${peers.length} connected peers`);

    // 2. Fetch additional nodes from DNS seeders (network-aware)
    const isTestnet = ZEBRA_RPC_URL.includes('18232') || (process.env.NETWORK || '').toLowerCase() === 'testnet';
    const DNS_SEEDERS = isTestnet
      ? [
          'testnet.seeder.zfnd.org',
          'testnet.seeder.shieldedinfra.net',
          'dnsseed.testnet.z.cash',
        ]
      : [
          'mainnet.seeder.zfnd.org',
          'mainnet.seeder.shieldedinfra.net',
          'dnsseed.z.cash',
          'dnsseed.str4d.xyz',
        ];
    console.log(`🔍 [NodeSync] Network: ${isTestnet ? 'testnet' : 'mainnet'}`);

    console.log('🌱 [NodeSync] Querying DNS seeders...');
    const seederIPs = new Set();
    for (const seeder of DNS_SEEDERS) {
      const ips = await resolveSeeder(seeder);
      ips.forEach(ip => seederIPs.add(ip));
    }

    // Merge: extract IPs from peers, add seeder IPs that aren't already peers
    const peerIPs = new Set(peers.map(p => (p.addr || '').split(':')[0]).filter(Boolean));
    const seederOnlyIPs = [...seederIPs].filter(ip => !peerIPs.has(ip));
    console.log(`🌱 [NodeSync] DNS seeders returned ${seederIPs.size} IPs (${seederOnlyIPs.length} new)`);

    // 3. Process each peer
    let updated = 0;
    let newNodes = 0;
    let geoLookups = 0;

    for (const peer of peers) {
      const [ip, portStr] = (peer.addr || '').split(':');
      const port = parseInt(portStr) || 8233;
      const pingMs = (peer.pingtime || 0) * 1000; // Convert to ms

      if (!ip || ip === '0.0.0.0') continue;

      try {
        // Check if node exists
        const existing = await pool.query(
          'SELECT id, lat FROM nodes WHERE ip = $1',
          [ip]
        );

        if (existing.rows.length > 0) {
          // Update existing node
          await pool.query(`
            UPDATE nodes SET
              port = $2,
              inbound = $3,
              ping_ms = $4,
              last_seen = NOW(),
              is_active = TRUE
            WHERE ip = $1
          `, [ip, port, peer.inbound, pingMs]);
          updated++;

          // Skip GeoIP if we already have location data
          if (existing.rows[0].lat) continue;
        }

        // Fetch GeoIP for new nodes or nodes without location
        const geo = await fetchGeoIP(ip);
        geoLookups++;

        if (geo) {
          if (existing.rows.length > 0) {
            // Update with geo data
            await pool.query(`
              UPDATE nodes SET
                country = $2,
                country_code = $3,
                city = $4,
                lat = $5,
                lon = $6,
                isp = $7
              WHERE ip = $1
            `, [ip, geo.country, geo.countryCode, geo.city, geo.lat, geo.lon, geo.isp]);
          } else {
            // Insert new node
            await pool.query(`
              INSERT INTO nodes (ip, port, country, country_code, city, lat, lon, isp, inbound, ping_ms)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (ip) DO UPDATE SET
                port = $2,
                country = COALESCE($3, nodes.country),
                country_code = COALESCE($4, nodes.country_code),
                city = COALESCE($5, nodes.city),
                lat = COALESCE($6, nodes.lat),
                lon = COALESCE($7, nodes.lon),
                isp = COALESCE($8, nodes.isp),
                inbound = $9,
                ping_ms = $10,
                last_seen = NOW(),
                is_active = TRUE
            `, [ip, port, geo.country, geo.countryCode, geo.city, geo.lat, geo.lon, geo.isp, peer.inbound, pingMs]);
            newNodes++;
          }
        } else if (existing.rows.length === 0) {
          // Insert without geo data
          await pool.query(`
            INSERT INTO nodes (ip, port, inbound, ping_ms)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (ip) DO UPDATE SET
              port = $2,
              inbound = $3,
              ping_ms = $4,
              last_seen = NOW(),
              is_active = TRUE
          `, [ip, port, peer.inbound, pingMs]);
          newNodes++;
        }

        // Rate limit for GeoIP API
        if (geoLookups > 0) {
          await sleep(GEOIP_RATE_LIMIT_MS);
        }

      } catch (err) {
        console.error(`⚠️  [NodeSync] Error processing ${ip}:`, err.message);
      }
    }

    // 4. Process DNS seeder nodes (no ping/inbound info available)
    console.log(`🌱 [NodeSync] Processing ${seederOnlyIPs.length} seeder-only nodes...`);
    let seederNew = 0;
    for (const ip of seederOnlyIPs) {
      if (!ip || ip === '0.0.0.0') continue;

      try {
        // Check if node exists
        const existing = await pool.query(
          'SELECT id, lat FROM nodes WHERE ip = $1',
          [ip]
        );

        if (existing.rows.length > 0) {
          // Update last_seen for existing nodes
          await pool.query(`
            UPDATE nodes SET last_seen = NOW(), is_active = TRUE WHERE ip = $1
          `, [ip]);

          // Skip GeoIP if already have location
          if (existing.rows[0].lat) continue;
        }

        // Fetch GeoIP
        const geo = await fetchGeoIP(ip);
        geoLookups++;

        if (geo) {
          await pool.query(`
            INSERT INTO nodes (ip, port, country, country_code, city, lat, lon, isp)
            VALUES ($1, 8233, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (ip) DO UPDATE SET
              country = COALESCE($2, nodes.country),
              country_code = COALESCE($3, nodes.country_code),
              city = COALESCE($4, nodes.city),
              lat = COALESCE($5, nodes.lat),
              lon = COALESCE($6, nodes.lon),
              isp = COALESCE($7, nodes.isp),
              last_seen = NOW(),
              is_active = TRUE
          `, [ip, geo.country, geo.countryCode, geo.city, geo.lat, geo.lon, geo.isp]);
          if (existing.rows.length === 0) seederNew++;
        } else if (existing.rows.length === 0) {
          await pool.query(`
            INSERT INTO nodes (ip, port)
            VALUES ($1, 8233)
            ON CONFLICT (ip) DO UPDATE SET
              last_seen = NOW(),
              is_active = TRUE
          `, [ip]);
          seederNew++;
        }

        // Rate limit for GeoIP API
        await sleep(GEOIP_RATE_LIMIT_MS);

      } catch (err) {
        console.error(`⚠️  [NodeSync] Error processing seeder IP ${ip}:`, err.message);
      }
    }

    // 5. Mark inactive nodes (not seen in last 24h)
    const inactiveResult = await pool.query(`
      UPDATE nodes SET is_active = FALSE
      WHERE last_seen < NOW() - INTERVAL '${INACTIVE_THRESHOLD_HOURS} hours'
        AND is_active = TRUE
      RETURNING id
    `);
    const inactiveCount = inactiveResult.rowCount;

    // 6. Get final stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active) as active,
        COUNT(*) as total,
        COUNT(DISTINCT country_code) FILTER (WHERE is_active) as countries
      FROM nodes
    `);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`
✅ [NodeSync] Sync complete in ${elapsed}s
   - Peers processed: ${peers.length}
   - Seeder IPs found: ${seederIPs.size} (${seederOnlyIPs.length} new)
   - New nodes (peers): ${newNodes}
   - New nodes (seeders): ${seederNew}
   - Updated: ${updated}
   - GeoIP lookups: ${geoLookups}
   - Marked inactive: ${inactiveCount}
   - Active nodes: ${stats.rows[0].active}
   - Total nodes: ${stats.rows[0].total}
   - Countries: ${stats.rows[0].countries}
    `);

  } catch (error) {
    console.error('❌ [NodeSync] Sync failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  syncNodes()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { syncNodes };
