/**
 * Swap Routes — proxies the NEAR Intents 1-Click API
 *
 * Keeps the JWT API key server-side. The frontend never sees it.
 *
 * POST /api/swap/quote    — get a swap quote (returns deposit address)
 * GET  /api/swap/status   — poll swap status
 * GET  /api/swap/tokens   — list available tokens
 */

const express = require('express');
const router = express.Router();

const ONECLICK_BASE = 'https://1click.chaindefuser.com/v0';
const API_KEY = process.env.NEAR_ONECLICK_API_KEY || process.env.NEAR_INTENTS_API_KEY;
const AFFILIATE_ADDRESS = 'cipherscan.near';
const AFFILIATE_FEE_BPS = 50; // 0.5%
const REFERRAL = 'cipherscan';

async function oneClickRequest(method, endpoint, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${ONECLICK_BASE}${endpoint}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`1-Click API ${res.status}: ${text}`);
  }
  return res.json();
}

// Tokens cache (refreshes every 10 min)
let tokensCache = null;
let tokensCacheTime = 0;
const TOKENS_TTL = 10 * 60 * 1000;

/**
 * GET /api/swap/tokens
 * List available tokens for swapping
 */
router.get('/api/swap/tokens', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ success: false, error: 'Swap API not configured' });
    }

    const now = Date.now();
    if (!tokensCache || now - tokensCacheTime > TOKENS_TTL) {
      tokensCache = await oneClickRequest('GET', '/tokens');
      tokensCacheTime = now;
    }

    // Filter to tokens that can swap to/from ZEC
    const zecTokens = tokensCache.filter(t =>
      t.defuseAssetId?.toLowerCase().includes('zec') ||
      t.chainName?.toLowerCase().includes('zcash')
    );

    res.json({
      success: true,
      tokens: tokensCache,
      zecTokens,
    });
  } catch (error) {
    console.error('Swap tokens error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/swap/quote
 * Get a swap quote — returns deposit address
 *
 * Body: {
 *   originAsset: string,       // e.g. "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near"
 *   destinationAsset: string,  // e.g. "nep141:zec.omft.near"
 *   amount: string,            // in smallest unit as string
 *   recipient: string,         // ZEC address (for buy ZEC)
 *   refundTo: string,          // source chain address (for refund)
 *   slippageBps?: number       // default 100 (1%)
 * }
 */
router.post('/api/swap/quote', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ success: false, error: 'Swap API not configured' });
    }

    const { originAsset, destinationAsset, amount, recipient, refundTo, slippageBps } = req.body;

    if (!originAsset || !destinationAsset || !amount || !recipient) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: originAsset, destinationAsset, amount, recipient',
      });
    }

    if (destinationAsset.includes('zec')) {
      const BASE58 = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
      if (!(recipient.startsWith('t1') || recipient.startsWith('t3')) || recipient.length !== 35 || !BASE58.test(recipient)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ZEC transparent address. Must be a 35-character t1/t3 address.',
        });
      }
    }

    const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const quoteBody = {
      dry: false,
      swapType: 'EXACT_INPUT',
      slippageTolerance: slippageBps || 100,
      originAsset,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset,
      amount: String(amount),
      refundTo: refundTo || recipient,
      refundType: 'ORIGIN_CHAIN',
      recipient,
      recipientType: 'DESTINATION_CHAIN',
      deadline,
      quoteWaitingTimeMs: 3000,
      appFees: [{ recipient: AFFILIATE_ADDRESS, fee: AFFILIATE_FEE_BPS }],
      referral: REFERRAL,
    };

    const quote = await oneClickRequest('POST', '/quote', quoteBody);

    res.json({
      success: true,
      ...quote,
    });
  } catch (error) {
    console.error('Swap quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/swap/status?depositAddress=xxx
 * Poll swap status
 */
router.get('/api/swap/status', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ success: false, error: 'Swap API not configured' });
    }

    const { depositAddress } = req.query;
    if (!depositAddress) {
      return res.status(400).json({ success: false, error: 'depositAddress required' });
    }

    const status = await oneClickRequest('GET', `/status?depositAddress=${encodeURIComponent(depositAddress)}`);

    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Swap status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
