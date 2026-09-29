// Local-only backend for verify-address-pagination.mjs. No real balances/activity.
// 1. node scripts/perf/address-pagination-fixture.mjs
// 2. NEXT_PUBLIC_NETWORK=mainnet NEXT_PUBLIC_API_URL=http://127.0.0.1:3911 npm run dev -- --port 3105
// 3. ADDRESS_PAGINATION_BASE_URL=http://localhost:3105 node scripts/perf/verify-address-pagination.mjs
import http from 'node:http';
const address = 't3cFfPt1Bcvgez9ZbMBFWeZsskxTkPzGCow';
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  let data;
  if (/^\/(api\/address|v1\/addresses)\//.test(url.pathname)) {
    const page = Number(url.searchParams.get('page') || 1);
    data = { address, type: 'transparent', balance: 12500000, txCount: 75,
      firstSeen: 1732359779, lastSeen: 1732359779, firstFunding: null,
      pagination: { page, limit: 25, total: 75, totalPages: 3, hasNext: page < 3, hasPrev: page > 1 },
      transactions: Array.from({ length: 25 }, (_, i) => ({
        txid: String(page).repeat(60) + String(i).padStart(4, '0'), blockHeight: 3000000 - page * 25 - i,
        blockTime: '1732359779', txIndex: 0, size: 181, inputValue: 0, outputValue: 12500000,
        netChange: 12500000, senderCount: 0, recipientCount: 1,
      })) };
  } else if (url.pathname.includes('/crosschain/')) data = { success: true, totalSwaps: 0 };
  else if (url.pathname.endsWith('/price')) data = { price: 42, change24h: 0 };
  else if (url.pathname.includes('labels')) data = { labels: [], count: 0 };
  else { res.statusCode = 503; data = { error: 'Unavailable in pagination fixture' }; }
  res.end(JSON.stringify(url.pathname.startsWith('/v1/') ? { data, meta: { requestId: 'fixture', network: 'mainnet' } } : data));
}).listen(3911, '127.0.0.1', () => console.log('Pagination fixture: http://127.0.0.1:3911'));
