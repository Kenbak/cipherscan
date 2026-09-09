#!/usr/bin/env node
// Local-only preview of the real observer/API. No DB, chain RPC or credentials.
const express = require('../api/node_modules/express');
const cors = require('../api/node_modules/cors');
const { createAttestationRouter } = require('../api/routes/attestations');
process.env.ATTESTATION_SNAPSHOT_PATH ||= '/tmp/cipherscan-attestations-snapshot.json';
const app = express();
app.use(cors({ origin: ['http://127.0.0.1:3101', 'http://localhost:3101'] }));
app.use(createAttestationRouter());
// Keep the existing explorer shell usable in this isolated preview. Forward
// only public GET reads to the selected fixed backend, without credentials.
app.use(async (req, res) => {
  if (req.method !== 'GET' || !req.path.startsWith('/api/') || req.path.startsWith('/api/network/attestations')) return res.sendStatus(404);
  const network = process.env.ZCASH_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
  try {
    const response = await fetch(`https://api.${network}.cipherscan.app${req.originalUrl}`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    const body = await response.text();
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) return res.sendStatus(502);
    res.status(response.status).type('application/json').send(body);
  } catch { res.status(502).json({ success: false, error: 'Public preview data unavailable' }); }
});
const server = app.listen(3102, '127.0.0.1', () => console.log('Attestation preview API: http://127.0.0.1:3102/api/network/attestations'));
let running = false;
async function refresh() {
  if (running) return;
  running = true;
  try { await (await import('../jobs/check-attestations.mjs')).collectAttestations(); }
  catch { console.error('Preview collection failed; previous snapshot retained.'); }
  finally { running = false; }
}
refresh();
const timer = setInterval(refresh, 300_000);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); server.close(); });
