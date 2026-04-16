'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { STAKING_DAY_PERIOD, STAKING_DAY_WINDOW } from '@/lib/config';

const InfoIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ShieldIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const LayersIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
);

const UsersIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ZapIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const ExternalLinkIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const ChevronRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

function GlossaryItem({ term, definition }: { term: string; definition: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-cipher-border/50 last:border-0">
      <span className="font-mono text-sm font-bold text-cipher-cyan whitespace-nowrap">{term}</span>
      <span className="text-sm text-secondary leading-relaxed">{definition}</span>
    </div>
  );
}

export function CrosslinkLearn() {
  return (
    <div className="min-h-screen">
      {/* HERO */}
      <div className="border-b border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            <div>
              <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
                <span className="opacity-50">{'>'}</span> LEARN_CROSSLINK
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-5">
                What is Crosslink?
              </h1>
              <p className="text-secondary leading-relaxed mb-4">
                Crosslink is an upgrade to Zcash that adds a <strong className="text-primary">Proof-of-Stake finality gadget</strong> on
                top of Proof-of-Work. It strengthens the network by making confirmed blocks irreversible, while keeping PoW
                as the foundation of consensus.
              </p>
              <p className="text-secondary leading-relaxed mb-6">
                This is the <strong className="text-cipher-purple">Season 1 Feature Net</strong> — an incentivized
                testnet where participants earn cTAZ that converts to real ZEC rewards.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/validators"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-medium rounded-lg transition-colors"
                >
                  <ShieldIcon className="w-3.5 h-3.5" />
                  <span>View Finalizers</span>
                </Link>
                <a
                  href="https://github.com/ShieldedLabs/crosslink_monolith/releases/tag/season-1-workshop-1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-cipher-border hover:border-cipher-cyan text-secondary hover:text-cipher-cyan rounded-lg transition-colors"
                >
                  <ExternalLinkIcon className="w-3.5 h-3.5" />
                  <span>Download Desktop App</span>
                </a>
              </div>
            </div>

            {/* Visual: how it works diagram */}
            <div className="rounded-xl border border-cipher-border bg-[#0a0a0f] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-cipher-border/50 bg-cipher-surface/30">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                <span className="text-[10px] font-mono text-muted/40 ml-2">crosslink architecture</span>
              </div>
              <div className="p-5 sm:p-6 font-mono text-sm space-y-4">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-cipher-cyan" />
                  <span className="text-cipher-cyan">PoW Chain</span>
                  <span className="text-muted">miners produce blocks</span>
                </div>
                <div className="ml-1.5 border-l-2 border-cipher-border/30 h-4" />
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-cipher-purple" />
                  <span className="text-cipher-purple">Finality Gadget</span>
                  <span className="text-muted">finalizers vote via BFT</span>
                </div>
                <div className="ml-1.5 border-l-2 border-cipher-border/30 h-4" />
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-cipher-green" />
                  <span className="text-cipher-green">Finalized Block</span>
                  <span className="text-muted">irreversible, no reorgs</span>
                </div>
                <div className="mt-4 pt-4 border-t border-cipher-border/30 text-muted text-xs leading-relaxed">
                  Stakers delegate cTAZ to finalizers, who gain voting power.
                  Once 2/3+ of stake agrees, a block becomes finalized.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROLES */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-xs font-mono text-muted uppercase tracking-wider mb-6">{'>'} ROLES</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="glass" className="border-l-2 border-l-cipher-cyan/30">
            <CardBody>
              <div className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center mb-4">
                <ZapIcon className="w-5 h-5 text-cipher-cyan" />
              </div>
              <h3 className="font-bold text-primary mb-2">Miner</h3>
              <p className="text-sm text-secondary leading-relaxed">
                Produce new blocks using Proof-of-Work. Every block earns <strong className="text-cipher-cyan">5 cTAZ</strong> for
                the miner. The desktop app CPU-mines by default.
              </p>
            </CardBody>
          </Card>

          <Card variant="glass" className="border-l-2 border-l-cipher-purple/30">
            <CardBody>
              <div className="w-10 h-10 rounded-xl bg-cipher-purple/10 flex items-center justify-center mb-4">
                <ShieldIcon className="w-5 h-5 text-cipher-purple" />
              </div>
              <h3 className="font-bold text-primary mb-2">Finalizer</h3>
              <p className="text-sm text-secondary leading-relaxed">
                Run a validator node that participates in BFT consensus to finalize blocks.
                Top 100 finalizers by stake are active. Your node must stay online.
              </p>
              <Link href="/validators" className="inline-flex items-center gap-1 text-sm text-cipher-purple hover:text-cipher-cyan mt-3 transition-colors">
                <span>View Active Roster</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </CardBody>
          </Card>

          <Card variant="glass" className="border-l-2 border-l-cipher-green/30">
            <CardBody>
              <div className="w-10 h-10 rounded-xl bg-cipher-green/10 flex items-center justify-center mb-4">
                <UsersIcon className="w-5 h-5 text-cipher-green" />
              </div>
              <h3 className="font-bold text-primary mb-2">Staker (Protocol Guardian)</h3>
              <p className="text-sm text-secondary leading-relaxed">
                Lock cTAZ in a delegation bond to a finalizer. Your stake earns a share of
                the <strong className="text-cipher-green">5 cTAZ</strong> block reward distributed to stakers.
                Staking uses shielded funds for privacy.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* STAKING DAY */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="flex items-center gap-3 mb-2">
            <LayersIcon className="w-5 h-5 text-cipher-cyan" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} STAKING_DAY</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Staking actions are only allowed during recurring windows called &ldquo;Staking Days&rdquo; — designed
            to protect user privacy by grouping actions into defined time periods.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card variant="compact">
              <CardBody>
                <h3 className="font-bold text-primary mb-4">How It Works</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-cipher-green/10 flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-xs text-cipher-green font-bold">1</span>
                    <div>
                      <div className="font-medium text-primary">Window Opens</div>
                      <div className="text-xs text-secondary mt-0.5">Every <strong>{STAKING_DAY_PERIOD}</strong> blocks, a {STAKING_DAY_WINDOW}-block staking window opens</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-xs text-cipher-cyan font-bold">2</span>
                    <div>
                      <div className="font-medium text-primary">Perform Actions</div>
                      <div className="text-xs text-secondary mt-0.5">Stake, unstake, or withdraw bonds during the open window</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-muted/10 flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-xs text-muted font-bold">3</span>
                    <div>
                      <div className="font-medium text-primary">Window Closes</div>
                      <div className="text-xs text-secondary mt-0.5">Wait for the next cycle. Retargeting (moving stake between finalizers) can be done anytime.</div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card variant="compact">
              <CardBody>
                <h3 className="font-bold text-primary mb-4">Why Staking Days?</h3>
                <div className="space-y-3 text-sm text-secondary leading-relaxed">
                  <p>
                    <strong className="text-cipher-purple">Privacy protection:</strong> Grouping staking actions into windows
                    makes it harder to link actions to specific users based on timing.
                  </p>
                  <p>
                    <strong className="text-cipher-cyan">Security:</strong> Structured periods make the system easier to
                    monitor and defend against manipulation.
                  </p>
                  <p>
                    <strong className="text-primary">Withdrawal safety:</strong> Coins in a bond cannot be spent until
                    you unstake on one Staking Day and withdraw on the next — preventing flash-stake attacks.
                  </p>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* SEASON 1 REWARDS */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="flex items-center gap-3 mb-2">
            <ZapIcon className="w-5 h-5 text-cipher-yellow" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} SEASON_1_REWARDS</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Season 1 is allocated <strong className="text-cipher-yellow">25 real ZEC</strong>, distributed pro rata
            based on cTAZ earned through mining and staking.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card variant="compact" className="text-center">
              <CardBody>
                <span className="text-2xl font-mono font-bold text-cipher-cyan">5 cTAZ</span>
                <p className="text-xs text-muted mt-1">per block to miner</p>
              </CardBody>
            </Card>
            <Card variant="compact" className="text-center">
              <CardBody>
                <span className="text-2xl font-mono font-bold text-cipher-purple">5 cTAZ</span>
                <p className="text-xs text-muted mt-1">per block to stakers (weighted)</p>
              </CardBody>
            </Card>
            <Card variant="compact" className="text-center">
              <CardBody>
                <span className="text-2xl font-mono font-bold text-muted">1.25 cTAZ</span>
                <p className="text-xs text-muted mt-1">per block to Dev Fund</p>
              </CardBody>
            </Card>
          </div>

          <div className="card p-4 border border-cipher-yellow/20 bg-cipher-yellow/5">
            <div className="flex items-start gap-3">
              <InfoIcon className="w-5 h-5 text-cipher-yellow flex-shrink-0 mt-0.5" />
              <div className="text-sm text-secondary leading-relaxed">
                Only cTAZ earned from block rewards is eligible for ZEC payouts. cTAZ received from faucets, transfers,
                or other participants does not count. Rewards are based on what you <strong className="text-primary">earn by participating</strong>,
                not what you hold.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GLOSSARY */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="flex items-center gap-3 mb-2">
            <InfoIcon className="w-5 h-5 text-cipher-cyan" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} GLOSSARY</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Key terms you&apos;ll see on the Crosslink explorer.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card variant="compact">
              <CardBody>
                <GlossaryItem term="PoW Tip" definition="The latest block mined by Proof-of-Work miners — the chain tip before finality confirmation." />
                <GlossaryItem term="Finalized" definition="A block that has been confirmed by 2/3+ of finalizer voting power. It can never be reversed or reorganized." />
                <GlossaryItem term="Finality Gap" definition="The number of blocks between the PoW tip and the last finalized block. A small gap means fast finalization." />
                <GlossaryItem term="Finalizer" definition="A validator node that participates in BFT consensus to vote on blocks. Runs alongside zebrad." />
                <GlossaryItem term="BFT" definition="Byzantine Fault Tolerant consensus — finalizers vote on blocks and reach agreement even if some nodes are malicious." />
              </CardBody>
            </Card>

            <Card variant="compact">
              <CardBody>
                <GlossaryItem term="Delegation Bond" definition="cTAZ locked in a staking contract, delegated to a specific finalizer. Earns rewards proportional to total stake." />
                <GlossaryItem term="Staking Day" definition={`A recurring ${STAKING_DAY_WINDOW}-block window (every ${STAKING_DAY_PERIOD} blocks) during which staking actions are allowed.`} />
                <GlossaryItem term="cTAZ" definition="Crosslink TAZ — the native currency of the Crosslink feature net. Earned through mining and staking, converts to ZEC rewards." />
                <GlossaryItem term="Retarget" definition="Moving an existing delegation bond to a different finalizer. Unlike other staking actions, this can be done at any time." />
                <GlossaryItem term="Voting Power" definition="A finalizer's influence in BFT consensus, proportional to the total cTAZ staked to it." />
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* GET STARTED */}
      <div className="border-t border-cipher-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-2">
            <ZapIcon className="w-5 h-5 text-cipher-cyan" />
            <h2 className="text-xs font-mono text-muted uppercase tracking-wider">{'>'} GET_STARTED</h2>
          </div>
          <p className="text-secondary mb-8 max-w-2xl">
            Join the Crosslink feature net and start earning cTAZ.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <a
              href="https://github.com/ShieldedLabs/crosslink_monolith/releases/tag/season-1-workshop-1"
              target="_blank"
              rel="noopener noreferrer"
              className="card card-compact card-interactive flex items-center gap-3 !p-4"
            >
              <span className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0 text-cipher-cyan">
                <ExternalLinkIcon className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-medium text-primary">Download App</div>
                <div className="text-xs text-muted mt-0.5">Desktop miner + wallet</div>
              </div>
            </a>

            <Link
              href="/validators"
              className="card card-compact card-interactive flex items-center gap-3 !p-4"
            >
              <span className="w-10 h-10 rounded-xl bg-cipher-purple/10 flex items-center justify-center flex-shrink-0 text-cipher-purple">
                <ShieldIcon className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-medium text-primary">View Finalizers</div>
                <div className="text-xs text-muted mt-0.5">Roster & voting power</div>
              </div>
            </Link>

            <Link
              href="/"
              className="card card-compact card-interactive flex items-center gap-3 !p-4"
            >
              <span className="w-10 h-10 rounded-xl bg-cipher-green/10 flex items-center justify-center flex-shrink-0 text-cipher-green">
                <LayersIcon className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-medium text-primary">Explorer</div>
                <div className="text-xs text-muted mt-0.5">Blocks, txs & staking</div>
              </div>
            </Link>

            <a
              href="https://github.com/ShieldedLabs/crosslink_monolith"
              target="_blank"
              rel="noopener noreferrer"
              className="card card-compact card-interactive flex items-center gap-3 !p-4"
            >
              <span className="w-10 h-10 rounded-xl bg-cipher-surface flex items-center justify-center flex-shrink-0 text-muted">
                <ExternalLinkIcon className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-medium text-primary">Source Code</div>
                <div className="text-xs text-muted mt-0.5">GitHub repository</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
