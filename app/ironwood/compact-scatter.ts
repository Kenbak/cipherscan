import type { ScatterData, ScatterTx } from './components/types';

type CompactPoint = [
  height: number,
  timestamp: number | null,
  amountZat: string,
  txid: string,
  denominated: 0 | 1,
  denominationIndex: number,
  ironwoodActions: number,
  orchardActions: number,
  anchorCompliant: 0 | 1,
  feeZat: string,
  expiryDelta: number | null,
  familyIndex: number,
  confidenceIndex: number,
  shortLabelIndex: number,
];

interface CompactSummary {
  total: number;
  denominatedCount: number;
  distinctiveCount: number;
  denominatedVolumeZat: string;
  distinctiveVolumeZat: string;
}

export interface ScatterCursor {
  height: number;
  hash: string | null;
}

interface CompactDictionaries {
  denominations: number[];
  families: string[];
  confidences: string[];
  shortLabels: string[];
}

export interface CompactScatterResponse {
  success: boolean;
  version: 1;
  network: string;
  range?: string;
  resetRequired?: boolean;
  cursor: ScatterCursor;
  summary?: CompactSummary;
  dictionaries?: CompactDictionaries;
  points?: CompactPoint[];
}

interface CompactManifest extends CompactScatterResponse {
  chunkBlocks: number;
  finalizedThrough: number;
  chunks: Array<{ start: number; end: number }>;
  mutableTailStart: number;
}

function safeIntegerString(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('Scatter zatoshi value exceeds safe range');
  return parsed;
}

function decodePoint(point: CompactPoint, dictionaries: CompactDictionaries): ScatterTx {
  const amountZat = safeIntegerString(point[2]);
  return {
    height: point[0],
    timestamp: point[1],
    amountZec: amountZat / 100_000_000,
    txid: point[3],
    privacy: point[4] === 1 ? 'denominated' : 'distinctive',
    matchedDenomination: point[5] >= 0 ? dictionaries.denominations[point[5]] ?? null : null,
    ironwoodActions: point[6],
    orchardActions: point[7],
    anchorCompliant: point[8] === 1,
    fee: safeIntegerString(point[9]),
    expiryDelta: point[10],
    family: point[11] >= 0 ? dictionaries.families[point[11]] : undefined,
    familyConfidence: point[12] >= 0 ? dictionaries.confidences[point[12]] : undefined,
    familyShortLabel: point[13] >= 0 ? dictionaries.shortLabels[point[13]] : undefined,
  };
}

function decodeSummary(summary: CompactSummary | undefined, txs: ScatterTx[]): ScatterData {
  const denominatedCount = summary?.denominatedCount
    ?? txs.filter((tx) => tx.privacy === 'denominated').length;
  const distinctiveCount = summary?.distinctiveCount ?? txs.length - denominatedCount;
  const total = summary?.total ?? txs.length;
  return {
    success: true,
    total,
    denominatedCount,
    distinctiveCount,
    denominatedPercent: total > 0 ? Math.round((denominatedCount / total) * 100) : 0,
    denominatedVolumeZat: summary ? safeIntegerString(summary.denominatedVolumeZat) : undefined,
    distinctiveVolumeZat: summary ? safeIntegerString(summary.distinctiveVolumeZat) : undefined,
    txs,
  };
}

export function decodeCompactScatter(response: CompactScatterResponse): ScatterData {
  if (!response.success || response.version !== 1) throw new Error('Unsupported scatter response');
  const dictionaries = response.dictionaries;
  const points = response.points ?? [];
  if (points.length > 0 && !dictionaries) throw new Error('Scatter dictionaries are missing');
  const txs = dictionaries ? points.map((point) => decodePoint(point, dictionaries)) : [];
  return {
    ...decodeSummary(response.summary, txs),
    network: response.network,
  };
}

export function mergeScatter(base: ScatterData, delta: ScatterData): ScatterData {
  const byTxid = new Map(base.txs.map((tx) => [tx.txid, tx]));
  for (const tx of delta.txs) byTxid.set(tx.txid, tx);
  const txs = Array.from(byTxid.values()).sort(
    (a, b) => a.height - b.height || a.txid.localeCompare(b.txid),
  );
  return {
    ...base,
    ...delta,
    txs,
  };
}

async function fetchCompact(
  url: string,
  expectedNetwork: string,
  signal: AbortSignal,
): Promise<CompactScatterResponse> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Scatter request failed with HTTP ${response.status}`);
  const body = await response.json() as CompactScatterResponse;
  if (!body.success || body.network !== expectedNetwork) {
    throw new Error('Scatter response network mismatch');
  }
  return body;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}

export async function loadAllScatter(
  apiBase: string,
  expectedNetwork: string,
  signal: AbortSignal,
): Promise<{ data: ScatterData; cursor: ScatterCursor }> {
  const manifest = await fetchCompact(
    `${apiBase}/api/migration/scatter/compact?manifest=1`,
    expectedNetwork,
    signal,
  ) as CompactManifest;
  const chunks = await mapWithConcurrency(manifest.chunks, 4, (chunk) => fetchCompact(
    `${apiBase}/api/migration/scatter/compact?chunkStart=${chunk.start}`,
    expectedNetwork,
    signal,
  ));
  const tailAfter = Math.max(0, manifest.mutableTailStart - 1);
  const tail = await fetchCompact(
    `${apiBase}/api/migration/scatter/compact?afterHeight=${tailAfter}`,
    expectedNetwork,
    signal,
  );
  const decoded = [...chunks, tail].map(decodeCompactScatter);
  const merged = decoded.reduce(
    (current, part) => mergeScatter(current, part),
    decodeSummary(manifest.summary, []),
  );
  return {
    data: { ...merged, network: expectedNetwork },
    cursor: tail.cursor,
  };
}

