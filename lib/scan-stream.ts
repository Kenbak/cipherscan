import type { CompactBlock } from './scan-records';
export interface LinkedCompactBlock extends CompactBlock { hash?: string; prevHash?: string }

/** Incremental framing: require ordered data, hash continuity, a trailer, and clean EOF. */
export async function* readCompactRange(response: Response, start: number, end: number, signal: AbortSignal, previousHash?: string): AsyncGenerator<LinkedCompactBlock[]> {
  if (!response.ok) throw new Error(`Scan request failed (${response.status})`);
  const packedValid = (blocks: LinkedCompactBlock[]) => blocks.every(block => Array.isArray(block.vtx) && block.vtx.every(tx => typeof tx.records === 'string' && tx.actions === undefined));
  if (!response.headers?.get('content-type')?.includes('application/x-ndjson')) {
    const data = await response.json();
    const blocks: LinkedCompactBlock[] = data.blocks;
    if (data.format !== undefined && data.format !== 'inbox-v1') throw new Error('Unsupported scan response format');
    if (!Array.isArray(blocks) || blocks.length !== end - start + 1 || blocks.some((b, i) => Number(b.height) !== start + i)) throw new Error('Incomplete compact block range; retry the scan');
    if (data.format === 'inbox-v1' && !packedValid(blocks)) throw new Error('Invalid packed scan response');
    signal.throwIfAborted();
    yield blocks;
    return;
  }
  if (!response.body) throw new Error('Missing compact stream');
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = ''; let started = false; let ended = false; let expected = start; let lastHash = previousHash;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        if (newline > 16 * 1024 * 1024) throw new Error('Compact stream record too large');
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line || ended) throw new Error('Unexpected compact stream data');
        const record = JSON.parse(line);
        if (record.type === 'error') throw new Error('Compact stream failed; retry the scan');
        if (!started) {
          if (record.type !== 'start' || record.format !== 'inbox-stream-v1' || record.startHeight !== start || record.endHeight !== end) throw new Error('Invalid compact stream header');
          started = true; continue;
        }
        if (record.type === 'blocks') {
          const blocks: LinkedCompactBlock[] = record.blocks;
          if (!Array.isArray(blocks) || !blocks.length || blocks.length > 128 || !packedValid(blocks)) throw new Error('Invalid compact stream batch');
          for (const block of blocks) {
            if (Number(block.height) !== expected || expected > end || !/^[0-9a-f]{64}$/.test(block.hash || '') ||
                !/^[0-9a-f]{64}$/.test(block.prevHash || '') || (lastHash && block.prevHash !== lastHash)) throw new Error('Incomplete or disconnected compact chain');
            expected++; lastHash = block.hash;
          }
          yield blocks;
        } else if (record.type === 'end') {
          if (expected !== end + 1 || record.endHeight !== end || record.blocksScanned !== end - start + 1 || record.hash !== lastHash) throw new Error('Incomplete compact stream');
          ended = true;
        } else throw new Error('Unexpected compact stream record');
      }
      if (buffer.length > 16 * 1024 * 1024) throw new Error('Compact stream record too large');
      if (done) break;
    }
    if (!started || !ended || buffer) throw new Error('Truncated compact stream');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
