'use strict';
const { parseDay } = require('./utxo-age');
const DAY = 86400;
const METHOD = 'transparent-utxo-day-close-v1';
const BUCKETS = ['lt_1m','b_1_3m','b_3_6m','b_6_12m','b_1_2y','gt_2y'];
const dateOf = day => new Date(day * DAY * 1000).toISOString().slice(0,10);
// Integer arithmetic through USD valuation: zatoshis × USD prices in 1/10,000 dollars.
function priceUnits(value) {
  if (!/^\d+(\.\d{1,4})?$/.test(String(value))) throw new Error('Missing or invalid daily price');
  const [whole, fraction=''] = String(value).split('.');
  const units = BigInt(whole)*10000n + BigInt(fraction.padEnd(4,'0'));
  if (units <= 0n) throw new Error('Price must be positive');
  return units;
}
function usd(value) {
  return `${value / 1000000000000n}.${(value % 1000000000000n).toString().padStart(12,'0')}`;
}
// Queries touch one indexed UTC day. Missing inputs/outputs fail closed instead
// of silently lowering balances or a SOPR denominator. Block counts are checked
// separately against blocks.transaction_count by the caller.
const CREATIONS_SQL = `WITH tx AS MATERIALIZED (
 SELECT txid, vout_count FROM transactions WHERE block_time >= $1 AND block_time < $2
), counts AS (
 SELECT t.txid,t.vout_count,COUNT(o.txid) actual,
 COALESCE(SUM(o.value) FILTER(WHERE o.value>0),0)::numeric value,
 COUNT(*) FILTER(WHERE o.value>0) positive
 FROM tx t LEFT JOIN LATERAL (SELECT txid,value FROM transaction_outputs WHERE txid=t.txid OFFSET 0) o ON true
 GROUP BY t.txid,t.vout_count
) SELECT COALESCE(SUM(value),0)::text value_zat,COALESCE(SUM(positive),0)::text output_count,
 COUNT(*) FILTER(WHERE actual<>vout_count OR vout_count IS NULL)::int invalid FROM counts`;
const SPENDS_SQL = `WITH tx AS MATERIALIZED (
 SELECT txid,block_time,vin_count FROM transactions WHERE block_time >= $1 AND block_time < $2 AND NOT is_coinbase
), inputs AS MATERIALIZED (
 SELECT t.*,i.prev_txid,i.prev_vout,i.txid input_txid,
 COUNT(i.txid) OVER(PARTITION BY t.txid) actual_inputs
 FROM tx t LEFT JOIN LATERAL (SELECT txid,prev_txid,prev_vout FROM transaction_inputs WHERE txid=t.txid OFFSET 0) i ON true
), resolved AS (
 SELECT i.*,o.value,o.spent,o.spent_txid,origin.block_time created_time
 FROM inputs i LEFT JOIN LATERAL (SELECT value,spent,spent_txid FROM transaction_outputs WHERE txid=i.prev_txid AND vout_index=i.prev_vout OFFSET 0) o ON true
 LEFT JOIN LATERAL (SELECT block_time FROM transactions WHERE txid=i.prev_txid OFFSET 0) origin ON true
) SELECT (created_time/86400)::bigint created_day,
 COALESCE(SUM(value) FILTER(WHERE value>0),0)::text value_zat,
 COUNT(*) FILTER(WHERE value>0)::text output_count,
 COALESCE(SUM((value::numeric/1e8)*GREATEST(block_time-created_time,0)/86400.0) FILTER(WHERE value>0),0)::text cdd,
 COALESCE(SUM(GREATEST(block_time-created_time,0)::numeric/86400.0) FILTER(WHERE value>0),0)::text dormancy_sum,
 COUNT(*) FILTER(WHERE actual_inputs<>vin_count OR vin_count IS NULL OR
 (input_txid IS NOT NULL AND (prev_txid IS NULL OR value IS NULL OR created_time IS NULL OR spent IS DISTINCT FROM true OR spent_txid IS DISTINCT FROM txid)))::int invalid
 FROM resolved GROUP BY 1`;
function advance(previous, date, creation, spends, prices) {
  const day = parseDay(date);
  if (creation.invalid || spends.some(row=>row.invalid)) throw new Error('Incomplete canonical transparent inputs/outputs');
  const cohorts = new Map(previous.map(([d,v,n])=>[Number(d),{value:BigInt(v),count:BigInt(n)}]));
  const current = cohorts.get(day) || {value:0n,count:0n};
  current.value += BigInt(creation.value_zat); current.count += BigInt(creation.output_count); cohorts.set(day,current);
  let spentValue=0n,spentBasis=0n,spentCount=0n,cdd=0,dormancy=0;
  for(const row of spends) {
    const value=BigInt(row.value_zat), count=BigInt(row.output_count);
    if(!count && !value) continue;
    const created=Number(row.created_day);
    // Header timestamps can run backward across midnight. Keep a pending debit
    // for a future-dated creation; it is excluded from today's holdings and
    // cancels the already-spent output when its creation day is processed.
    const cohort=cohorts.get(created) || (created>day ? {value:0n,count:0n} : null);
    if(!cohort || (created<=day && (cohort.value<value || cohort.count<count))) throw new Error(`Spend exceeds historical creation cohort: ${dateOf(created)}`);
    cohorts.set(created,cohort);
    cohort.value-=value;cohort.count-=count;
    spentValue+=value;spentCount+=count;spentBasis+=value*priceUnits(prices.get(dateOf(created)));
    cdd+=Number(row.cdd);dormancy+=Number(row.dormancy_sum);
  }
  const result={date,cohorts:[],total:0n,count:0n,cap:0n,spentValue,spentBasis,spentCount,cdd,
    avgDormancy:spentCount?dormancy/Number(spentCount):null,...Object.fromEntries(BUCKETS.map(b=>[b,0n]))};
  for(const [created,c] of [...cohorts].sort((a,b)=>a[0]-b[0])) {
    if(created>day && c.value<0n && c.count<0n) {
      result.cohorts.push([created,c.value.toString(),c.count.toString()]);
      continue;
    }
    if(created>day || c.value<0n || c.count<0n || (c.count===0n && c.value!==0n)) throw new Error('Invalid unspent cohort');
    if(!c.count) continue;
    const age=day-created,bucket=age<30?0:age<90?1:age<180?2:age<365?3:age<730?4:5;
    result[BUCKETS[bucket]]+=c.value; result.total+=c.value;result.count+=c.count;
    result.cap+=c.value*priceUnits(prices.get(dateOf(created)));
    result.cohorts.push([created,c.value.toString(),c.count.toString()]);
  }
  const todayPrice=priceUnits(prices.get(date));
  result.sopr=spentBasis>0n?Number(spentValue*todayPrice)/Number(spentBasis):null;
  if(!Number.isFinite(cdd) || (result.sopr!==null && !Number.isFinite(result.sopr))) throw new Error('Invalid analytics result');
  return result;
}
module.exports={DAY,METHOD,BUCKETS,dateOf,priceUnits,usd,advance,CREATIONS_SQL,SPENDS_SQL};
