/**
 * Fork monitor — chain alignment checks, node registry, and block hash lookup.
 */

const express = require('express');
const { logSafeError } = require('../../lib/safe-log');
const router = express.Router();
const {
  deps,
  normalizeHash,
  pruneAndFetchNodes,
  fetchCtazForkMap,
  FORK_MONITOR_CACHE_KEY,
  FORK_MONITOR_CACHE_DURATION,
  ANCHOR_HEIGHTS,
  KNOWN_REFERENCE_HASHES,
  NODE_TTL_OPTIONS,
  DEFAULT_TTL,
  MAX_REGISTERED_NODES,
  REPORT_COOLDOWN_MS,
  MAX_REPORT_SAMPLES,
  MAX_TIP_HEIGHT,
  MAX_PEER_COUNT,
  NODE_NAME_RE,
  reportTimestamps,
} = require('./_helpers');

/**
 * GET /api/crosslink/fork-monitor
 * Aggregated chain health: our node vs cTAZ, anchor comparisons, registered nodes.
 */
router.get('/api/crosslink/fork-monitor', async (req, res) => {
  try {
    if (deps.redisClient && deps.redisClient.isOpen) {
      try {
        const cached = await deps.redisClient.get(FORK_MONITOR_CACHE_KEY);
        if (cached) return res.json(JSON.parse(cached));
      } catch {}
    }

    // Fetch base stats + cTAZ in parallel (only 2 RPC calls + 1 HTTP)
    const [tipHeight, ctaz] = await Promise.all([
      deps.callZebraRPC('getblockcount').catch(() => null),
      fetchCtazForkMap(),
    ]);

    if (tipHeight === null) {
      return res.status(503).json({ success: false, error: 'Crosslink RPC unavailable' });
    }

    // Sequential RPC calls to avoid overwhelming zebrad
    const finalityInfo = await deps.callZebraRPC('get_tfl_final_block_height_and_hash').catch(() => null);
    const peerInfo = await deps.callZebraRPC('getpeerinfo').catch(() => []);

    const finalizedHeight = finalityInfo?.height ?? finalityInfo?.[0] ?? 0;
    const peerCount = Array.isArray(peerInfo) ? peerInfo.length : 0;

    // Fetch anchor hashes sequentially to avoid "Too many connections".
    // getblockhash is much cheaper than getblock and returns exactly what we need.
    const eligible = ANCHOR_HEIGHTS.filter((a) => a.height <= tipHeight);
    const anchorChecks = [];
    for (const a of eligible) {
      const hash = await deps.callZebraRPC('getblockhash', [a.height]).catch(() => null);
      anchorChecks.push({
        height: a.height,
        label: a.label,
        cipherscan_hash: normalizeHash(hash),
      });
    }

    // Fetch our tip hash
    const tipHash = normalizeHash(
      await deps.callZebraRPC('getblockhash', [tipHeight]).catch(() => null)
    );

    // Build cTAZ reference from their API, with verified fallbacks
    let ctazRef = null;
    let ctazAnchors = { ...KNOWN_REFERENCE_HASHES };
    if (ctaz && ctaz.reference) {
      ctazRef = {
        tip: ctaz.reference.tip,
        tip_hash: normalizeHash(ctaz.reference.tip_hash),
        peers: ctaz.reference.peers,
        finalized: ctaz.reference.finalized ?? 0,
        finality_gap: ctaz.reference.finality_gap ?? 0,
      };
      if (Array.isArray(ctaz.anchors)) {
        for (const a of ctaz.anchors) {
          ctazAnchors[a.height] = normalizeHash(a.observed_hash || a.expected_hash);
        }
      }
    }

    // Compare anchors
    const anchors = anchorChecks.map((a) => ({
      height: a.height,
      label: a.label,
      cipherscan_hash: a.cipherscan_hash,
      ctaz_hash: ctazAnchors[a.height] || null,
      match:
        a.cipherscan_hash && ctazAnchors[a.height]
          ? a.cipherscan_hash === ctazAnchors[a.height]
          : null,
    }));

    // Determine overall alignment
    const mismatches = anchors.filter((a) => a.match === false);
    let status = 'aligned';
    let firstDivergence = null;
    if (!ctaz) {
      status = 'ctaz_unavailable';
    } else if (mismatches.length > 0) {
      status = 'diverged';
      firstDivergence = mismatches[0].height;
    }

    // Registered nodes (from DB, with TTL pruning)
    const dbNodes = await pruneAndFetchNodes();
    const nodes = dbNodes.map((node) => {
      let branch = 'unknown';
      if (node.sample_hashes && node.sample_hashes.length > 0) {
        const csMatch = node.sample_hashes.every((s) => {
          const anchor = anchors.find((a) => a.height === s.height);
          return !anchor || !anchor.cipherscan_hash || anchor.cipherscan_hash === s.hash;
        });
        const ctazMatch =
          ctazRef &&
          node.sample_hashes.every((s) => {
            return !ctazAnchors[s.height] || ctazAnchors[s.height] === s.hash;
          });
        if (csMatch && ctazMatch) branch = 'reference';
        else if (csMatch) branch = 'cipherscan';
        else if (ctazMatch) branch = 'ctaz';
        else branch = 'other';
      } else if (
        node.tip_hash &&
        node.tip === tipHeight &&
        tipHash &&
        node.tip_hash === tipHash
      ) {
        branch = ctazRef && ctazRef.tip === tipHeight && ctazRef.tip_hash === tipHash
          ? 'reference'
          : 'cipherscan';
      } else if (
        node.tip_hash &&
        ctazRef &&
        node.tip === ctazRef.tip &&
        node.tip_hash === ctazRef.tip_hash
      ) {
        branch = 'ctaz';
      }
      return { ...node, branch };
    });

    const result = {
      generated_at: new Date().toISOString(),
      cipherscan: {
        tip: tipHeight,
        tip_hash: tipHash,
        peers: peerCount,
        finalized: finalizedHeight,
        finality_gap: tipHeight - finalizedHeight,
      },
      ctaz: ctazRef,
      status,
      first_divergence: firstDivergence,
      anchors,
      nodes,
      split_hints: [
        'If h39573 matches and h39574 differs, your node is on an earlier observed split.',
        'If h40665 matches but h41898 differs, the node split later near the current tip.',
        'If a node is mining every block, treat it as partition risk until peers and tip hash match.',
        'Peer count alone does not determine correctness. Longest chain with valid PoW wins above finalized height.',
      ],
    };

    if (deps.redisClient && deps.redisClient.isOpen) {
      try {
        await deps.redisClient.set(FORK_MONITOR_CACHE_KEY, JSON.stringify(result), {
          EX: FORK_MONITOR_CACHE_DURATION,
        });
      } catch {}
    }

    res.json(result);
  } catch (error) {
    logSafeError('Fork monitor error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch fork monitor data' });
  }
});

