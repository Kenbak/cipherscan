/* Public descriptors only. Never serialize DOM text, query strings or wallet state. */
const base = { version: 1, metric: 'balances', period: '30d', pool: 'all', view: 'line', start: null, end: null };
const pages = {
  '/': { id: 'home', title: 'Zcash overview', topic: 'explorer' },
  '/ask': { id: 'ask', title: 'Ask ZecBlock', topic: 'explorer' },
  '/pools': { id: 'pools', title: 'Shielded pools', topic: 'pools', spec: base },
  '/ironwood': { id: 'ironwood', title: 'Ironwood', topic: 'ironwood', spec: { ...base, metric: 'migration_share', period: '90d' } },
  '/crosschain': { id: 'crosschain', title: 'Cross-chain swaps', topic: 'crosschain', spec: { ...base, metric: 'swap_volume', view: 'bar' } },
  '/pulse': { id: 'pulse', title: 'Network Pulse', topic: 'pulse', spec: { ...base, metric: 'pulse', view: 'bar' } },
  '/zodl': { id: 'miner_zodl', title: 'Miner ZODL', topic: 'miner_zodl' },
  '/network': { id: 'network', title: 'Network', topic: 'nodes' },
  '/rich-list': { id: 'addresses', title: 'Funded transparent addresses', topic: 'addresses' },
  '/privacy': { id: 'privacy', title: 'Privacy', topic: 'pools' },
};
function describePage(pathname) {
  if (Object.hasOwn(pages, pathname)) return pages[pathname];
  if (/^\/tx\/[a-fA-F0-9]{64}$/.test(pathname)) return { id: 'transaction', title: 'Transaction', topic: 'transactions' };
  if (/^\/block\/(\d{1,9}|[a-fA-F0-9]{64})$/.test(pathname)) return { id: 'block', title: 'Block', topic: 'nodes' };
  if (/^\/address\/[A-Za-z0-9]{20,200}$/.test(pathname)) return { id: 'address', title: 'Address', topic: 'addresses' };
  return { id: 'explorer', title: 'Zcash explorer', topic: 'explorer' };
}
const pageIds = [...new Set([...Object.values(pages).map(page => page.id), 'transaction', 'block', 'address', 'explorer'])];
function pageById(id) {
  return Object.values(pages).find(page => page.id === id) || ({ transaction: describePage('/tx/' + 'a'.repeat(64)), block: describePage('/block/1'), address: describePage('/address/' + 'a'.repeat(35)) })[id] || describePage('');
}
module.exports = { describePage, pageById, pageIds };
