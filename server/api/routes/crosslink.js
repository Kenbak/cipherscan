/**
 * Crosslink Routes
 * /api/crosslink - network stats, finality, roster, staking day
 */

const express = require('express');
const router = express.Router();

let callZebraRPC;
let redisClient;
let pool;

router.use((req, res, next) => {
  callZebraRPC = req.app.locals.callZebraRPC;
  redisClient = req.app.locals.redisClient;
  pool = req.app.locals.pool;
  next();
});

const CROSSLINK_CACHE_KEY = 'crosslink:stats';
const CROSSLINK_CACHE_DURATION = 10; // 10 seconds

// ---------------------------------------------------------------------------
// Fork Monitor — in-memory node registry
// ---------------------------------------------------------------------------
const FORK_MONITOR_CACHE_KEY = 'crosslink:fork-monitor';
const FORK_MONITOR_CACHE_DURATION = 15;
const CTAZ_CACHE_KEY = 'crosslink:ctaz-fork-map';
const CTAZ_CACHE_DURATION = 30;
const NODE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_REGISTERED_NODES = 100;
const REPORT_COOLDOWN_MS = 30 * 1000;
const MAX_REPORT_SAMPLES = 12;
const MAX_TIP_HEIGHT = 100_000_000;
const MAX_PEER_COUNT = 10_000;
const NODE_NAME_RE = /^[a-zA-Z0-9_. -]{1,32}$/;
const CTAZ_FORK_MAP_URLS = [
  'https://ctaz.zat-explorer.cash/api/fork-map',
  'https://frontiercompute.io/ctaz/api/fork-map',
];

const nodeRegistry = new Map();
const reportTimestamps = new Map();

const ANCHOR_HEIGHTS = [
  { height: 19138, label: 'BFT finalized' },
  { height: 37657, label: 'fixed branch check' },
  { height: 39573, label: 'pre-split marker' },
  { height: 39574, label: 'split marker' },
  { height: 40665, label: 'CipherScan indexed match' },
  { height: 41898, label: 'May 2 tip split marker' },
];

function normalizeHash(hash) {
  return typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)
    ? hash.toLowerCase()
    : null;
}

function pruneStaleNodes() {
  const now = Date.now();
  for (const [name, node] of nodeRegistry) {
    if (now - node.reported_at > NODE_TTL_MS) nodeRegistry.delete(name);
  }
}

