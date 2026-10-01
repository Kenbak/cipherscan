'use strict';
const { askError, askStage } = require('./ask-errors');
const { createHmac, randomUUID } = require('node:crypto');

// All keys share a Redis Cluster slot. Reserve the conservative maximum, never
// refund uncertain/cancelled calls. Prices are deployment-reviewed upper bounds.
const RESERVE = `
local calls = tonumber(redis.call('GET', KEYS[1]) or '0')
local daily = tonumber(redis.call('GET', KEYS[3]) or '0')
local monthly = tonumber(redis.call('GET', KEYS[4]) or '0')
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
if calls >= tonumber(ARGV[3]) or redis.call('ZCARD', KEYS[2]) >= 3
  or daily + tonumber(ARGV[5]) > tonumber(ARGV[6])
  or monthly + tonumber(ARGV[5]) > tonumber(ARGV[7]) then return 0 end
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 172800)
redis.call('INCRBY', KEYS[3], ARGV[5]); redis.call('EXPIRE', KEYS[3], 172800)
redis.call('INCRBY', KEYS[4], ARGV[5]); redis.call('EXPIRE', KEYS[4], 3456000)
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[4]); redis.call('EXPIRE', KEYS[2], 60)
return 1`;
const ADMIT = `
if tonumber(redis.call('GET', KEYS[1]) or '0') >= 5 or tonumber(redis.call('GET', KEYS[2]) or '0') >= 20 then return 0 end
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 120)
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)
return 1`;
function money(value) { return /^\d+(\.\d{1,6})?$/.test(value || '') ? Math.round(Number(value) * 1e6) : NaN; }
function budgetConfig(env) {
  const dailyBudget = money(env.ASK_DAILY_BUDGET_USD);
  const monthlyBudget = money(env.ASK_MONTHLY_BUDGET_USD);
  const inputRate = Number(env.ASK_MAX_INPUT_USD_PER_MILLION);
  const outputRate = Number(env.ASK_MAX_OUTPUT_USD_PER_MILLION);
  if (![dailyBudget, monthlyBudget].every(value => Number.isSafeInteger(value) && value > 0 && value <= 1e9)
    || ![inputRate, outputRate].every(value => Number.isFinite(value) && value > 0 && value <= 1000)
    || !env.ASK_ABUSE_SECRET || env.ASK_ABUSE_SECRET.length < 32
    || !env.ASK_TURNSTILE_SECRET || !env.ASK_TURNSTILE_HOSTNAME || !env.ASK_TURNSTILE_SITE_KEY) return null;
  return { dailyBudget, monthlyBudget, inputRate, outputRate, abuseSecret: env.ASK_ABUSE_SECRET, challengeSecret: env.ASK_TURNSTILE_SECRET, challengeHostname: env.ASK_TURNSTILE_HOSTNAME, siteKey: env.ASK_TURNSTILE_SITE_KEY };
}
function maximumCost(config, body) {
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > 48000) throw new Error('Context too large');
  // UTF-8 bytes conservatively bound text tokens; overhead covers provider
  // wrappers and schema handling. Output includes reasoning within token cap.
  return Math.ceil((bytes + 4096) * config.inputRate + 500 * config.outputRate);
}
async function reserve(redis, config, body, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const active = 'ask:{mainnet}:active';
  const lease = randomUUID();
  const accepted = Number(await redis.eval(RESERVE, {
    keys: [`ask:{mainnet}:calls:${day}`, active, `ask:{mainnet}:usd:${day}`, `ask:{mainnet}:usd:${day.slice(0, 7)}`],
    arguments: [String(now), String(now + 60000), String(config.dailyCalls), lease, String(maximumCost(config, body)), String(config.dailyBudget), String(config.monthlyBudget)],
  })) === 1;
  if (!accepted) { const error = new Error('Ask allowance reached'); error.quota = true; throw error; }
  return async () => { try { await redis.zRem(active, lease); } catch { /* lease expires */ } };
}
async function admit(redis, config, req, fetchImpl = fetch) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const identity = createHmac('sha256', config.abuseSecret).update(`${day}:${req.ip || req.socket?.remoteAddress || 'unknown'}`).digest('hex');
  const allowed = Number(await redis.eval(ADMIT, { keys: [`ask:{mainnet}:ip:${identity}:${Math.floor(now / 60000)}`, `ask:{mainnet}:ip:${identity}:day`], arguments: [] })) === 1;
  if (!allowed) { const error = new Error('Request allowance reached'); error.quota = true; throw error; }
  const token = req.body?.challenge;
  if (typeof token !== 'string' || !token || token.length > 2048) throw askError('verification');
  const response = await askStage('verification', () => fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', redirect: 'error', signal: AbortSignal.any([req.v1.abortSignal, AbortSignal.timeout(5000)]), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: config.challengeSecret, response: token }) }));
  if (!response.ok) throw askError('verification');
  const result = await askStage('verification', () => response.json());
  if (!result.success || result.action !== 'ask' || result.hostname !== config.challengeHostname) throw askError('verification');
}
module.exports = { RESERVE, ADMIT, budgetConfig, maximumCost, reserve, admit };
