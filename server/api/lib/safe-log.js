/**
 * Shared, redacted operational error logger.
 *
 * Problem: raw `console.error('X failed:', error)` / `console.error('X:',
 * error.message)` calls scattered across routes hand the *entire* exception
 * — including driver-generated text that can embed a Postgres connection
 * string (with password), the literal SQL statement, a Zcash address or
 * txid that was part of the failing query, or a service/API/viewing key
 * that was in flight — straight to stdout/log aggregation. Once that's in a
 * log shipper, it's effectively permanent and outside our control.
 *
 * This module is the single choke point every route/module should log
 * caught errors through instead of `console.error(label, error)` directly.
 * It keeps the error's class/code and other genuinely useful, non-sensitive
 * metadata (Postgres `code`/`table`/`schema`/`constraint`, `errno`/`syscall`
 * for network errors, etc.) but redacts the free-text `message`/`stack`
 * before they ever reach `console.error`/`console.warn`.
 *
 * This does NOT change any HTTP response — routes must keep returning their
 * own stable, hand-authored safe fallback strings to clients (see
 * server/tests/error-message-leakage.test.js). This module only governs
 * what reaches server-side logs.
 *
 * See server/tests/safe-log.test.js for the sensitive-injection regression
 * suite this module must keep passing.
 */

'use strict';

const MAX_FIELD_LENGTH = 500;

// --- Redaction patterns --------------------------------------------------
// Order matters: SQL text is stripped first (it's often where addresses,
// txids, and other literal values end up embedded via query params in
// driver error messages), then credential-bearing URLs, then
// keys/tokens/passwords, then Zcash-specific identifiers, then generic long
// hex blobs, and finally any leftover URL query strings.

// `postgres://user:pass@host`, `redis://user:pass@host`, etc. Keeps the
// scheme (useful to know "this was talking to Postgres") but drops the
// credentials and host entirely — a host/port pair is still enough to
// fingerprint internal infrastructure.
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]{1,15}:\/\/)[^\s'"<>]*:[^\s'"<>@]+@[^\s'"<>]+/gi;

// SQL statements embedded in driver error messages (e.g. node-postgres
// "syntax error ... LINE 1: SELECT * FROM addresses WHERE address = '...'").
// Requires the clause-defining keyword (FROM/INTO/SET/TABLE/etc.) nearby so
// ordinary English sentences ("please select a network") never match —
// only shapes that actually look like a SQL statement do. Case-sensitive
// (uppercase-only) rather than case-insensitive: every query in this
// codebase is written with uppercase SQL keywords (see any routes/*.js
// `pool.query(...)` call), so an embedded query in a driver error message
// always reproduces them verbatim — while ordinary lowercase English
// ("select ... from the list") never coincidentally matches. Deliberately
// greedy to the end of the message once matched — literal values in the
// query (addresses, txids) are almost always in this tail.
const SQL_STATEMENT_RE = /\b(SELECT\s+[\s\S]{0,200}?\bFROM\b[\s\S]*|INSERT\s+INTO\s+[\s\S]*|UPDATE\s+[\s\S]{0,100}?\bSET\b[\s\S]*|DELETE\s+FROM\s+[\s\S]*|CREATE\s+(?:TABLE|INDEX|VIEW)\s+[\s\S]*|ALTER\s+TABLE\s+[\s\S]*|DROP\s+(?:TABLE|INDEX|VIEW)\s+[\s\S]*|TRUNCATE\s+TABLE\s+[\s\S]*)/g;

// `Authorization: Bearer <token>` / `Authorization: Basic <token>`.
const BEARER_TOKEN_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

