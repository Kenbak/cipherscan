// The dashboard is an external observer, not a direct node RPC or chain authority.
const MAX_AGE_SECONDS = 300;
const MAX_BYTES = 1024 * 1024;

function parseNodeSnapshot(data, nodeName, now = Date.now() / 1000) {
  const node = data?.node;
  if (data?.network !== 'mainnet' || node?.name !== nodeName
      || node.rpc_chain !== 'main' || node.rpc_testnet !== false
      || node.client_name !== 'zakurad') {
    throw new Error('Unexpected Zakura dashboard node or network');
  }
  // generated_at advances on requests even when the underlying probe is stale.
  for (const at of [data.last_poll, node.last_seen_at]) {
    if (!Number.isFinite(at) || now - at > MAX_AGE_SECONDS || at - now > 60) {
      throw new Error('Stale Zakura dashboard observation');
    }
  }
  if (node.rpc_ok !== true || node.active_state !== 'active') {
    throw new Error('Zakura dashboard reports node unavailable');
  }
  if (!Number.isSafeInteger(node.height) || node.height < 0 || node.height > 100_000_000
      || typeof node.block_hash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(node.block_hash)) {
    throw new Error('Invalid Zakura dashboard chain tip');
  }
  return {
    height: node.height,
    hash: node.block_hash.toLowerCase(),
    nodeImpl: 'Zakura',
    version: typeof node.client_version === 'string' ? node.client_version.slice(0, 80) : null,
    observedAt: new Date(node.last_seen_at * 1000).toISOString(),
  };
}

async function readNodeSnapshot(node) {
  const response = await fetch(`http://${node.host}:${node.port}/data/node/${encodeURIComponent(node.dashboard)}`, {
    signal: AbortSignal.timeout(5_000), redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Zakura dashboard HTTP ${response.status}`);
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw new Error('Zakura dashboard response too large');
    chunks.push(chunk);
  }
  return parseNodeSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')), node.dashboard);
}

module.exports = { parseNodeSnapshot, readNodeSnapshot };
