/**
 * Testnet Faucet Routes
 * /api/faucet/status, /api/faucet/dispense — proxies to taps, verifies Turnstile
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const DEFAULT_DISPENSE_TAZ = 0.5;
const UA_REGEX = /^utest1[02-9ac-hj-np-z]{40,}$/;
const FAUCET_MEMO =
  "thanks for using the cipherscan testnet faucet — zipher, a zcash wallet for humans and agents, coming soon (in beta)";

const dispenseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  message: { error: "rate limited" },
});

const TAPS_URL = process.env.TAPS_URL || "";
if (!TAPS_URL) {
  console.error("[faucet] TAPS_URL not set — /api/faucet/* will 503");
}

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || "";
if (!TURNSTILE_SECRET) {
  console.error(
    "[faucet] TURNSTILE_SECRET_KEY not set — /api/faucet/dispense will 503",
  );
}

async function verifyTurnstile(token, remoteIp) {
  if (!token) return false;

  try {
    const body = new URLSearchParams({
      secret: TURNSTILE_SECRET,
      response: token,
    });
    if (remoteIp) body.append("remoteip", remoteIp);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
      },
    );
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("[faucet] Turnstile verify failed:", err.message);
    return false;
  }
}

async function tapsStatus() {
  const res = await fetch(`${TAPS_URL}/status`);
  if (!res.ok) throw new Error(`taps /status ${res.status}`);
  return res.json();
}

async function tapsSend({ recipient, amountTaz }) {
  const apiKey = process.env.TAPS_API_KEY || "";
  const res = await fetch(`${TAPS_URL}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({ recipient, amount: amountTaz, memo: FAUCET_MEMO }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

router.get("/api/faucet/status", async (_req, res) => {
  if (!TAPS_URL) return res.status(503).json({ error: "taps not configured" });
  try {
    const taps = await tapsStatus();
    const orchard = taps?.balances?.orchard;
    const ua = taps?.unified_address;
    const maxDispensable = taps?.max_dispensable_zat;
    const maxSpend = taps?.max_spend_zat;
    const minSpend = taps?.min_spend_zat;
    const increment = taps?.spend_increment_zat;
    res.json({
      balanceTaz: typeof orchard === "number" ? orchard : 0,
      maxDispensableTaz:
        typeof maxDispensable === "number" ? maxDispensable / 100000000 : 0,
      maxSpendTaz: typeof maxSpend === "number" ? maxSpend / 100000000 : 0,
      minSpendTaz: typeof minSpend === "number" ? minSpend / 100000000 : 0,
      stepTaz: typeof increment === "number" ? increment / 100000000 : 0,
      donateAddress: typeof ua === "string" && ua !== "unavailable" ? ua : null,
    });
  } catch (err) {
    console.error("[faucet] status failed:", err.message);
    res.status(502).json({ error: "wallet unreachable" });
  }
});

router.post(
  "/api/faucet/dispense",
  dispenseLimiter,
  express.json(),
  async (req, res) => {
    if (!TAPS_URL)
      return res.status(503).json({ error: "taps not configured" });
    if (!TURNSTILE_SECRET)
      return res.status(503).json({ error: "captcha not configured" });
    const {
      address,
      amountTaz: requestedAmount,
      captchaToken,
    } = req.body || {};

    if (
      !address ||
      typeof address !== "string" ||
      !UA_REGEX.test(address.trim())
    ) {
      return res.status(400).json({ error: "invalid address" });
    }
    const addr = address.trim();

    let amountTaz;
    if (requestedAmount === undefined || requestedAmount === null) {
      amountTaz = DEFAULT_DISPENSE_TAZ;
    } else if (
      typeof requestedAmount !== "number" ||
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0
    ) {
      return res.status(400).json({ error: "invalid amount" });
    } else {
      amountTaz = requestedAmount;
    }

    const captchaOk = await verifyTurnstile(captchaToken, req.ip);
    if (!captchaOk) {
      return res.status(400).json({ error: "captcha failed" });
    }

    // Defense-in-depth cap: ask taps what the live ceiling is and reject above
    // it. max_dispensable_zat is what the slider also reads, so client and
    // server agree. Static config would drift; live fetch tracks balance + fees.
    let status;
    try {
      status = await tapsStatus();
    } catch (err) {
      console.error("[faucet] status check failed:", err.message);
      return res.status(502).json({ error: "wallet unreachable" });
    }
    const cap = (status?.max_dispensable_zat ?? 0) / 100000000;
    if (cap > 0 && amountTaz > cap) {
      return res
        .status(400)
        .json({
          error: "invalid amount",
          detail: `amount exceeds available ${cap} TAZ`,
        });
    }

    let result;
    try {
      result = await tapsSend({ recipient: addr, amountTaz });
    } catch (err) {
      console.error("[faucet] taps /send failed:", err.message);
      return res.status(502).json({ error: "wallet unreachable" });
    }

    if (result.status === 200 && result.body?.txid) {
      console.log(
        `[faucet] dispensed ${amountTaz} TAZ to ${addr.slice(0, 12)}… txid=${result.body.txid}`,
      );
      return res.json({ txid: result.body.txid, amountTaz });
    }

    const tapsErr = result.body?.error || "";
    if (tapsErr === "invalid address") {
      return res.status(400).json({ error: "invalid address" });
    }
    if (tapsErr === "insufficient balance") {
      return res.status(503).json({ error: "drained" });
    }
    if (tapsErr.startsWith("amount ")) {
      // taps amount-validation surface: too small, too large, wrong increment
      return res.status(400).json({ error: "invalid amount", detail: tapsErr });
    }
    if (result.status === 401) {
      console.error("[faucet] taps rejected api key — check TAPS_API_KEY");
      return res.status(502).json({ error: "wallet auth" });
    }
    console.error(`[faucet] taps /send ${result.status}:`, tapsErr);
    return res.status(502).json({ error: "send failed", detail: tapsErr });
  },
);

module.exports = router;
