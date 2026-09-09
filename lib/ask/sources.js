/* Fixed public reads shared by browser charts and server explanations. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { analysisSchema } = require('./contract');
const { normalizeEvidence } = require('./data');

function sourceRequest(input) {
  const spec = analysisSchema.parse(input);
  const days = spec.period === '1y' ? 365 : Number(spec.period.slice(0, -1));
  if (spec.metric.startsWith('chain_')) return { path: '/v1/crosschain/volume-by-chain', legacy: '/api/crosschain/volume-by-chain', query: { period: spec.period } };
  if (spec.metric.startsWith('swap_')) return { path: '/v1/crosschain/trends', legacy: '/api/crosschain/trends', query: { period: spec.period, granularity: 'daily' } };
  if (spec.metric === 'transactions') return { path: '/v1/privacy/stats', legacy: '/api/privacy-stats', query: { days: String(days) } };
  if (spec.metric === 'pulse') return { path: '/v1/pulse', legacy: '/api/pulse', query: { days: String(days), limit: '200', offset: '0' } };
  const balances = ['balances', 'migration_share'].includes(spec.metric);
  return { path: `/v1/shielded-pools/${balances ? 'history' : 'flows'}`, legacy: balances ? '/api/network/pool-history' : '/api/pools/flows', query: { period: spec.period, format: 'zatoshi', ...(!balances ? { pool: spec.pool, granularity: 'daily' } : {}) } };
}

async function loadEvidence(spec, request) {
  const source = sourceRequest(spec);
  const first = await request(source);
  if (first.meta.network !== 'mainnet') throw new Error('Wrong source network');
  let data = first.data;
  if (spec.metric === 'pulse') {
    const total = data.total;
    if (!Number.isSafeInteger(total) || total < 0 || total > 5000 || !Array.isArray(data.events)) throw new Error('Unsupported Pulse response');
    const events = [...data.events];
    while (events.length < total) {
      if (!events.length || events.length % 200 !== 0) throw new Error('Incomplete Pulse page');
      const next = await request({ ...source, query: { ...source.query, offset: String(events.length) } });
      if (next.meta.network !== 'mainnet' || next.data.total !== total || !Array.isArray(next.data.events) || !next.data.events.length || next.data.events.length > 200) throw new Error('Pulse changed during pagination');
      events.push(...next.data.events);
    }
    if (events.length !== total) throw new Error('Incomplete Pulse history');
    data = { ...data, events };
  }
  return normalizeEvidence(spec, data, first.meta);
}

module.exports = { sourceRequest, loadEvidence };
