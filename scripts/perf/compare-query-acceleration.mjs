#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const values = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (match) values[match[1]] = match[2];
  }
  for (const required of ['before-api', 'after-api', 'before-components', 'after-components', 'output']) {
    if (!values[required]) throw new Error(`--${required}=path is required`);
  }
  return values;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

function componentFixtures(artifact) {
  return {
    'network-ready-cold': artifact.results.network.cold.summary.readyMs.p50,
    'network-ready-warm': artifact.results.network.warm.summary.readyMs.p50,
    'ironwood-ready-cold': artifact.results.ironwood.cold.summary.readyMs.p50,
    'ironwood-ready-warm': artifact.results.ironwood.warm.summary.readyMs.p50,
  };
}

function apiFixtures(artifact) {
  return Object.fromEntries(Object.entries(artifact.results).map(([id, result]) => [
    `${id}-api`,
    result.summary.totalMs.p50,
  ]));
}

function validateArtifact(artifact, kind) {
  const runs = kind === 'api' ? artifact.runs : artifact.runsPerCacheMode;
  if (!Number.isInteger(runs) || runs < 30) {
    throw new Error(`${kind} artifact must contain at least 30 samples per fixture`);
  }
}

const options = parseArgs(process.argv.slice(2));
const [beforeApi, afterApi, beforeComponents, afterComponents] = await Promise.all([
  readJson(options['before-api']),
  readJson(options['after-api']),
  readJson(options['before-components']),
  readJson(options['after-components']),
]);
validateArtifact(beforeApi, 'api');
validateArtifact(afterApi, 'api');
validateArtifact(beforeComponents, 'components');
validateArtifact(afterComponents, 'components');

const before = { ...apiFixtures(beforeApi), ...componentFixtures(beforeComponents) };
const after = { ...apiFixtures(afterApi), ...componentFixtures(afterComponents) };
if (JSON.stringify(Object.keys(before).sort()) !== JSON.stringify(Object.keys(after).sort())) {
  throw new Error('Before/after benchmark fixture populations differ');
}

const fixtures = Object.keys(before).sort().map((id) => {
  const speedup = before[id] / after[id];
  return {
    id,
    beforeP50Ms: before[id],
    afterP50Ms: after[id],
    speedup: Number(speedup.toFixed(4)),
    fasterPercent: Number(((1 - after[id] / before[id]) * 100).toFixed(1)),
  };
});
const geometricSpeedup = Math.exp(
  fixtures.reduce((sum, fixture) => sum + Math.log(fixture.speedup), 0) / fixtures.length,
);
const fasterPercent = (1 - 1 / geometricSpeedup) * 100;
const result = {
  schemaVersion: 1,
  calculatedAt: new Date().toISOString(),
  methodology: 'Equal-weight geometric mean of predeclared p50 API and browser-readiness fixtures',
  fixtureCount: fixtures.length,
  geometricSpeedup: Number(geometricSpeedup.toFixed(4)),
  fasterPercent: Number(fasterPercent.toFixed(1)),
  fixtures,
};

await writeFile(resolve(options.output), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

