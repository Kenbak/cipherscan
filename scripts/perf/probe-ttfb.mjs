import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  resolveTargets,
  runPairedProbe,
  summarizeTtfb,
  writeArtifactAtomic,
} from './ttfb-probe-lib.mjs';

const USAGE = `Usage: npm run perf:probe:ttfb -- \\
  --base-url=https://cipherscan.app \\
  --output=artifacts/perf/ttfb-production.json \\
  [--targets=scripts/perf/ttfb-targets.json] \\
  [--rounds=2] [--timeout-ms=12000] [--threshold-ms=200] \\
  [--scheduling=serial|parallel] [--label=post-deploy] [--revision=SHA] \\
  [--min-under-threshold-pct=80] [--require-core-under-threshold] [--force]`;

function parseArgs(args) {
  const options = {};
  const booleans = new Set(['force', 'require-core-under-threshold']);
  const values = new Set([
    'base-url',
    'label',
    'min-under-threshold-pct',
    'output',
    'revision',
    'rounds',
    'scheduling',
    'targets',
    'threshold-ms',
    'timeout-ms',
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new TypeError(`Unexpected argument: ${argument}`);
    const equals = argument.indexOf('=');
    const name = argument.slice(2, equals === -1 ? undefined : equals);
    if (booleans.has(name)) {
      if (equals !== -1) throw new TypeError(`--${name} does not take a value`);
      options[name] = true;
      continue;
    }
    if (!values.has(name)) throw new TypeError(`Unknown option: --${name}`);

    const value = equals === -1 ? args[index += 1] : argument.slice(equals + 1);
    if (value === undefined || value.startsWith('--')) throw new TypeError(`--${name} requires a value`);
    options[name] = value;
  }
  return options;
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

function positiveNumber(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new RangeError(`--${name} must be positive`);
  return parsed;
}

function percentage(value, name) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError(`--${name} must be between 0 and 100`);
  }
  return parsed;
}

export async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
    if (!options['base-url'] || !options.output) throw new TypeError('--base-url and --output are required');

    await assertOutputDoesNotExist(options.output, options.force === true);

    const rounds = positiveNumber(options.rounds, 2, 'rounds');
    if (!Number.isInteger(rounds)) throw new RangeError('--rounds must be an integer');
    const timeoutMs = positiveNumber(options['timeout-ms'], 12_000, 'timeout-ms');
    const thresholdMs = positiveNumber(options['threshold-ms'], 200, 'threshold-ms');
    const minimumUnderThreshold = percentage(
      options['min-under-threshold-pct'],
      'min-under-threshold-pct',
    );
    const scheduling = options.scheduling ?? 'serial';
    if (!['serial', 'parallel'].includes(scheduling)) {
      throw new TypeError('--scheduling must be serial or parallel');
    }

    const targetsPath = path.resolve(options.targets ?? 'scripts/perf/ttfb-targets.json');
    const manifest = JSON.parse(await readFile(targetsPath, 'utf8'));
    const targets = resolveTargets(manifest, options['base-url']);
    const observations = await runPairedProbe(targets, {
      rounds,
      scheduling,
      measureOptions: { timeoutMs },
    });
    const summary = summarizeTtfb(observations, { thresholdMs });
    const artifact = {
      schemaVersion: 1,
      metadata: {
        generatedAt: new Date().toISOString(),
        label: options.label ?? null,
        revision: options.revision ?? process.env.GITHUB_SHA ?? null,
        baseUrl: new URL(options['base-url']).origin,
        nodeVersion: process.version,
        targetManifest: {
          path: targetsPath,
          name: manifest.name ?? null,
          population: manifest.population ?? null,
        },
        rounds,
        requestsPerTarget: rounds * 2,
        scheduling,
        mode: scheduling === 'serial' ? 'paired-baseline' : 'parallel-stress',
        timeoutMs,
        thresholdMs,
        bodyHandling: 'GET response body cancelled immediately after response headers',
        cacheClassification: 'Explicit cache headers only; pair position never implies cache state',
      },
      targets,
      summary,
      observations,
    };
    const outputPath = await writeArtifactAtomic(options.output, artifact, {
      force: options.force === true,
    });

    const transportPassed = summary.overall.failedResponses === 0;
    const populationPassed = minimumUnderThreshold === null
      || summary.overall.underThresholdPct >= minimumUnderThreshold;
    const corePassed = options['require-core-under-threshold'] !== true
      || summary.core.underThresholdPct === 100;

    console.log(JSON.stringify({
      outputPath,
      metadata: artifact.metadata,
      summary,
      acceptance: {
        transportPassed,
        minimumUnderThreshold,
        populationPassed,
        requireCoreUnderThreshold: options['require-core-under-threshold'] === true,
        corePassed,
        passed: transportPassed && populationPassed && corePassed,
      },
    }, null, 2));

    if (!transportPassed || !populationPassed || !corePassed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
