import { randomUUID } from 'node:crypto';
import { link, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const CACHE_STATES = Object.freeze({
  HIT: 'HIT',
  STALE_HIT: 'STALE_HIT',
  MISS: 'MISS',
  STALE_MISS: 'STALE_MISS',
  BYPASS: 'BYPASS',
  UNKNOWN: 'UNKNOWN',
});

export const DIAGNOSTIC_HEADERS = Object.freeze([
  'age',
  'cache-control',
  'cache-status',
  'cdn-cache-control',
  'content-length',
  'content-type',
  'date',
  'etag',
  'last-modified',
  'location',
  'netlify-cdn-cache-control',
  'netlify-vary',
  'server',
  'server-timing',
  'retry-after',
  'vary',
  'via',
  'x-cipherscan-cache',
  'x-nf-cache',
  'x-nf-request-id',
  'x-nextjs-cache',
  'x-nextjs-prerender',
  'x-vercel-cache',
]);

function splitOutsideQuotes(value, delimiter) {
  const parts = [];
  let current = '';
  let escaped = false;
  let quoted = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quoted) {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      current += character;
      quoted = !quoted;
      continue;
    }
    if (character === delimiter && !quoted) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquote(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed;
  return trimmed.slice(1, -1).replace(/\\([\\"])/g, '$1');
}

function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);

  const wanted = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === wanted && value !== undefined && value !== null) {
      return String(value);
    }
  }
  return null;
}

export function selectDiagnosticHeaders(headers) {
  return Object.fromEntries(DIAGNOSTIC_HEADERS.flatMap((name) => {
    const value = readHeader(headers, name);
    return value === null ? [] : [[name, value]];
  }));
}

export function parseCacheStatus(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return [];

  return splitOutsideQuotes(rawValue, ',').flatMap((rawMember) => {
    const segments = splitOutsideQuotes(rawMember, ';');
    if (segments.length === 0 || !segments[0]) return [];

    const params = {};
    for (const segment of segments.slice(1)) {
      if (!segment) continue;
      const equals = segment.indexOf('=');
      if (equals === -1) {
        params[segment.trim().toLowerCase()] = true;
        continue;
      }
      const key = segment.slice(0, equals).trim().toLowerCase();
      const value = unquote(segment.slice(equals + 1));
      if (key) params[key] = value;
    }

    return [{
      name: unquote(segments[0]),
      params,
      raw: rawMember,
    }];
  });
}

function isTrue(value) {
  return value === true || value === 1 || value === '1' || value === '?1'
    || String(value).toLowerCase() === 'true';
}

export function classifyCacheStatusMember(member) {
  if (!member) {
    return {
      state: CACHE_STATES.UNKNOWN,
      forward: null,
      hit: false,
      raw: null,
      params: {},
    };
  }

  const forward = typeof member.params.fwd === 'string'
    ? member.params.fwd.toLowerCase()
    : null;
  const hit = isTrue(member.params.hit);
  let state = CACHE_STATES.UNKNOWN;

  if (hit && forward === 'stale') state = CACHE_STATES.STALE_HIT;
  else if (hit) state = CACHE_STATES.HIT;
  else if (forward === 'stale' || isTrue(member.params.stale)) state = CACHE_STATES.STALE_MISS;
  else if (forward === 'bypass' || isTrue(member.params.bypass)) state = CACHE_STATES.BYPASS;
  else if (forward === 'miss' || forward?.endsWith('-miss')) state = CACHE_STATES.MISS;

  return {
    state,
    forward,
    hit,
    raw: member.raw,
    params: member.params,
  };
}

function findLayer(entries, name) {
  return entries.findLast((entry) => entry.name.toLowerCase() === name);
}

function simpleCacheState(value) {
  const state = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ['HIT', 'MISS', 'STALE', 'BYPASS'].includes(state)
    ? state
    : CACHE_STATES.UNKNOWN;
}

export function classifyCache(headers) {
  const raw = readHeader(headers, 'cache-status');
  const entries = parseCacheStatus(raw);

  return {
    raw,
    netlify: {
      edge: classifyCacheStatusMember(findLayer(entries, 'netlify edge')),
      durable: classifyCacheStatusMember(findLayer(entries, 'netlify durable')),
    },
    application: simpleCacheState(readHeader(headers, 'x-cipherscan-cache')),
    vercel: simpleCacheState(readHeader(headers, 'x-vercel-cache')),
  };
}

