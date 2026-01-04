/**
 * Stats Routes
 * /api/stats/*
 */

const express = require('express');
const router = express.Router();
const { getShieldedCountSince, getShieldedCountSimple, getShieldedCountDaily } = require('../stats-queries');

// Dependencies will be injected via middleware
let pool;

// Middleware to inject dependencies
router.use((req, res, next) => {
  pool = req.app.locals.pool;
  next();
});

/**
 * GET /api/stats/shielded-count
 * Get the count of shielded transactions since a specific date.
 *
 * Query params:
 * - since: Required. ISO date string (e.g., "2024-01-01")
 * - detailed: Optional. If "true", returns full breakdown (slower)
 */
router.get('/api/stats/shielded-count', async (req, res) => {
  try {
    const { since, detailed } = req.query;

    if (!since) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: since (e.g., ?since=2024-01-01)',
      });
    }

    let result;
    if (detailed === 'true') {
      result = await getShieldedCountSince(pool, since);
    } else {
      result = await getShieldedCountSimple(pool, since);
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [STATS] Shielded count error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/stats/shielded-daily
 * Get daily shielded transaction counts for a date range.
 *
 * Query params:
 * - since: Required. Start date (ISO format)
 * - until: Optional. End date (defaults to now)
 */
router.get('/api/stats/shielded-daily', async (req, res) => {
  try {
    const { since, until } = req.query;

    if (!since) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: since (e.g., ?since=2024-01-01)',
      });
    }

    const result = await getShieldedCountDaily(pool, since, until);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ [STATS] Shielded daily error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
