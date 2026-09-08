const express = require('express');
const { readSnapshot, publicSnapshot } = require('../../lib/attestation-store');

function createAttestationRouter({ read = readSnapshot, network = process.env.ZCASH_NETWORK || process.env.NETWORK || 'mainnet', now = Date.now } = {}) {
  const router = express.Router();
  const configuredNetwork = network.toLowerCase();
  if (!['mainnet', 'testnet', 'crosslink-testnet'].includes(configuredNetwork)) throw new Error('Invalid attestation network');
  router.get(['/api/network/attestations', '/api/network/attestations/:id'], async (req, res) => {
    res.set('X-Robots-Tag', 'noindex, follow');
    // Dynamic freshness must not be hidden by a stale CDN success.
    res.set('Cache-Control', 'no-store');
    let snapshot = null;
    try { snapshot = await read(); } catch { /* Keep endpoint registry visible when the collector has no data. */ }
    const data = publicSnapshot(snapshot, configuredNetwork, now());
    if (req.params.id) {
      const endpoint = data.endpoints.find((entry) => entry.id === req.params.id);
      if (!endpoint) return res.status(404).json({ success: false, error: 'Unknown attestation endpoint', network: configuredNetwork });
      return res.json({ ...data, endpoints: undefined, endpoint });
    }
    return res.json(data);
  });
  return router;
}
module.exports = { createAttestationRouter };