async function fetchCtazForkMap(redisClient) {
  if (redisClient && redisClient.isOpen) {
    try {
      const cached = await redisClient.get(CTAZ_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
  }
  for (const url of CTAZ_FORK_MAP_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (redisClient && redisClient.isOpen) {
        try {
          await redisClient.set(CTAZ_CACHE_KEY, JSON.stringify(data), { EX: CTAZ_CACHE_DURATION });
        } catch {}
      }
      return data;
    } catch {
      // Try the next mirror.
    }
  }
  return null;
}

const STAKING_DAY_PERIOD = 150;
const STAKING_DAY_WINDOW = 70;

/**
 * Reverse the byte order of a 64-char hex string. zebrad's fat-pointer
 * signer pub_keys come through in one byte order; the Crosslink GUI
 * displays them in the opposite order. Frontend prefers the GUI form.
 * Non-64-char input is returned unchanged.
 */
function reverseHex(hex) {
  if (typeof hex !== 'string' || hex.length !== 64) return hex;
  let out = '';
  for (let i = 62; i >= 0; i -= 2) out += hex.slice(i, i + 2);
  return out;
}

/**
 * Resolve a user-supplied pubkey against our DB. The user may paste a
 * GUI-form hex or a raw-RPC form; we try both and use whichever one
 * matches a known finalizer. Returns the form that's actually stored
 * in the DB (raw form), or null if neither exists.
 */
async function resolveFinalizerPubkey(pool, input) {
  const lower = input.toLowerCase();
  const candidates = [lower];
  const reversed = reverseHex(lower);
  if (reversed !== lower) candidates.push(reversed);

  const r = await pool.query(
    'SELECT pub_key FROM finalizers WHERE pub_key = ANY($1) LIMIT 1',
    [candidates]
  );
  return r.rows[0]?.pub_key || null;
}

function computeStakingDay(tipHeight) {
  const periodNumber = Math.floor(tipHeight / STAKING_DAY_PERIOD);
  const positionInPeriod = tipHeight % STAKING_DAY_PERIOD;
  const isStakingOpen = positionInPeriod < STAKING_DAY_WINDOW;

  const windowStart = periodNumber * STAKING_DAY_PERIOD;
  const windowEnd = windowStart + STAKING_DAY_WINDOW - 1;

  const blocksRemaining = isStakingOpen
    ? STAKING_DAY_WINDOW - positionInPeriod
    : 0;

  const blocksUntilNextWindow = isStakingOpen
    ? 0
    : STAKING_DAY_PERIOD - positionInPeriod;

  return {
    tipHeight,
    positionInPeriod,
    isStakingOpen,
    blocksRemaining,
    blocksUntilNextWindow,
    periodNumber,
    windowStart,
    windowEnd,
  };
}

router.get('/api/crosslink', async (req, res) => {
  try {
    // Check cache
    if (redisClient && redisClient.isOpen) {
      try {
        const cached = await redisClient.get(CROSSLINK_CACHE_KEY);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (e) { /* ignore cache miss */ }
    }

    const [tipHeight, finalityInfo, roster, peerInfo] = await Promise.all([
      callZebraRPC('getblockcount').catch(() => null),
      callZebraRPC('get_tfl_final_block_height_and_hash').catch(() => null),
      callZebraRPC('get_tfl_roster_zats').catch(() => []),
      callZebraRPC('getpeerinfo').catch(() => []),
    ]);

    if (tipHeight === null) {
      return res.status(503).json({
        success: false,
        error: 'Crosslink RPC unavailable',
      });
    }

    const parsedRoster = Array.isArray(roster)
      ? roster.map((m) => {
          const stakeZats = m.stake_zats ?? m.stake ?? m.voting_power ?? 0;
          return {
            identity: m.identity || m.pub_key || m.public_key || '',
            stake_zats: stakeZats,
            stake_zec: stakeZats / 1e8,
          };
        }).sort((a, b) => b.stake_zats - a.stake_zats)
      : [];

    const totalStakeZats = parsedRoster.reduce((sum, m) => sum + m.stake_zats, 0);
    const finalizedHeight = finalityInfo?.height ?? finalityInfo?.[0] ?? 0;

    const peerCount = Array.isArray(peerInfo) ? peerInfo.length : 0;

    const result = {
      success: true,
      tipHeight,
      finalizedHeight,
      finalityGap: tipHeight - finalizedHeight,
      finalizerCount: parsedRoster.length,
      totalStakeZats,
      totalStakeZec: totalStakeZats / 1e8,
      peerCount,
      stakingDay: computeStakingDay(tipHeight),
      roster: parsedRoster,
    };

    // Cache result
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.set(CROSSLINK_CACHE_KEY, JSON.stringify(result), {
          EX: CROSSLINK_CACHE_DURATION,
        });
      } catch (e) { /* ignore cache write failure */ }
    }

    res.json(result);
  } catch (error) {
    console.error('Crosslink stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch crosslink stats',
    });
  }
});

/**
 * GET /api/crosslink/bft-tip
 * Returns the current BFT chain tip pointer: which PoW block is being voted on
 * and how many finalizers have signed so far. Cached 5s in Redis.
 */
