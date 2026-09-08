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
function getQueryConstraint(route, name) {
  const field = schemas[routeSchemas[route]]?.query?.shape?.[name];
  if (!field) return null;
  const schema = z.toJSONSchema(field, { io: 'output', unrepresentable: 'any' });
  delete schema.$schema;
  return { required: !field.isOptional(), schema };
}
module.exports = { getQueryConstraint };
