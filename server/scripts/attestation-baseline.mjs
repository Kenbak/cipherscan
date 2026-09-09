#!/usr/bin/env node
// Offline build tooling only: never imported by the observer or public API.
import { readFile, writeFile, mkdir, copyFile, readdir, realpath } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchAttestation, observeEndpoint, checkRelease } from '../lib/attestation-verifier.mjs';
import store from '../lib/attestation-store.js';

const recipes = JSON.parse(await readFile(new URL('../data/attestation-build-inputs.json', import.meta.url)));
export const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
  return value;
}
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
function endpointFor(id) {
  const endpoint = store.registry.find((entry) => entry.id === id);
  if (!endpoint) throw new Error('Unknown endpoint');
  return endpoint;
}
export function assertRecipe(endpoint, manifest) {
  const expected = recipes.endpoints[endpoint.id];
  if (!expected || !endpoint.sourceUrl) throw new Error('No pinned source mapping; obtain operator build inputs first');
  if (canonical(manifest) !== canonical(expected)) throw new Error('Build manifest changed; review and pin the new inputs before rebuilding');
  const source = manifest.app_source;
  const normalize = (url) => url.replace(/\.git$/, '');
  if (!/^[a-f0-9]{40}$/.test(source.commit) || source.urls.length !== 1
    || normalize(source.urls[0]) !== normalize(endpoint.sourceUrl)) throw new Error('Invalid source mapping');
  return expected;
}
export function baselineFromPublished(endpoint, record, referenceUrl) {
  if (record.sourceUrl !== endpoint.sourceUrl) throw new Error('Published source does not match the endpoint registry');
  const url = new URL(referenceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Use an authenticated HTTPS release reference');
  const baseline = { authority: 'published', commit: record.commit, referenceUrl, pcrs: record.pcrs };
  checkRelease(record.pcrs, baseline);
  return baseline;
}
export function baselineFromReproduction(endpoint, manifest, trusted, referenceUrl, startedAt, now = Date.now()) {
  assertRecipe(endpoint, manifest);
  const pcrs = Object.fromEntries(['PCR0', 'PCR1', 'PCR2'].map((key) => [key, trusted[key.toLowerCase()]]));
  const baseline = baselineFromPublished(endpoint, { sourceUrl: endpoint.sourceUrl, commit: manifest.app_source.commit, pcrs }, referenceUrl);
  const verifiedAt = Date.parse(trusted.verified_at);
  if (!Number.isFinite(verifiedAt) || verifiedAt < startedAt || verifiedAt > now + 30_000
    || trusted.tls?.domain !== endpoint.hostname || !/^[a-f0-9]{64}$/.test(trusted.tls.certfp ?? '')) {
    throw new Error('Fresh source-backed verification with TLS binding is required');
  }
  return { ...baseline, authority: 'reproduced' };
}
async function run(program, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(program, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '';
    const capture = (chunk) => {
      if (output.length < 4 * 1024 * 1024) output += chunk.toString();
      process.stdout.write(chunk);
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, 70 * 60_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolvePromise({ code, output }); });
  });
}
async function findManifests(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    // Only inspect the CLI build cache; do not follow source-created symlinks.
    if (entry.isDirectory()) {
      if (entry.name === 'eif-stage') found.push(join(path, 'manifest.json'));
      else if (!['app', 'enclave', '.git', 'node_modules'].includes(entry.name)) found.push(...await findManifests(path));
    }
  }
  return found;
}
async function assertLiveMatch(endpoint, baseline) {
  const observed = await observeEndpoint({ ...endpoint, baseline });
  if (observed.evidence !== 'verified' || observed.tlsBinding !== 'matched'
    || !['published_match', 'reproduced_match'].includes(observed.release)) throw new Error(`Fresh verification did not match baseline: ${observed.errorCode || observed.release}`);
  return observed;
}
export async function main(args) {
  const [mode, id, ...rest] = args;
  const endpoint = endpointFor(id);
  if (mode === 'inspect') {
    const [output] = rest;
    if (!output) throw new Error('inspect ENDPOINT OUTPUT.json');
    const { body } = await fetchAttestation(endpoint.hostname, randomBytes(32));
    await save(output, { endpointId: id, unsigned: true, manifest: body.manifest ?? null,
      manifestSha256: sha256(canonical(body.manifest ?? null)) });
    return;
  }
  if (mode === 'published') {
    const [input, referenceUrl, output] = rest;
    if (!output) throw new Error('published ENDPOINT RECORD.json RELEASE_HTTPS_URL OUTPUT.json');
    const raw = await readFile(input);
    const baseline = baselineFromPublished(endpoint, JSON.parse(raw), referenceUrl);
    const observation = await assertLiveMatch(endpoint, baseline);
    await save(output, { version: 1, endpointId: id, hostname: endpoint.hostname, sourceUrl: endpoint.sourceUrl,
      baseline, observation, evidence: { publishedRecordSha256: sha256(raw) }, activation: 'Review provenance, then copy baseline into the registry; this command does not activate it.' });
    return;
  }
  if (mode !== 'reproduce' || rest.length !== 4) throw new Error('reproduce ENDPOINT CAUTION_BINARY APP_CHECKOUT NEW_OUTPUT_DIR EVIDENCE_HTTPS_URL');
  const [binary, checkout, output, referenceUrl] = rest;
  const outputDir = resolve(output);
  await mkdir(outputDir, { recursive: false }); // Fresh directory prevents old trusted files from being reused.
  const startedAt = Date.now();
  const { body } = await fetchAttestation(endpoint.hostname, randomBytes(32));
  const manifest = assertRecipe(endpoint, body.manifest);
  await save(join(outputDir, 'input-manifest.json'), manifest);
  const sourceArchive = join(outputDir, 'source.tar.gz');
  const archive = await run('git', ['-C', resolve(checkout), 'archive', '--format=tar.gz', `--output=${sourceArchive}`, manifest.app_source.commit]);
  if (archive.code !== 0) throw new Error('Pinned source commit is unavailable');
  const cacheDir = join(outputDir, 'build-cache');
  await mkdir(cacheDir);
  const result = await run(resolve(binary), ['verify', '--attestation-url', `https://${endpoint.hostname}/attestation`, '--from-tarball', sourceArchive, '--no-cache'],
    { cwd: outputDir, env: { ...process.env, CAUTION_WORKDIR: cacheDir } });
  await writeFile(join(outputDir, 'verify.log'), result.output);
  if (result.code !== 0) throw new Error(`Caution reproduction failed (${result.code}); see verify.log`);
  const manifests = await findManifests(cacheDir);
  if (manifests.length !== 1) throw new Error('Expected exactly one fresh enclave build manifest');
  // Check what was actually built, closing the preflight/CLI-fetch metadata race.
  const builtPath = await realpath(manifests[0]);
  if (!builtPath.startsWith(`${await realpath(cacheDir)}${sep}`)) throw new Error('Build manifest escaped cache');
  const builtManifest = await json(builtPath);
  assertRecipe(endpoint, builtManifest);
  const trustedPath = join(outputDir, '.caution', 'trusted_hashes.json');
  const trusted = await json(trustedPath);
  const baseline = baselineFromReproduction(endpoint, builtManifest, trusted, referenceUrl, startedAt);
  const observation = await assertLiveMatch(endpoint, baseline);
  await copyFile(trustedPath, join(outputDir, 'trusted_hashes.json'));
  await copyFile(builtPath, join(outputDir, 'built-manifest.json'));
  await copyFile(join(resolve(builtPath, '..'), 'Containerfile.eif'), join(outputDir, 'Containerfile.eif'));
  await save(join(outputDir, 'candidate.json'), { version: 1, endpointId: id, hostname: endpoint.hostname, sourceUrl: endpoint.sourceUrl,
    baseline, observation, evidence: { cautionCommit: recipes.cautionCommit, cautionBinarySha256: sha256(await readFile(binary)),
      sourceArchiveSha256: sha256(await readFile(sourceArchive)), manifestSha256: sha256(canonical(builtManifest)),
      trustedStateSha256: sha256(await readFile(trustedPath)), verifiedAt: trusted.verified_at },
    activation: 'Review build evidence, then copy baseline into the registry; this job cannot publish or activate a release.' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