router.get('/api/crosslink/bft-tip', async (req, res) => {
  const CACHE_KEY = 'crosslink:bft-tip';
  try {
    if (redisClient && redisClient.isOpen) {
      try {
        const cached = await redisClient.get(CACHE_KEY);
        if (cached) return res.json(JSON.parse(cached));
      } catch {}
    }

    const fatPtr = await callZebraRPC('get_tfl_fat_pointer_to_bft_chain_tip').catch(() => null);
    if (!fatPtr) {
      return res.status(503).json({ success: false, error: 'BFT tip unavailable' });
    }

    // Field name varies across serializations; accept either.
    const voteBytes =
      fatPtr.vote_for_block_without_finalizer_public_key ??
      fatPtr.voteForBlockWithoutFinalizerPublicKey ??
      [];
    // First 32 bytes are the PoW block hash the BFT is voting on.
    // Zebra stores hashes in internal byte order; reverse for the display hex.
    const blockHashInternal = voteBytes.slice(0, 32);
    const votedBlockHash = Buffer.from(blockHashInternal).reverse().toString('hex');
    const signatures = Array.isArray(fatPtr.signatures) ? fatPtr.signatures : [];

    const result = {
      success: true,
      votedBlockHash: votedBlockHash || null,
      signatureCount: signatures.length,
      signers: signatures.map((s) => ({
        pub_key: Array.isArray(s.pub_key)
          ? Buffer.from(s.pub_key).toString('hex')
          : typeof s.pub_key === 'string' ? s.pub_key : null,
      })),
      timestamp: Date.now(),
    };

    if (redisClient && redisClient.isOpen) {
      try { await redisClient.set(CACHE_KEY, JSON.stringify(result), { EX: 5 }); } catch {}
    }

    res.json(result);
  } catch (error) {
    console.error('BFT tip error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch BFT tip' });
  }
});

/**
 * GET /api/crosslink/bootstrap-info
 * Returns metadata about the currently-published public Zebra cache
 * snapshot (the "bootstrap" archive that others can download to skip a
 * genesis resync). Reads /var/www/crosslink.cipherscan.app/bootstrap/bootstrap.json
 * written by zebra-public-snapshot.sh.
 */
router.get('/api/crosslink/bootstrap-info', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = process.env.BOOTSTRAP_META_PATH
      || '/var/www/crosslink.cipherscan.app/bootstrap/bootstrap.json';

    let meta;
    try {
      const raw = await fs.readFile(path, 'utf8');
      meta = JSON.parse(raw);
    } catch (err) {
      // File may not exist yet (first publish not done). Return a predictable
      // "not available" response instead of 500 so the frontend can display
      // a friendly message.
      return res.json({ success: true, available: false });
    }

    res.json({
      success: true,
      available: true,
      generated_at: meta.generated_at,
      tip_height: meta.tip_height,
      tip_hash: meta.tip_hash,
      finalized_height: meta.finalized_height,
      finalized_hash: meta.finalized_hash,
      size_bytes: meta.size_bytes,
      sha256: meta.sha256,
      cache_dir_name: meta.cache_dir_name,
      reference_hashes: meta.reference_hashes || [],
      contents: meta.contents || ['state/', 'pos.chain'],
      excludes: meta.excludes || ['secret.seed', 'zaino/'],
      download_url: process.env.BOOTSTRAP_DOWNLOAD_URL
        || 'https://api.crosslink.cipherscan.app/bootstrap/bootstrap.tar.gz',
      sha256_url: process.env.BOOTSTRAP_DOWNLOAD_URL
        ? `${process.env.BOOTSTRAP_DOWNLOAD_URL}.sha256`
        : 'https://api.crosslink.cipherscan.app/bootstrap/bootstrap.tar.gz.sha256',
    });
  } catch (error) {
    console.error('bootstrap-info error:', error);
    res.status(500).json({ success: false, error: 'Failed to read bootstrap metadata' });
  }
});

/**
 * GET /api/crosslink/divergence-history
 * Returns the history of chain divergences (times our node drifted from the
 * finalized network tip). Useful for spotting patterns across resets.
 */
