import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeArtifactAtomic } from './ttfb-probe-lib.mjs';
import {
  createRateGate,
  decodeInput,
  extractInputRows,
  normalizeOrigin,
  resolveWarmTargets,
  runWarmup,
  summarizeWarmup,
} from './isr-warmup-lib.mjs';

const USAGE = `Usage (validation only; makes no requests):
  npm run perf:warm:isr -- \\
    --origin=https://cipherscan.app \\
    --input=/path/to/ahrefs-export.csv \\
    --output=artifacts/perf/isr-warm-plan.json

Execution requires both --execute and an exact origin confirmation:
  npm run perf:warm:isr -- \\
    --origin=https://cipherscan.app \\
    --confirm-origin=https://cipherscan.app \\
    --input=/path/to/isr-urls.csv \\
    --output=artifacts/perf/isr-warm-execution.json \\
    --execute

Options:
  [--skip-query] [--concurrency=1] [--requests-per-second=1]
  [--timeout-ms=30000] [--max-body-bytes=5242880]
  [--max-urls=500] [--max-failures=3] [--url-column=url]
  [--label=post-deploy] [--revision=SHA] [--force]`;

const BOOLEAN_OPTIONS = new Set(['execute', 'force', 'skip-query']);
const VALUE_OPTIONS = new Set([
  'concurrency',
  'confirm-origin',
  'input',
  'label',
  'max-body-bytes',
  'max-failures',
  'max-urls',
  'origin',
  'output',
  'requests-per-second',
  'revision',
  'timeout-ms',
  'url-column',
]);

export function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new TypeError(`Unexpected argument: ${argument}`);
    const equals = argument.indexOf('=');
    const name = argument.slice(2, equals === -1 ? undefined : equals);
    if (BOOLEAN_OPTIONS.has(name)) {
      if (equals !== -1) throw new TypeError(`--${name} does not take a value`);
      options[name] = true;
      continue;
    }
    if (!VALUE_OPTIONS.has(name)) throw new TypeError(`Unknown option: --${name}`);
    const value = equals === -1 ? args[index += 1] : argument.slice(equals + 1);
    if (value === undefined || value.startsWith('--')) throw new TypeError(`--${name} requires a value`);
    options[name] = value;
  }
  return options;
}

