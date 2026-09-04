/**
 * server/api/v1/lib/zatoshi.js
 *
 * Zcash-explorer-wide rule: values MUST be represented in zatoshis
 * (1 ZEC = 100,000,000 zatoshis) and MUST NEVER pass through a float.
 * This module converts integer-valued zatoshi amounts to canonical
 * decimal strings for JSON transport (JSON numbers lose precision past
 * 2^53 and, more importantly, invite accidental float math downstream).
 *
 * IMPORTANT — precision boundary:
 * These helpers only convert values that are *already* integer zatoshi
 * amounts (e.g. a BIGINT column read back from Postgres, which node-pg
 * returns as a numeric string). They cannot recover precision from a
 * value some legacy handler already divided by 1e8 into a JS float —
 * that information is gone by the time it reaches this layer. Adapters
 * must not "helpfully" re-multiply a lossy float back into zatoshis;
 * doing so would fabricate false precision. See MANIFEST entries with
 * `zatoshiConfidence: 'unverified'` and the caveats in server/api/v1/README.md.
 */

const MAX_SAFE_DECIMAL_DIGITS = 30; // generous upper bound, rejects garbage input

/**
 * Convert a value known to be an integer zatoshi amount into a canonical
 * decimal string ("100000000", not "1e8", "100000000.0", or "+100000000").
 *
 * Accepts: number (must be a safe integer), string (must be `-?\d+`), bigint.
 * Throws on floats, non-numeric strings, or values that would silently lose
 * precision — this is intentionally fail-closed per the "never use floats
 * for zatoshi" rule.
 */
function toZatoshiString(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`toZatoshiString: refusing to convert non-integer number ${value}`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`toZatoshiString: number ${value} exceeds Number.MAX_SAFE_INTEGER; pass the original string instead`);
    }
    return value.toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new TypeError(`toZatoshiString: "${value}" is not an integer decimal string`);
    }
    if (trimmed.replace('-', '').length > MAX_SAFE_DECIMAL_DIGITS) {
      throw new TypeError(`toZatoshiString: "${value}" exceeds max supported digit length`);
    }
    // Normalize leading zeros ("00100" -> "100") while preserving sign and "0".
    const negative = trimmed.startsWith('-');
    const digits = (negative ? trimmed.slice(1) : trimmed).replace(/^0+(?=\d)/, '');
    return (negative && digits !== '0' ? '-' : '') + digits;
  }

  throw new TypeError(`toZatoshiString: unsupported type ${typeof value}`);
}

/** True if `value` can be safely passed to toZatoshiString without throwing. */
function isZatoshiLike(value) {
  try {
    toZatoshiString(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a zatoshi decimal string to a ZEC decimal string (for display-only
 * contexts). Never returns a float/number — string in, string out.
 */
function zatoshiToZecString(zatoshiStr) {
  const z = toZatoshiString(zatoshiStr);
  if (z === null) return null;
  const negative = z.startsWith('-');
  const digits = negative ? z.slice(1) : z;
  const padded = digits.padStart(9, '0');
  const whole = padded.slice(0, -8).replace(/^0+(?=\d)/, '');
  const frac = padded.slice(-8).replace(/0+$/, '');
  const wholePart = whole === '' ? '0' : whole;
  const sign = negative && (wholePart !== '0' || frac !== '') ? '-' : '';
  return frac ? `${sign}${wholePart}.${frac}` : `${sign}${wholePart}`;
}

/**
 * Deep-clone `obj`, converting the values found at each dotted `fieldPaths`
 * entry into canonical zatoshi decimal strings via toZatoshiString.
 * Supports simple array wildcards via "items.*.field" -> applies to every
 * element of an array field.
 *
 * Fails closed: if a targeted field exists but is not zatoshi-like, the
 * conversion error is collected (not thrown) and returned alongside the
 * result so the caller can decide whether to serve a 502
 * upstream-contract-mismatch instead of silently shipping bad data.
 */
function applyZatoshiFields(input, fieldPaths = []) {
  const warnings = [];
  if (input === null || typeof input !== 'object' || !fieldPaths.length) {
    return { value: input, warnings };
  }

  const output = Array.isArray(input) ? input.slice() : { ...input };

  for (const fieldPath of fieldPaths) {
    const segments = fieldPath.split('.');
    convertAtPath(output, segments, fieldPath, warnings);
  }

  return { value: output, warnings };
}

function convertAtPath(node, segments, originalPath, warnings) {
  if (node === null || node === undefined) return;
  const [head, ...rest] = segments;

  if (head === '*') {
    if (!Array.isArray(node)) return;
    for (let i = 0; i < node.length; i++) {
      if (rest.length === 0) {
        node[i] = safeConvert(node[i], originalPath, warnings);
      } else if (node[i] && typeof node[i] === 'object') {
        convertAtPath(node[i], rest, originalPath, warnings);
      }
    }
    return;
  }

  if (typeof node !== 'object' || Array.isArray(node)) return;
  if (!(head in node)) return;

  if (rest.length === 0) {
    node[head] = safeConvert(node[head], originalPath, warnings);
    return;
  }

  if (node[head] && typeof node[head] === 'object') {
    convertAtPath(node[head], rest, originalPath, warnings);
  }
}

function safeConvert(value, fieldPath, warnings) {
  if (value === null || value === undefined) return value;
  try {
    return toZatoshiString(value);
  } catch (err) {
    warnings.push({ field: fieldPath, issue: err.message });
    return value;
  }
}

module.exports = {
  toZatoshiString,
  isZatoshiLike,
  zatoshiToZecString,
  applyZatoshiFields,
};
