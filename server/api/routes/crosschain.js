/**
 * Cross-chain Routes (NEAR Intents)
 * /api/crosschain/*
 */

const express = require('express');
const router = express.Router();
const { getNearIntentsClient, CHAIN_CONFIG } = require('../near-intents');

/**
 * GET /api/crosschain/stats
 * Get cross-chain ZEC swap statistics via NEAR Intents
 */
router.get('/api/crosschain/stats', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    // Check if API key is configured
    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
        message: 'Set NEAR_INTENTS_API_KEY environment variable',
        docsUrl: 'https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api',
      });
    }

    console.log('🌉 [CROSSCHAIN] Fetching cross-chain stats...');

    const stats = await client.getCrossChainStats();

    res.json({
      success: true,
      ...stats,
      chainConfig: CHAIN_CONFIG,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cross-chain stats',
    });
  }
});

/**
 * GET /api/crosschain/inflows
 * Get recent ZEC inflows (other chains → ZEC)
 */
router.get('/api/crosschain/inflows', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = parseInt(req.query.page) || 1;

    const data = await client.getZecInflows({ limit, page });

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Inflows error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/crosschain/outflows
 * Get recent ZEC outflows (ZEC → other chains)
 */
router.get('/api/crosschain/outflows', async (req, res) => {
  try {
    const client = getNearIntentsClient();

    if (!client.hasApiKey()) {
      return res.status(503).json({
        success: false,
        error: 'NEAR Intents API key not configured',
      });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const page = parseInt(req.query.page) || 1;

    const data = await client.getZecOutflows({ limit, page });

    res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('❌ [CROSSCHAIN] Outflows error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/crosschain/status
 * Check if NEAR Intents integration is configured
 */
router.get('/api/crosschain/status', async (req, res) => {
  const client = getNearIntentsClient();

  res.json({
    success: true,
    configured: client.hasApiKey(),
    message: client.hasApiKey()
      ? 'NEAR Intents API configured'
      : 'NEAR Intents API key not set. Cross-chain features disabled.',
    docsUrl: 'https://docs.near-intents.org/near-intents/integration/distribution-channels/intents-explorer-api',
  });
});

module.exports = router;

