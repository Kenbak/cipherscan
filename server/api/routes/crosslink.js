/**
 * Crosslink Routes
 * /api/crosslink - network stats, finality, roster, staking day
 */

const express = require('express');
const router = express.Router();

let callZebraRPC;
let redisClient;

router.use((req, res, next) => {
  callZebraRPC = req.app.locals.callZebraRPC;
  redisClient = req.app.locals.redisClient;
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
      ? roster.map((m) => ({
          identity: m.identity || m.pub_key || m.public_key || '',
          stake_zats: m.stake_zats || m.stake || 0,
          stake_zec: (m.stake_zats || m.stake || 0) / 1e8,
        })).sort((a, b) => b.stake_zats - a.stake_zats)
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

module.exports = router;
