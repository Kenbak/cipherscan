/**
 * Testnet Faucet — proxy to the taps wallet daemon
 *
 * GET  /api/faucet/status     → balance, dispense amount, cooldown, captcha
 * POST /api/faucet/dispense   → send TAZ to a testnet Unified Address
 *
 * Taps (https://github.com/zcashme/taps — separate repo) runs on the same VPS,
 * listens on loopback only, and holds the Orchard spending key. We sit in
 * front of it for Turnstile + per-address cooldown.
 */

const express = require('express');
const router = express.Router();

const DEFAULT_DISPENSE_TAZ = 1;
const DEFAULT_TAPS_URL = 'http://127.0.0.1:3000';
// Loose testnet Unified Address check: bech32m charset, utest1 prefix.
// Strict parsing happens in taps.
const UA_REGEX = /^utest1[02-9ac-hj-np-z]{40,}$/;

function tapsUrl() {
  return (process.env.TAPS_URL || DEFAULT_TAPS_URL).replace(/\/$/, '');
}

function dispenseAmountTaz() {
  const raw = parseFloat(process.env.FAUCET_DISPENSE_AMOUNT_TAZ);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DISPENSE_TAZ;
}

function cooldownSeconds() {
  const raw = parseInt(process.env.FAUCET_COOLDOWN_SECONDS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // captcha disabled
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.append('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[faucet] Turnstile verify failed:', err.message);
    return false;
  }
}

async function tapsStatus() {
  const res = await fetch(`${tapsUrl()}/status`);
  if (!res.ok) throw new Error(`taps /status ${res.status}`);
  return res.json();
}

async function tapsSend({ recipient, amountTaz }) {
  const apiKey = process.env.TAPS_API_KEY || '';
  const res = await fetch(`${tapsUrl()}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ recipient, amount: amountTaz }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

router.get('/api/faucet/status', async (_req, res) => {
  try {
    const taps = await tapsStatus();
    const orchard = taps?.balances?.orchard;
    const ua = taps?.unified_address;
    res.json({
      balanceTaz: typeof orchard === 'number' ? orchard : 0,
      dispenseAmountTaz: dispenseAmountTaz(),
      cooldownSeconds: cooldownSeconds(),
      captchaEnabled: !!process.env.TURNSTILE_SECRET_KEY,
      donateAddress: typeof ua === 'string' && ua !== 'unavailable' ? ua : null,
    });
  } catch (err) {
    console.error('[faucet] status failed:', err.message);
    res.status(502).json({ error: 'wallet unreachable' });
  }
});

router.post('/api/faucet/dispense', express.json(), async (req, res) => {
  const redisClient = req.app.locals.redisClient;
  const { address, captchaToken } = req.body || {};

  if (!address || typeof address !== 'string' || !UA_REGEX.test(address.trim())) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const addr = address.trim();

  const captchaOk = await verifyTurnstile(captchaToken, req.ip);
  if (!captchaOk) {
    return res.status(400).json({ error: 'captcha failed' });
  }

  const cdSec = cooldownSeconds();
  if (cdSec > 0 && redisClient) {
    const key = `faucet:cooldown:${addr}`;
    try {
      const existing = await redisClient.get(key);
      if (existing) {
        const ttl = await redisClient.ttl(key);
        return res.status(429).json({
          error: 'cooldown',
          retryAfterSeconds: ttl > 0 ? ttl : cdSec,
        });
      }
    } catch (err) {
      console.error('[faucet] cooldown check failed:', err.message);
    }
  }

  const amountTaz = dispenseAmountTaz();

  let result;
  try {
    result = await tapsSend({ recipient: addr, amountTaz });
  } catch (err) {
    console.error('[faucet] taps /send failed:', err.message);
    return res.status(502).json({ error: 'wallet unreachable' });
  }

  if (result.status === 200 && result.body?.txid) {
    if (cdSec > 0 && redisClient) {
      try {
        await redisClient.set(`faucet:cooldown:${addr}`, '1', { EX: cdSec });
      } catch (err) {
        console.error('[faucet] cooldown set failed:', err.message);
      }
    }
    console.log(`[faucet] dispensed ${amountTaz} TAZ to ${addr.slice(0, 12)}… txid=${result.body.txid}`);
    return res.json({ txid: result.body.txid, amountTaz });
  }

  // Map taps errors → cipherscan UI shapes
  const tapsErr = result.body?.error || '';
  if (tapsErr === 'invalid address') {
    return res.status(400).json({ error: 'invalid address' });
  }
  if (tapsErr === 'insufficient balance') {
    return res.status(503).json({ error: 'drained' });
  }
  if (result.status === 401) {
    console.error('[faucet] taps rejected api key — check TAPS_API_KEY');
    return res.status(502).json({ error: 'wallet auth' });
  }
  console.error(`[faucet] taps /send ${result.status}:`, tapsErr);
  return res.status(502).json({ error: 'send failed', detail: tapsErr });
});

module.exports = router;