/**
 * POST /api/crosslink/fork-monitor/check
 * Live hash lookup at arbitrary heights. Accepts { heights: [number] },
 * returns our hash + cTAZ hash for each.
 */
router.post('/api/crosslink/fork-monitor/check', async (req, res) => {
  try {
    const { heights } = req.body || {};
    if (!Array.isArray(heights) || heights.length === 0) {
      return res.status(400).json({ success: false, error: 'heights must be a non-empty array' });
    }
    if (heights.length > 10) {
      return res.status(400).json({ success: false, error: 'max 10 heights per request' });
    }

    const parsed = heights.map((h) => parseInt(h)).filter((h) => !isNaN(h) && h >= 0);
    if (parsed.length === 0) {
      return res.status(400).json({ success: false, error: 'no valid heights provided' });
    }

    const ctaz = await fetchCtazForkMap();
    const ctazAnchors = { ...KNOWN_REFERENCE_HASHES };
    if (ctaz && Array.isArray(ctaz.anchors)) {
      for (const a of ctaz.anchors) {
        ctazAnchors[a.height] = normalizeHash(a.observed_hash || a.expected_hash);
      }
    }
    if (ctaz && ctaz.reference) {
      ctazAnchors[ctaz.reference.tip] = normalizeHash(ctaz.reference.tip_hash);
    }

    const results = [];
    for (const height of parsed) {
      const csHash = normalizeHash(
        await deps.callZebraRPC('getblockhash', [height]).catch(() => null)
      );
      const ctazHash = ctazAnchors[height] || null;
      results.push({
        height,
        cipherscan_hash: csHash,
        ctaz_hash: ctazHash,
        match: csHash && ctazHash ? csHash === ctazHash : null,
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    logSafeError('Fork monitor check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check hashes' });
  }
});

/**
 * GET /api/crosslink/block-hash/:height
 * Returns the block hash at a given height. Used by external fork-finder scripts.
 */
router.get('/api/crosslink/block-hash/:height', async (req, res) => {
  try {
    const height = parseInt(req.params.height);
    if (isNaN(height) || height < 0) {
      return res.status(400).json({ success: false, error: 'invalid height' });
    }
    const hash = normalizeHash(
      await deps.callZebraRPC('getblockhash', [height]).catch(() => null)
    );
    if (!hash) {
      return res.status(404).json({ success: false, error: 'block not found' });
    }
    res.json({ success: true, height, hash });
  } catch (error) {
    logSafeError('Block hash lookup error:', error);
    res.status(500).json({ success: false, error: 'Failed to get block hash' });
  }
});

/**
 * POST /api/crosslink/fork-monitor/report
 * Voluntary node registration. Persisted to PostgreSQL with configurable TTL.
 */
router.post('/api/crosslink/fork-monitor/report', async (req, res) => {
  try {
    const { name, tip, tip_hash, sample_hashes, peers, mining, ttl } = req.body || {};

    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!NODE_NAME_RE.test(cleanName)) {
      return res.status(400).json({
        success: false,
        error: 'name must be 1-32 chars: letters, numbers, spaces, _, -, .',
      });
    }
    if (!Number.isInteger(tip) || tip < 0 || tip > MAX_TIP_HEIGHT) {
      return res.status(400).json({ success: false, error: 'tip must be a non-negative number' });
    }
    if (tip_hash && !normalizeHash(tip_hash)) {
      return res.status(400).json({ success: false, error: 'tip_hash must be a 64-char hex string' });
    }
    if (peers !== undefined && peers !== null && (!Number.isInteger(peers) || peers < 0 || peers > MAX_PEER_COUNT)) {
      return res.status(400).json({ success: false, error: 'peers must be a non-negative integer' });
    }
    if (mining !== undefined && mining !== null && typeof mining !== 'boolean') {
      return res.status(400).json({ success: false, error: 'mining must be boolean' });
    }
    if (sample_hashes && !Array.isArray(sample_hashes)) {
      return res.status(400).json({ success: false, error: 'sample_hashes must be an array' });
    }
    if (sample_hashes) {
      if (sample_hashes.length > MAX_REPORT_SAMPLES) {
        return res.status(400).json({ success: false, error: `max ${MAX_REPORT_SAMPLES} sample hashes` });
      }
      for (const s of sample_hashes) {
        if (!Number.isInteger(s.height) || s.height < 0 || s.height > MAX_TIP_HEIGHT || !normalizeHash(s.hash)) {
          return res.status(400).json({ success: false, error: 'each sample_hash needs { height: number, hash: 64-char hex }' });
        }
      }
    }

    const validTtl = ttl && NODE_TTL_OPTIONS[ttl] ? ttl : DEFAULT_TTL;

    // Rate limit per name (still in-memory — ephemeral by design)
    const lastReport = reportTimestamps.get(cleanName);
    if (lastReport && Date.now() - lastReport < REPORT_COOLDOWN_MS) {
      const wait = Math.ceil((REPORT_COOLDOWN_MS - (Date.now() - lastReport)) / 1000);
      return res.status(429).json({ success: false, error: `wait ${wait}s before reporting again` });
    }

    // Evict oldest if at capacity (DB-based)
    const { rows: countRows } = await deps.writePool.query('SELECT COUNT(*)::int AS cnt FROM fork_monitor_nodes');
    const existing = await deps.writePool.query('SELECT 1 FROM fork_monitor_nodes WHERE name = $1', [cleanName]);
    if (countRows[0].cnt >= MAX_REGISTERED_NODES && existing.rows.length === 0) {
      await deps.writePool.query(
        `DELETE FROM fork_monitor_nodes WHERE name = (
           SELECT name FROM fork_monitor_nodes ORDER BY reported_at ASC LIMIT 1
         )`
      );
    }

    const cleanSamples = (sample_hashes || []).map((s) => ({
      height: s.height,
      hash: normalizeHash(s.hash),
    }));

    await deps.writePool.query(
      `INSERT INTO fork_monitor_nodes (name, tip, tip_hash, sample_hashes, peers, mining, ttl, reported_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (name) DO UPDATE SET
         tip = EXCLUDED.tip,
         tip_hash = EXCLUDED.tip_hash,
         sample_hashes = EXCLUDED.sample_hashes,
         peers = EXCLUDED.peers,
         mining = EXCLUDED.mining,
         ttl = EXCLUDED.ttl,
         reported_at = EXCLUDED.reported_at`,
      [
        cleanName,
        tip,
        tip_hash ? normalizeHash(tip_hash) : null,
        JSON.stringify(cleanSamples),
        Number.isInteger(peers) ? peers : null,
        typeof mining === 'boolean' ? mining : null,
        validTtl,
        Date.now(),
      ]
    );
    reportTimestamps.set(cleanName, Date.now());

    // Invalidate fork-monitor cache so fresh GET picks up new node
    if (deps.redisClient && deps.redisClient.isOpen) {
      try { await deps.redisClient.del(FORK_MONITOR_CACHE_KEY); } catch {}
    }

    const { rows: nodeCount } = await deps.writePool.query('SELECT COUNT(*)::int AS cnt FROM fork_monitor_nodes');
    res.json({ success: true, registered: cleanName, node_count: nodeCount[0].cnt });
  } catch (error) {
    logSafeError('Fork monitor report error:', error);
    res.status(500).json({ success: false, error: 'Failed to register node' });
  }
});

/**
 * DELETE /api/crosslink/fork-monitor/report/:name
 * Remove a node report by name.
 */
router.delete('/api/crosslink/fork-monitor/report/:name', async (req, res) => {
  try {
    const cleanName = typeof req.params.name === 'string' ? req.params.name.trim() : '';
    if (!NODE_NAME_RE.test(cleanName)) {
      return res.status(400).json({ success: false, error: 'Invalid node name' });
    }

    const { rowCount } = await deps.writePool.query(
      'DELETE FROM fork_monitor_nodes WHERE name = $1',
      [cleanName]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    if (deps.redisClient && deps.redisClient.isOpen) {
      try { await deps.redisClient.del(FORK_MONITOR_CACHE_KEY); } catch {}
    }

    res.json({ success: true, deleted: cleanName });
  } catch (error) {
    logSafeError('Fork monitor delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete node' });
  }
});

module.exports = router;
