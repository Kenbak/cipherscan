/** Query constraints shared with the middleware that actually validates each source route. */
const { z } = require('zod');
const { schemas } = require('../../validation');
const routeSchemas = {
  '/v1/addresses/:address': 'addressById',
  '/v1/transactions/shielded-summary': 'shieldedTxs',
  '/v1/crosschain/trends': 'crosschainTrends',
  '/v1/crosschain/history': 'crosschainHistory',
  '/v1/crosschain/volume-by-chain': 'volumeByChain',
  '/v1/privacy/recommended-swap-amounts': 'recommendedAmounts',
  '/v1/privacy/risks': 'privacyRisks',
  '/v1/privacy/linkage-edges': 'privacyLinkageEdges',
  '/v1/privacy/batch-risks': 'privacyBatchRisks',
  '/v1/privacy/clusters': 'privacyBatchRisks',
  '/v1/transactions/:txid/linkability': 'txLinkability',
  '/v1/transparent/exposed': 'exposedAddresses',
};
const softwareFilters = {
  software: {type:'string',enum:['all','zebra','zakura','other','unknown','conflicting','missing'],default:'all',description:'Self-reported coinbase marker; unknown means unmarked, other means zcashd, missing means unavailable coinbase data.'},
  pool: {type:'string',enum:['all',...require('../../lib/mining-software').pools,'unattributed'],default:'all',description:'Mining-pool payout-address attribution, independent of software markers.'},
  order: {type:'string',enum:['newest','oldest','interval_asc','interval_desc','size_asc','size_desc','fees_asc','fees_desc','txs_asc','txs_desc'],default:'newest',description:'Sort the complete filtered dataset by height, parent interval, indexed size, fees or transaction count. Metric ties use height; unavailable values sort last. Cursor remains bound to every filter and order.'},
  from: {type:'string',format:'date',description:'Inclusive UTC date, YYYY-MM-DD. Mining software history requires period=custom.'},
  to: {type:'string',format:'date',description:'Inclusive UTC end date, YYYY-MM-DD. Mining software history requires period=custom.'},
  min_height: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive minimum canonical block height.'},
  max_height: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive maximum canonical block height.'},
  min_interval: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive minimum difference from the canonical parent timestamp in seconds.'},
  max_interval: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive maximum difference from the canonical parent timestamp in seconds.'},
  min_size: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive minimum indexed block size in bytes.'},
  max_size: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive maximum indexed block size in bytes.'},
  min_txs: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive minimum transaction count including coinbase.'},
  max_txs: {type:'integer',minimum:0,maximum:2147483647,description:'Inclusive maximum transaction count including coinbase.'},
  min_fees: {type:'number',minimum:0,maximum:21000000,description:'Inclusive minimum total transaction fees in ZEC (up to 8 decimal places).'},
  max_fees: {type:'number',minimum:0,maximum:21000000,description:'Inclusive maximum total transaction fees in ZEC (up to 8 decimal places).'},
  period: {type:'string',enum:['7d','30d','90d','1y','all','custom','since-zebra','since-zakura'],default:'30d',description:'UTC calendar-day range. Since presets begin on the first observed marker day, not the software launch.'},
  bucket: {type:'string',enum:['auto','day','week'],default:'auto',description:'Auto selects weekly for ranges longer than 121 days. Weekly buckets start Monday; boundary weeks contain only requested days.'},
};
function getQueryConstraint(route, name) {
  if(['/v1/blocks','/v1/mining/software'].includes(route) && softwareFilters[name]) return {required:false,schema:softwareFilters[name],description:softwareFilters[name].description};
  const field = schemas[routeSchemas[route]]?.query?.shape?.[name];
  if (!field) return null;
  const schema = z.toJSONSchema(field, { io: 'output', unrepresentable: 'any' });
  delete schema.$schema;
  return { required: !field.isOptional(), schema };
}
module.exports = { getQueryConstraint };