function serializedError(error) {
  const result = {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
  if (error && typeof error === 'object' && 'code' in error) result.code = String(error.code);
  return result;
}

function isoNow(wallNow) {
  const value = wallNow();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function roundedMilliseconds(value) {
  return Number(value.toFixed(1));
}

export async function measureTtfb(target, {
  fetchImpl = globalThis.fetch,
  now = () => performance.now(),
  signalFactory = (timeoutMs) => AbortSignal.timeout(timeoutMs),
  timeoutMs = 12_000,
  userAgent = 'CipherScan-TTFB-Probe/1.0',
  wallNow = () => new Date(),
} = {}) {
  const requestedUrl = typeof target === 'string' ? target : target.url;
  if (!requestedUrl) throw new TypeError('TTFB target must include a URL');

  const startedAt = isoNow(wallNow);
  const started = now();

  try {
    const response = await fetchImpl(requestedUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': userAgent,
      },
      redirect: 'manual',
      signal: signalFactory(timeoutMs),
    });
    const ttfbMs = roundedMilliseconds(now() - started);
    const headersAt = isoNow(wallNow);
    const headers = selectDiagnosticHeaders(response.headers);
    const redirected = response.status >= 300 && response.status < 400;
    let bodyCancellation;

    if (!response.body || typeof response.body.cancel !== 'function') {
      bodyCancellation = { state: 'no-body', error: null };
    } else {
      try {
        await response.body.cancel();
        bodyCancellation = { state: 'cancelled', error: null };
      } catch (error) {
        bodyCancellation = { state: 'failed', error: serializedError(error) };
      }
    }

    return {
      requestedUrl,
      finalUrl: response.url || requestedUrl,
      startedAt,
      headersAt,
      completedAt: isoNow(wallNow),
      headersReceived: true,
      completed: true,
      timedOut: false,
      redirected,
      status: response.status,
      ok: response.ok,
      ttfbMs,
      elapsedUntilErrorMs: null,
      headers,
      cache: classifyCache(headers),
      bodyCancellation,
      error: null,
    };
  } catch (error) {
    const elapsedUntilErrorMs = roundedMilliseconds(now() - started);
    const failure = serializedError(error);
    const timedOut = failure.name === 'TimeoutError' || /timed?\s*out/i.test(failure.message);

    return {
      requestedUrl,
      finalUrl: null,
      startedAt,
      headersAt: null,
      completedAt: isoNow(wallNow),
      headersReceived: false,
      completed: false,
      timedOut,
      redirected: false,
      status: null,
      ok: false,
      ttfbMs: null,
      elapsedUntilErrorMs,
      headers: {},
      cache: classifyCache({}),
      bodyCancellation: { state: 'not-started', error: null },
      error: failure,
    };
  }
}

export function resolveTargets(manifest, baseUrl) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.targets)) {
    throw new TypeError('TTFB target manifest must use schemaVersion 1 and contain targets');
  }

  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)
    || base.username
    || base.password
    || base.pathname !== '/'
    || base.search
    || base.hash) {
    throw new TypeError('TTFB base URL must be an HTTP(S) origin without credentials, path, query, or fragment');
  }
  const ids = new Set();

  return manifest.targets.map((target, index) => {
    if (!target || typeof target.id !== 'string' || !target.id.trim()) {
      throw new TypeError(`TTFB target ${index + 1} must have an id`);
    }
    if (ids.has(target.id)) throw new TypeError(`Duplicate TTFB target id: ${target.id}`);
    ids.add(target.id);
    if (typeof target.routeGroup !== 'string' || !target.routeGroup.trim()) {
      throw new TypeError(`TTFB target ${target.id} must have a routeGroup`);
    }
    if (typeof target.path !== 'string' || !target.path.startsWith('/') || target.path.includes('#')) {
      throw new TypeError(`TTFB target ${target.id} must use an absolute path without a fragment`);
    }

    const url = new URL(target.path, base);
    if (url.origin !== base.origin) {
      throw new TypeError(`TTFB target ${target.id} must stay on the base URL origin`);
    }

    return {
      id: target.id,
      routeGroup: target.routeGroup,
      path: `${url.pathname}${url.search}`,
      url: url.toString(),
      core: target.core === true,
    };
  });
}

