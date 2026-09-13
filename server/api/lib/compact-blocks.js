'use strict';

/** Preserve authoritative pool identity from the upstream protobuf fields. */
function compactBlockToJSON(block) {
  const toHex = value => value ? (typeof value === 'string' ? value : Buffer.from(value).toString('hex')) : null;
  const actions = (values, pool) => (values || []).map(action => ({
    pool, nullifier: toHex(action.nullifier), cmx: toHex(action.cmx),
    ephemeralKey: toHex(action.ephemeralKey), ciphertext: toHex(action.ciphertext),
  }));
  return {
    height: block.height, hash: toHex(block.hash), time: block.time,
    vtx: (block.vtx || []).map(tx => ({
      index: tx.index, hash: toHex(tx.hash),
      outputs: (tx.outputs || []).map(output => ({
        cmu: toHex(output.cmu), ephemeralKey: toHex(output.epk), ciphertext: toHex(output.ciphertext),
      })),
      actions: [...actions(tx.actions, 'orchard'), ...actions(tx.ironwoodActions, 'ironwood')],
    })),
  };
}

function isCompleteRange(blocks, start, end) {
  return Array.isArray(blocks) && blocks.length === end - start + 1 &&
    blocks.every((block, index) => Number(block.height) === start + index);
}
/** Opt-in inbox transport. Keep the disk cache and default response unchanged. */
function compactBlockToInbox(block) {
  return { height: block.height, time: block.time, vtx: (block.vtx || [])
    .filter(tx => tx.actions?.length)
    .map(tx => {
      const bytes = Buffer.alloc(tx.actions.length * 149);
      tx.actions.forEach((action, index) => {
        let offset = index * 149;
        if (action.pool !== undefined && action.pool !== 'orchard' && action.pool !== 'ironwood') throw new Error('Invalid compact pool');
        bytes[offset++] = action.pool === 'orchard' ? 1 : action.pool === 'ironwood' ? 2 : 0;
        for (const [field, size] of [['nullifier', 32], ['cmx', 32], ['ephemeralKey', 32], ['ciphertext', 52]]) {
          const value = action[field];
          if (typeof value !== 'string' || value.length !== size * 2 || !/^[0-9a-f]+$/i.test(value)) throw new Error('Invalid compact action');
          Buffer.from(value, 'hex').copy(bytes, offset); offset += size;
        }
      });
      return { hash: tx.hash, records: bytes.toString('base64') };
    }) };
}
module.exports = { compactBlockToJSON, isCompleteRange, compactBlockToInbox };
