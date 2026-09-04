/**
 * server/api/v1/inventory/manifest.js
 *
 * SINGLE SOURCE OF TRUTH for:
 *   1. The complete inventory of legacy endpoints found in server/api/routes/**
 *      and server/signals/api.js, each classified as:
 *        - public      user-facing data/action, no auth, safe to document externally
 *        - internal    used by our own frontend/SSR/sitemap generation only,
 *                       not intended as a general external API contract
 *        - ops         operational/administrative (health, monitoring admin
 *                       mutations), not a versioned data-product surface
 *        - private     paid/gated feature with its own auth model (x402/CipherPay)
 *        - deprecated  superseded by another endpoint; still live, not carried
 *                       forward into /v1 to avoid two competing contracts
 *   2. The v1 mapping for each entry: whether/how it is exposed under /v1.
 *
 * `v1.status`:
 *   - 'adapter'  : mounted under /v1, proxies to the legacy endpoint via
 *                  lib/internal-client.js and reshapes the response into the
 *                  standard envelope. No SQL is duplicated — zero new queries.
 *   - 'stub'     : mounted under /v1, but deliberately NOT proxied. Returns a
 *                  501 "not-migrated" problem+json. Used for endpoints that
 *                  are public but not yet SAFE to blanket-proxy (unbounded
 *                  compute, no rate limiting, etc.) — see notes per entry.
 *   - 'excluded' : NOT mounted under /v1 at all. Used for internal/ops/private
 *                  endpoints out of v1's public-contract scope, and for
 *                  legacy endpoints that are superseded/duplicated by another
 *                  entry that IS adapted.
 *
 * This file intentionally has no logic beyond a couple of small pure
 * `cursorMap` closures next to the list endpoints that need them — everything
 * else is data, so server/api/test/v1/*.test.js can assert against it
 * directly and server/api/openapi/v1.yaml can be checked for drift against it.
 */

/** @typedef {{ next: (pagination: object) => object|null, prev: (pagination: object) => object|null }} CursorMap */

