'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { Card, CardBody } from '@/components/ui/Card';
import type { RawTxData } from './types';

interface RawDataSectionProps {
  txid: string;
  rawData: RawTxData | null;
  setRawData: (d: RawTxData | null) => void;
  rawLoading: boolean;
  setRawLoading: (l: boolean) => void;
}

export function RawDataSection({
  txid,
  rawData,
  setRawData,
  rawLoading,
  setRawLoading,
}: RawDataSectionProps) {
  useEffect(() => {
    if (rawData) return;
    setRawLoading(true);
    fetch(`${getApiUrl()}/api/tx/${txid}/verbose`)
      .then((res) => res.json())
      .then((data) => {
        if (data.hex && data.decoded) {
          setRawData({ hex: data.hex, decoded: data.decoded });
        }
      })
      .catch((err) => console.error('Failed to fetch raw tx:', err))
      .finally(() => setRawLoading(false));
  }, [txid, rawData, setRawData, setRawLoading]);

  const [copiedRaw, setCopiedRaw] = useState(false);
  const [showDecoded, setShowDecoded] = useState(true);

  const copyHex = async () => {
    if (!rawData?.hex) return;
    await navigator.clipboard.writeText(rawData.hex);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  if (rawLoading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-cipher-cyan/30 border-t-cipher-cyan rounded-full animate-spin" />
            <span className="ml-3 text-sm text-muted">Loading raw transaction...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!rawData) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted text-center py-8">Failed to load raw transaction data.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="filter-group">
          <button
            onClick={() => setShowDecoded(true)}
            className={`filter-btn ${showDecoded ? 'filter-btn-active' : ''}`}
          >
            Decoded JSON
          </button>
          <button
            onClick={() => setShowDecoded(false)}
            className={`filter-btn ${!showDecoded ? 'filter-btn-active' : ''}`}
          >
            Hex
          </button>
        </div>
        <button
          onClick={copyHex}
          className="ml-auto px-3 py-1.5 text-xs font-mono text-muted hover:text-primary transition-colors"
        >
          {copiedRaw ? '✓ Copied' : 'Copy Hex'}
        </button>
      </div>

      <Card>
        <CardBody>
          {!showDecoded ? (
            <pre className="text-[11px] font-mono text-secondary whitespace-pre-wrap break-all max-h-[600px] overflow-y-auto leading-relaxed">
              {rawData.hex}
            </pre>
          ) : (
            <pre className="text-[11px] font-mono text-secondary whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed">
              {JSON.stringify(rawData.decoded, null, 2)}
            </pre>
          )}
        </CardBody>
      </Card>

      <p className="text-[10px] text-muted font-mono text-center">
        {rawData.hex.length / 2} bytes • {rawData.hex.length} hex characters
      </p>
    </div>
  );
}
