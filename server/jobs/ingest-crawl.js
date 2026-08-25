'use strict';

/**
 * Crawl Ingester Job
 *
 * Polls the Ziggurat crawler's JSON-RPC (getmetrics), invokes the Rust cruncher
 * for geolocation + centrality enrichment, then persists to PostgreSQL.
 *
 * Run: node server/jobs/ingest-crawl.js [--dry-run]
 * Schedule: every 5 minutes via flock in crontab.production.
 *
 * During parallel validation, writes to `nodes_crawl` (shadow table).
 * After cutover (NODE_SOURCE=crawl), writes to `nodes` directly.
 */

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { log, loadEnv, withAdvisoryLock } = require('../lib/job-utils');
const { getPool } = require('../lib/db-pool');
const { parsePeerClient } = require('../lib/peer-client');

const execFileAsync = promisify(execFile);

loadEnv(__dirname);

const CRAWLER_RPC_HOST = process.env.CRAWLER_RPC_HOST || '127.0.0.1';
const CRAWLER_RPC_PORT = parseInt(process.env.CRAWLER_RPC_PORT || '54321');
const CRAWLER_TOR_RPC_PORT = parseInt(process.env.CRAWLER_TOR_RPC_PORT || '54322');
const CRUNCHER_BIN = process.env.CRUNCHER_BIN || '/opt/zcash-crawler/target/release/cruncher';
const MAXMIND_DB_PATH = process.env.MAXMIND_DB_PATH || '/opt/zcash-crawler/data/GeoLite2-City.mmdb';
const NODE_SOURCE = process.env.NODE_SOURCE || 'peer';
const DRY_RUN = process.argv.includes('--dry-run');
const INACTIVE_THRESHOLD_HOURS = 1;
const ADVISORY_LOCK_ID = 839271;

const pool = getPool({ max: 3, idleTimeoutMillis: 10000 });

/**
 * Call a crawler's JSON-RPC endpoint.
 */
function callCrawlerRPC(method, port = CRAWLER_RPC_PORT) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params: [], id: 1 });
    const req = http.request({
      hostname: CRAWLER_RPC_HOST,
      port,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) reject(new Error(`RPC error: ${JSON.stringify(parsed.error)}`));
          else resolve(parsed.result);
        } catch (e) {
          reject(new Error(`RPC parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('RPC timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * Invoke the Rust cruncher binary.
 * Stdin: raw crawl JSON, Stdout: enriched JSON with geo + centrality.
 */
async function runCruncher(crawlJson) {
  const tmpFile = path.join(os.tmpdir(), `crawl-input-${process.pid}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(crawlJson));

  try {
    const { stdout, stderr } = await execFileAsync('/bin/sh', [
      '-c', `${CRUNCHER_BIN} --mmdb ${MAXMIND_DB_PATH} < ${tmpFile}`,
    ], {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 60000,
    });

    if (stderr) {
      log(`[Cruncher stderr] ${stderr.slice(0, 500)}`);
    }

    return JSON.parse(stdout);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Fetch known Tor exit node IPs from the Tor Project's bulk exit list.
 */
function fetchTorExitNodes() {
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
        log(`Fetched ${ips.size} Tor exit node IPs`);
        resolve(ips);
      });
    }).on('error', (err) => {
      log(`Could not fetch Tor exit list: ${err.message}`);
      resolve(new Set());
    });
  });
}

/**
 * Determine the target table based on NODE_SOURCE and dry-run mode.
 */
function getTargetTable() {
  if (DRY_RUN) return 'nodes_crawl';
  return NODE_SOURCE === 'crawl' ? 'nodes' : 'nodes_crawl';
}

/**
 * Main ingestion logic.
 */