function boundedNumber(value, fallback, name, { minimum, maximum, integer = false }) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)
    || parsed < minimum
    || parsed > maximum
    || (integer && !Number.isInteger(parsed))) {
    throw new RangeError(`--${name} must be ${integer ? 'an integer ' : ''}between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function countsByReason(entries) {
  return Object.fromEntries([...new Set(entries.map((entry) => entry.reason))].sort().map((reason) => [
    reason,
    entries.filter((entry) => entry.reason === reason).length,
  ]));
}

async function assertOutputDoesNotExist(outputPath, force) {
  if (force) return;
  try {
    await stat(path.resolve(outputPath));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const error = new Error(`Output already exists: ${path.resolve(outputPath)} (use --force to replace it)`);
  error.code = 'EEXIST';
  throw error;
}

function planResults(targets, observations = []) {
  const bySequence = new Map(observations.map((observation) => [observation.sequence, observation]));
  return targets.map((target, index) => ({
    index,
    rowNumber: target.rowNumber,
    label: target.label,
    url: target.url,
    operation: bySequence.get(index + 1) ?? null,
  }));
}

export async function main(args = process.argv.slice(2), {
  fetchImpl = globalThis.fetch,
  wallNow = () => new Date(),
} = {}) {
  try {
    const options = parseArgs(args);
    if (!options.origin || !options.input || !options.output) {
      throw new TypeError('--origin, --input, and --output are required');
    }

    const origin = normalizeOrigin(options.origin);
    const execute = options.execute === true;
    if (execute) {
      if (!options['confirm-origin']) {
        throw new TypeError('--confirm-origin is required with --execute');
      }
      const confirmedOrigin = normalizeOrigin(options['confirm-origin']);
      if (confirmedOrigin !== origin) {
        throw new TypeError(`--confirm-origin must exactly match ${origin}`);
      }
    } else if (options['confirm-origin']) {
      throw new TypeError('--confirm-origin is only valid with --execute');
    }

    const concurrency = boundedNumber(options.concurrency, 1, 'concurrency', {
      minimum: 1, maximum: 2, integer: true,
    });
    const requestsPerSecond = boundedNumber(
      options['requests-per-second'], 1, 'requests-per-second',
      { minimum: 0.1, maximum: 2 },
    );
    const timeoutMs = boundedNumber(options['timeout-ms'], 30_000, 'timeout-ms', {
      minimum: 1_000, maximum: 120_000, integer: true,
    });
    const maxBodyBytes = boundedNumber(
      options['max-body-bytes'], 5 * 1024 * 1024, 'max-body-bytes',
      { minimum: 1_024, maximum: 50 * 1024 * 1024, integer: true },
    );
    const maxUrls = boundedNumber(options['max-urls'], 500, 'max-urls', {
      minimum: 1, maximum: 10_000, integer: true,
    });
    const maxFailures = boundedNumber(options['max-failures'], 3, 'max-failures', {
      minimum: 1, maximum: 100, integer: true,
    });

    await assertOutputDoesNotExist(options.output, options.force === true);
    const inputPath = path.resolve(options.input);
    const inputBytes = await readFile(inputPath);
    const extracted = extractInputRows(decodeInput(inputBytes), {
      inputPath,
      urlColumn: options['url-column'] ?? 'url',
    });
    const resolved = resolveWarmTargets(extracted.rows, { origin, maxUrls });
    const queryRejections = resolved.rejected.filter(
      (entry) => entry.reason === 'query-string-forbidden',
    );
    const fatalRejections = resolved.rejected.filter(
      (entry) => entry.reason !== 'query-string-forbidden' || options['skip-query'] !== true,
    );
    if (fatalRejections.length > 0) {
      throw new TypeError(`Warm-up input contains rejected entries: ${Object.keys(countsByReason(fatalRejections)).join(', ')}`);
    }
    if (resolved.targets.length === 0) {
      throw new TypeError('Warm-up input contains no eligible URLs');
    }

    const startedAt = wallNow().toISOString();
    let interrupted = false;
    const interruptHandler = () => { interrupted = true; };
    let runResult = {
      observations: [],
      stoppedEarly: false,
      stopReason: null,
      notAttempted: resolved.targets.length,
    };
    if (execute) {
      process.once('SIGINT', interruptHandler);
      try {
        runResult = await runWarmup(resolved.targets, {
          concurrency,
          maxFailures,
          rateGate: createRateGate({ requestsPerSecond }),
          shouldStop: () => interrupted,
          warmOptions: {
            fetchImpl,
            maxBodyBytes,
            timeoutMs,
            wallNow,
          },
        });
      } finally {
        process.removeListener('SIGINT', interruptHandler);
      }
    }

    const summary = summarizeWarmup(runResult);
    const completedAt = wallNow().toISOString();
    const artifact = {
      schemaVersion: 1,
      metadata: {
        kind: 'isr-warmup',
        mode: execute ? 'execute' : 'dry-run',
        origin,
        startedAt,
        completedAt,
        claimPolicy: 'This artifact contains no TTFB measurement or performance acceptance and does not prove that any URL is globally warm.',
        inputPath,
        inputSha256: createHash('sha256').update(inputBytes).digest('hex'),
        inputFormat: extracted.format,
        label: options.label ?? null,
        revision: options.revision ?? process.env.GITHUB_SHA ?? null,
        limits: {
          concurrency,
          requestsPerSecond,
          timeoutMs,
          maxBodyBytes,
          maxUrls,
          maxFailures,
        },
      },
      validation: {
        inputRows: extracted.rows.length,
        uniqueUrls: resolved.targets.length,
        duplicateRows: resolved.duplicates,
        rejectedCounts: countsByReason(resolved.rejected),
        skippedQueryRows: options['skip-query'] === true ? queryRejections : [],
        minimumExecutionSecondsAtConfiguredRate: Math.max(
          0,
          (resolved.targets.length - 1) / requestsPerSecond,
        ),
      },
      summary,
      results: planResults(resolved.targets, runResult.observations),
    };
    const outputPath = await writeArtifactAtomic(options.output, artifact, {
      force: options.force === true,
    });

    console.log(JSON.stringify({ outputPath, metadata: artifact.metadata, validation: artifact.validation, summary }, null, 2));
    if (execute && (summary.operationalErrors > 0 || summary.stoppedEarly)) process.exitCode = 1;
    return artifact;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 2;
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
