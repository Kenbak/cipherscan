const { readFile, stat } = require('node:fs/promises');
const { canaryConfig } = require('../canary/config.js');
const { canaryStatus } = require('../../lib/canary-status');
const ORIGIN = 'http://127.0.0.1:3187';
const SNAPSHOT = '/var/lib/cipherscan/canary-observations/snapshot.json';
async function fetchArtifact(path) {
  // Callers use only fixed paths or registry IDs. No caller-controlled origins.
  if (!/^\/(?:keys\.json|config\.json|status\.json|targets\/[a-zA-Z0-9_-]+\/(?:statement|evidence|history))$/.test(path)) throw new Error('Invalid Canary artifact');
  const response = await fetch(ORIGIN + path, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Canary artifact unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 512 * 1024) throw new Error('Canary artifact too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readCanarySnapshot(path = process.env.CANARY_SNAPSHOT_PATH || SNAPSHOT) {
  if ((await stat(path)).size > 128 * 1024) throw new Error('Canary snapshot too large');
  return JSON.parse(await readFile(path, 'utf8'));
}
function attachCanary(data, snapshot, now = Date.now()) {
  const config = ['mainnet', 'testnet'].includes(data.network) ? canaryConfig(data.network) : null;
  // A report is usable only for precisely the currently reviewed target policy.
  const usable = snapshot?.version === 1 && snapshot.network === data.network
    && JSON.stringify(snapshot.config) === JSON.stringify(config)
    && Array.isArray(snapshot.targets);
  data.canary = { trust: 'operator-pinned', runtimeAttested: false, pollIntervalMs: 60_000 };
  for (const endpoint of data.endpoints) {
    if (!config?.targets.some(t => t.id === endpoint.id)) { endpoint.canary = null; continue; }
    const check = usable ? snapshot.targets.find(t => t.id === endpoint.id) : null;
    endpoint.canary = check || { checkedAt: null, verified: false, status: 'UNAVAILABLE', expiresAt: null, observedAt: null, transportWarning: null };
    endpoint.canary.displayStatus = canaryStatus(endpoint.canary, now);
  }
  return data;
}
module.exports = { ORIGIN, fetchArtifact, readCanarySnapshot, attachCanary };