// `key=value` / `key: value` style secrets: API keys, service keys,
// passwords, tokens, viewing keys passed as params, auth headers. Excludes
// values that are literally "Bearer"/"Basic" so this doesn't double-match
// (with a misleading value) after BEARER_TOKEN_RE has already redacted the
// actual token on an `Authorization:` line.
const KEY_VALUE_SECRET_RE = /\b((?:x-)?(?:api|service|secret|access|auth|private)[_-]?key|authorization|password|passwd|pwd|token)\s*[:=]\s*["']?(?!Bearer\b|Basic\b)[^\s"'&,;)}\]]{3,}/gi;

// Zcash viewing keys (Sapling/Unified extended full/incoming viewing keys,
// spending keys). Never safe to log even truncated.
const VIEWING_KEY_RE = /\b(zxviews|zxview|secret-extended-key-main|secret-extended-key-test|uview|uivk|zivks|uivktest|uviewtest)[0-9a-z]+/gi;

// Zcash addresses: transparent (t1/t3/tm/tn), Sprout (zc), Sapling (zs/
// ztestsapling), Unified (u1/utest1). Bech32/base58 body is long
// alphanumeric, so a 10+ char continuation after the prefix is required to
// avoid matching short unrelated tokens that merely start with these
// letters.
const ZCASH_ADDRESS_RE = /\b(t1|t3|tm|tn|zc|zs|u1|utest1|ztestsapling1)[0-9a-zA-Z]{10,}\b/g;

// Exactly-64-hex identifiers: txids, block hashes, commitments, nullifiers,
// anchors.
const HEX64_RE = /\b[0-9a-fA-F]{64}\b/g;

// Other long hex blobs (raw tx hex, API/service keys in hex form, etc.)
// that aren't exactly 64 chars.
const HEX_BLOB_RE = /\b[0-9a-fA-F]{32,63}\b|\b[0-9a-fA-F]{65,}\b/g;

// Leftover URL query strings (e.g. `?address=...&key=...`) not already
// caught above.
const QUERY_STRING_RE = /\?[a-zA-Z0-9_.[\]-]+=[^\s'"<>]*(?:&[a-zA-Z0-9_.[\]-]+=[^\s'"<>]*)*/g;

/**
 * Redacts sensitive substrings from a free-text string. Safe to call on
 * anything derived from an exception (`message`, first line of `stack`) or
 * other untrusted/semi-trusted text before logging.
 */
function redactText(input) {
  if (typeof input !== 'string' || input.length === 0) return input;

  let out = input;
  out = out.replace(URL_CREDENTIALS_RE, (match, scheme) => `${scheme}[REDACTED_CREDENTIALS]`);
  out = out.replace(SQL_STATEMENT_RE, '[REDACTED_SQL]');
  out = out.replace(BEARER_TOKEN_RE, (match, scheme) => `${scheme} [REDACTED_TOKEN]`);
  out = out.replace(KEY_VALUE_SECRET_RE, (match, key) => `${key}=[REDACTED_SECRET]`);
  out = out.replace(VIEWING_KEY_RE, '[REDACTED_VIEWING_KEY]');
  out = out.replace(ZCASH_ADDRESS_RE, '[REDACTED_ADDRESS]');
  out = out.replace(HEX64_RE, '[REDACTED_HEX64]');
  out = out.replace(HEX_BLOB_RE, '[REDACTED_HEX]');
  out = out.replace(QUERY_STRING_RE, '?[REDACTED_QUERY]');

  return out;
}

// Non-sensitive, structural metadata worth keeping from a caught error.
// Deliberately excludes node-postgres's `detail`/`hint`/`where`/`query`/
// `parameters`/`internalQuery` fields — those routinely embed the actual
// offending row/column values (e.g. a unique-constraint violation's
// `detail: "Key (address)=(t1...) already exists."`) and are exactly the
// kind of leak this module exists to prevent. `table`/`schema`/`constraint`/
// `column` are schema-level identifiers, not row data, so they're safe and
// useful for debugging which query failed.
const SAFE_SCALAR_KEYS = [
  'code',
  'errno',
  'syscall',
  'severity',
  'schema',
  'table',
  'column',
  'constraint',
  'routine',
  'status',
  'statusCode',
];

function truncate(value) {
  if (typeof value !== 'string') return value;
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…[truncated]` : value;
}

/**
 * Converts an arbitrary caught value (Error instance, string, or anything
 * else code might `throw`) into a plain object safe to pass to
 * `console.error`/`console.warn` — class/code retained, free text redacted.
 */
function sanitizeError(error) {
  if (error === null || error === undefined) {
    return { name: 'UnknownError', message: '[no error provided]' };
  }

  if (!(error instanceof Error) && typeof error !== 'object') {
    return { name: 'NonErrorThrow', message: truncate(redactText(String(error))) };
  }

  const safe = { name: typeof error.name === 'string' && error.name ? error.name : 'Error' };

  for (const key of SAFE_SCALAR_KEYS) {
    const value = error[key];
    if ((typeof value === 'string' || typeof value === 'number') && value !== '') {
      safe[key] = typeof value === 'string' ? truncate(redactText(value)) : value;
    }
  }

  const rawMessage = typeof error.message === 'string' && error.message ? error.message : String(error);
  safe.message = truncate(redactText(rawMessage));

  if (typeof error.stack === 'string' && error.stack) {
    // Only the first line (name + message) — file/line stack frames aren't
    // secrets, but the full stack is unneeded for operational logs and
    // needlessly widens what a screenshot/ticket copy-paste could expose.
    const firstLine = error.stack.split('\n')[0];
    safe.stack = truncate(redactText(firstLine));
  }

  return safe;
}

function redactContextValue(value) {
  if (typeof value === 'string') return redactText(value);
  return value;
}

/**
 * Redacts a plain-object context bag (extra fields callers want alongside
 * the error, e.g. `{ route: '/api/x' }`). Every string value is passed
 * through the same redaction as error text.
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return undefined;
  const out = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactContextValue(value);
  }
  return out;
}

/**
 * Drop-in replacement for `console.error(label, error)` that never leaks
 * credential-bearing URLs, keys/tokens, Zcash addresses, 64-hex
 * identifiers, query strings, or SQL text. `context` is an optional plain
 * object of additional non-error fields to log (also redacted).
 */
function logSafeError(label, error, context) {
  const safeError = sanitizeError(error);
  const safeContext = sanitizeContext(context);
  if (safeContext) {
    console.error(label, safeError, safeContext);
  } else {
    console.error(label, safeError);
  }
}

/**
 * Same as `logSafeError` but for `console.warn`.
 */
function logSafeWarn(label, error, context) {
  const safeError = sanitizeError(error);
  const safeContext = sanitizeContext(context);
  if (safeContext) {
    console.warn(label, safeError, safeContext);
  } else {
    console.warn(label, safeError);
  }
}

module.exports = {
  redactText,
  sanitizeError,
  sanitizeContext,
  logSafeError,
  logSafeWarn,
};
