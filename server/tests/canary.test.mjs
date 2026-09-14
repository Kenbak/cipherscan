import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { confirmedCheck } from '../jobs/check-canary.mjs';
import statuses from '../../lib/canary-status.js';
import canary from '../lib/canary.js';
import policies from '../canary/config.js';
const require = createRequire(import.meta.url);
const NOW = Date.parse('2026-09-14T00:00:00Z');
const config = policies.canaryConfig('mainnet'), target = config.targets[0];
function fixture() {
  const tls = { attested_mode: 'tls', attested_domain: new URL(target.attestation_url).hostname, attested_certfp: 'a'.repeat(64), observed_certfp: 'a'.repeat(64) };
  const before = { payload: { target_id: target.id, target_origin: new URL(target.attestation_url).origin, verifier_id: config.node_id, status: 'VERIFIED', reason: 'ALL_CHECKS_PASSED', observed_at: new Date(NOW - 10_000).toISOString(), issued_at: new Date(NOW - 10_000).toISOString(), expires_at: new Date(NOW + 170_000).toISOString(), tls } };
  return { target, config, before, after: structuredClone(before), checkedAt: new Date(NOW).toISOString(),
    deployment: { status: 'VERIFIED', reason: 'ALL_CHECKS_PASSED', tls, pcrs: { evidence_authentication: 'verified', observed: target.expected_pcrs, expected: target.expected_pcrs, matches: { 0: true, 1: true, 2: true } } },
    summary: { id: target.id, status: 'VERIFIED', observed_at: before.payload.observed_at, transport_warning: null } };
}
test('Canary checks bind reviewed PCRs, TLS, identity, stable signed observation and bounded lifetime', () => {
  const args = fixture();
  const check = confirmedCheck(args);
  assert.equal(statuses.canaryStatus(check, NOW), 'verified');
  for (const mutate of [
    f => { f.after.payload.reason = 'OTHER'; },
    f => { f.before.payload.verifier_id = f.after.payload.verifier_id = 'wrong'; },
    f => { f.deployment.pcrs = { ...f.deployment.pcrs, observed: { 0: 'b'.repeat(96) } }; },
    f => { f.deployment.pcrs.evidence_authentication = 'unverified'; },
    f => { f.before.payload.expires_at = f.after.payload.expires_at = new Date(NOW + 600_000).toISOString(); },
    f => { f.before.payload.expires_at = f.after.payload.expires_at = new Date(NOW - 1).toISOString(); },
    f => { f.before.payload.observed_at = f.after.payload.observed_at = new Date(NOW - 200_000).toISOString(); },
    f => { f.before.payload.tls.attested_certfp = f.after.payload.tls.attested_certfp = 'b'.repeat(64); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => confirmedCheck(f)); }
});
test('latest transport warning, missing telemetry, signed expiry and stopped reporter never remain green', () => {
  const f = fixture(); f.summary.transport_warning = 'TIMEOUT';
  assert.equal(statuses.canaryStatus(confirmedCheck(f), NOW), 'warning');
  f.summary = null;
  assert.equal(statuses.canaryStatus(confirmedCheck(f), NOW), 'warning');
  const c = confirmedCheck(fixture());
  assert.equal(statuses.canaryStatus(c, NOW + 120_000), 'stale');
  assert.equal(statuses.canaryStatus({ ...c, expiresAt: new Date(NOW).toISOString() }, NOW), 'stale');
  assert.equal(statuses.canaryStatus({ ...c, verified: false }, NOW), 'unavailable');
});
test('report from another network or an obsolete registry policy cannot surface a verified check', () => {
  const check = confirmedCheck(fixture());
  const data = () => ({ network: 'mainnet', endpoints: [{ id: target.id }, { id: 'caution-hub' }] });
  const snapshot = { version: 1, network: 'mainnet', config, targets: [check] };
  assert.equal(canary.attachCanary(data(), snapshot, NOW).endpoints[0].canary.displayStatus, 'verified');
  assert.equal(canary.attachCanary(data(), snapshot, NOW).endpoints[1].canary, null);
  assert.equal(canary.attachCanary(data(), { ...snapshot, network: 'testnet' }, NOW).endpoints[0].canary.displayStatus, 'unavailable');
  assert.equal(canary.attachCanary(data(), { ...snapshot, config: { ...config, targets: [] } }, NOW).endpoints[0].canary.displayStatus, 'unavailable');
});
test('Canary protocol routes preserve bytes and reject unregistered or other-network targets', async () => {
  const express = require('../api/node_modules/express');
  const { createAttestationRouter } = require('../api/routes/attestations');
  const seen = [];
  const app = express();
  app.use(createAttestationRouter({ network: 'mainnet', artifact: async path => { seen.push(path); return Buffer.from('{"canonical":true}'); } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/keys.json');
    assert.equal(await response.text(), '{"canonical":true}');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    for (const path of ['/targets/caution-hub/statement', '/targets/zecrocks-testnet/statement', '/targets/unknown/evidence']) assert.equal((await fetch(base + path)).status, 404);
    assert.deepEqual(seen, ['/keys.json']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