async function ingestCrawl() {
  const startTime = Date.now();
  const targetTable = getTargetTable();
  log(`Starting crawl ingestion (target: ${targetTable}, dry-run: ${DRY_RUN})`);

  const metrics = await callCrawlerRPC('getmetrics');
  if (!metrics) {
    throw new Error('getmetrics returned null/undefined');
  }

  log(`Crawler reports: ${metrics.num_good_nodes} good / ${metrics.num_known_nodes} known nodes, ${metrics.num_known_connections} connections`);

  // Poll Tor crawler (best-effort — may not be running)
  let torMetrics = null;
  try {
    torMetrics = await callCrawlerRPC('getmetrics', CRAWLER_TOR_RPC_PORT);
    if (torMetrics && torMetrics.num_good_nodes > 0) {
      log(`Tor crawler reports: ${torMetrics.num_good_nodes} good / ${torMetrics.num_known_nodes} known nodes`);
    }
  } catch {
    log('Tor crawler not available (skipping)');
  }

  // Merge Tor-discovered nodes into the main metrics before crunching
  if (torMetrics && Array.isArray(torMetrics.node_info) && torMetrics.node_info.length > 0) {
    const existingAddrs = new Set((metrics.node_info || []).map(n => n.addr));
    let torAdded = 0;
    for (const torNode of torMetrics.node_info) {
      if (torNode.addr && !existingAddrs.has(torNode.addr)) {
        metrics.node_info.push(torNode);
        existingAddrs.add(torNode.addr);
        torAdded++;
      }
    }
    if (torAdded > 0) {
      log(`Merged ${torAdded} unique nodes from Tor crawler`);
    }
  }

  const enriched = await runCruncher(metrics);
  if (!enriched || !Array.isArray(enriched.nodes)) {
    throw new Error('Cruncher returned invalid output');
  }

  log(`Cruncher enriched ${enriched.nodes.length} nodes`);

  const torExitIPs = await fetchTorExitNodes();

  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, ADVISORY_LOCK_ID, async () => {
      await client.query('BEGIN');

      let upserted = 0;
      let newNodes = 0;

      for (const node of enriched.nodes) {
        if (!node.addr) continue;

        const [ip, portStr] = node.addr.includes(']:')
          ? [node.addr.match(/\[(.+)\]/)?.[1], node.addr.split(']:')[1]]
          : node.addr.split(':');

        if (!ip || ip === '0.0.0.0') continue;

        const port = parseInt(portStr) || 8233;
        const isOnion = ip.endsWith('.onion');
        const isTor = isOnion || torExitIPs.has(ip);
        const torType = isOnion ? 'relay' : (isTor ? 'exit' : null);

        const parsed = parsePeerClient(node.user_agent || '');

        const result = await client.query(`
          INSERT INTO ${targetTable} (
            ip, port, country, country_code, city, lat, lon, isp,
            ping_ms, is_tor, is_active, user_agent, client_impl,
            client_version, protocol_version, observed_via, onion_address,
            tor_type, betweenness, closeness, degree, network_type
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE,
            $11, $12, $13, $14, 'crawl', $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (ip) DO UPDATE SET
            port = EXCLUDED.port,
            country = COALESCE(EXCLUDED.country, ${targetTable}.country),
            country_code = COALESCE(EXCLUDED.country_code, ${targetTable}.country_code),
            city = COALESCE(EXCLUDED.city, ${targetTable}.city),
            lat = COALESCE(EXCLUDED.lat, ${targetTable}.lat),
            lon = COALESCE(EXCLUDED.lon, ${targetTable}.lon),
            isp = COALESCE(EXCLUDED.isp, ${targetTable}.isp),
            ping_ms = EXCLUDED.ping_ms,
            is_tor = EXCLUDED.is_tor,
            is_active = TRUE,
            user_agent = COALESCE(EXCLUDED.user_agent, ${targetTable}.user_agent),
            client_impl = CASE WHEN EXCLUDED.user_agent IS NOT NULL THEN EXCLUDED.client_impl ELSE ${targetTable}.client_impl END,
            client_version = CASE WHEN EXCLUDED.user_agent IS NOT NULL THEN EXCLUDED.client_version ELSE ${targetTable}.client_version END,
            protocol_version = COALESCE(EXCLUDED.protocol_version, ${targetTable}.protocol_version),
            observed_via = 'crawl',
            last_seen = NOW(),
            onion_address = COALESCE(EXCLUDED.onion_address, ${targetTable}.onion_address),
            tor_type = COALESCE(EXCLUDED.tor_type, ${targetTable}.tor_type),
            betweenness = EXCLUDED.betweenness,
            closeness = EXCLUDED.closeness,
            degree = EXCLUDED.degree,
            network_type = EXCLUDED.network_type
          RETURNING (xmax = 0) AS is_insert
        `, [
          ip, port,
          node.geo?.country || null,
          node.geo?.country_code || null,
          node.geo?.city || null,
          node.geo?.lat ?? null,
          node.geo?.lon ?? null,
          node.geo?.isp || null,
          node.handshake_time_ms ?? null,
          isTor,
          parsed.userAgent || node.user_agent || null,
          parsed.clientImpl,
          parsed.clientVersion,
          node.protocol_version || null,
          isOnion ? ip : null,
          torType,
          node.betweenness ?? null,
          node.closeness ?? null,
          node.degree ?? null,
          node.network_type || null,
        ]);

        if (result.rows[0]?.is_insert) newNodes++;
        else upserted++;
      }

      // Cross-reference with Zebra peer data to fill Unknown gaps
      if (targetTable === 'nodes_crawl') {
        const crossRef = await client.query(`
          UPDATE nodes_crawl nc SET
            client_impl = n.client_impl,
            client_version = n.client_version,
            user_agent = n.user_agent,
            protocol_version = COALESCE(nc.protocol_version, n.protocol_version)
          FROM nodes n
          WHERE nc.ip = n.ip
            AND nc.client_impl = 'Unknown'
            AND n.client_impl IS NOT NULL
            AND n.client_impl != 'Unknown'
        `);
        if (crossRef.rowCount > 0) {
          log(`Cross-referenced ${crossRef.rowCount} nodes from Zebra peer data`);
        }
      }

      // Mark nodes not seen in this crawl as inactive
      await client.query(`
        UPDATE ${targetTable} SET is_active = FALSE
        WHERE last_seen < NOW() - INTERVAL '${INACTIVE_THRESHOLD_HOURS} hours'
          AND is_active = TRUE
          AND observed_via = 'crawl'
      `);

      // Persist topology edges
      if (enriched.edges && Array.isArray(enriched.edges)) {
        await client.query('DELETE FROM node_edges');

        for (const edge of enriched.edges) {
          await client.query(`
            INSERT INTO node_edges (src_addr_id, dst_addr_id)
            SELECT s.id, d.id
            FROM ${targetTable} s, ${targetTable} d
            WHERE s.ip = $1 AND d.ip = $2
            ON CONFLICT (src_addr_id, dst_addr_id) DO UPDATE SET observed_at = NOW()
          `, [edge.src, edge.dst]);
        }
        log(`Persisted ${enriched.edges.length} topology edges`);
      }

      // Persist per-node metrics
      if (enriched.nodes.length > 0) {
        await client.query('DELETE FROM node_metrics');

        for (const node of enriched.nodes) {
          if (!node.addr || node.betweenness == null) continue;
          const nodeIp = node.addr.includes(']:')
            ? node.addr.match(/\[(.+)\]/)?.[1]
            : node.addr.split(':')[0];

          await client.query(`
            INSERT INTO node_metrics (addr_id, betweenness, closeness, degree, network_type)
            SELECT id, $2, $3, $4, $5
            FROM ${targetTable} WHERE ip = $1
            ON CONFLICT DO NOTHING
          `, [nodeIp, node.betweenness, node.closeness, node.degree, node.network_type]);
        }
      }

      // Record snapshot
      const stats = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_active) AS active,
          COUNT(*) AS total,
          COUNT(DISTINCT country_code) FILTER (WHERE is_active) AS countries,
          COUNT(*) FILTER (WHERE is_active AND is_tor) AS tor,
          COUNT(*) FILTER (WHERE is_active AND tor_type = 'relay') AS tor_hidden,
          ROUND(AVG(ping_ms) FILTER (WHERE is_active AND ping_ms > 0)::numeric, 3) AS avg_ping
        FROM ${targetTable}
        WHERE observed_via = 'crawl'
      `);

      const clientResult = await client.query(`
        SELECT client_impl, COUNT(*)::int AS node_count
        FROM ${targetTable}
        WHERE is_active = TRUE AND observed_via = 'crawl'
        GROUP BY client_impl
        ORDER BY node_count DESC
      `);

      const snap = stats.rows[0];
      const clientCounts = Object.fromEntries(
        clientResult.rows.map(r => [r.client_impl || 'Unknown', r.node_count])
      );
      const identifiedClientNodes = clientResult.rows
        .filter(r => r.client_impl && r.client_impl !== 'Unknown')
        .reduce((sum, r) => sum + Number(r.node_count), 0);

      if (!DRY_RUN) {
        await client.query(`
          INSERT INTO node_snapshots (
            active_nodes, total_nodes, countries, tor_nodes,
            inbound_nodes, outbound_nodes, avg_ping_ms,
            identified_client_nodes, client_counts, tor_hidden_nodes
          )
          VALUES ($1, $2, $3, $4, 0, $1, $5, $6, $7, $8)
        `, [
          parseInt(snap.active), parseInt(snap.total),
          parseInt(snap.countries), parseInt(snap.tor),
          snap.avg_ping ? parseFloat(snap.avg_ping) : null,
          identifiedClientNodes, JSON.stringify(clientCounts),
          parseInt(snap.tor_hidden || 0),
        ]);
      }

      await client.query('COMMIT');

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`Ingestion complete in ${elapsed}s — ${newNodes} new, ${upserted} updated, ${snap.active} active, ${snap.countries} countries, ${snap.tor} Tor`);
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  ingestCrawl()
    .then(() => { pool.end(); process.exit(0); })
    .catch((err) => {
      log(`Ingestion failed: ${err.message}`);
      console.error(err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { ingestCrawl };
