'use strict';
const p = require('../../bot/lib/editorial-policy');
const { addDays } = require('../../lib/transaction-activity');
const target = '2026-09-30';
const rows = (prior, latest) => Array.from({ length: 31 }, (_, i) => ({ date: addDays(target, i - 30), value: i === 30 ? latest : prior }));
const flow = { amount_zat: '89999975000', sample_count: 10000, greater_count: 4, equal_count: 2, pool: 'ironwood', txid: 'a'.repeat(64), block_time: 1790812800 };
const stories = [
  p.flowStory({ ...flow, flow_type: 'shield' }),
  p.flowStory({ ...flow, flow_type: 'deshield', pool: 'mixed' }),
  p.swapStory({ id: 1, source_amount_usd: 1500000, source_chain: 'zec', dest_chain: 'sol', sample_count: 10000, greater_count: 2, equal_count: 1, zec_txid: 'b'.repeat(64), swap_created_at: '2026-09-30T10:00:00Z' }),
  p.dailyActivity({ days: rows(0,0).map((r,i) => ({ date:r.date, shielded:i===30?90:50, transparent:i===30?10:50, fully_shielded:20 })) }, target),
  p.weeklyActivity({ week: '2026-09-21', metadata: { period: { start: '2026-09-21', endExclusive: '2026-09-28' }, metrics: [{ noteworthy: true, metric: 'fully_shielded', value: 140321, rank: 12, tied: true, changePct: 102.3 }] } }),
  p.hashStory({ method: 'target-work-v1', window: '7d', points: Array.from({ length: 31 }, (_, i) => ({ date: `${addDays('2026-10-01', i-30)}T00:00:00.000Z`, method: 'target-work-v1', windowSeconds: 604800, unavailableReason: null, hashrate: i===30?3e10:2e10 })) }, { target, genesisComplete: false }),
  ...['mvrv', 'exchange_deposit_zat', 'daily_fees_zat', 'shield_volume_zat', 'deshield_volume_zat'].map(metric => p.signalStory(metric, rows(metric==='mvrv'?2:1e11, metric==='mvrv'?3:3e11), target)),
  p.candidate('migration','migration:c', '10,000 ZEC entered Ironwood in a pool migration with an Orchard withdrawal.\nNo transparent inputs or outputs; this is not new shielding.\nhttps://zecblock.com/tx/'+'c'.repeat(64), { amount_zat: '1000000000000', block_time:1790812800 }),
  p.candidate('reorg','reorg:1','Zcash chain reorganization detected: depth 2, fork height 3500000.\nRecent transaction confirmations can change as the canonical chain changes.\nhttps://zecblock.com/network', { depth:2, fork_height:3500000, detected_at:'2026-09-30T10:00:00Z' }),
  p.candidate('crosschain_daily',`analysis:crosschain:${target}`,`NEAR 1Click ZEC swaps, ${target} UTC:\n$2,000,000 in / $3,000,000 out; net $1,000,000 out.\nTop route by USD: ZEC -> SOL. Largest swap: $1,500,000.\nObserved completed external routes; reported source USD.\nhttps://zecblock.com/crosschain`, { inflow: '2000000', outflow:'3000000' }),
];
module.exports = stories;
