/** View model for the legacy /api/transactions/list endpoint.
 * BIGINT timestamps/heights arrive as decimal strings. Monetary fields remain
 * zatoshis in their original representation; this boundary never converts ZEC.
 */
type ZatoshiValue = string | number | null;

export interface TransactionListItem {
  txid: string;
  block_height: number;
  block_time: number | null;
  size: number;
  tx_index: number | null;
  vin_count: number;
  vout_count: number;
  has_sapling: boolean;
  has_orchard: boolean;
  has_ironwood: boolean;
  has_sprout: boolean;
  is_coinbase: boolean;
  value_balance: ZatoshiValue;
  value_balance_sapling: ZatoshiValue;
  value_balance_orchard: ZatoshiValue;
  value_balance_ironwood: ZatoshiValue;
  total_output: ZatoshiValue;
  flow_type: string | null;
}

function unsignedInteger(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

/** Missing or invalid time stays unknown; never coerce it to the current time. */
export function parseTransactionTimestamp(value: unknown): number | null {
  const seconds = unsignedInteger(value);
  return seconds !== null && seconds > 0 && seconds <= 8_640_000_000_000 ? seconds : null;
}

function integer(value: unknown, field: string): number {
  const number = unsignedInteger(value);
  if (number === null) throw new Error(`Invalid transaction ${field}`);
  return number;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid transaction ${field}`);
  return value;
}

function zatoshis(value: unknown, field: string): ZatoshiValue {
  if (value === null || (typeof value === 'string' && /^-?\d+$/.test(value))
    || (typeof value === 'number' && Number.isSafeInteger(value))) return value;
  throw new Error(`Invalid transaction ${field}`);
}

/** One decode path for homepage, server-rendered archives and browser refreshes. */
export function parseTransactionListItems(value: unknown): TransactionListItem[] {
  if (!Array.isArray(value)) throw new Error('Invalid transaction list');
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid transaction row');
    const row = item as Record<string, unknown>;
    if (typeof row.txid !== 'string' || !/^[0-9a-f]{64}$/i.test(row.txid)) throw new Error('Invalid transaction txid');
    if (row.flow_type !== null && typeof row.flow_type !== 'string') throw new Error('Invalid transaction flow_type');
    return {
      txid: row.txid,
      block_height: integer(row.block_height, 'block_height'),
      block_time: parseTransactionTimestamp(row.block_time),
      size: integer(row.size, 'size'),
      tx_index: row.tx_index == null ? null : integer(row.tx_index, 'tx_index'),
      vin_count: integer(row.vin_count, 'vin_count'),
      vout_count: integer(row.vout_count, 'vout_count'),
      has_sapling: boolean(row.has_sapling, 'has_sapling'),
      has_orchard: boolean(row.has_orchard, 'has_orchard'),
      has_ironwood: boolean(row.has_ironwood, 'has_ironwood'),
      has_sprout: boolean(row.has_sprout, 'has_sprout'),
      is_coinbase: boolean(row.is_coinbase, 'is_coinbase'),
      value_balance: zatoshis(row.value_balance, 'value_balance'),
      value_balance_sapling: zatoshis(row.value_balance_sapling, 'value_balance_sapling'),
      value_balance_orchard: zatoshis(row.value_balance_orchard, 'value_balance_orchard'),
      value_balance_ironwood: zatoshis(row.value_balance_ironwood, 'value_balance_ironwood'),
      total_output: zatoshis(row.total_output, 'total_output'),
      flow_type: row.flow_type,
    };
  });
}
