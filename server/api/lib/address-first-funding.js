/** Earliest public inbound output, using the existing per-address history index. */
const FIRST_FUNDING_SQL = `WITH first_receive AS (
          SELECT a.txid, a.block_time, o.value AS amount_zat, t.is_coinbase
          FROM address_transactions a
          JOIN LATERAL (
            SELECT value FROM transaction_outputs
            WHERE txid = a.txid AND address = $1
            ORDER BY vout_index ASC LIMIT 1
          ) o ON true
          JOIN transactions t ON t.txid = a.txid
          WHERE a.address = $1 AND a.is_output = true
          ORDER BY a.block_height ASC, a.tx_index ASC, a.txid ASC
          LIMIT 1
        )
        SELECT
          fr.txid,
          fr.block_time,
          fr.amount_zat,
          fr.is_coinbase,
          funder.address AS funder_address,
          l.label AS funder_label
        FROM first_receive fr
        LEFT JOIN LATERAL (
          SELECT i.address
          FROM transaction_inputs i
          WHERE i.txid = fr.txid AND i.address IS NOT NULL AND i.address != $1
          ORDER BY i.value DESC NULLS LAST
          LIMIT 1
        ) funder ON true
        LEFT JOIN address_labels l ON l.address = funder.address`;

// Older installations may not yet have migration 004's address history table.
const LEGACY_FIRST_FUNDING_SQL = `WITH first_receive AS (
          SELECT o.txid, t.block_time, o.value AS amount_zat, t.is_coinbase
          FROM transaction_outputs o
          JOIN transactions t ON t.txid = o.txid
          WHERE o.address = $1
          ORDER BY t.block_height ASC, o.vout_index ASC
          LIMIT 1
        )
        SELECT
          fr.txid,
          fr.block_time,
          fr.amount_zat,
          fr.is_coinbase,
          funder.address AS funder_address,
          l.label AS funder_label
        FROM first_receive fr
        LEFT JOIN LATERAL (
          SELECT i.address
          FROM transaction_inputs i
          WHERE i.txid = fr.txid AND i.address IS NOT NULL AND i.address != $1
          ORDER BY i.value DESC NULLS LAST
          LIMIT 1
        ) funder ON true
        LEFT JOIN address_labels l ON l.address = funder.address`;

async function getFirstFunding(query, address) {
  try {
    return await query(FIRST_FUNDING_SQL, [address]);
  } catch (error) {
    // Timeouts and connection failures must not trigger another expensive scan.
    if (error.code !== '42P01') throw error;
    return query(LEGACY_FIRST_FUNDING_SQL, [address]);
  }
}

module.exports = { getFirstFunding, FIRST_FUNDING_SQL };
