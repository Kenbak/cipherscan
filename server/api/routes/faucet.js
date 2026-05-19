/**
 * Testnet Faucet
 * GET  /api/faucet/status     → wallet balance + dispense amount
 * POST /api/faucet/dispense   → send TAZ to a transparent address
 *
 * Captcha (Turnstile) and per-address cooldown are both feature-flagged
 * via env vars — see .env.example. Unset = disabled, no code change needed
 * to enable.
 */

const express = require('express');
const router = express.Router();

const DEFAULT_DISPENSE_TAZ = 0.5;
const ADDRESS_REGEX = /^tm[a-zA-Z0-9]{32,40}$/;

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

router.get('/api/faucet/status', async (req, res) => {
  const callWalletRPC = req.app.locals.callWalletRPC;
  if (!callWalletRPC) {
    return res.status(503).json({ error: 'wallet RPC not configured' });
  }

  try {
    const balance = await callWalletRPC('getbalance', []);
    res.json({
      balanceTaz: typeof balance === 'number' ? balance : parseFloat(balance) || 0,
      dispenseAmountTaz: dispenseAmountTaz(),
      cooldownSeconds: cooldownSeconds(),
      captchaEnabled: !!process.env.TURNSTILE_SECRET_KEY,
    });
  } catch (err) {
    console.error('[faucet] status failed:', err.message);
    res.status(502).json({ error: 'wallet unreachable' });
  }
});

router.post('/api/faucet/dispense', express.json(), async (req, res) => {
  const callWalletRPC = req.app.locals.callWalletRPC;
  const redisClient = req.app.locals.redisClient;
  if (!callWalletRPC) {
    return res.status(503).json({ error: 'wallet RPC not configured' });
  }

  const { address, captchaToken } = req.body || {};

  if (!address || typeof address !== 'string' || !ADDRESS_REGEX.test(address.trim())) {
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

  const amount = dispenseAmountTaz();

  let balance;
  try {
    balance = await callWalletRPC('getbalance', []);
  } catch (err) {
    console.error('[faucet] balance check failed:', err.message);
    return res.status(502).json({ error: 'wallet unreachable' });
  }
  if (typeof balance === 'number' && balance < amount) {
    return res.status(503).json({ error: 'drained', balanceTaz: balance });
  }

  let txid;
  try {
    txid = await callWalletRPC('sendtoaddress', [addr, amount]);
  } catch (err) {
    console.error('[faucet] sendtoaddress failed:', err.message);
    return res.status(502).json({ error: 'send failed', detail: err.message });
  }

  if (cdSec > 0 && redisClient) {
    try {
      await redisClient.set(`faucet:cooldown:${addr}`, '1', { EX: cdSec });
    } catch (err) {
      console.error('[faucet] cooldown set failed:', err.message);
    }
  }

  console.log(`[faucet] dispensed ${amount} TAZ to ${addr.slice(0, 10)}… txid=${txid}`);
  res.json({ txid, amountTaz: amount });
});

module.exports = router;
