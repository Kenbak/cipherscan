/**
 * Testnet Faucet — proxy to the taps wallet daemon
 *
 * GET  /api/faucet/status     → balance, dispense amount, captcha
 * POST /api/faucet/dispense   → send TAZ to a testnet Unified Address
 *
 * Taps (https://github.com/zcashme/taps — separate repo) runs on the same VPS,
 * listens on loopback only, and holds the Orchard spending key. We sit in
 * front of it for Turnstile only.
 */

const express = require('express');
const router = express.Router();

const DEFAULT_DISPENSE_TAZ = 1;
const DEFAULT_TAPS_URL = 'http://127.0.0.1:3001';
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

const ZAT_PER_TAZ = 100_000_000;

router.get('/api/faucet/status', async (_req, res) => {
  try {
    const taps = await tapsStatus();
    const orchard = taps?.balances?.orchard;
    const ua = taps?.unified_address;
    const maxDispensable = taps?.max_dispensable_zat;
    const maxSpend = taps?.max_spend_zat;
    res.json({
      balanceTaz: typeof orchard === 'number' ? orchard : 0,
      maxDispensableTaz: typeof maxDispensable === 'number' ? maxDispensable / ZAT_PER_TAZ : 0,
      maxSpendTaz: typeof maxSpend === 'number' ? maxSpend / ZAT_PER_TAZ : 0,
      dispenseAmountTaz: dispenseAmountTaz(),
      captchaEnabled: !!process.env.TURNSTILE_SECRET_KEY,
      donateAddress: typeof ua === 'string' && ua !== 'unavailable' ? ua : null,
    });
  } catch (err) {
    console.error('[faucet] status failed:', err.message);
    res.status(502).json({ error: 'wallet unreachable' });
  }
});

router.post('/api/faucet/dispense', express.json(), async (req, res) => {
  const { address, amountTaz: requestedAmount, captchaToken } = req.body || {};

  if (!address || typeof address !== 'string' || !UA_REGEX.test(address.trim())) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const addr = address.trim();

  // Caller chooses the amount; taps enforces min/max/increment.
  // Fall back to the env default if the client didn't send one.
  let amountTaz;
  if (requestedAmount === undefined || requestedAmount === null) {
    amountTaz = dispenseAmountTaz();
  } else if (typeof requestedAmount !== 'number' || !Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return res.status(400).json({ error: 'invalid amount' });
  } else {
    amountTaz = requestedAmount;
  }

  const captchaOk = await verifyTurnstile(captchaToken, req.ip);
  if (!captchaOk) {
    return res.status(400).json({ error: 'captcha failed' });
  }

  let result;
  try {
    result = await tapsSend({ recipient: addr, amountTaz });
  } catch (err) {
    console.error('[faucet] taps /send failed:', err.message);
    return res.status(502).json({ error: 'wallet unreachable' });
  }

  if (result.status === 200 && result.body?.txid) {
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
  if (tapsErr.startsWith('amount ')) {
    // taps amount-validation surface: too small, too large, wrong increment
    return res.status(400).json({ error: 'invalid amount', detail: tapsErr });
  }
  if (result.status === 401) {
    console.error('[faucet] taps rejected api key — check TAPS_API_KEY');
    return res.status(502).json({ error: 'wallet auth' });
  }
  console.error(`[faucet] taps /send ${result.status}:`, tapsErr);
  return res.status(502).json({ error: 'send failed', detail: tapsErr });
});

module.exports = router;
