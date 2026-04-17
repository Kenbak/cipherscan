'use client';

import { useEffect, useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getApiUrl } from '@/lib/api-config';

interface BootstrapInfo {
  success: boolean;
  available: boolean;
  generated_at?: string;
  tip_height?: number;
  finalized_height?: number;
  finalized_hash?: string;
  size_bytes?: number;
  sha256?: string;
  cache_dir_name?: string;
  contents?: string[];
  excludes?: string[];
  download_url?: string;
  sha256_url?: string;
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function parseTimestamp(raw?: string): number {
  if (!raw) return NaN;
  // The snapshot script writes compact ISO like "20260417T145553Z".
  // new Date() can't parse that, so normalize to "2026-04-17T14:55:53Z".
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (m) {
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  return new Date(raw).getTime();
}

function fmtAgo(iso?: string): string {
  if (!iso) return '';
  const ms = parseTimestamp(iso);
  if (isNaN(ms)) return '';
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function CopyBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="block-hash-bg border border-cipher-border rounded p-3 text-xs font-mono text-secondary overflow-x-auto">
        <code>{children}</code>
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(children).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-cipher-bg border border-cipher-border px-2 py-1 text-[10px] font-mono text-muted hover:text-cipher-cyan rounded"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

export default function BootstrapPage() {
  const [info, setInfo] = useState<BootstrapInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/crosslink/bootstrap-info`)
      .then((r) => r.json())
      .then((data) => setInfo(data))
      .catch(() => setInfo({ success: false, available: false }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> BOOTSTRAP
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">
          Zebra Crosslink Bootstrap
        </h1>
        <p className="text-sm text-secondary leading-relaxed">
          Skip the multi-hour genesis resync by restoring your local Zebra cache from this
          snapshot of our node&apos;s state. Useful when your node hits the ~block-1120 sidechain
          corruption bug, after fresh installs, or any time you need to get back online fast.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardBody className="py-10 text-center text-muted text-sm">Loading snapshot info…</CardBody>
        </Card>
      ) : !info?.available ? (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-sm text-muted mb-2">No public snapshot has been published yet.</p>
            <p className="text-xs text-muted">
              Snapshots are only published when our node has been stable on the majority chain for
              a while. Check back in a few hours.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Snapshot metadata */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cipher-green opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-cipher-green" />
                  </span>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                    Latest snapshot
                  </h2>
                </div>
                <Badge color="green">{fmtAgo(info.generated_at)}</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="PoW Tip" value={`#${info.tip_height?.toLocaleString()}`} />
                <Stat label="Finalized" value={`#${info.finalized_height?.toLocaleString()}`} />
                <Stat label="Size" value={fmtBytes(info.size_bytes || 0)} />
                <Stat label="Generated" value={fmtAgo(info.generated_at)} />
              </div>

              <div className="mt-5 space-y-3 text-xs">
                <div>
                  <div className="text-muted font-mono uppercase tracking-wider text-[10px] mb-1">
                    SHA256
                  </div>
                  <code className="block font-mono text-secondary break-all">{info.sha256}</code>
                </div>
                <div>
                  <div className="text-muted font-mono uppercase tracking-wider text-[10px] mb-1">
                    Finalized block hash
                  </div>
                  <code className="block font-mono text-secondary break-all">{info.finalized_hash}</code>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Contents notice */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-primary mb-3">What&apos;s inside</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-cipher-green font-mono uppercase tracking-wider text-[10px] mb-2">
                    Included (public data)
                  </div>
                  <ul className="space-y-1 text-secondary">
                    {info.contents?.map((c) => (
                      <li key={c}>
                        <span className="text-cipher-green">✓</span> <code className="font-mono">{c}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-cipher-orange font-mono uppercase tracking-wider text-[10px] mb-2">
                    Never included
                  </div>
                  <ul className="space-y-1 text-secondary">
                    {info.excludes?.map((c) => (
                      <li key={c}>
                        <span className="text-cipher-orange">✗</span> <code className="font-mono">{c}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 text-[11px] text-muted leading-relaxed">
                Wallet keys and service state stay on our server. The archive only contains the
                RocksDB blockchain state and BFT chain data — bytes that are identical on every
                honest node at the same height.
              </p>
            </CardBody>
          </Card>

          {/* How to use */}
          <Card className="mb-6">
            <CardBody className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-primary mb-1">How to restore</h3>
              <p className="text-xs text-muted mb-4">
                Run these commands on the machine where you run zebrad / the Crosslink GUI.
              </p>

              <div className="space-y-5">
                <Step
                  n={1}
                  title="Stop your node / close the GUI"
                  description="If the Crosslink GUI is running, quit it. If zebrad is a systemd service, stop it."
                />

                <div>
                  <StepHeader n={2} title="Back up your wallet seed" />
                  <p className="text-xs text-muted mb-2">
                    This is the one file that MUST be preserved across the reset. The snapshot
                    does not contain your seed — if you lose it, you lose your mined cTAZ.
                  </p>
                  <CopyBlock>{`# macOS GUI users:
cp ~/Library/Caches/zebra/${info.cache_dir_name}/secret.seed ~/crosslink-seed.backup

# Linux server users:
cp ~/.cache/zebra/${info.cache_dir_name}/secret.seed ~/crosslink-seed.backup`}</CopyBlock>
                </div>

                <div>
                  <StepHeader n={3} title="Download the snapshot + checksum" />
                  <CopyBlock>{`curl -LO ${info.download_url}
curl -LO ${info.sha256_url}`}</CopyBlock>
                </div>

                <div>
                  <StepHeader n={4} title="Verify the checksum" />
                  <p className="text-xs text-muted mb-2">
                    Always verify — this protects you from a tampered download.
                  </p>
                  <CopyBlock>{`sha256sum -c bootstrap.tar.gz.sha256
# Should print:  bootstrap.tar.gz: OK`}</CopyBlock>
                </div>

                <div>
                  <StepHeader n={5} title="Wipe the broken cache and extract the snapshot" />
                  <CopyBlock>{`# macOS GUI users:
rm -rf ~/Library/Caches/zebra/${info.cache_dir_name}
mkdir -p ~/Library/Caches/zebra/${info.cache_dir_name}
tar -xzf bootstrap.tar.gz -C ~/Library/Caches/zebra/

# Linux server users:
rm -rf ~/.cache/zebra/${info.cache_dir_name}
mkdir -p ~/.cache/zebra/${info.cache_dir_name}
tar -xzf bootstrap.tar.gz -C ~/.cache/zebra/`}</CopyBlock>
                </div>

                <div>
                  <StepHeader n={6} title="Restore your wallet seed" />
                  <CopyBlock>{`# macOS GUI users:
mv ~/crosslink-seed.backup ~/Library/Caches/zebra/${info.cache_dir_name}/secret.seed

# Linux server users:
mv ~/crosslink-seed.backup ~/.cache/zebra/${info.cache_dir_name}/secret.seed`}</CopyBlock>
                </div>

                <Step
                  n={7}
                  title="Start your node / relaunch the GUI"
                  description="Your node will pick up from the snapshot block and start receiving new blocks. You should see the finality gap stabilize at 0-5 within a minute."
                />
              </div>
            </CardBody>
          </Card>

          {/* Trust disclaimer */}
          <Card>
            <CardBody className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-primary mb-2">Trust &amp; verification</h3>
              <div className="text-xs text-secondary space-y-2 leading-relaxed">
                <p>
                  This snapshot is only published when our node has been on the majority chain
                  with a finality gap ≤ 5 blocks and its finalized block hash matches a reference
                  explorer. If any check fails, no new snapshot is written.
                </p>
                <p>
                  You are still trusting CipherScan to host an honest snapshot. For maximum
                  assurance: after restoring, compare your finalized block hash against a second
                  source (e.g.{' '}
                  <a
                    href="https://ctaz.frontiercompute.cash"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cipher-cyan hover:underline"
                  >
                    ctaz.frontiercompute.cash
                  </a>
                  ) before staking any significant cTAZ.
                </p>
                <p>
                  Source code for the snapshotter:{' '}
                  <code className="text-muted">server/scripts/zebra-public-snapshot.sh</code>{' '}
                  in the cipherscan repo.
                </p>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm sm:text-base font-mono font-bold text-primary">{value}</div>
    </div>
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="inline-flex w-5 h-5 rounded-full bg-cipher-hover text-muted text-[11px] font-mono items-center justify-center shrink-0">
        {n}
      </span>
      <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">{title}</h4>
    </div>
  );
}

function Step({ n, title, description }: { n: number; title: string; description: string }) {
  return (
    <div>
      <StepHeader n={n} title={title} />
      <p className="text-xs text-secondary leading-relaxed">{description}</p>
    </div>
  );
}
