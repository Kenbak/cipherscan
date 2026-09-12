'use strict';
const { compactBlockToJSON, compactBlockToInbox } = require('./compact-blocks');

// Bound projection/output buffering; gRPC's Readable iterator supplies backpressure.
async function streamInbox(res, Client, grpc, start, end) {
  const client = new Client('127.0.0.1:9067', grpc.credentials.createInsecure());
  const call = client.GetBlockRange({ start: { height: start }, end: { height: end } });
  const close = () => call.cancel();
  res.once('close', close);
  async function write(value) {
    if (res.destroyed) throw new Error('Scan client disconnected');
    const line = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(line) > 16 * 1024 * 1024) throw new Error('Compact stream record too large');
    if (res.write(line)) return;
    await new Promise((resolve, reject) => {
      const clean = () => { res.off('drain', drain); res.off('close', closed); };
      const drain = () => { clean(); resolve(); };
      const closed = () => { clean(); reject(new Error('Scan client disconnected')); };
      res.once('drain', drain); res.once('close', closed);
    });
  }
  try {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    await write({ type: 'start', format: 'inbox-stream-v1', startHeight: start, endHeight: end });
    let expected = start; let previous; let batch = []; let bytes = 0;
    for await (const raw of call) {
      const block = compactBlockToJSON(raw);
      const prevHash = Buffer.from(raw.prevHash || []).toString('hex');
      if (Number(block.height) !== expected || expected > end || !/^[0-9a-f]{64}$/.test(block.hash || '') ||
          !/^[0-9a-f]{64}$/.test(prevHash) || (previous && previous !== prevHash)) {
        throw new Error('Incomplete or disconnected compact chain');
      }
      const packed = { ...compactBlockToInbox(block), hash: block.hash, prevHash };
      const size = Buffer.byteLength(JSON.stringify(packed));
      if (batch.length && bytes + size > 256 * 1024) { await write({ type: 'blocks', blocks: batch }); batch = []; bytes = 0; }
      batch.push(packed); bytes += size; previous = block.hash; expected++;
      if (batch.length >= 128 || bytes >= 256 * 1024) { await write({ type: 'blocks', blocks: batch }); batch = []; bytes = 0; }
    }
    if (expected !== end + 1) throw new Error('Incomplete compact range');
    if (batch.length) await write({ type: 'blocks', blocks: batch });
    await write({ type: 'end', blocksScanned: end - start + 1, endHeight: end, hash: previous });
    res.end();
  } catch (_error) {
    // HTTP status may already be committed. A terminal error is never a success trailer.
    if (!res.destroyed) { await write({ type: 'error', error: 'Compact stream failed; retry the scan' }).catch(() => {}); res.end(); }
  } finally {
    res.off('close', close);
    call.cancel();
    client.close();
  }
}
module.exports = { streamInbox };