const MANIFEST = [
  // ---------------------------------------------------------------------
  // system / health (blocks.js)
  // ---------------------------------------------------------------------
  {
    method: 'GET', legacyPath: '/health', file: 'server/api/routes/blocks.js',
    classification: 'ops', domain: 'system', auth: 'none',
    description: 'Shallow liveness check.',
    v1: { path: '/v1/system/health', status: 'adapter', shape: 'passthrough' },
  },
  {
    method: 'GET', legacyPath: '/health/deep', file: 'server/api/routes/blocks.js',
    classification: 'ops', domain: 'system', auth: 'none',
    description: 'Deep health check including DB connectivity.',
    v1: { path: '/v1/system/health/deep', status: 'adapter', shape: 'passthrough' },
  },
  {
    method: 'GET', legacyPath: '/api/info', file: 'server/api/routes/blocks.js',
    classification: 'public', domain: 'network', auth: 'none',
    description: 'Current indexed chain height.',
    v1: { path: '/v1/network/info', status: 'adapter', shape: 'passthrough' },
  },
  {
    method: 'GET', legacyPath: '/api/blocks/list', file: 'server/api/routes/blocks.js',
    classification: 'public', domain: 'blocks', auth: 'none',
    description: 'Cursor-paginated block list (canonical listing endpoint).',
    v1: {
      path: '/v1/blocks', status: 'adapter', shape: 'list',
      listKey: 'blocks', paginationKey: 'pagination',
      cursorMap: {
        next: (p) => (p?.hasNext ? { cursor: p.nextCursor, direction: 'next' } : null),
        prev: (p) => (p?.hasPrev ? { cursor: p.prevCursor, direction: 'prev' } : null),
      },
      zatoshiFields: ['total_fees'],
      zatoshiConfidence: 'verified',
      notes: 'total_fees is a raw zatoshi BIGINT column, not pre-divided by the legacy handler.',
    },
  },
  {
    method: 'GET', legacyPath: '/api/blocks', file: 'server/api/routes/blocks.js',
    classification: 'deprecated', domain: 'blocks', auth: 'none',
    description: 'Offset-paginated recent blocks; superseded by /api/blocks/list cursor pagination.',
    v1: { status: 'excluded', notes: 'Covered by /v1/blocks (cursor pagination is the v1 standard, see lib/cursor.js). Not carried forward to avoid two competing list contracts.' },
  },
  {
    method: 'GET', legacyPath: '/api/block/:heightOrHash', file: 'server/api/routes/blocks.js',
    classification: 'public', domain: 'blocks', auth: 'none',
    description: 'Block detail by height or hash.',
    v1: { path: '/v1/blocks/:heightOrHash', status: 'adapter', shape: 'passthrough', zatoshiFields: ['total_fees'], zatoshiConfidence: 'verified' },
  },
  {
    method: 'GET', legacyPath: '/api/search/anchor/:root', file: 'server/api/routes/blocks.js',
    classification: 'public', domain: 'search', auth: 'none',
    description: 'Look up the block containing a given Orchard/Sapling anchor root.',
    v1: { path: '/v1/search/anchors/:root', status: 'adapter', shape: 'passthrough' },
  },
  {
    method: 'GET', legacyPath: '/api/block-archive/:hashOrHeight', file: 'server/api/routes/blocks.js',
    classification: 'public', domain: 'blocks', auth: 'none',
    description: 'Orphaned/non-canonical block archive lookup.',
    v1: { path: '/v1/blocks/:hashOrHeight/archive', status: 'adapter', shape: 'passthrough' },
  },

  // ---------------------------------------------------------------------
  // network.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/network/stats', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Aggregate network statistics.', v1: { path: '/v1/network/stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/fees', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Fee estimates.', v1: { path: '/v1/network/fees', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/health', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Zebra node health snapshot.', v1: { path: '/v1/network/health', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/peers', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Known peer list.', v1: { path: '/v1/network/peers', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/supply/transparent-breakdown', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Transparent supply breakdown.', v1: { path: '/v1/network/supply/transparent-breakdown', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/supply', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Total/circulating supply.', v1: { path: '/v1/network/supply', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/blockchain-info', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Zebra getblockchaininfo passthrough summary.', v1: { path: '/v1/network/blockchain-info', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/circulating-supply', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Circulating supply, plain-number legacy format.', v1: { path: '/v1/network/circulating-supply', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Ziggurat crawler node census.', v1: { path: '/v1/network/nodes', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes/stats', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Node census summary stats.', v1: { path: '/v1/network/nodes/stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/node-history', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Historical node count series.', v1: { path: '/v1/network/nodes/history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/price', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Current ZEC price.', v1: { path: '/v1/network/price', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/price/at', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Historical ZEC price at a timestamp.', v1: { path: '/v1/network/price/at', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/protocol-stats', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Protocol version adoption stats.', v1: { path: '/v1/network/protocol-stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/topology', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Peer topology graph.', v1: { path: '/v1/network/topology', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes/list', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Paged node list.', v1: { path: '/v1/network/nodes/list', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes/health-score', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Per-node health scoring.', v1: { path: '/v1/network/nodes/health-score', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes/reliability', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Node reliability metrics.', v1: { path: '/v1/network/nodes/reliability', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes/upgrade-readiness', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'NU upgrade readiness by node.', v1: { path: '/v1/network/nodes/upgrade-readiness', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/nodes/concentration', file: 'server/api/routes/network.js', classification: 'public', domain: 'network', auth: 'none', description: 'Node/ASN/geography concentration metrics.', v1: { path: '/v1/network/nodes/concentration', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // network-analytics.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/network/halving', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'network', auth: 'none', description: 'Block subsidy halving schedule.', v1: { path: '/v1/network/halving', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/mining-metrics', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Mining metrics summary.', v1: { path: '/v1/mining/metrics', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/hashrate-history', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Historical network hashrate.', v1: { path: '/v1/mining/hashrate-history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/pool-history', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Historical mining pool share.', v1: { path: '/v1/mining/pool-history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/emission', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'network', auth: 'none', description: 'ZEC emission curve.', v1: { path: '/v1/network/emission', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/chain-size-history', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'network', auth: 'none', description: 'Chain size growth over time.', v1: { path: '/v1/network/chain-size-history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/blocks/recent', file: 'server/api/routes/network-analytics.js', classification: 'public', domain: 'network', auth: 'none', description: 'Lightweight recent-blocks summary for charts (distinct from /v1/blocks).', v1: { path: '/v1/network/blocks/recent-summary', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // crosschain.js + wrapped-zec.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/crosschain/stats', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Cross-chain swap stats.', v1: { path: '/v1/crosschain/stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/inflows', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Cross-chain inflow volume.', v1: { path: '/v1/crosschain/inflows', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/outflows', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Cross-chain outflow volume.', v1: { path: '/v1/crosschain/outflows', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/status', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'NEAR Intents integration configuration status.', v1: { path: '/v1/crosschain/status', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/db-stats', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Materialized-view-backed swap dashboard stats.', v1: { path: '/v1/crosschain/db-stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/trends', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Cross-chain swap trends over time.', v1: { path: '/v1/crosschain/trends', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/history', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Historical swap list.', v1: { path: '/v1/crosschain/history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/volume-by-chain', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Swap volume grouped by source chain.', v1: { path: '/v1/crosschain/volume-by-chain', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/address/:address', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Cross-chain swap history for one ZEC address.', v1: { path: '/v1/crosschain/addresses/:address', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/popular-pairs', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Most popular source/dest chain pairs.', v1: { path: '/v1/crosschain/popular-pairs', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosschain/size-distribution', file: 'server/api/routes/crosschain.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Swap size histogram.', v1: { path: '/v1/crosschain/size-distribution', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/wrapped-zec/supply', file: 'server/api/routes/wrapped-zec.js', classification: 'public', domain: 'crosschain', auth: 'none', description: 'Wrapped ZEC supply across chains (read-only RPC, no shared DB).', v1: { path: '/v1/crosschain/wrapped-zec/supply', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // stats.js + privacy.js + analytics.js + blend-check.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/privacy-stats', file: 'server/api/routes/stats.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Aggregate shielded-vs-transparent stats.', v1: { path: '/v1/privacy/stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/stats/shielded-count', file: 'server/api/routes/stats.js', classification: 'public', domain: 'stats', auth: 'none', description: 'Running count of shielded transactions.', v1: { path: '/v1/stats/shielded-count', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/stats/shielded-daily', file: 'server/api/routes/stats.js', classification: 'public', domain: 'stats', auth: 'none', description: 'Daily shielded transaction counts.', v1: { path: '/v1/stats/shielded-daily', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/risks', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Per-transaction privacy risk indicators.', v1: { path: '/v1/privacy/risks', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/linkage-edges', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Precomputed address linkage edges.', v1: { path: '/v1/privacy/linkage-edges', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/batch-risks', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Batch deshield/for-shield risk detection.', v1: { path: '/v1/privacy/batch-risks', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/clusters', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Precomputed batch clusters.', v1: { path: '/v1/privacy/clusters', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/graph/:txid', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Privacy linkage graph rooted at a transaction.', v1: { path: '/v1/privacy/graph/:txid', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/shield/:txid/batch', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Batch-shield linkage for a transaction.', v1: { path: '/v1/privacy/shield/:txid/batch', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/patterns', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Detected privacy-relevant transaction patterns.', v1: { path: '/v1/privacy/patterns', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/common-amounts', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Common transaction amount buckets (anonymity set aid).', v1: { path: '/v1/privacy/common-amounts', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/recommended-swap-amounts', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Recommended round amounts for better anonymity sets.', v1: { path: '/v1/privacy/recommended-swap-amounts', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/fee-lanes', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Fee-lane privacy heuristics.', v1: { path: '/v1/privacy/fee-lanes', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/privacy/wallet-fingerprints', file: 'server/api/routes/privacy.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Wallet fingerprinting signal aggregates.', v1: { path: '/v1/privacy/wallet-fingerprints', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/analytics/anonymity-set', file: 'server/api/routes/analytics.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Anonymity set size estimates.', v1: { path: '/v1/privacy/anonymity-set', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/analytics/shielding-distribution', file: 'server/api/routes/analytics.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Distribution of shielding behavior.', v1: { path: '/v1/privacy/shielding-distribution', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/network/fee-distribution', file: 'server/api/routes/analytics.js', classification: 'public', domain: 'network', auth: 'none', description: 'Fee distribution histogram.', v1: { path: '/v1/network/fee-distribution', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/analytics/usage-clock', file: 'server/api/routes/analytics.js', classification: 'public', domain: 'analytics', auth: 'none', description: 'Time-of-day/week usage heatmap.', v1: { path: '/v1/analytics/usage-clock', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/blend-check', file: 'server/api/routes/blend-check.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Transaction "blend" (mixing quality) check.', v1: { path: '/v1/privacy/blend-check', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/blend-check/split', file: 'server/api/routes/blend-check.js', classification: 'public', domain: 'privacy', auth: 'none', description: 'Blend-check split breakdown.', v1: { path: '/v1/privacy/blend-check/split', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // pools.js + mining.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/pools/overview', file: 'server/api/routes/pools.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Mining pool overview.', v1: { path: '/v1/mining/pools/overview', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/pools/flows', file: 'server/api/routes/pools.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Coinbase reward flows by pool.', v1: { path: '/v1/mining/pools/flows', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/pools/turnstile', file: 'server/api/routes/pools.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Orchard/Ironwood turnstile pool metrics.', v1: { path: '/v1/mining/pools/turnstile', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mining/pool-distribution', file: 'server/api/routes/mining.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Mining pool hashrate distribution.', v1: { path: '/v1/mining/pool-distribution', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mining/pool-ranking', file: 'server/api/routes/mining.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Ranked mining pools.', v1: { path: '/v1/mining/pool-ranking', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mining/hashrate-share', file: 'server/api/routes/mining.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Hashrate share over time.', v1: { path: '/v1/mining/hashrate-share', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mining/rewards', file: 'server/api/routes/mining.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Block reward accounting.', v1: { path: '/v1/mining/rewards', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mining/miner-behavior', file: 'server/api/routes/mining.js', classification: 'public', domain: 'mining', auth: 'none', description: 'Miner behavior heuristics.', v1: { path: '/v1/mining/miner-behavior', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mining/zodl-leaderboard', file: 'server/api/routes/mining.js', classification: 'public', domain: 'mining', auth: 'none', description: 'ZODL miner leaderboard.', v1: { path: '/v1/mining/zodl-leaderboard', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // migration.js + valuation.js + pulse.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/migration/overview', file: 'server/api/routes/migration.js', classification: 'public', domain: 'migration', auth: 'none', description: 'Sapling→Orchard/Ironwood migration overview.', v1: { path: '/v1/migration/overview', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/migration/cohorts', file: 'server/api/routes/migration.js', classification: 'public', domain: 'migration', auth: 'none', description: 'Migration cohort breakdown.', v1: { path: '/v1/migration/cohorts', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/migration/denominations', file: 'server/api/routes/migration.js', classification: 'public', domain: 'migration', auth: 'none', description: 'Migration by amount denomination.', v1: { path: '/v1/migration/denominations', status: 'adapter', shape: 'passthrough' } },
  {
    method: 'GET', legacyPath: '/api/migration/activity', file: 'server/api/routes/migration.js',
    classification: 'public', domain: 'migration', auth: 'none', description: 'Compact hourly/daily migration activity buckets for time-series charts.',
    v1: {
      path: '/v1/migration/activity', status: 'adapter', shape: 'passthrough',
      zatoshiFields: ['buckets.*.volumeZat'], zatoshiConfidence: 'verified',
      notes: 'volumeZat per bucket is an exact SQL SUM() of the raw zatoshi BIGINT column, never divided into ZEC — per the route\'s own docblock.',
    },
  },
  {
    method: 'GET', legacyPath: '/api/migration/summary', file: 'server/api/routes/migration.js',
    classification: 'public', domain: 'migration', auth: 'none', description: 'Small, fixed-size digest of migration activity (headline totals + 24h/7d windows).',
    v1: {
      path: '/v1/migration/summary', status: 'adapter', shape: 'passthrough',
      zatoshiFields: ['totalVolumeZat', 'volumeZat24h', 'volumeZat7d'], zatoshiConfidence: 'verified',
      notes: 'Exact zatoshi integers throughout per the route\'s own docblock — never divided into a ZEC float.',
    },
  },
  {
    method: 'GET', legacyPath: '/api/migration/scatter', file: 'server/api/routes/migration.js',
    classification: 'public', domain: 'migration', auth: 'none', description: 'Individual migration transactions with privacy classification (measured ~10.4MB response at current chain height).',
    v1: { path: '/v1/migration/scatter', status: 'adapter', shape: 'passthrough' },
  },
  {
    method: 'GET', legacyPath: '/api/migration/scatter/compact', file: 'server/api/routes/migration.js',
    classification: 'public', domain: 'migration', auth: 'none', description: 'Versioned compact migration points with bounded ranges, finalized chunks, ETags, and incremental canonical-tail cursors.',
    v1: { path: '/v1/migration/scatter/compact', status: 'adapter', shape: 'passthrough' },
  },
  { method: 'GET', legacyPath: '/api/migration/tiers', file: 'server/api/routes/migration.js', classification: 'public', domain: 'migration', auth: 'none', description: 'Migration progress by holding tier.', v1: { path: '/v1/migration/tiers', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/valuation/snapshot', file: 'server/api/routes/valuation.js', classification: 'public', domain: 'valuation', auth: 'none', description: 'Current valuation snapshot.', v1: { path: '/v1/valuation/snapshot', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/valuation/history', file: 'server/api/routes/valuation.js', classification: 'public', domain: 'valuation', auth: 'none', description: 'Historical valuation series.', v1: { path: '/v1/valuation/history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/valuation/hodl-waves', file: 'server/api/routes/valuation.js', classification: 'public', domain: 'valuation', auth: 'none', description: 'HODL wave age-band breakdown.', v1: { path: '/v1/valuation/hodl-waves', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/valuation/dormancy', file: 'server/api/routes/valuation.js', classification: 'public', domain: 'valuation', auth: 'none', description: 'Coin dormancy metrics.', v1: { path: '/v1/valuation/dormancy', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/pulse', file: 'server/api/routes/pulse.js', classification: 'public', domain: 'pulse', auth: 'none', description: 'Real-time "pulse" activity feed.', v1: { path: '/v1/pulse', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/pulse/summary', file: 'server/api/routes/pulse.js', classification: 'public', domain: 'pulse', auth: 'none', description: 'Pulse summary metrics.', v1: { path: '/v1/pulse/summary', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // transparent.js + address.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/transparent/exposed', file: 'server/api/routes/transparent.js', classification: 'public', domain: 'transparent', auth: 'none', description: 'Transparent addresses with exposed-linkage risk.', v1: { path: '/v1/transparent/exposed', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/transparent/exposed/summary', file: 'server/api/routes/transparent.js', classification: 'public', domain: 'transparent', auth: 'none', description: 'Summary of transparent exposure risk.', v1: { path: '/v1/transparent/exposed/summary', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/labels', file: 'server/api/routes/address.js', classification: 'public', domain: 'address', auth: 'none', description: 'Known-address label directory.', v1: { path: '/v1/labels', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/label/:address', file: 'server/api/routes/address.js', classification: 'public', domain: 'address', auth: 'none', description: 'Label for one address.', v1: { path: '/v1/labels/:address', status: 'adapter', shape: 'passthrough' } },
  {
    method: 'GET', legacyPath: '/api/rich-list', file: 'server/api/routes/address.js',
    classification: 'public', domain: 'address', auth: 'none', description: 'Top addresses by transparent balance.',
    v1: {
      path: '/v1/addresses/rich-list', status: 'adapter', shape: 'passthrough',
      zatoshiConfidence: 'not-applicable-legacy-preconverted',
      knownPrecisionCaveat: 'balance/totalReceived/totalSent are pre-divided to ZEC (parseFloat(row.balance)/1e8) by the legacy handler before this proxy sees them; v1 cannot losslessly reconstruct zatoshi precision here. Treat as approximate ZEC decimals, not authoritative zatoshi integers.',
    },
  },
  {
    method: 'GET', legacyPath: '/api/address/:address', file: 'server/api/routes/address.js',
    classification: 'public', domain: 'address', auth: 'none', description: 'Address summary + paginated transaction history.',
    v1: {
      path: '/v1/addresses/:address', status: 'adapter', shape: 'passthrough',
      zatoshiFields: ['balance', 'totalReceived', 'totalSent'],
      zatoshiConfidence: 'verified',
      notes: 'balance/totalReceived/totalSent are the raw zatoshi columns (parseFloat without /1e8 division) in the branch with an existing address summary row; null/0 in the no-history branches convert safely.',
    },
  },
  { method: 'GET', legacyPath: '/api/address/:address/graph', file: 'server/api/routes/address.js', classification: 'public', domain: 'address', auth: 'none', description: 'Address cluster/linkage graph.', v1: { path: '/v1/addresses/:address/graph', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // crosslink/*
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/finalizers', file: 'server/api/routes/crosslink/finalizers.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Crosslink BFT finalizer set.', v1: { path: '/v1/crosslink/finalizers', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/finalizer/:pubkey/participation', file: 'server/api/routes/crosslink/finalizers.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Finalizer participation history.', v1: { path: '/v1/crosslink/finalizers/:pubkey/participation', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/participation', file: 'server/api/routes/crosslink/finalizers.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Aggregate finalizer participation.', v1: { path: '/v1/crosslink/participation', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/bft-chain', file: 'server/api/routes/crosslink/finalizers.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'BFT finalized chain segment.', v1: { path: '/v1/crosslink/bft-chain', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/finalizer/:pubkey', file: 'server/api/routes/crosslink/finalizers.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Single finalizer detail.', v1: { path: '/v1/crosslink/finalizers/:pubkey', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink', file: 'server/api/routes/crosslink/stats.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Crosslink overview stats.', v1: { path: '/v1/crosslink', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/bft-tip', file: 'server/api/routes/crosslink/stats.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Current BFT-finalized tip.', v1: { path: '/v1/crosslink/bft-tip', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/bootstrap-info', file: 'server/api/routes/crosslink/stats.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Crosslink bootstrap parameters.', v1: { path: '/v1/crosslink/bootstrap-info', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/divergence-history', file: 'server/api/routes/crosslink/stats.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'PoW/BFT chain divergence history.', v1: { path: '/v1/crosslink/divergence-history', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/fork-monitor', file: 'server/api/routes/crosslink/fork-monitor.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Fork monitor dashboard (reported node tips vs. cTAZ).', v1: { path: '/v1/crosslink/fork-monitor', status: 'adapter', shape: 'passthrough' } },
  { method: 'POST', legacyPath: '/api/crosslink/fork-monitor/check', file: 'server/api/routes/crosslink/fork-monitor.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Live hash comparison at up to 10 heights (read-only RPC, no writes).', v1: { path: '/v1/crosslink/fork-monitor/checks', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/crosslink/block-hash/:height', file: 'server/api/routes/crosslink/fork-monitor.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Block hash at a given height (used by external fork-finder scripts).', v1: { path: '/v1/crosslink/block-hash/:height', status: 'adapter', shape: 'passthrough' } },
  { method: 'POST', legacyPath: '/api/crosslink/fork-monitor/report', file: 'server/api/routes/crosslink/fork-monitor.js', classification: 'public', domain: 'crosslink', auth: 'none', description: 'Voluntary node self-registration for the fork monitor (per-name rate limited, capacity-bounded upstream).', v1: { path: '/v1/crosslink/fork-monitor/nodes', status: 'adapter', shape: 'passthrough' } },
  {
    method: 'DELETE', legacyPath: '/api/crosslink/fork-monitor/report/:name', file: 'server/api/routes/crosslink/fork-monitor.js',
    classification: 'ops', domain: 'crosslink', auth: 'none', description: 'Delete a registered fork-monitor node report by name.',
    v1: { status: 'excluded', notes: 'AUDIT FINDING: legacy endpoint has no authentication — anyone who knows/guesses a node name can delete its report. Not carried into /v1 pending an ownership token or service-key requirement upstream; do not proxy an unauthenticated destructive mutation under a new versioned surface.' },
  },

  // ---------------------------------------------------------------------
  // reorgs.js
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/uncles', file: 'server/api/routes/reorgs.js', classification: 'public', domain: 'reorgs', auth: 'none', description: 'Recent orphaned blocks ("uncles").', v1: { path: '/v1/uncles', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/uncles/forks', file: 'server/api/routes/reorgs.js', classification: 'public', domain: 'reorgs', auth: 'none', description: 'Detected chain forks.', v1: { path: '/v1/uncles/forks', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/uncle/:hash', file: 'server/api/routes/reorgs.js', classification: 'public', domain: 'reorgs', auth: 'none', description: 'Single orphaned block detail.', v1: { path: '/v1/uncles/:hash', status: 'adapter', shape: 'passthrough' } },
  { method: 'POST', legacyPath: '/api/uncle/report', file: 'server/api/routes/reorgs.js', classification: 'public', domain: 'reorgs', auth: 'none', description: 'Report an observed tip hash for comparison (IP rate limited, PoW-shape validated upstream).', v1: { path: '/v1/uncles/reports', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/uncles/stats', file: 'server/api/routes/reorgs.js', classification: 'public', domain: 'reorgs', auth: 'none', description: 'Reorg/orphan dashboard stats.', v1: { path: '/v1/uncles/stats', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/uncles/nodes', file: 'server/api/routes/reorgs.js', classification: 'public', domain: 'reorgs', auth: 'none', description: 'Reporting node list for the reorg dashboard.', v1: { path: '/v1/uncles/nodes', status: 'adapter', shape: 'passthrough' } },

  // ---------------------------------------------------------------------
  // transactions/*
  // ---------------------------------------------------------------------
  {
    method: 'GET', legacyPath: '/api/transactions/list', file: 'server/api/routes/transactions/tx-lists.js',
    classification: 'public', domain: 'transactions', auth: 'none', description: 'Cursor-paginated transaction list with type filter.',
    v1: {
      path: '/v1/transactions', status: 'adapter', shape: 'list',
      listKey: 'transactions', paginationKey: 'pagination',
      cursorMap: {
        next: (p) => (p?.hasNext ? { cursor: p.nextCursor, cursor_idx: p.nextCursorIdx, direction: 'next' } : null),
        prev: (p) => (p?.hasPrev ? { cursor: p.prevCursor, cursor_idx: p.prevCursorIdx, direction: 'prev' } : null),
      },
      zatoshiFields: ['fee', 'total_input', 'total_output', 'value_balance', 'value_balance_sapling', 'value_balance_orchard', 'value_balance_ironwood'],
      zatoshiConfidence: 'verified',
      notes: 'These are raw BIGINT columns selected directly (t.fee, t.total_input, ...), never divided by the legacy handler.',
    },
  },
  { method: 'GET', legacyPath: '/api/shielded/list', file: 'server/api/routes/transactions/tx-lists.js', classification: 'public', domain: 'transactions', auth: 'none', description: 'Shielded-only transaction list.', v1: { path: '/v1/transactions/shielded', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/tx/shielded', file: 'server/api/routes/transactions/tx-read.js', classification: 'public', domain: 'transactions', auth: 'none', description: 'Shielded transaction summary metrics.', v1: { path: '/v1/transactions/shielded-summary', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/tx/:txid/linkability', file: 'server/api/routes/transactions/tx-read.js', classification: 'public', domain: 'transactions', auth: 'none', description: 'Linkability analysis for one transaction.', v1: { path: '/v1/transactions/:txid/linkability', status: 'adapter', shape: 'passthrough' } },
  {
    method: 'POST', legacyPath: '/api/tx/broadcast', file: 'server/api/routes/transactions/tx-write.js',
    classification: 'public', domain: 'transactions', auth: 'none', description: 'Broadcast a fully-signed raw transaction (no keys involved).',
    v1: { path: '/v1/transactions/broadcast', status: 'adapter', shape: 'passthrough', notes: 'Core public write endpoint. See README caveats re: proxy write semantics (no v1-layer idempotency key yet — a client retry on timeout may double-submit; legacy sendrawtransaction is itself idempotent at the mempool level for an unchanged tx, so a duplicate submit is harmless, but a network partition on the internal hop can still return a spurious error for a tx that actually broadcast).' },
  },
  { method: 'GET', legacyPath: '/api/mempool', file: 'server/api/routes/transactions/tx-mempool.js', classification: 'public', domain: 'mempool', auth: 'none', description: 'Current mempool transaction summaries.', v1: { path: '/v1/mempool', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/mempool/tx/:txid', file: 'server/api/routes/transactions/tx-mempool.js', classification: 'public', domain: 'mempool', auth: 'none', description: 'Single mempool transaction detail.', v1: { path: '/v1/mempool/:txid', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/tx/:txid/raw', file: 'server/api/routes/transactions/tx-raw.js', classification: 'public', domain: 'transactions', auth: 'none', description: 'Raw transaction hex.', v1: { path: '/v1/transactions/:txid/raw', status: 'adapter', shape: 'passthrough' } },
  { method: 'GET', legacyPath: '/api/tx/:txid/verbose', file: 'server/api/routes/transactions/tx-raw.js', classification: 'public', domain: 'transactions', auth: 'none', description: 'Verbose decoded transaction (zebra getrawtransaction verbose=1).', v1: { path: '/v1/transactions/:txid/verbose', status: 'adapter', shape: 'passthrough' } },
  { method: 'POST', legacyPath: '/api/tx/raw/batch', file: 'server/api/routes/transactions/tx-raw.js', classification: 'public', domain: 'transactions', auth: 'none', description: 'Batch raw-tx fetch by txid list (read-only despite POST verb; body carries the id list).', v1: { path: '/v1/transactions/raw/batch', status: 'adapter', shape: 'passthrough' } },
  {
    method: 'GET', legacyPath: '/api/seo/tx/:txid', file: 'server/api/routes/transactions/tx-detail.js',
    classification: 'internal', domain: 'transactions', auth: 'none', description: 'Lightweight metadata for server-rendered titles/JSON-LD.',
    v1: { status: 'excluded', notes: 'SSR/meta support endpoint, not a general data-product contract; the same fields are a subset of /v1/transactions/:txid.' },
  },
  {
    method: 'GET', legacyPath: '/api/tx/:txid', file: 'server/api/routes/transactions/tx-detail.js',
    classification: 'public', domain: 'transactions', auth: 'none', description: 'Full transaction detail (inputs, outputs, cross-chain bridge match).',
    v1: {
      path: '/v1/transactions/:txid', status: 'adapter', shape: 'passthrough',
      zatoshiConfidence: 'not-applicable-legacy-preconverted',
      knownPrecisionCaveat: 'fee/valueBalance*/totalValueBalance are pre-divided to ZEC ("/ 100000000") by the legacy handler before this proxy sees them. v1 cannot losslessly reconstruct zatoshi precision here without querying the DB directly, which would duplicate business SQL. Treat these fields as approximate ZEC decimals, not authoritative zatoshi integers, until a follow-up adds true zatoshi fields at the source.',
    },
  },

  // ---------------------------------------------------------------------
  // scan.js — public, cost-bounded via v1-only validation + rate limiting
  // ---------------------------------------------------------------------
  // These are public endpoints, so per the "complete public coverage"
  // requirement they must be adapters, not stubs — but the legacy handlers
  // alone allow a bigger cost knob (up to 1,000,000 / 50,000 block ranges,
  // no per-IP throttle) than is safe to hand out on a newly-discoverable
  // surface. Rather than reclassify them without concrete product evidence
  // that they should be non-public, v1 adds its OWN, independently
  // configurable, STRICTER range caps (lib/scan-validation.js, run BEFORE
  // any legacy dispatch) and per-IP rate limits (lib/rate-limit.js) on top
  // of the existing legacy protections, then proxies. See config.js for
  // the tunable V1_SCAN_* env vars.
  {
    method: 'POST', legacyPath: '/api/scan/orchard', file: 'server/api/routes/scan.js',
    classification: 'public', domain: 'scan', auth: 'none', description: 'Batch-scan a height range for Orchard transactions (wallet scanning aid).',
    v1: {
      path: '/v1/scan/orchard', status: 'adapter', shape: 'passthrough',
      validateKey: 'scanOrchard', rateLimitKey: 'scanOrchard',
      notes: 'v1 enforces a stricter max range (default 50,000 blocks vs. legacy\'s 1,000,000, see V1_SCAN_ORCHARD_MAX_RANGE) and a per-IP rate limit (default 5/minute, see V1_SCAN_ORCHARD_RATE_LIMIT_MAX/_WINDOW_MS) before proxying to the legacy endpoint.',
    },
  },
  {
    method: 'POST', legacyPath: '/api/lightwalletd/scan', file: 'server/api/routes/scan.js',
    classification: 'public', domain: 'scan', auth: 'none', description: 'Batch-scan blocks via Lightwalletd gRPC for client-side trial decryption.',
    v1: {
      path: '/v1/scan/lightwalletd', status: 'adapter', shape: 'passthrough',
      validateKey: 'scanLightwalletd', rateLimitKey: 'scanLightwalletd',
      notes: 'v1 requires an explicit `endHeight` (legacy defaults a missing one to the current chain tip, which v1 treats as an unbounded-until-resolved request shape and rejects), enforces a stricter max range (default 10,000 blocks vs. legacy\'s 50,000, see V1_SCAN_LIGHTWALLETD_MAX_RANGE — lightwalletd scanning is more expensive per block: gRPC + parallel streaming + optional disk cache writes), and a per-IP rate limit (default 3/minute, see V1_SCAN_LIGHTWALLETD_RATE_LIMIT_MAX/_WINDOW_MS) before proxying.',
    },
  },

  // ---------------------------------------------------------------------
  // sitemaps.js — internal SEO infrastructure, out of v1 scope
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/sitemaps/blocks', file: 'server/api/routes/sitemaps.js', classification: 'internal', domain: 'sitemaps', auth: 'none', description: 'Block sitemap shard data, consumed by app/sitemap.ts.', v1: { status: 'excluded', notes: 'SEO infrastructure for our own Next.js sitemap generation, not a general external data contract.' } },
  { method: 'GET', legacyPath: '/api/sitemaps/transactions/recent', file: 'server/api/routes/sitemaps.js', classification: 'internal', domain: 'sitemaps', auth: 'none', description: 'Recent-transaction sitemap shard data.', v1: { status: 'excluded', notes: 'Same as /api/sitemaps/blocks.' } },

  // ---------------------------------------------------------------------
  // server/signals/api.js — paid feature (x402 / CipherPay), out of v1 scope
  // ---------------------------------------------------------------------
  { method: 'GET', legacyPath: '/api/signals/latest', file: 'server/signals/api.js', classification: 'private', domain: 'signals', auth: 'service-key|bearer|x402', description: 'Current trading signal + 7-day history (paid).', v1: { status: 'excluded', notes: 'Payment-gated (x402/CipherPay session). Proxying would need to forward Authorization/x402 payment headers end-to-end and is deliberately excluded from the initial v1 contract; revisit once a monetized-endpoint pattern exists in v1.' } },
  { method: 'GET', legacyPath: '/api/signals/history', file: 'server/signals/api.js', classification: 'private', domain: 'signals', auth: 'service-key|bearer|x402', description: 'Full trading signal history (paid).', v1: { status: 'excluded', notes: 'See /api/signals/latest.' } },
  { method: 'GET', legacyPath: '/api/signals/performance', file: 'server/signals/api.js', classification: 'private', domain: 'signals', auth: 'service-key|bearer|x402', description: 'Backtest performance summary (paid).', v1: { status: 'excluded', notes: 'See /api/signals/latest.' } },
];

// -- Small integrity checks that run at require()-time (cheap, synchronous,
//    no I/O) so a manifest authoring mistake fails fast in every process
//    that loads this module (including tests), not just in the OpenAPI/
//    inventory test suite. -------------------------------------------------
(function assertManifestIntegrity() {
  const seenV1Routes = new Set();
  for (const entry of MANIFEST) {
    if (!entry.method || !entry.legacyPath || !entry.classification || !entry.v1) {
      throw new Error(`v1 manifest: malformed entry for ${entry.legacyPath || '<unknown>'}`);
    }
    if (entry.v1.status === 'adapter') {
      if (!entry.v1.path) {
        throw new Error(`v1 manifest: adapter entry for ${entry.legacyPath} is missing v1.path`);
      }
      const key = `${entry.method} ${entry.v1.path}`;
      if (seenV1Routes.has(key)) {
        throw new Error(`v1 manifest: duplicate v1 route ${key}`);
      }
      seenV1Routes.add(key);
    }
  }
})();

const CLASSIFICATIONS = ['public', 'internal', 'ops', 'private', 'deprecated'];
const V1_STATUSES = ['adapter', 'stub', 'excluded'];

module.exports = { MANIFEST, CLASSIFICATIONS, V1_STATUSES };