router.get('/api/crosslink/divergence-history', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const result = await pool.query(
      `SELECT
        id,
        EXTRACT(EPOCH FROM start_time)::bigint AS start_time,
        start_tip_height,
        start_finalized_height,
        start_gap,
        peak_gap,
        peak_tip_height,
        EXTRACT(EPOCH FROM end_time)::bigint AS end_time,
        end_tip_height,
        end_finalized_height,
        severity,
        notes,
        CASE WHEN end_time IS NULL
             THEN NULL
             ELSE EXTRACT(EPOCH FROM (end_time - start_time))::bigint
        END AS duration_seconds
      FROM divergence_events
      ORDER BY start_time DESC
      LIMIT $1`,
      [limit]
    );

    const events = result.rows.map(r => ({
      id: parseInt(r.id),
      start_time: parseInt(r.start_time),
      end_time: r.end_time ? parseInt(r.end_time) : null,
      duration_seconds: r.duration_seconds ? parseInt(r.duration_seconds) : null,
      is_open: r.end_time === null,
      severity: r.severity,
      start_tip_height: parseInt(r.start_tip_height),
      start_finalized_height: parseInt(r.start_finalized_height),
      start_gap: r.start_gap,
      peak_gap: r.peak_gap,
      peak_tip_height: parseInt(r.peak_tip_height),
      end_tip_height: r.end_tip_height ? parseInt(r.end_tip_height) : null,
      end_finalized_height: r.end_finalized_height ? parseInt(r.end_finalized_height) : null,
      notes: r.notes,
    }));

    res.json({
      success: true,
      count: events.length,
      openEvent: events.find(e => e.is_open) || null,
      events,
    });
  } catch (error) {
    console.error('Divergence history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch divergence history' });
  }
});

/**
 * GET /api/finalizers
 * List all finalizers (active + historical) from DB, ordered by current voting power desc.
 * Falls back to live RPC if DB is empty.
 */
router.get('/api/finalizers', async (req, res) => {
  try {
    const activeOnly = req.query.active !== 'false';
    const result = await pool.query(
      `SELECT
        pub_key,
        voting_power_zats,
        first_seen_height,
        last_seen_height,
        is_active,
        EXTRACT(EPOCH FROM updated_at)::bigint AS updated_at
      FROM finalizers
      ${activeOnly ? 'WHERE is_active = true' : ''}
      ORDER BY voting_power_zats DESC`
    );

    const finalizers = result.rows.map(r => ({
      pub_key: r.pub_key,
      voting_power_zats: parseInt(r.voting_power_zats),
      voting_power_zec: parseInt(r.voting_power_zats) / 1e8,
      first_seen_height: r.first_seen_height ? parseInt(r.first_seen_height) : null,
      last_seen_height: r.last_seen_height ? parseInt(r.last_seen_height) : null,
      is_active: r.is_active,
      updated_at: r.updated_at,
    }));

    const totalStakeZats = finalizers.reduce((s, f) => s + f.voting_power_zats, 0);

    res.json({
      success: true,
      count: finalizers.length,
      totalStakeZats,
      totalStakeZec: totalStakeZats / 1e8,
      finalizers,
    });
  } catch (error) {
    console.error('Finalizers list error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch finalizers' });
  }
});

/**
 * GET /api/finalizer/:pubkey/participation
 * Per-finalizer BFT participation over the last N blocks. Reads
 * `blocks.bft_signer_keys` (populated by the Rust indexer from each PoW
 * block's fat_pointer_to_bft_block) and counts how many blocks in the
 * window include this pubkey.
 *
 * Response:
 *   {
 *     pubkey, window_start, window_end, window_size,
 *     signed_blocks, participation_pct,
 *     recent: [{ height, signed: true|false }, ...]  // for sparkline
 *   }
 */
