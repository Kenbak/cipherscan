'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/CopyButton';
import { useTheme } from '@/contexts/ThemeContext';
import { getApiUrl } from '@/lib/api-config';
import { isTestnet } from '@/lib/config';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

// Slider events emit 0.30000000000000004 etc. — snap to the increment.
function snapToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function formatTaz(v: number): string {
  return parseFloat(v.toFixed(4)).toString();
}

interface FaucetStatus {
  balanceTaz: number;
  maxDispensableTaz: number;
  maxSpendTaz: number;
  minSpendTaz: number;
  stepTaz: number;
  donateAddress: string | null;
}

const SYNC_NOTICE_THRESHOLD = 0.2;

function isValidTestnetUnifiedAddress(addr: string): boolean {
  return /^utest1[02-9ac-hj-np-z]{40,}$/.test(addr.trim());
}

function errorMessage(data: { error?: string; detail?: string }): string {
  switch (data.error) {
    case 'invalid address':
      return 'invalid testnet address — expected utest1…';
    case 'drained':
      return 'faucet is dry — mining the next refill, check back later';
    case 'captcha failed':
      return 'captcha verification failed';
    default:
      return data.error || data.detail || 'something broke, try again';
  }
}

export default function FaucetClient() {
  const [address, setAddress] = useState('');
  const [amountTaz, setAmountTaz] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ txid: string; amountTaz: number } | null>(null);
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const { theme, mounted: themeMounted } = useTheme();
  const captchaMisconfigured = !TURNSTILE_SITE_KEY;

  const lowSpendable =
    status != null &&
    status.maxSpendTaz > 0 &&
    status.maxDispensableTaz < status.maxSpendTaz * SYNC_NOTICE_THRESHOLD;
  const overSpendable = status != null && amountTaz != null && amountTaz > status.maxDispensableTaz + 1e-9;

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const res = await fetch(`${getApiUrl()}/api/faucet/status`);
        if (!res.ok) return;
        const data: FaucetStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {}
    }
    loadStatus();
    const interval = setInterval(loadStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (status == null) return;
    if (amountTaz == null || amountTaz > status.maxDispensableTaz) {
      setAmountTaz(status.maxDispensableTaz);
    }
  }, [status, amountTaz]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!isValidTestnetUnifiedAddress(trimmed)) {
      setNotice('invalid testnet address — expected utest1…');
      return;
    }
    if (!captchaToken) {
      setNotice('complete the captcha first');
      return;
    }
    if (amountTaz == null) {
      setNotice('still loading — try again in a moment');
      return;
    }
    setNotice(null);
    setPending(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/faucet/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed, amountTaz, captchaToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.txid) {
        setResult({ txid: data.txid, amountTaz });
        return;
      }

      turnstileRef.current?.reset();
      setCaptchaToken(null);
      setNotice(errorMessage(data));
    } catch (err) {
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      setNotice(err instanceof Error ? err.message : 'network error');
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setAddress('');
    setNotice(null);
    setResult(null);
  }

  if (!isTestnet) {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="card py-16 px-8">
          <div className="w-12 h-12 rounded-full bg-cipher-cyan/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-6 h-6 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold font-mono text-primary mb-3">Testnet Only</h1>
          <p className="text-sm text-muted mb-6">The faucet dispenses testnet ZEC (TAZ).</p>
          <a href="https://testnet.cipherscan.app/faucet" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-sm text-cipher-cyan bg-cipher-cyan/10 hover:bg-cipher-cyan/15 transition-colors">
            Go to Testnet
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> TESTNET_FAUCET
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">Testnet Faucet</h1>
        {lowSpendable && (
          <p className="text-xs text-cipher-orange font-mono mt-2">
            wallet syncing — single dispense currently capped at {formatTaz(status!.maxDispensableTaz)} TAZ
          </p>
        )}
      </div>

      {/* Form / Result */}
      {result ? (
        <Card variant="glass">
          <CardBody>
            <div className="flex items-center gap-2 mb-4">
              <Badge color="green">SENT</Badge>
              <span className="text-sm text-secondary">
                {formatTaz(result.amountTaz)} TAZ dispatched to your address
              </span>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-mono text-muted uppercase tracking-widest">
                <span className="opacity-50">{'>'}</span> TXID
              </div>
              <div className="flex items-center gap-2 font-mono text-xs sm:text-sm text-primary break-all">
                <span>{result.txid}</span>
                <CopyButton text={result.txid} label="Copy txid" />
              </div>
              <p className="text-xs text-muted">
                Likely unconfirmed — confirmation in ~75 seconds.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href={`/tx/${result.txid}`}
                className="text-xs font-mono text-cipher-cyan hover:underline"
              >
                view tx →
              </Link>
              <button
                type="button"
                onClick={reset}
                className="text-xs font-mono text-muted hover:text-cipher-cyan"
              >
                send to another address
              </button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card variant="glass">
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="faucet-address"
                  className="text-xs font-mono text-muted uppercase tracking-widest block mb-2"
                >
                  <span className="opacity-50">{'>'}</span> YOUR_TESTNET_ADDRESS
                </label>
                <input
                  id="faucet-address"
                  type="text"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (notice) setNotice(null);
                  }}
                  placeholder="utest1..."
                  spellCheck={false}
                  autoComplete="off"
                  disabled={pending}
                  className="input-field disabled:opacity-50"
                />
                {notice && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    {notice}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-mono text-muted uppercase tracking-widest">
                    <span className="opacity-50">{'>'}</span> AMOUNT
                  </div>
                  <div className="font-mono text-sm text-cipher-cyan tabular-nums">
                    {formatTaz(amountTaz ?? 0)} <span className="text-muted">TAZ</span>
                  </div>
                </div>
                {status ? (
                  <>
                    <input
                      type="range"
                      min={status.minSpendTaz}
                      max={status.maxDispensableTaz}
                      step={status.stepTaz}
                      value={amountTaz ?? status.minSpendTaz}
                      onChange={(e) => setAmountTaz(snapToStep(parseFloat(e.target.value), status.stepTaz))}
                      disabled={pending}
                      aria-label="Dispense amount in TAZ"
                      className="w-full accent-cipher-cyan cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between font-mono text-[10px] text-muted/70 mt-1">
                      <span>{formatTaz(status.minSpendTaz)} TAZ</span>
                      <span>{formatTaz(status.maxDispensableTaz)} TAZ</span>
                    </div>
                  </>
                ) : (
                  <div className="h-6 font-mono text-[10px] text-muted/70">loading bounds…</div>
                )}
                {overSpendable && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    only {formatTaz(status!.maxDispensableTaz)} TAZ spendable right now — pick a smaller amount
                  </p>
                )}
              </div>

              {captchaMisconfigured ? (
                <p className="text-xs text-cipher-orange font-mono text-center">
                  captcha misconfigured — set NEXT_PUBLIC_TURNSTILE_SITE_KEY on the build.
                </p>
              ) : (
                <div className="flex justify-center">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => setCaptchaToken(null)}
                    options={{
                      theme,
                      size: 'normal',
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={
                  pending ||
                  !address.trim() ||
                  !status ||
                  overSpendable ||
                  captchaMisconfigured ||
                  !captchaToken
                }
                className="w-full bg-cipher-yellow text-black rounded-md px-4 py-3 font-mono font-bold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
              >
                {pending ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Sending {formatTaz(amountTaz ?? 0)} TAZ…
                  </>
                ) : (
                  <>
                    <span className="opacity-60">{'>'}</span> Send {formatTaz(amountTaz ?? 0)} TAZ
                  </>
                )}
              </button>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Wallet stats */}
      <Card variant="glass">
        <CardBody>
          <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-widest">
            <span className="opacity-50">{'>'}</span> FAUCET_STATS
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">
                Wallet balance
              </div>
              <div className="font-mono text-sm text-secondary tabular-nums">
                {status ? `${formatTaz(status.balanceTaz)} TAZ` : '…'}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">
                Available right now
              </div>
              <div className="font-mono text-sm text-cipher-green tabular-nums">
                {status ? `${formatTaz(status.maxDispensableTaz)} TAZ` : '…'}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Rules card */}
      <Card variant="glass">
        <CardBody>
          <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-widest">
            <span className="opacity-50">{'>'}</span> RULES_OF_ENGAGEMENT
          </h3>
          <ul className="space-y-2 text-xs text-secondary font-mono">
            <li>· {status ? `${formatTaz(status.minSpendTaz)} – ${formatTaz(status.maxSpendTaz)} TAZ per request` : '…'}</li>
            <li>· Orchard / Unified addresses (utest1…) only</li>
          </ul>
        </CardBody>
      </Card>

      {/* Donate card */}
      <Card variant="glass">
        <CardBody>
          <h3 className="text-xs font-mono text-muted mb-3 uppercase tracking-widest">
            <span className="opacity-50">{'>'}</span> SUPPORT_THE_FAUCET
          </h3>
          <p className="text-xs text-secondary mb-4">
            Faucet running low? Send TAZ to keep it pouring.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {/* QR */}
            <div className="bg-white/95 dark:bg-black/40 border border-cipher-border rounded-md p-2 flex-shrink-0 self-center sm:self-start">
              {themeMounted && status?.donateAddress && (
                <QRCodeSVG
                  value={status.donateAddress}
                  size={96}
                  level="M"
                  bgColor="var(--color-bg)"
                  fgColor="var(--color-cyan)"
                />
              )}
            </div>

            {/* Address + copy */}
            <div className="flex-1 min-w-0 w-full">
              <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1.5">
                <span className="opacity-50">{'>'}</span> ADDRESS
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-primary break-all">
                {status?.donateAddress ? (
                  <>
                    <span>{status.donateAddress}</span>
                    <CopyButton text={status.donateAddress} label="Copy donate address" />
                  </>
                ) : (
                  <span className="text-muted">loading…</span>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

    </div>
  );
}
