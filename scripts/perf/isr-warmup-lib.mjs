import { TextDecoder } from 'node:util';
import {
  classifyCache,
  selectDiagnosticHeaders,
} from './ttfb-probe-lib.mjs';

function serializedError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    ...(error && typeof error === 'object' && 'code' in error
      ? { code: String(error.code) }
      : {}),
  };
}

function isoNow(wallNow) {
  const value = wallNow();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function decodeInput(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
}

export function parseDelimited(text, delimiter) {
  if (delimiter !== ',' && delimiter !== '\t') {
    throw new TypeError('Delimited input must use comma or tab separators');
  }

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new TypeError('Delimited input contains an unterminated quoted field');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ''));
}

function jsonEntries(document) {
  const entries = Array.isArray(document)
    ? document
    : document?.urls ?? document?.pages ?? document?.targets;
  if (!Array.isArray(entries)) {
    throw new TypeError('JSON warm-up input must be an array or contain urls, pages, or targets');
  }
  return entries;
}

export function extractInputRows(text, {
  inputPath = 'input',
  urlColumn = 'url',
} = {}) {
  const trimmed = text.trim();
  if (!trimmed) throw new TypeError('Warm-up input is empty');

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const rows = jsonEntries(JSON.parse(trimmed)).map((entry, index) => {
      if (typeof entry === 'string') {
        return { rowNumber: index + 1, url: entry, label: null };
      }
      if (entry && typeof entry === 'object') {
        return {
          rowNumber: index + 1,
          url: entry.url ?? entry.path ?? null,
          label: typeof entry.label === 'string' ? entry.label : null,
        };
      }
      return { rowNumber: index + 1, url: null, label: null };
    });
    return { format: 'json', rows };
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(',') ? ',' : null);
  if (!delimiter) {
    return {
      format: 'lines',
      rows: trimmed.split(/\r?\n/).map((line, index) => ({
        rowNumber: index + 1,
        url: line.trim(),
        label: null,
      })).filter((row) => row.url),
    };
  }

  const table = parseDelimited(trimmed, delimiter);
  const headers = table[0].map((header) => header.trim().toLowerCase());
  const urlIndex = headers.indexOf(urlColumn.trim().toLowerCase());
  if (urlIndex === -1) {
    throw new TypeError(`${inputPath} does not contain the ${urlColumn} URL column`);
  }
  const labelIndex = headers.indexOf('label');
  return {
    format: delimiter === '\t' ? 'tsv' : 'csv',
    rows: table.slice(1).map((row, index) => ({
      rowNumber: index + 2,
      url: row[urlIndex] ?? null,
      label: labelIndex === -1 || typeof row[labelIndex] !== 'string'
        ? null
        : row[labelIndex],
    })),
  };
}

export function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Warm-up origin must be an HTTP(S) origin');
  }

  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash) {
    throw new TypeError('Warm-up origin must be an HTTP(S) origin without credentials, path, query, or fragment');
  }
  return url.origin;
}

function isReservedPath(pathname) {
  return ['/api', '/_next', '/.netlify'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function resolveWarmTargets(rows, {
  origin,
  maxUrls = 500,
} = {}) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!Number.isInteger(maxUrls) || maxUrls < 1) {
    throw new RangeError('maxUrls must be a positive integer');
  }

  const targets = [];
  const rejected = [];
  const duplicates = [];
  const seen = new Map();

  rows.forEach((rawRow, index) => {
    const row = typeof rawRow === 'string'
      ? { rowNumber: index + 1, url: rawRow, label: null }
      : { rowNumber: index + 1, label: null, ...rawRow };
    const candidate = typeof row.url === 'string' ? row.url.trim() : '';
    if (!candidate) {
      rejected.push({ rowNumber: row.rowNumber, value: row.url ?? null, reason: 'missing-url' });
      return;
    }

    let url;
    try {
      url = new URL(candidate);
    } catch {
      rejected.push({ rowNumber: row.rowNumber, value: candidate, reason: 'absolute-url-required' });
      return;
    }

    let reason = null;
    if (!['http:', 'https:'].includes(url.protocol)) reason = 'http-url-required';
    else if (url.username || url.password) reason = 'credentials-forbidden';
    else if (url.origin !== normalizedOrigin) reason = 'cross-origin';
    else if (url.hash) reason = 'fragment-forbidden';
    else if (url.search) reason = 'query-string-forbidden';
    else if (isReservedPath(url.pathname)) reason = 'non-page-path';

    if (reason) {
      rejected.push({ rowNumber: row.rowNumber, value: candidate, reason });
      return;
    }

    const normalized = url.href;
    const firstRow = seen.get(normalized);
    if (firstRow !== undefined) {
      duplicates.push({
        rowNumber: row.rowNumber,
        duplicateOfRow: firstRow,
        url: normalized,
      });
      return;
    }
    seen.set(normalized, row.rowNumber);
    targets.push({
      rowNumber: row.rowNumber,
      label: typeof row.label === 'string' && row.label ? row.label : null,
      url: normalized,
      path: url.pathname,
    });
  });

  if (targets.length > maxUrls) {
    throw new RangeError(`Warm-up input has ${targets.length} unique URLs; maximum maxUrls is ${maxUrls}`);
  }
  return { origin: normalizedOrigin, targets, rejected, duplicates };
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Best effort. The result remains incomplete even if cancellation fails.
  }
}

