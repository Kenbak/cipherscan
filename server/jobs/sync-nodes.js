/**
 * Node Sync Job
 * Fetches peers from Zebra RPC and updates GeoIP data in PostgreSQL
 * Run: node server/jobs/sync-nodes.js
 * Schedule every 15 minutes via server/deploy/crontab.production.
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { parsePeerAddress, parsePeerClient } = require('../lib/peer-client');

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
  max: 2,
  idleTimeoutMillis: 10000,
});

// Configuration from environment
const ZEBRA_RPC_URL = process.env.ZEBRA_RPC_URL;
const ZEBRA_COOKIE_FILE = process.env.ZEBRA_RPC_COOKIE_FILE;
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
 * Batch GeoIP lookup using ip-api.com (free tier: 45 req/min, 100 IPs per batch).
 * Returns a Map<ip, { country, countryCode, city, lat, lon, isp }>.
 */
async function fetchGeoIPBatch(ips) {
  const results = new Map();
  if (!ips || ips.length === 0) return results;

  const validIps = ips.filter(ip => ip && !ip.endsWith('.onion'));
  if (validIps.length === 0) return results;

  const BATCH_SIZE = 100;
  for (let i = 0; i < validIps.length; i += BATCH_SIZE) {
    const batch = validIps.slice(i, i + BATCH_SIZE);
    const body = JSON.stringify(batch.map(ip => ({ query: ip, fields: 'query,country,countryCode,city,lat,lon,isp,status' })));

    try {
      const data = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'ip-api.com',
          port: 80,
          path: '/batch',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        }, (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch (e) { reject(new Error(`ip-api parse error: ${e.message}`)); }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry.status === 'success') {
            results.set(entry.query, {
              country: entry.country || null,
              countryCode: entry.countryCode || null,
              city: entry.city || null,
              lat: entry.lat ?? null,
              lon: entry.lon ?? null,
              isp: entry.isp || null,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️  [NodeSync] ip-api batch lookup failed: ${err.message}`);
    }

    // Rate limit: ip-api free tier allows 45 requests/minute
    if (i + BATCH_SIZE < validIps.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return results;
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
 * Fetch known Tor exit node IPs from the Tor Project's bulk exit list
 */
async function fetchTorExitNodes() {
  return new Promise((resolve) => {
    https.get('https://check.torproject.org/torbulkexitlist', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const ips = new Set(
          data.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
        );
        console.log(`🧅 [NodeSync] Fetched ${ips.size} Tor exit node IPs`);
        resolve(ips);
      });
    }).on('error', (err) => {
      console.warn(`⚠️  [NodeSync] Could not fetch Tor exit list: ${err.message}`);
      resolve(new Set());
    });
  });
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

    // 3. Collect all IPs that need GeoIP, then batch-lookup via ip-api.com
    const peerEntries = peers.map(peer => {
      const addr = peer.addr || '';
      const { host: ip, port } = parsePeerAddress(addr);
      return { peer, ip, port, isOnion: addr.includes('.onion') };
    }).filter(e => e.ip && e.ip !== '0.0.0.0');

    // Find which IPs need geo lookups (new or missing lat)
    const allIPs = [...new Set([...peerEntries.map(e => e.ip), ...seederOnlyIPs])];
    const existingRows = allIPs.length > 0
      ? (await pool.query('SELECT ip, lat FROM nodes WHERE ip = ANY($1::varchar[])', [allIPs])).rows
      : [];
    const existingMap = new Map(existingRows.map(r => [r.ip, r]));

    const ipsNeedingGeo = allIPs.filter(ip => {
      if (ip.endsWith('.onion')) return false;
      const existing = existingMap.get(ip);
      return !existing || !existing.lat;
    });

    console.log(`🌍 [NodeSync] Batch GeoIP lookup for ${ipsNeedingGeo.length} IPs via ip-api.com...`);
    const geoMap = await fetchGeoIPBatch(ipsNeedingGeo);
    const geoLookups = ipsNeedingGeo.length;

    // 4. Process each peer
    let updated = 0;
    let newNodes = 0;

    for (const { peer, ip, port, isOnion } of peerEntries) {
      const pingMs = (peer.pingtime || 0) * 1000;
      const client = parsePeerClient(peer.subver);
      const protocolVersion = Number.isInteger(peer.version) ? peer.version : null;
      const exists = existingMap.has(ip);
      const geo = geoMap.get(ip) || null;

      try {
        await pool.query(`
          INSERT INTO nodes (
            ip, port, country, country_code, city, lat, lon, isp,
            inbound, ping_ms, is_tor, user_agent, client_impl,
            client_version, protocol_version, observed_via
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, 'peer'
          )
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
            is_tor = $11 OR nodes.is_tor,
            user_agent = COALESCE($12, nodes.user_agent),
            client_impl = CASE WHEN $12 IS NULL THEN nodes.client_impl ELSE $13 END,
            client_version = CASE WHEN $12 IS NULL THEN nodes.client_version ELSE $14 END,
            protocol_version = COALESCE($15, nodes.protocol_version),
            observed_via = 'peer',
            last_seen = NOW(),
            is_active = TRUE
        `, [
          ip,
          port,
          geo?.country || null,
          geo?.countryCode || null,
          geo?.city || null,
          geo?.lat ?? null,
          geo?.lon ?? null,
          geo?.isp || null,
          peer.inbound,
          pingMs,
          isOnion,
          client.userAgent,
          client.clientImpl,
          client.clientVersion,
          protocolVersion,
        ]);
        if (exists) updated++;
        else newNodes++;
      } catch (err) {
        console.error(`⚠️  [NodeSync] Error processing ${ip}:`, err.message);
      }
    }

    // 5. Process DNS seeder nodes (no ping/inbound info available)
    console.log(`🌱 [NodeSync] Processing ${seederOnlyIPs.length} seeder-only nodes...`);
    let seederNew = 0;
    for (const ip of seederOnlyIPs) {
      if (!ip || ip === '0.0.0.0') continue;
      const geo = geoMap.get(ip) || null;

      try {
        await pool.query(`
          INSERT INTO nodes (ip, port, country, country_code, city, lat, lon, isp, observed_via)
          VALUES ($1, 8233, $2, $3, $4, $5, $6, $7, 'dns')
          ON CONFLICT (ip) DO UPDATE SET
            country = COALESCE($2, nodes.country),
            country_code = COALESCE($3, nodes.country_code),
            city = COALESCE($4, nodes.city),
            lat = COALESCE($5, nodes.lat),
            lon = COALESCE($6, nodes.lon),
            isp = COALESCE($7, nodes.isp),
            last_seen = NOW(),
            is_active = TRUE
        `, [ip, geo?.country || null, geo?.countryCode || null, geo?.city || null, geo?.lat ?? null, geo?.lon ?? null, geo?.isp || null]);
        if (!existingMap.has(ip)) seederNew++;
      } catch (err) {
        console.error(`⚠️  [NodeSync] Error processing seeder IP ${ip}:`, err.message);
      }
    }

    // 6. Mark inactive nodes (not seen in last 24h)
    const inactiveResult = await pool.query(`
      UPDATE nodes SET is_active = FALSE
      WHERE last_seen < NOW() - INTERVAL '${INACTIVE_THRESHOLD_HOURS} hours'
        AND is_active = TRUE
      RETURNING id
    `);
    const inactiveCount = inactiveResult.rowCount;

    // 7. Cross-reference with Tor exit node list
    console.log('🧅 [NodeSync] Checking Tor exit node list...');
    const torExitIPs = await fetchTorExitNodes();
    if (torExitIPs.size > 0) {
      const torResult = await pool.query(`
        UPDATE nodes SET is_tor = TRUE
        WHERE ip = ANY($1::varchar[]) AND is_active = TRUE AND is_tor = FALSE
        RETURNING id
      `, [[...torExitIPs]]);
      console.log(`🧅 [NodeSync] Flagged ${torResult.rowCount} additional Tor exit nodes`);
    }

    // 8. Get final stats + record snapshot for historical tracking
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active) as active,
        COUNT(*) as total,
        COUNT(DISTINCT country_code) FILTER (WHERE is_active) as countries,
        COUNT(*) FILTER (WHERE is_active AND is_tor) as tor,
        COUNT(*) FILTER (WHERE is_active AND inbound = TRUE) as inbound,
        COUNT(*) FILTER (WHERE is_active AND (inbound = FALSE OR inbound IS NULL)) as outbound,
        ROUND(AVG(ping_ms) FILTER (WHERE is_active AND ping_ms > 0)::numeric, 3) as avg_ping
      FROM nodes
    `);
    const clientResult = await pool.query(`
      SELECT client_impl, COUNT(*)::int AS node_count
      FROM nodes
      WHERE is_active = TRUE
      GROUP BY client_impl
      ORDER BY node_count DESC, client_impl ASC
    `);

    const snap = stats.rows[0];
    const clientCounts = Object.fromEntries(
      clientResult.rows.map((row) => [row.client_impl || 'Unknown', row.node_count])
    );
    const identifiedClientNodes = clientResult.rows
      .filter((row) => row.client_impl && row.client_impl !== 'Unknown')
      .reduce((sum, row) => sum + Number(row.node_count), 0);
    try {
      await pool.query(`
        INSERT INTO node_snapshots (
          active_nodes, total_nodes, countries, tor_nodes, inbound_nodes,
          outbound_nodes, avg_ping_ms, identified_client_nodes, client_counts
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        parseInt(snap.active), parseInt(snap.total), parseInt(snap.countries),
        parseInt(snap.tor), parseInt(snap.inbound), parseInt(snap.outbound),
        snap.avg_ping ? parseFloat(snap.avg_ping) : null, identifiedClientNodes,
        JSON.stringify(clientCounts),
      ]);

      // Prune snapshots older than 90 days
      await pool.query(`DELETE FROM node_snapshots WHERE snapshot_time < NOW() - INTERVAL '90 days'`);
      console.log(`📸 [NodeSync] Recorded snapshot: ${snap.active} active, ${snap.tor} Tor, ${snap.countries} countries`);
    } catch (snapErr) {
      console.warn(`⚠️  [NodeSync] Could not record snapshot (table may not exist yet): ${snapErr.message}`);
    }

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
   - Active nodes: ${snap.active}
   - Total nodes: ${snap.total}
   - Countries: ${snap.countries}
   - Tor nodes: ${snap.tor}
   - Identified clients: ${identifiedClientNodes}
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
