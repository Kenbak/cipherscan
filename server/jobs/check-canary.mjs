#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, rename, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import canary from '../lib/canary.js';
import configModule from '../canary/config.js';
const exec = promisify(execFile);
const CLI = process.env.CANARY_CLI || '/opt/cipherscan-canary/canaryctl';
const KEYS = process.env.CANARY_KEYS || '/etc/cipherscan-canary/keys.json';

export function confirmedCheck({ target, config, before, after, deployment, summary, checkedAt }) {
  const p = before?.payload;
  if (!isDeepStrictEqual(before, after) || !p || p.target_id !== target.id || p.target_origin !== new URL(target.attestation_url).origin
    || p.verifier_id !== config.node_id || p.status !== deployment?.status || p.reason !== deployment?.reason
    || !isDeepStrictEqual(p.tls ?? null, deployment.tls ?? null)) throw new Error('Inconsistent Canary result');
  const now = Date.parse(checkedAt), observed = Date.parse(p.observed_at), issued = Date.parse(p.issued_at), expires = Date.parse(p.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 30_000 || expires <= now || expires - issued > 180_000) throw new Error('Invalid Canary lifetime');
  if (p.status === 'VERIFIED') {
    if (!Number.isFinite(observed) || observed > now + 30_000 || now - observed >= 180_000
      || deployment.pcrs?.evidence_authentication !== 'verified'
      || !isDeepStrictEqual(deployment.pcrs.expected, target.expected_pcrs)
      || !isDeepStrictEqual(deployment.pcrs.observed, target.expected_pcrs)
      || ![0, 1, 2].every(i => deployment.pcrs.matches[i] === true)
      || p.tls?.attested_mode !== 'tls' || p.tls?.attested_domain !== new URL(target.attestation_url).hostname
      || !/^[a-f0-9]{64}$/.test(p.tls?.observed_certfp ?? '') || p.tls.attested_certfp !== p.tls.observed_certfp) throw new Error('Canary policy mismatch');
  }
  // status.json is operational telemetry, not a signed claim. Missing or newer
  // telemetry must never silently erase a warning or promote a retained success.
  const aligned = summary?.id === target.id && summary.status === p.status && summary.observed_at === p.observed_at;
  return { id: target.id, checkedAt, verified: true, status: p.status, reason: p.reason,
    observedAt: p.observed_at, expiresAt: p.expires_at,
    transportWarning: aligned ? summary.transport_warning ?? null : 'LATEST_ATTEMPT_UNCONFIRMED' };
}
async function runCli(args) {
  try { const r = await exec(CLI, [...args, '--json'], { timeout: 20_000, maxBuffer: 256 * 1024 }); return JSON.parse(r.stdout); }
  catch (error) { if (error.stdout) return JSON.parse(error.stdout); throw new Error('Canary verifier unavailable'); }
}
export async function collectCanary() {
  const network = process.env.ZCASH_NETWORK || 'mainnet';
  const config = configModule.canaryConfig(network);
  const checkedAt = new Date().toISOString();
  const targets = [];
  const temp = await mkdtemp(join(tmpdir(), 'cipherscan-canary-'));
  try {
    for (const target of config.targets) {
      let check = { id: target.id, checkedAt, verified: false, status: 'UNAVAILABLE', reason: 'VERIFICATION_UNAVAILABLE', observedAt: null, expiresAt: null, transportWarning: null };
      try {
        const remoteConfig = JSON.parse(await canary.fetchArtifact('/config.json'));
        if (!isDeepStrictEqual(remoteConfig.config, config)) throw new Error('Canary config differs from reviewed policy');
        const before = JSON.parse(await canary.fetchArtifact(`/targets/${target.id}/statement`));
        const result = await runCli(['verify', '--canary-url', canary.ORIGIN, '--skip-canary-attestation', '--allow-http', '--trusted-keys', KEYS, '--target', target.id]);
        // Only results from a completed cryptographic verification have a deployment.
        const deployment = result.result?.deployments?.find(d => d.id === target.id);
        if (!deployment || result.result.trust !== 'TOFU' || (deployment.status === 'VERIFIED' && !result.ok)) throw new Error('Canary verification failed');
        const after = JSON.parse(await canary.fetchArtifact(`/targets/${target.id}/statement`));
        const file = join(temp, `${target.id}.json`);
        await writeFile(file, JSON.stringify(after), { mode: 0o600 });
        const signed = await runCli(['verify-statement', '--statement', file, '--trusted-keys', KEYS]);
        if (!signed.ok) throw new Error('Canary signatures failed');
        const status = JSON.parse(await canary.fetchArtifact('/status.json'));
        check = confirmedCheck({ target, config, before, after, deployment, summary: status.targets?.find(t => t.id === target.id), checkedAt });
      } catch { /* Replace any previous success with explicitly unavailable verification. */ }
      targets.push(check);
    }
    const snapshot = { version: 1, network, config, checkedAt, targets };
    const path = process.env.CANARY_SNAPSHOT_PATH || '/var/lib/cipherscan/canary-observations/snapshot.json';
    await mkdir(dirname(path), { recursive: true, mode: 0o750 });
    await writeFile(`${path}.tmp`, JSON.stringify(snapshot) + '\n', { mode: 0o640 });
    await rename(`${path}.tmp`, path);
    console.log(JSON.stringify({ checkedAt, targets: targets.map(t => ({ id: t.id, verified: t.verified, status: t.status, warning: t.transportWarning })) }));
    return snapshot;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) collectCanary().catch(() => { console.error('Canary report unavailable'); process.exitCode = 1; });