router.get('/api/finalizer/:pubkey/participation', async (req, res) => {
  try {
    const raw = req.params.pubkey.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(raw)) {
      return res.status(400).json({ success: false, error: 'Invalid pubkey' });
    }
    // Accept either byte order from the URL — resolve to the form stored in DB.
    const pubkey = (await resolveFinalizerPubkey(pool, raw)) || raw;
    const windowSize = Math.min(Math.max(parseInt(req.query.window) || 1000, 1), 5000);

    // Window = last N blocks that actually carry BFT data (i.e. bft_signer_keys IS NOT NULL)
    const result = await pool.query(
      `WITH win AS (
         SELECT height, bft_signer_keys, bft_signature_count
         FROM blocks
         WHERE bft_signer_keys IS NOT NULL
         ORDER BY height DESC
         LIMIT $2
       )
       SELECT
         COALESCE(MIN(height), 0)::bigint AS window_start,
         COALESCE(MAX(height), 0)::bigint AS window_end,
         COUNT(*)::int AS window_size,
         COUNT(*) FILTER (WHERE $1 = ANY(bft_signer_keys))::int AS signed_blocks
       FROM win`,
      [pubkey, windowSize]
    );
    const row = result.rows[0];
    const signed = row.signed_blocks || 0;
    const total = row.window_size || 0;

    // For a sparkline: which of the last 50 blocks did this pubkey sign?
    const recentResult = await pool.query(
      `SELECT height, ($1 = ANY(bft_signer_keys)) AS signed
       FROM blocks
       WHERE bft_signer_keys IS NOT NULL
       ORDER BY height DESC
       LIMIT 50`,
      [pubkey]
    );

    res.json({
      success: true,
      pubkey,
      window_start: parseInt(row.window_start),
      window_end: parseInt(row.window_end),
      window_size: total,
      signed_blocks: signed,
      participation_pct: total > 0 ? (signed / total) * 100 : 0,
      recent: recentResult.rows.map(r => ({
        height: parseInt(r.height),
        signed: r.signed,
      })),
    });
  } catch (error) {
    console.error('Finalizer participation error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute participation' });
  }
});

/**
 * GET /api/crosslink/participation
 * Returns ALL active finalizers with their stake, share, and per-block
 * BFT participation (signed count + rate) over the same observation
 * window. Single query — perfect for rendering a participation table
 * without N round trips from the client.
 *
 * More accurate than poll-based approaches because bft_signer_keys is
 * extracted from every PoW block header's fat_pointer_to_bft_block,
 * not sampled at a fixed interval.
 *
 * Response includes a metadata block with the observation window
 * (first/last block height, count, tracking_since timestamp).
 */
