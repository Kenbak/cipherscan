'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useTheme } from '@/contexts/ThemeContext';
import { getApiUrl } from '@/lib/api-config';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

const FALLBACK_DISPENSE_TAZ = 0.5;
// STUB: real address comes from env once wallet is provisioned
const FAUCET_DONATE_ADDRESS = 'tm9zNbDx7K2pVcRfYqWxJ8mE4hT3nL6Aoq5';

interface FaucetStatus {
  balanceTaz: number;
  dispenseAmountTaz: number;
  cooldownSeconds: number;
  captchaEnabled: boolean;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; txid: string }
  | { kind: 'invalid' }
  | { kind: 'cooldown'; retryAfterSeconds: number }
  | { kind: 'drained' }
  | { kind: 'error'; message: string };

function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.ceil(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function isValidTestnetTransparentAddress(addr: string): boolean {
  return /^tm[a-zA-Z0-9]{32,40}$/.test(addr.trim());
}

export default function FaucetClient() {
  const [address, setAddress] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const { theme, mounted: themeMounted } = useTheme();
  const isDark = theme === 'dark';
  const captchaRequired = !!TURNSTILE_SITE_KEY;

  const dispenseAmount = status?.dispenseAmountTaz ?? FALLBACK_DISPENSE_TAZ;
  const cooldownEnabled = (status?.cooldownSeconds ?? 0) > 0;

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
    if (!isValidTestnetTransparentAddress(trimmed)) {
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
        body: JSON.stringify({ address: trimmed, captchaToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.txid) {
        setState({ kind: 'success', txid: data.txid });
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
        case 'cooldown':
          setState({
            kind: 'cooldown',
            retryAfterSeconds: data.retryAfterSeconds ?? 86400,
          });
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
    setCopied(false);
  }

  async function copyTxid(txid: string) {
    await navigator.clipboard.writeText(txid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyDonateAddress() {
    await navigator.clipboard.writeText(FAUCET_DONATE_ADDRESS);
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 2000);
  }

  const isSubmitting = state.kind === 'submitting';
  const isSuccess = state.kind === 'success';

  return (
    <div className="space-y-6">
      {/* Header + status strip */}
      <div className="flex items-start justify-between gap-4 animate-fade-in">
        <div>
          <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
            <span className="opacity-50">{'>'}</span> TESTNET_FAUCET
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Get free testnet ZEC</h1>
          <p className="text-sm text-secondary mt-2">
            {dispenseAmount} TAZ per address
            {cooldownEnabled && `, every ${formatRetry(status!.cooldownSeconds)}`}. Don&apos;t be a dick.
          </p>
        </div>

        <div className="hidden sm:flex items-center font-mono text-[11px] text-muted flex-shrink-0">
          balance{' '}
          <span className="text-cipher-green ml-1.5">
            {status ? `${status.balanceTaz.toFixed(1)} TAZ` : '…'}
          </span>
        </div>
      </div>

      {/* Mobile balance */}
      <div className="sm:hidden font-mono text-[11px] text-muted">
        balance{' '}
        <span className="text-cipher-green">
          {status ? `${status.balanceTaz.toFixed(1)} TAZ` : '…'}
        </span>
      </div>

      {/* Form / Result */}
      {isSuccess ? (
        <Card variant="glass">
          <CardBody>
            <div className="flex items-center gap-2 mb-4">
              <Badge color="green">SENT</Badge>
              <span className="text-sm text-secondary">
                {dispenseAmount} TAZ dispatched to your address
              </span>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-mono text-muted uppercase tracking-widest">
                <span className="opacity-50">{'>'}</span> TXID
              </div>
              <div className="flex items-center gap-2 font-mono text-xs sm:text-sm text-primary break-all">
                <span>{state.txid}</span>
                <button
                  type="button"
                  onClick={() => copyTxid(state.txid)}
                  className="text-muted hover:text-cipher-cyan flex-shrink-0 font-mono"
                  aria-label="Copy txid"
                >
                  {copied ? '✓' : '⎘'}
                </button>
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
                    if (state.kind !== 'idle' && state.kind !== 'submitting' && state.kind !== 'success') {
                      setState({ kind: 'idle' });
                    }
                  }}
                  placeholder="tm..."
                  spellCheck={false}
                  autoComplete="off"
                  disabled={isSubmitting}
                  className="w-full bg-black/40 border border-cipher-border rounded-md px-3 py-2.5 font-mono text-sm text-primary placeholder:text-muted/40 focus:outline-none focus:border-cipher-cyan/60 focus:ring-1 focus:ring-cipher-cyan/30 transition-colors disabled:opacity-50"
                />
                {state.kind === 'invalid' && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    invalid testnet address — expected <span className="text-primary">tm…</span>
                  </p>
                )}
                {state.kind === 'cooldown' && (
                  <p className="text-xs text-cipher-orange font-mono mt-2">
                    cooldown active — try again in {formatRetry(state.retryAfterSeconds)}
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
                    Sending {dispenseAmount} TAZ…
                  </>
                ) : (
                  <>
                    <span className="opacity-60">{'>'}</span> Send {dispenseAmount} TAZ
                  </>
                )}
              </button>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Rules card */}
      <Card variant="glass">
        <CardBody>
          <h3 className="text-xs font-mono text-muted mb-4 uppercase tracking-widest">
            <span className="opacity-50">{'>'}</span> RULES_OF_ENGAGEMENT
          </h3>
          <ul className="space-y-2 text-xs text-secondary font-mono">
            <li>
              · {dispenseAmount} TAZ per testnet address
              {cooldownEnabled && `, max one per ${formatRetry(status!.cooldownSeconds)}`}
            </li>
            <li>· transparent (tm…) addresses only · shielded support coming</li>
            <li>· this is testnet ZEC — it has no monetary value, don&apos;t try</li>
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
              {themeMounted && (
                <QRCodeSVG
                  value={FAUCET_DONATE_ADDRESS}
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
                <span>{FAUCET_DONATE_ADDRESS}</span>
                <button
                  type="button"
                  onClick={copyDonateAddress}
                  className="text-muted hover:text-cipher-cyan flex-shrink-0 font-mono"
                  aria-label="Copy donate address"
                >
                  {addrCopied ? '✓' : '⎘'}
                </button>
              </div>
              <p className="text-[10px] font-mono text-muted/70 mt-2">
                transparent only · shielded donations coming
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

    </div>
  );
}