export async function runPairedProbe(targets, {
  measureImpl = measureTtfb,
  measureOptions = {},
  rounds = 2,
  scheduling = 'serial',
} = {}) {
  if (!Number.isInteger(rounds) || rounds < 1) throw new RangeError('rounds must be a positive integer');
  if (!['serial', 'parallel'].includes(scheduling)) {
    throw new TypeError('scheduling must be serial or parallel');
  }

  const measurePair = async (target, round) => {
    const first = await measureImpl(target, { ...measureOptions, round, pairPosition: 1 });
    const second = await measureImpl(target, { ...measureOptions, round, pairPosition: 2 });
    return [
      { ...first, targetId: target.id, routeGroup: target.routeGroup, core: target.core, round, pairPosition: 1 },
      { ...second, targetId: target.id, routeGroup: target.routeGroup, core: target.core, round, pairPosition: 2 },
    ];
  };

  const observations = [];
  for (let round = 1; round <= rounds; round += 1) {
    if (scheduling === 'parallel') {
      const pairs = await Promise.all(targets.map((target) => measurePair(target, round)));
      observations.push(...pairs.flat());
    } else {
      for (const target of targets) observations.push(...await measurePair(target, round));
    }
  }

  return observations.map((observation, index) => ({ sequence: index + 1, ...observation }));
}

export function nearestRank(values, fraction) {
  if (values.length === 0) return null;
  if (!(fraction > 0 && fraction <= 1)) throw new RangeError('percentile must be in (0, 1]');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function percentage(numerator, denominator) {
  return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(2));
}

function statistics(rows, thresholdMs) {
  const headerRows = rows.filter((row) => row.headersReceived && Number.isFinite(row.ttfbMs));
  const successfulRows = headerRows.filter((row) => row.ok && !row.redirected);
  const timings = successfulRows.map((row) => row.ttfbMs);
  const underThreshold = successfulRows.filter((row) => row.ttfbMs < thresholdMs).length;

  return {
    observations: rows.length,
    headersReceived: headerRows.length,
    successfulDirectResponses: successfulRows.length,
    failedResponses: rows.length - successfulRows.length,
    timeouts: rows.filter((row) => row.timedOut).length,
    redirects: rows.filter((row) => row.redirected).length,
    medianMs: nearestRank(timings, 0.5),
    p95Ms: nearestRank(timings, 0.95),
    maxMs: timings.length ? Math.max(...timings) : null,
    underThreshold,
    underThresholdPct: percentage(underThreshold, rows.length),
  };
}

function groupedStatistics(rows, key, thresholdMs) {
  const groups = new Map();
  for (const row of rows) {
    const group = key(row);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  return Object.fromEntries([...groups].map(([group, groupRows]) => [
    String(group),
    statistics(groupRows, thresholdMs),
  ]));
}

function isConfirmedNetlifyHit(row) {
  const hitStates = new Set([CACHE_STATES.HIT, CACHE_STATES.STALE_HIT]);
  return hitStates.has(row.cache?.netlify?.edge?.state)
    || hitStates.has(row.cache?.netlify?.durable?.state);
}

export function summarizeTtfb(observations, { thresholdMs = 200 } = {}) {
  if (!(Number.isFinite(thresholdMs) && thresholdMs > 0)) {
    throw new RangeError('thresholdMs must be a positive number');
  }

  return {
    thresholdMs,
    overall: statistics(observations, thresholdMs),
    core: statistics(observations.filter((row) => row.core), thresholdMs),
    confirmedNetlifyCacheHits: statistics(observations.filter(isConfirmedNetlifyHit), thresholdMs),
    byTarget: groupedStatistics(observations, (row) => row.targetId, thresholdMs),
    byRoute: groupedStatistics(observations, (row) => row.routeGroup, thresholdMs),
    byPairPosition: groupedStatistics(observations, (row) => row.pairPosition, thresholdMs),
    byNetlifyEdgeState: groupedStatistics(
      observations,
      (row) => row.cache?.netlify?.edge?.state ?? CACHE_STATES.UNKNOWN,
      thresholdMs,
    ),
    byNetlifyDurableState: groupedStatistics(
      observations,
      (row) => row.cache?.netlify?.durable?.state ?? CACHE_STATES.UNKNOWN,
      thresholdMs,
    ),
    byApplicationCacheState: groupedStatistics(
      observations,
      (row) => row.cache?.application ?? CACHE_STATES.UNKNOWN,
      thresholdMs,
    ),
  };
}

export async function writeArtifactAtomic(outputPath, artifact, { force = false } = {}) {
  const destination = path.resolve(outputPath);
  const directory = path.dirname(destination);
  const temporary = path.join(directory, `.${path.basename(destination)}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });

  let handle;
  try {
    handle = await open(temporary, 'wx');
    await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle?.close();
  }

  try {
    if (force) await rename(temporary, destination);
    else {
      await link(temporary, destination);
      await unlink(temporary);
    }
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }

  return destination;
}