router.get('/api/crosslink/participation', async (req, res) => {
  try {
    const windowSize = Math.min(Math.max(parseInt(req.query.window) || 500, 1), 5000);

    // 1) The observation window — last N blocks that carry BFT data.
    // A single CTE shared by the aggregate and per-finalizer queries.
    const result = await pool.query(
      `WITH win AS (
         SELECT height, timestamp, bft_signer_keys
         FROM blocks
         WHERE bft_signer_keys IS NOT NULL
         ORDER BY height DESC
         LIMIT $1
       ),
       win_stats AS (
         SELECT
           COALESCE(MIN(height), 0)::bigint  AS first_height,
           COALESCE(MAX(height), 0)::bigint  AS last_height,
           COUNT(*)::int                     AS observed_blocks,
           COALESCE(MIN(timestamp), 0)::bigint AS tracking_since
         FROM win
       )
       SELECT
         f.pub_key,
         f.voting_power_zats,
         f.is_active,
         f.last_seen_height,
         (
           SELECT COUNT(*)
           FROM win
           WHERE f.pub_key = ANY(bft_signer_keys)
         )::int AS signed_blocks,
         (SELECT observed_blocks FROM win_stats) AS window_size,
         (SELECT first_height   FROM win_stats) AS window_first_height,
         (SELECT last_height    FROM win_stats) AS window_last_height,
         (SELECT tracking_since FROM win_stats) AS tracking_since
       FROM finalizers f
       WHERE f.is_active = true
       ORDER BY f.voting_power_zats DESC`,
      [windowSize]
    );

    const rows = result.rows;
    if (rows.length === 0) {
      return res.json({
        success: true,
        finalizers: [],
        window: { size: 0, first_height: 0, last_height: 0, tracking_since: 0 },
      });
    }

    const total = rows.reduce((s, r) => s + parseInt(r.voting_power_zats), 0);
    const windowSizeActual = rows[0].window_size || 0;

    res.json({
      success: true,
      window: {
        size: windowSizeActual,
        first_height: parseInt(rows[0].window_first_height),
        last_height: parseInt(rows[0].window_last_height),
        tracking_since: parseInt(rows[0].tracking_since),
      },
      total_stake_zats: total,
      total_stake_zec: total / 1e8,
      finalizers: rows.map((r, i) => {
        const vp = parseInt(r.voting_power_zats);
        return {
          rank: i + 1,
          pub_key: r.pub_key,
          voting_power_zats: vp,
          voting_power_zec: vp / 1e8,
          share_pct: total > 0 ? (vp / total) * 100 : 0,
          signed_blocks: r.signed_blocks,
          participation_pct: windowSizeActual > 0
            ? (r.signed_blocks / windowSizeActual) * 100
            : 0,
          last_seen_height: r.last_seen_height ? parseInt(r.last_seen_height) : null,
        };
      }),
    });
  } catch (error) {
    console.error('Participation overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute participation' });
  }
});

/**
 * GET /api/crosslink/bft-chain
 * Returns the historical BFT chain reconstructed from PoW block fat
 * pointers. Groups consecutive PoW blocks by their (referenced_hash,
 * signer_set) so each row is one unique BFT decision with the range of
 * PoW blocks that observed it.
 *
 * This is what makes the /chain dual-chain graph actually show history
 * instead of just a single current-tip node.
 */
