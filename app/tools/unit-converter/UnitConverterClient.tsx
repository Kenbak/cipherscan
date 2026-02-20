'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';

const ZATOSHIS_PER_ZEC = 100_000_000; // 10^8

function formatZatoshi(value: bigint | null): string {
  if (value === null) return '';
  return value.toLocaleString('en-US', { useGrouping: true });
}

/** Format ZEC for display; never use scientific notation (e.g. 0.00000001 not 1e-8). */
function formatZec(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '';
  if (value === 0) return '0';
  const s = value.toFixed(8);
  return s.replace(/\.?0+$/, '') || '0';
}

/** One reference row: label, displayed value, value to copy. */
function CopyableRow({
  label,
  valueDisplay,
  valueToCopy,
}: {
  label: string;
  valueDisplay: string;
  valueToCopy: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(valueToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-cipher-border/20 last:border-0">
      <span className="text-xs font-mono text-muted shrink-0">{label}</span>
      <code className="font-mono text-sm text-secondary text-right break-all min-w-0 flex-1">
        {valueDisplay}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 p-1.5 rounded-md text-muted hover:text-cipher-cyan hover:bg-cipher-hover transition-colors"
        aria-label={`Copy ${valueToCopy}`}
      >
        {copied ? (
          <svg className="w-4 h-4 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function UnitConverterClient() {
  const [zecInput, setZecInput] = useState('');
  const [zatoshiInput, setZatoshiInput] = useState('');

  const fromZec = useCallback((zecStr: string): { zec: number | null; zatoshi: bigint | null } => {
    const trimmed = zecStr.trim().replace(/,/g, '');
    if (trimmed === '') return { zec: null, zatoshi: null };
    const zec = parseFloat(trimmed);
    if (Number.isNaN(zec) || zec < 0) return { zec: null, zatoshi: null };
    const zatoshi = Math.round(zec * ZATOSHIS_PER_ZEC);
    return { zec, zatoshi: BigInt(zatoshi) };
  }, []);

  const fromZatoshi = useCallback((zatoshiStr: string): { zec: number | null; zatoshi: bigint | null } => {
    const trimmed = zatoshiStr.trim().replace(/,/g, '');
    if (trimmed === '') return { zec: null, zatoshi: null };
    try {
      const zatoshi = BigInt(trimmed);
      if (zatoshi < 0n) return { zec: null, zatoshi: null };
      const zec = Number(zatoshi) / ZATOSHIS_PER_ZEC;
      return { zec, zatoshi };
    } catch {
      return { zec: null, zatoshi: null };
    }
  }, []);

  const handleZecChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setZecInput(v);
    const { zatoshi } = fromZec(v);
    setZatoshiInput(zatoshi !== null ? formatZatoshi(zatoshi) : '');
  };

  const handleZatoshiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setZatoshiInput(v);
    const { zec } = fromZatoshi(v);
    setZecInput(zec !== null ? formatZec(zec) : '');
  };

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text.replace(/,/g, ''));
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const [copiedZec, setCopiedZec] = useState(false);
  const [copiedZatoshi, setCopiedZatoshi] = useState(false);
  const zecResult = fromZec(zecInput);
  const zatoshiResult = fromZatoshi(zatoshiInput);
  const zecForCopy = zecInput.trim() ? (zecResult.zec !== null ? formatZec(zecResult.zec) : zecInput.replace(/,/g, '')) : '';
  const zatoshiForCopy = zatoshiInput.trim() ? (zatoshiResult.zatoshi != null ? zatoshiResult.zatoshi.toString() : zatoshiInput.replace(/,/g, '')) : '';

  const CopyIcon = ({ copied }: { copied: boolean }) =>
    copied ? (
      <svg className="w-5 h-5 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    );

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header — full width */}
      <div className="mb-8">
        <Link
          href="/tools"
          className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors mb-4 inline-block"
        >
          ← All Tools
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-primary">ZEC ↔ Zatoshi</h1>
        <p className="text-sm text-secondary mt-1">
          1 ZEC = 100,000,000 zatoshis (10<sup>8</sup>). Convert between ZEC and the smallest protocol unit.
        </p>
      </div>

      {/* Balanced two columns — equal width, no sticky */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {/* Left column: converter + why */}
        <div className="space-y-6 min-w-0">
          <Card>
            <CardBody className="space-y-6">
              <label htmlFor="zec" className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                ZEC
              </label>
              <div className="flex gap-2">
                <input
                  id="zec"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.5"
                  value={zecInput}
                  onChange={handleZecChange}
                  className="input-field flex-1 font-mono text-lg min-w-0"
                  aria-label="ZEC amount"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(zecForCopy, setCopiedZec)}
                  disabled={!zecForCopy}
                  className="p-2 rounded-md text-muted hover:text-cipher-cyan hover:bg-cipher-hover transition-colors disabled:opacity-40 disabled:pointer-events-none self-center shrink-0"
                  aria-label="Copy ZEC value"
                >
                  <CopyIcon copied={copiedZec} />
                </button>
              </div>

              <div className="flex justify-center text-muted font-mono text-xl" aria-hidden="true">
                ⟷
              </div>

              <label htmlFor="zatoshi" className="block text-xs font-mono text-muted uppercase tracking-wider mb-2">
                Zatoshi
              </label>
              <div className="flex gap-2">
                <input
                  id="zatoshi"
                  type="text"
                  inputMode="numeric"
                  placeholder="50000000"
                  value={zatoshiInput}
                  onChange={handleZatoshiChange}
                  className="input-field flex-1 font-mono text-lg min-w-0"
                  aria-label="Zatoshi amount"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(zatoshiForCopy, setCopiedZatoshi)}
                  disabled={!zatoshiForCopy}
                  className="p-2 rounded-md text-muted hover:text-cipher-cyan hover:bg-cipher-hover transition-colors disabled:opacity-40 disabled:pointer-events-none self-center shrink-0"
                  aria-label="Copy zatoshi value"
                >
                  <CopyIcon copied={copiedZatoshi} />
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="text-sm font-bold text-primary mb-2 font-mono">Why zatoshis?</h2>
              <p className="text-sm text-secondary leading-relaxed">
                Zatoshi is the smallest unit of ZEC (1 zatoshi = 10<sup>-8</sup> ZEC). Wallets and protocols
                often work in zatoshis to avoid floating-point issues. Transaction amounts in the blockchain
                and in raw transaction hex are expressed in zatoshis.
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Right column: reference values — same visual weight */}
        <div className="min-w-0">
          <Card className="h-full">
            <CardBody>
              <h2 className="text-sm font-bold text-primary mb-1 font-mono">Reference values</h2>
              <p className="text-xs text-muted mb-4">Copy for use in scripts or APIs.</p>
              <div className="space-y-0">
                <CopyableRow label="1 ZEC" valueDisplay="100,000,000 zatoshi" valueToCopy="100000000" />
                <CopyableRow label="1 zatoshi" valueDisplay="0.00000001 ZEC" valueToCopy="0.00000001" />
                <CopyableRow label="0.0001 ZEC" valueDisplay="10,000 zatoshi" valueToCopy="0.0001" />
                <CopyableRow label="ZIP-317 fee" valueDisplay="10,000 zatoshi = 0.0001 ZEC" valueToCopy="10000" />
                <CopyableRow label="100,000 zatoshi" valueDisplay="0.001 ZEC" valueToCopy="100000" />
                <CopyableRow label="1,000,000 zatoshi" valueDisplay="0.01 ZEC" valueToCopy="1000000" />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
