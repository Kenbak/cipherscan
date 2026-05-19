'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useTheme } from '@/contexts/ThemeContext';

const DISPENSE_AMOUNT_TAZ = 0.5;
const COOLDOWN_HOURS = 24;
// STUB: real address comes from env once wallet is provisioned
const FAUCET_DONATE_ADDRESS = 'tm9zNbDx7K2pVcRfYqWxJ8mE4hT3nL6Aoq5';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; txid: string }
  | { kind: 'invalid' };

function isValidTestnetTransparentAddress(addr: string): boolean {
  return /^tm[a-zA-Z0-9]{32,40}$/.test(addr.trim());
}

export default function FaucetClient() {
  const [address, setAddress] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const { theme, mounted: themeMounted } = useTheme();
  const isDark = theme === 'dark';

  // STUB: status will come from /api/faucet/status once backend lands
  const stubStatus = {
    balanceTAZ: 812.4,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!isValidTestnetTransparentAddress(trimmed)) {
      setState({ kind: 'invalid' });
      return;
    }
    setState({ kind: 'submitting' });
    // STUB: simulate a 1.5s dispense
    await new Promise((r) => setTimeout(r, 1500));
    setState({
      kind: 'success',
      txid: '4f3b9c129a87d10e4d3fa1b2c5e6f0d2e8a9b3c4d5e6f708192a3b4c5d6e7f80a',
    });
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
            {DISPENSE_AMOUNT_TAZ} TAZ per address, every {COOLDOWN_HOURS}h. Don&apos;t be a dick.
          </p>
        </div>

        <div className="hidden sm:flex items-center font-mono text-[11px] text-muted flex-shrink-0">
          balance{' '}
          <span className="text-cipher-green ml-1.5">
            {stubStatus.balanceTAZ.toFixed(1)} TAZ
          </span>
        </div>
      </div>

      {/* Mobile balance */}
      <div className="sm:hidden font-mono text-[11px] text-muted">
        balance{' '}
        <span className="text-cipher-green">{stubStatus.balanceTAZ.toFixed(1)} TAZ</span>
      </div>

      {/* Form / Result */}
      {isSuccess ? (
        <Card variant="glass">
          <CardBody>
            <div className="flex items-center gap-2 mb-4">
              <Badge color="green">SENT</Badge>
              <span className="text-sm text-secondary">
                {DISPENSE_AMOUNT_TAZ} TAZ dispatched to your address
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
                    if (state.kind === 'invalid') setState({ kind: 'idle' });
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
              </div>

              {/* Captcha placeholder */}
              <div className="border border-dashed border-cipher-border rounded-md p-4 flex items-center justify-center text-xs font-mono text-muted bg-black/20">
                [ Turnstile widget · stub ]
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !address.trim()}
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
                    Sending {DISPENSE_AMOUNT_TAZ} TAZ…
                  </>
                ) : (
                  <>
                    <span className="opacity-60">{'>'}</span> Send {DISPENSE_AMOUNT_TAZ} TAZ
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
            <li>· {DISPENSE_AMOUNT_TAZ} TAZ per testnet address, max one per {COOLDOWN_HOURS}h</li>
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
