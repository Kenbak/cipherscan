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

const STAKING_DAY_PERIOD = 150;
const STAKING_DAY_WINDOW = 70;

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

    const [tipHeight, finalityInfo, roster] = await Promise.all([
      callZebraRPC('getblockcount').catch(() => null),
      callZebraRPC('get_tfl_final_block_height_and_hash').catch(() => null),
      callZebraRPC('get_tfl_roster_zats').catch(() => []),
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

    const result = {
      success: true,
      tipHeight,
      finalizedHeight,
      finalityGap: tipHeight - finalizedHeight,
      finalizerCount: parsedRoster.length,
      totalStakeZats,
      totalStakeZec: totalStakeZats / 1e8,
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
 * GET /api/finalizer/:pubkey
 * Get finalizer detail: current state + staking action history (who delegated).
 */
router.get('/api/finalizer/:pubkey', async (req, res) => {
  try {
    const pubkey = req.params.pubkey.toLowerCase();

    // 64 hex chars = 32-byte pubkey
    if (!/^[a-f0-9]{64}$/.test(pubkey)) {
      return res.status(400).json({ success: false, error: 'Invalid finalizer pubkey' });
    }

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

module.exports = router;