export async function drainBody(response, maxBodyBytes) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    await cancelBody(response);
    const error = new RangeError(`Response body exceeds ${maxBodyBytes} bytes`);
    error.code = 'BODY_LIMIT';
    throw error;
  }
  if (!response.body || typeof response.body.getReader !== 'function') return 0;

  const reader = response.body.getReader();
  let bodyBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodyBytes += value?.byteLength ?? 0;
      if (bodyBytes > maxBodyBytes) {
        await reader.cancel('ISR warm-up body limit exceeded');
        const error = new RangeError(`Response body exceeds ${maxBodyBytes} bytes`);
        error.code = 'BODY_LIMIT';
        throw error;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return bodyBytes;
}

function bodyResult(disposition, bytes, complete, reason = null) {
  return { disposition, bytes, complete, reason };
}

function ineligibleReason(response, contentType) {
  if (response.status === 429) return 'rate-limited';
  if (response.status >= 300 && response.status < 400) return 'redirect';
  if (!response.ok) return 'http-status';
  if (!/^text\/html(?:;|$)/i.test(contentType)) return 'non-html';
  return null;
}

export async function warmUrl(target, {
  fetchImpl = globalThis.fetch,
  maxBodyBytes = 5 * 1024 * 1024,
  signalFactory = (timeoutMs) => AbortSignal.timeout(timeoutMs),
  timeoutMs = 30_000,
  userAgent = 'CipherScan-ISR-Warmup/1.0',
  wallNow = () => new Date(),
} = {}) {
  const requestedUrl = typeof target === 'string' ? target : target.url;
  const requestStartedAt = isoNow(wallNow);

  try {
    const response = await fetchImpl(requestedUrl, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': userAgent,
      },
      redirect: 'manual',
      signal: signalFactory(timeoutMs),
    });
    const headersReceivedAt = isoNow(wallNow);
    const headers = selectDiagnosticHeaders(response.headers);
    const contentType = response.headers.get('content-type') ?? '';
    const reason = ineligibleReason(response, contentType);

    if (reason) {
      await cancelBody(response);
      const body = bodyResult('cancelled', 0, false, reason);
      return {
        requestedUrl,
        requestStartedAt,
        headersReceivedAt,
        completedAt: isoNow(wallNow),
        status: response.status,
        ok: response.ok,
        httpOk: response.ok,
        eligible: false,
        bodyComplete: false,
        bodyBytes: 0,
        body,
        headers,
        cache: classifyCache(headers),
        error: null,
      };
    }

    try {
      const bodyBytes = await drainBody(response, maxBodyBytes);
      const body = bodyResult('drained', bodyBytes, true);
      return {
        requestedUrl,
        requestStartedAt,
        headersReceivedAt,
        completedAt: isoNow(wallNow),
        status: response.status,
        ok: response.ok,
        httpOk: response.ok,
        eligible: true,
        bodyComplete: true,
        bodyBytes,
        body,
        headers,
        cache: classifyCache(headers),
        error: null,
      };
    } catch (error) {
      const body = bodyResult('cancelled', 0, false, error?.code === 'BODY_LIMIT' ? 'body-limit' : 'body-error');
      return {
        requestedUrl,
        requestStartedAt,
        headersReceivedAt,
        completedAt: isoNow(wallNow),
        status: response.status,
        ok: false,
        httpOk: response.ok,
        eligible: true,
        bodyComplete: false,
        bodyBytes: 0,
        body,
        headers,
        cache: classifyCache(headers),
        error: serializedError(error),
      };
    }
  } catch (error) {
    return {
      requestedUrl,
      requestStartedAt,
      headersReceivedAt: null,
      completedAt: isoNow(wallNow),
      status: null,
      ok: false,
      httpOk: false,
      eligible: false,
      bodyComplete: false,
      bodyBytes: 0,
      body: bodyResult('unavailable', 0, false, 'request-error'),
      headers: {},
      cache: classifyCache({}),
      error: serializedError(error),
    };
  }
}