router.get('/api/crosslink/bft-chain', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 200);

    // Each unique bft_referenced_hash is one BFT decision. Use a window
    // function to pick the newest row per decision (that row has the most
    // authoritative signer set) and aggregate first/last-seen heights.
    // NOTE: ARRAY_AGG on variable-size text[] columns fails with
    // "cannot accumulate arrays of different dimensionality", hence the
    // window-function approach instead of GROUP BY.
    const result = await pool.query(
      `WITH ranked AS (
         SELECT
           height,
           bft_referenced_hash,
           bft_signature_count,
           bft_signer_keys,
           ROW_NUMBER() OVER (PARTITION BY bft_referenced_hash ORDER BY height DESC) AS rn,
           COUNT(*) OVER (PARTITION BY bft_referenced_hash)                          AS pow_blocks_in_decision,
           MIN(height) OVER (PARTITION BY bft_referenced_hash)                        AS first_seen,
           MAX(height) OVER (PARTITION BY bft_referenced_hash)                        AS last_seen
         FROM blocks
         WHERE bft_referenced_hash IS NOT NULL
       )
       SELECT
         bft_referenced_hash AS referenced_hash,
         bft_signature_count AS signature_count,
         bft_signer_keys     AS signer_keys,
         pow_blocks_in_decision::int,
         first_seen::bigint  AS first_seen_at_pow_height,
         last_seen::bigint   AS last_seen_at_pow_height
       FROM ranked
       WHERE rn = 1
       ORDER BY last_seen DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      count: result.rows.length,
      decisions: result.rows.map(r => ({
        referenced_hash: r.referenced_hash,
        signature_count: r.signature_count,
        pow_blocks_in_decision: r.pow_blocks_in_decision,
        first_seen_at_pow_height: parseInt(r.first_seen_at_pow_height),
        last_seen_at_pow_height: parseInt(r.last_seen_at_pow_height),
        signer_keys: r.signer_keys || [],
      })),
    });
  } catch (error) {
    console.error('BFT chain history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch BFT chain' });
  }
});

/**
 * GET /api/finalizer/:pubkey
 * Get finalizer detail: current state + staking action history (who delegated).
 */
router.get('/api/finalizer/:pubkey', async (req, res) => {
  try {
    const raw = req.params.pubkey.toLowerCase();

    // 64 hex chars = 32-byte pubkey
    if (!/^[a-f0-9]{64}$/.test(raw)) {
      return res.status(400).json({ success: false, error: 'Invalid finalizer pubkey' });
    }

    // Accept either byte order: try raw, then reversed. The GUI displays
    // pubkeys in reversed byte order from what zebrad's RPCs return, so
    // users pasting a pubkey from their desktop wallet must still land
    // on the right detail page.
    const pubkey = (await resolveFinalizerPubkey(pool, raw)) || raw;

    const finalizerResult = await pool.query(
      `SELECT pub_key, voting_power_zats, first_seen_height, last_seen_height, is_active,
              EXTRACT(EPOCH FROM updated_at)::bigint AS updated_at
       FROM finalizers WHERE pub_key = $1`,
      [pubkey]
    );

    if (finalizerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Finalizer not found' });
    }

    const row = finalizerResult.rows[0];

    // Rank among active finalizers
    const rankResult = await pool.query(
      `SELECT COUNT(*) AS rank FROM finalizers
       WHERE is_active = true AND voting_power_zats > $1`,
      [row.voting_power_zats]
    );
    const rank = parseInt(rankResult.rows[0].rank) + 1;

    // Associated staking actions (stakes + retargets targeting this finalizer)
    const actionsResult = await pool.query(
      `SELECT txid, block_height, staking_action_type, staking_bond_key,
              staking_amount_zats, block_time
       FROM transactions
       WHERE staking_delegatee = $1
       ORDER BY block_height DESC
       LIMIT 100`,
      [pubkey]
    );

    res.json({
      success: true,
      finalizer: {
        pub_key: row.pub_key,
        voting_power_zats: parseInt(row.voting_power_zats),
        voting_power_zec: parseInt(row.voting_power_zats) / 1e8,
        first_seen_height: row.first_seen_height ? parseInt(row.first_seen_height) : null,
        last_seen_height: row.last_seen_height ? parseInt(row.last_seen_height) : null,
        is_active: row.is_active,
        updated_at: row.updated_at,
        rank: row.is_active ? rank : null,
      },
      stakeActions: actionsResult.rows.map(a => ({
        txid: a.txid,
        block_height: parseInt(a.block_height),
        block_time: a.block_time ? parseInt(a.block_time) : null,
        action_type: a.staking_action_type,
        bond_key: a.staking_bond_key,
        amount_zats: a.staking_amount_zats ? parseInt(a.staking_amount_zats) : null,
        amount_zec: a.staking_amount_zats ? parseInt(a.staking_amount_zats) / 1e8 : null,
      })),
    });
  } catch (error) {
    console.error('Finalizer detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch finalizer' });
  }
});

// ---------------------------------------------------------------------------
// Fork Monitor endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/crosslink/fork-monitor
 * Aggregated chain health: our node vs cTAZ, anchor comparisons, registered nodes.
 */
router.get('/api/crosslink/fork-monitor', async (req, res) => {
  try {
    if (redisClient && redisClient.isOpen) {
      try {
        const cached = await redisClient.get(FORK_MONITOR_CACHE_KEY);
        if (cached) return res.json(JSON.parse(cached));
      } catch {}
    }

    // Fetch base stats + cTAZ in parallel (only 2 RPC calls + 1 HTTP)
    const [tipHeight, ctaz] = await Promise.all([
      callZebraRPC('getblockcount').catch(() => null),
      fetchCtazForkMap(redisClient),
    ]);

    if (tipHeight === null) {
      return res.status(503).json({ success: false, error: 'Crosslink RPC unavailable' });
    }

    // Sequential RPC calls to avoid overwhelming zebrad
    const finalityInfo = await callZebraRPC('get_tfl_final_block_height_and_hash').catch(() => null);
    const peerInfo = await callZebraRPC('getpeerinfo').catch(() => []);

    const finalizedHeight = finalityInfo?.height ?? finalityInfo?.[0] ?? 0;
    const peerCount = Array.isArray(peerInfo) ? peerInfo.length : 0;

    // Fetch anchor hashes sequentially to avoid "Too many connections".
    // getblockhash is much cheaper than getblock and returns exactly what we need.
    const eligible = ANCHOR_HEIGHTS.filter((a) => a.height <= tipHeight);
    const anchorChecks = [];
    for (const a of eligible) {
      const hash = await callZebraRPC('getblockhash', [a.height]).catch(() => null);
      anchorChecks.push({
        height: a.height,
        label: a.label,
        cipherscan_hash: normalizeHash(hash),
      });
    }

    // Fetch our tip hash
    const tipHash = normalizeHash(
      await callZebraRPC('getblockhash', [tipHeight]).catch(() => null)
    );

    // Build cTAZ reference from their API
    let ctazRef = null;
    let ctazAnchors = {};
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

    // Registered nodes
    pruneStaleNodes();
    const nodes = [];
    for (const [name, node] of nodeRegistry) {
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
      nodes.push({ name, ...node, branch });
    }

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

    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.set(FORK_MONITOR_CACHE_KEY, JSON.stringify(result), {
          EX: FORK_MONITOR_CACHE_DURATION,
        });
      } catch {}
    }

    res.json(result);
  } catch (error) {
    console.error('Fork monitor error:', error);
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

    const ctaz = await fetchCtazForkMap(redisClient);
    const ctazAnchors = {};
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
        await callZebraRPC('getblockhash', [height]).catch(() => null)
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
    console.error('Fork monitor check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check hashes' });
  }
});

/**
 * POST /api/crosslink/fork-monitor/report
 * Voluntary node registration. Stored in-memory with 1-hour TTL.
 */
router.post('/api/crosslink/fork-monitor/report', async (req, res) => {
  try {
    const { name, tip, tip_hash, sample_hashes, peers, mining } = req.body || {};

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

    // Rate limit per name
    const lastReport = reportTimestamps.get(cleanName);
    if (lastReport && Date.now() - lastReport < REPORT_COOLDOWN_MS) {
      const wait = Math.ceil((REPORT_COOLDOWN_MS - (Date.now() - lastReport)) / 1000);
      return res.status(429).json({ success: false, error: `wait ${wait}s before reporting again` });
    }

    // Evict oldest if at capacity
    if (nodeRegistry.size >= MAX_REGISTERED_NODES && !nodeRegistry.has(cleanName)) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [k, v] of nodeRegistry) {
        if (v.reported_at < oldestTime) {
          oldestTime = v.reported_at;
          oldestKey = k;
        }
      }
      if (oldestKey) nodeRegistry.delete(oldestKey);
    }

    nodeRegistry.set(cleanName, {
      tip,
      tip_hash: tip_hash ? normalizeHash(tip_hash) : null,
      sample_hashes: (sample_hashes || []).map((s) => ({
        height: s.height,
        hash: normalizeHash(s.hash),
      })),
      peers: Number.isInteger(peers) ? peers : null,
      mining: typeof mining === 'boolean' ? mining : null,
      reported_at: Date.now(),
    });
    reportTimestamps.set(cleanName, Date.now());

    // Invalidate fork-monitor cache so fresh GET picks up new node
    if (redisClient && redisClient.isOpen) {
      try { await redisClient.del(FORK_MONITOR_CACHE_KEY); } catch {}
    }

    res.json({ success: true, registered: cleanName, node_count: nodeRegistry.size });
  } catch (error) {
    console.error('Fork monitor report error:', error);
    res.status(500).json({ success: false, error: 'Failed to register node' });
  }
});

module.exports = router;
