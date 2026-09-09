// Export only independently reproduced policies. Never learn PCRs from a live target.
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync(new URL('../../data/attestation-endpoints.json', import.meta.url)));
const targets = ['zecrocks-mainnet', 'zecrocks-testnet'].map(id => {
  const entry = registry.find(item => item.id === id);
  if (entry?.baseline?.authority !== 'reproduced') throw new Error(`Missing reproduced baseline: ${id}`);
  const expected_pcrs = Object.fromEntries([0, 1, 2].map(index => {
    const value = entry.baseline.pcrs[`PCR${index}`];
    if (!/^[a-f0-9]{96}$/.test(value) || /^0+$/.test(value)) throw new Error(`Invalid PCR${index}: ${id}`);
    return [index, value];
  }));
  return { id, name: `CipherScan evaluation: ${entry.name} ${entry.network}`, attestation_url: `https://${entry.hostname}/attestation`, e2e_mode: 'tls', expected_pcrs };
});
if (process.argv.includes('--negative-control')) {
  const wrong = structuredClone(targets[0]);
  wrong.id = 'negative-wrong-pcr';
  wrong.name = 'Evaluation negative control: must fail PCR comparison';
  wrong.expected_pcrs['0'] = '1'.repeat(96);
  targets.push(wrong);
}
console.log(JSON.stringify({ version: 0, node_id: 'cipherscan-canary-evaluation', probe_interval_seconds: 60, history_limit: 20, targets }, null, 2));