export function createRateGate({
  requestsPerSecond,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
    throw new RangeError('requestsPerSecond must be a positive number');
  }
  const intervalMs = 1_000 / requestsPerSecond;
  let nextStart = 0;
  let queue = Promise.resolve();

  return async function waitForSlot() {
    let release;
    const previous = queue;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const current = now();
    const scheduled = Math.max(current, nextStart);
    nextStart = scheduled + intervalMs;
    release();
    const waitMs = scheduled - current;
    if (waitMs > 0) await sleep(waitMs);
  };
}

function observationFailed(observation) {
  return !observation?.ok || !observation?.eligible || !observation?.bodyComplete;
}

export async function runWarmup(targets, {
  concurrency = 1,
  maxFailures = 3,
  measureImpl,
  warmImpl = measureImpl ?? warmUrl,
  warmOptions = {},
  measureOptions = warmOptions,
  rateGate = createRateGate({ requestsPerSecond: 1 }),
  shouldStop = () => false,
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer');
  }
  if (!Number.isInteger(maxFailures) || maxFailures < 1) {
    throw new RangeError('maxFailures must be a positive integer');
  }

  const observations = new Array(targets.length);
  let nextIndex = 0;
  let failures = 0;
  let stopReason = null;

  async function worker() {
    while (true) {
      if (stopReason || shouldStop()) {
        if (!stopReason && shouldStop()) stopReason = 'interrupted';
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      if (index >= targets.length) return;

      await rateGate();
      if (stopReason || shouldStop()) {
        if (!stopReason && shouldStop()) stopReason = 'interrupted';
        return;
      }

      const observation = {
        sequence: index + 1,
        path: targets[index].path,
        ...await warmImpl(targets[index], measureOptions),
      };
      observations[index] = observation;

      if (observation.status === 429) {
        stopReason = 'http-429-rate-limited';
        return;
      }
      if (observationFailed(observation)) {
        failures += 1;
        if (failures >= maxFailures) {
          stopReason = 'max-failures';
          return;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  const completed = observations.filter(Boolean);
  const notAttempted = targets.length - completed.length;
  return {
    observations: completed,
    stoppedEarly: Boolean(stopReason),
    stopReason,
    notAttempted,
  };
}

export function summarizeWarmup(runResult) {
  const observations = Array.isArray(runResult) ? runResult : runResult.observations;
  const notAttempted = Array.isArray(runResult)
    ? 0
    : (Array.isArray(runResult.notAttempted) ? runResult.notAttempted.length : runResult.notAttempted);
  const byStatus = {};
  const cacheStateCounts = {};
  let bodiesDrained = 0;
  let bodyBytesDrained = 0;
  let operationalErrors = 0;

  for (const observation of observations) {
    const status = observation.status === null ? 'NO_RESPONSE' : String(observation.status);
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const edgeState = observation.cache?.netlify?.edge?.state ?? 'UNKNOWN';
    cacheStateCounts[edgeState] = (cacheStateCounts[edgeState] ?? 0) + 1;
    if (observation.bodyComplete && observation.body?.disposition === 'drained') {
      bodiesDrained += 1;
      bodyBytesDrained += observation.bodyBytes ?? observation.body?.bytes ?? 0;
    }
    if (observationFailed(observation)) operationalErrors += 1;
  }

  return {
    attemptedRequests: observations.length,
    completedUrls: observations.length,
    notAttempted,
    operationalErrors,
    bodiesDrained,
    bodyBytesDrained,
    stoppedEarly: Array.isArray(runResult) ? false : runResult.stoppedEarly,
    stopReason: Array.isArray(runResult) ? null : runResult.stopReason,
    byStatus,
    cacheStateCounts,
  };
}
