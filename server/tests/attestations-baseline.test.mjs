import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonical, assertRecipe, baselineFromPublished, baselineFromReproduction } from '../scripts/attestation-baseline.mjs';
import store from '../lib/attestation-store.js';
const recipes = JSON.parse(await readFile(new URL('../data/attestation-build-inputs.json', import.meta.url)));
const endpoint = store.registry.find((entry) => entry.id === 'shieldedlabs-hub');
const manifest = recipes.endpoints[endpoint.id];
const pcrs = { PCR0: '1'.repeat(96), PCR1: '2'.repeat(96), PCR2: '3'.repeat(96) };
const record = { sourceUrl: endpoint.sourceUrl, commit: manifest.app_source.commit, pcrs };
const url = 'https://github.com/ShieldedLabs/zero-hub/releases/tag/example';
const now = Date.parse('2026-09-09T09:00:00Z');
const trusted = { pcr0: pcrs.PCR0, pcr1: pcrs.PCR1, pcr2: pcrs.PCR2, verified_at: new Date(now).toISOString(), tls: { domain: endpoint.hostname, certfp: 'a'.repeat(64) } };

test('all reproduction recipes pin the registered source; a manifest is not a release baseline', () => {
  for (const [id, recipe] of Object.entries(recipes.endpoints)) {
    const registered = store.registry.find((entry) => entry.id === id);
    assertRecipe(registered, recipe);
    assert.equal(registered.baseline, null);
  }
  assert.throws(() => assertRecipe(store.registry.find((entry) => entry.id === 'caution-hub'), {}), /No pinned source/);
  assert.equal(canonical({ b: 1, a: [2, 3] }), canonical({ a: [2, 3], b: 1 }));
});
test('changed commands, framework, commit or source cannot become reproduced baselines', () => {
  for (const field of ['run_command', 'framework_source', 'app_source']) {
    assert.throws(() => assertRecipe(endpoint, { ...manifest, [field]: 'changed' }), /manifest changed/);
  }
});
test('published baselines require complete measurements, source identity and HTTPS provenance', () => {
  assert.equal(baselineFromPublished(endpoint, record, url).authority, 'published');
  for (const changed of [{ ...record, sourceUrl: 'https://example.com/fake' }, { ...record, commit: 'main' }, { ...record, pcrs: { ...pcrs, PCR1: '0'.repeat(96) } }]) {
    assert.throws(() => baselineFromPublished(endpoint, changed, url));
  }
  assert.throws(() => baselineFromPublished(endpoint, record, 'http://example.com/release'));
  assert.throws(() => baselineFromPublished(endpoint, record, 'https://user:secret@example.com/release'));
});
test('reproductions reject reused trusted state, missing TLS and wrong domains', () => {
  assert.equal(baselineFromReproduction(endpoint, manifest, trusted, url, now - 1, now).authority, 'reproduced');
  for (const changed of [{ ...trusted, tls: null }, { ...trusted, tls: { ...trusted.tls, domain: 'example.com' } }, { ...trusted, verified_at: new Date(now - 60_000).toISOString() }, { ...trusted, verified_at: new Date(now + 60_000).toISOString() }]) {
    assert.throws(() => baselineFromReproduction(endpoint, manifest, changed, url, now - 1, now));
  }
});
test('API Docker context includes registry and shared freshness module', async () => {
  const dockerfile = await readFile(new URL('../api/Dockerfile', import.meta.url), 'utf8');
  const ignores = await readFile(new URL('../api/Dockerfile.dockerignore', import.meta.url), 'utf8');
  for (const path of ['server/data/attestation-endpoints.json', 'lib/attestation-status.js']) {
    assert.ok(dockerfile.includes(`COPY ${path} `));
    assert.ok(ignores.includes(`!${path}\n`));
  }
});
