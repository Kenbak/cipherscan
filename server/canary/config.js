// Expected measurements come only from independently reproduced registry entries.
const registry = require('../data/attestation-endpoints.json');
function canaryConfig(network) {
  if (!['mainnet', 'testnet'].includes(network)) throw new Error('Invalid Canary network');
  const targets = registry.filter(e => e.network === network && e.baseline?.authority === 'reproduced').map(e => ({
    id: e.id, name: `${e.name} ${e.network}`, attestation_url: `https://${e.hostname}/attestation`, e2e_mode: 'tls',
    expected_pcrs: Object.fromEntries([0, 1, 2].map(i => {
      const value = e.baseline.pcrs[`PCR${i}`];
      if (!/^[a-f0-9]{96}$/.test(value) || /^0+$/.test(value)) throw new Error('Invalid reproduced measurements');
      return [i, value];
    })),
  }));
  if (!targets.length) throw new Error('No reproduced Canary targets');
  return { version: 0, node_id: `cipherscan-${network}`, probe_interval_seconds: 60, history_limit: 1000, targets };
}
module.exports = { canaryConfig };
if (require.main === module) console.log(JSON.stringify(canaryConfig(process.argv[2]), null, 2));
