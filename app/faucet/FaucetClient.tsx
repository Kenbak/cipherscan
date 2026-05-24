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

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

// Match taps' deploy/taps.toml: min_spend_zat=100_000, spend_increment_zat=10_000,
// max_spend_zat=100_000_000 (1 TAZ).
const MIN_DISPENSE_TAZ = 0.001;
const MAX_DISPENSE_TAZ = 1;
const STEP_TAZ = 0.0001;
const DEFAULT_DISPENSE_TAZ = 0.1;

// Snap a slider value to the nearest valid step to dodge float drift
// (e.g. 0.30000000000000004 → 0.3).
function snapToStep(v: number): number {
  return Math.round(v / STEP_TAZ) * STEP_TAZ;
}

// Strip trailing zeros from a 4-decimal-place fixed string.
// 0.1 → "0.1", 0.001 → "0.001", 1 → "1".
function formatTaz(v: number): string {
  return parseFloat(v.toFixed(4)).toString();
}

interface FaucetStatus {
  balanceTaz: number;
  maxDispensableTaz: number;
  maxSpendTaz: number;
  dispenseAmountTaz: number;
  captchaEnabled: boolean;
  donateAddress: string | null;
}

// Show a "wallet syncing" notice when a single dispense can fulfill less
// than 20% of the per-tx cap. Above that we consider it healthy fluctuation.
const SYNC_NOTICE_THRESHOLD = 0.2;

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; txid: string; amountTaz: number }
  | { kind: 'invalid' }
  | { kind: 'drained' }
  | { kind: 'error'; message: string };

// Loose testnet Unified Address check (bech32m charset). Strict parsing
// happens server-side in taps.
function isValidTestnetUnifiedAddress(addr: string): boolean {
  return /^utest1[02-9ac-hj-np-z]{40,}$/.test(addr.trim());
}

export default function FaucetClient() {
  const [address, setAddress] = useState('');
  const [amountTaz, setAmountTaz] = useState<number>(DEFAULT_DISPENSE_TAZ);
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const { theme, mounted: themeMounted } = useTheme();
  const isDark = theme === 'dark';
  const captchaRequired = !!TURNSTILE_SITE_KEY;

  const maxDispensable = status?.maxDispensableTaz ?? MAX_DISPENSE_TAZ;
  const maxSpend = status?.maxSpendTaz ?? MAX_DISPENSE_TAZ;
  const lowSpendable =
    status != null && maxSpend > 0 && maxDispensable < maxSpend * SYNC_NOTICE_THRESHOLD;
  const overSpendable = status != null && amountTaz > maxDispensable + 1e-9;

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!isValidTestnetUnifiedAddress(trimmed)) {
      setState({ kind: 'invalid' });
      return;
    }
    if (captchaRequired && !captchaToken) {
      setState({ kind: 'error', message: 'complete the captcha first' });
      return;
    }
    setState({ kind: 'submitting' });

    try {
      const res = await fetch(`${getApiUrl()}/api/faucet/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed, amountTaz, captchaToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.txid) {
        setState({ kind: 'success', txid: data.txid, amountTaz });
        return;
      }

      // Any non-success response invalidates the captcha token — reset the widget
      // so the user gets a fresh one for the next attempt.
      turnstileRef.current?.reset();
      setCaptchaToken(null);

      switch (data.error) {
        case 'invalid address':
          setState({ kind: 'invalid' });
          break;
        case 'drained':
          setState({ kind: 'drained' });
          break;
        case 'captcha failed':
          setState({ kind: 'error', message: 'captcha verification failed' });
          break;
        default:
          setState({
            kind: 'error',
            message: data.error || data.detail || 'something broke, try again',
          });
      }
    } catch (err) {
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'network error',
      });
    }
  }

  function reset() {
    setAddress('');
    setState({ kind: 'idle' });
  }

  const isSubmitting = state.kind === 'submitting';
  const isSuccess = state.kind === 'success';

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
            wallet syncing — single dispense currently capped at {formatTaz(maxDispensable)} TAZ
          </p>
        )}
      </div>

      {/* Form / Result */}
      {isSuccess ? (
        <Card variant="glass">
          <CardBody>
            <div className="flex items-center gap-2 mb-4">
              <Badge color="green">SENT</Badge>
              <span className="text-sm text-secondary">
                {formatTaz(state.amountTaz)} TAZ dispatched to your address
              </span>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-mono text-muted uppercase tracking-widest">
                <span className="opacity-50">{'>'}</span> TXID
              </div>
              <div className="flex items-center gap-2 font-mono text-xs sm:text-sm text-primary break-all">
                <span>{state.txid}</span>
                <CopyButton text={state.txid} label="Copy txid" />
              </div>
              <p className="text-xs text-muted">
                Likely unconfirmed — confirmation in ~75 seconds.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href={`/tx/${state.txid}`}
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
                    if (state.kind !== 'idle' && state.kind !== 'submitting') {
                      setState({ kind: 'idle' });
                    }
                  }}
                  placeholder="utest1..."
                  spellCheck={false}
                  autoComplete="off"
                  disabled={isSubmitting}
                  className="input-field disabled:opacity-50"
                />
                {state.kind === 'invalid' && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    invalid testnet address — expected <span className="text-primary">utest1…</span>
                  </p>
                )}
                {state.kind === 'drained' && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    faucet is dry — mining the next refill, check back later
                  </p>
                )}
                {state.kind === 'error' && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    {state.message}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-mono text-muted uppercase tracking-widest">
                    <span className="opacity-50">{'>'}</span> AMOUNT
                  </div>
                  <div className="font-mono text-sm text-cipher-cyan tabular-nums">
                    {formatTaz(amountTaz)} <span className="text-muted">TAZ</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={MIN_DISPENSE_TAZ}
                  max={MAX_DISPENSE_TAZ}
                  step={STEP_TAZ}
                  value={amountTaz}
                  onChange={(e) => setAmountTaz(snapToStep(parseFloat(e.target.value)))}
                  disabled={isSubmitting}
                  aria-label="Dispense amount in TAZ"
                  className="w-full accent-cipher-cyan cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex justify-between font-mono text-[10px] text-muted/70 mt-1">
                  <span>{MIN_DISPENSE_TAZ} TAZ</span>
                  <span>{MAX_DISPENSE_TAZ} TAZ</span>
                </div>
                {overSpendable && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    only {formatTaz(maxDispensable)} TAZ spendable right now — pick a smaller amount
                  </p>
                )}
              </div>

              {captchaRequired && (
                <div className="flex justify-center">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                    onError={() => setCaptchaToken(null)}
                    options={{
                      theme: isDark ? 'dark' : 'light',
                      size: 'normal',
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !address.trim() ||
                  state.kind === 'drained' ||
                  overSpendable ||
                  (captchaRequired && !captchaToken)
                }
                className="w-full bg-cipher-yellow text-black rounded-md px-4 py-3 font-mono font-bold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
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
                    Sending {formatTaz(amountTaz)} TAZ…
                  </>
                ) : (
                  <>
                    <span className="opacity-60">{'>'}</span> Send {formatTaz(amountTaz)} TAZ
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
            <span className="opacity-50">{'>'}</span> WALLET_STATS
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
            <li>· {MIN_DISPENSE_TAZ} – {MAX_DISPENSE_TAZ} TAZ per request</li>
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
                  bgColor={isDark ? '#08090F' : '#F5F7FA'}
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
