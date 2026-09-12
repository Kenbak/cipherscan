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
module.exports = { compactBlockToJSON, isCompleteRange };
