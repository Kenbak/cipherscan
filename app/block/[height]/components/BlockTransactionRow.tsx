import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { HashLink } from '@/components/ui/HashLink';
import { StakingActionBadge } from '@/components/StakingActionBadge';
import { zatToZec } from '@/lib/format-numbers';

function poolColorClass(pool: string | null) {
  return pool === 'Ironwood' ? 'text-cipher-yellow' : pool === 'Orchard' ? 'text-cipher-purple' : 'text-cipher-cyan';
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

export function BlockTransactionRow({ tx, index }: { tx: any; index: number }) {
  const isCoinbase = tx.vin?.[0]?.coinbase;

  const isShielded = !isCoinbase && (
    tx.hasShieldedActivity ||
    tx.has_sapling || tx.has_orchard || tx.has_sprout ||
    (tx.vShieldedSpend?.length > 0 || tx.vShieldedOutput?.length > 0) ||
    (tx.orchard?.actions?.length > 0) ||
    (tx.vJoinSplit?.length > 0)
  );
  const totalOutput = tx.vout?.reduce((sum: number, out: any) => sum + (out.value || 0), 0) || 0;

  const fromAddress = !isCoinbase && tx.vin?.[0]?.address;
  const toAddress = tx.vout?.[0]?.scriptPubKey?.addresses?.[0];

  const inputCount = tx.vin?.length || 0;
  const outputCount = tx.vout?.length || 0;

  const vbSap = parseInt(tx.value_balance_sapling || 0);
  const vbOrc = parseInt(tx.value_balance_orchard || 0);
  const vbIrn = parseInt(tx.value_balance_ironwood || 0);
  const sourcePool = vbOrc > 0 ? 'Orchard' : vbSap > 0 ? 'Sapling' : vbIrn > 0 ? 'Ironwood' : null;
  const destPool = vbIrn < 0 ? 'Ironwood' : vbOrc < 0 ? 'Orchard' : vbSap < 0 ? 'Sapling' : null;

  const shieldedPoolLabel = (pool: string | null) =>
    pool || (tx.has_ironwood ? 'Ironwood' : (tx.has_orchard || tx.orchard?.actions?.length > 0) ? 'Orchard' : 'Sapling');

  const isOrchardShielded = tx.has_orchard || tx.orchard?.actions?.length > 0;

  return (
    <Link href={`/tx/${tx.txid}`}>
      <div className="grid grid-cols-13 gap-3 items-center block-tx-row p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan transition-all cursor-pointer group">
        <div className="col-span-1">
          <span className="text-xs font-mono text-muted">#{index + 1}</span>
        </div>

        <div className="col-span-1">
          {tx.staking_action_type ? (
            <StakingActionBadge type={tx.staking_action_type} compact />
          ) : isCoinbase ? (
            <Badge color="green">COINBASE</Badge>
          ) : isShielded ? (
            tx.has_ironwood ? (
              <Badge color="amber">IRONWOOD</Badge>
            ) : isOrchardShielded ? (
              <Badge color="purple">ORCHARD</Badge>
            ) : (
              <Badge color="cyan">SAPLING</Badge>
            )
          ) : (
            <Badge color="muted">Regular</Badge>
          )}
        </div>

        <div className="col-span-2">
          <HashLink value={tx.txid} href={`/tx/${tx.txid}`} copy={false} linkClassName="text-xs text-secondary group-hover:text-primary transition-colors font-mono" />
        </div>

        <div className="col-span-2">
          {isCoinbase ? (
            <span className="text-xs text-muted font-mono">Block Reward</span>
          ) : fromAddress ? (
            <HashLink value={fromAddress} copy={false} linkClassName="text-xs text-secondary font-mono truncate block" />
          ) : isShielded ? (() => {
            const label = shieldedPoolLabel(sourcePool);
            return (
              <span className={`text-xs font-mono flex items-center gap-1 ${poolColorClass(label)}`}>
                <ShieldIcon className="w-3 h-3" />
                {label}
              </span>
            );
          })() : (
            <span className="text-xs text-muted font-mono">—</span>
          )}
        </div>

        <div className="col-span-2">
          {toAddress ? (
            <HashLink value={toAddress} copy={false} linkClassName="text-xs text-secondary font-mono truncate block" />
          ) : isShielded ? (() => {
            const label = shieldedPoolLabel(destPool);
            return (
              <span className={`text-xs font-mono flex items-center gap-1 ${poolColorClass(label)}`}>
                <ShieldIcon className="w-3 h-3" />
                {label}
              </span>
            );
          })() : (
            <span className="text-xs text-muted font-mono">—</span>
          )}
        </div>

        <div className="col-span-1 text-center">
          {isShielded && inputCount === 0 ? (
            <span className={isOrchardShielded ? 'text-cipher-purple' : 'text-cipher-cyan'} title={`${isOrchardShielded ? 'Orchard' : 'Sapling'} inputs`}>
              <ShieldIcon className="w-3 h-3 mx-auto" />
            </span>
          ) : (
            <span className="text-xs text-secondary font-mono">
              {inputCount}
            </span>
          )}
        </div>

        <div className="col-span-1 text-center">
          {isShielded && outputCount === 0 ? (
            <span className={isOrchardShielded ? 'text-cipher-purple' : 'text-cipher-cyan'} title={`${isOrchardShielded ? 'Orchard' : 'Sapling'} outputs`}>
              <ShieldIcon className="w-3 h-3 mx-auto" />
            </span>
          ) : (
            <span className="text-xs text-secondary font-mono">
              {outputCount}
            </span>
          )}
        </div>

        <div className="col-span-1 text-right">
          {isCoinbase ? (
            <div className="text-xs font-mono text-primary font-semibold">
              {totalOutput.toFixed(4)}
            </div>
          ) : totalOutput > 0 ? (
            <div className="text-xs font-mono text-primary font-semibold">
              {totalOutput.toFixed(4)}
            </div>
          ) : isShielded ? (() => {
            if (sourcePool && destPool && sourcePool !== destPool) {
              const destVb = destPool === 'Ironwood' ? vbIrn : destPool === 'Orchard' ? vbOrc : vbSap;
              const amountZec = zatToZec(Math.abs(destVb));
              return (
                <div className={`text-xs font-mono font-semibold ${poolColorClass(destPool)}`} title={`${amountZec.toFixed(8)} ZEC (${sourcePool} → ${destPool})`}>
                  {amountZec.toFixed(4)}
                </div>
              );
            }
            if (!sourcePool && destPool) {
              const destVb = destPool === 'Ironwood' ? vbIrn : destPool === 'Orchard' ? vbOrc : vbSap;
              const amountZec = zatToZec(Math.abs(destVb));
              if (amountZec > 0) {
                return (
                  <div className={`text-xs font-mono font-semibold ${poolColorClass(destPool)}`} title={`${amountZec.toFixed(8)} ZEC (Transparent → ${destPool})`}>
                    {amountZec.toFixed(4)}
                  </div>
                );
              }
            }
            const poolColor = tx.has_ironwood ? 'text-cipher-yellow' : isOrchardShielded ? 'text-cipher-purple' : 'text-cipher-cyan';
            return (
              <span className={`flex items-center justify-end gap-1 ${poolColor}`} title="Value is shielded (private)">
                <ShieldIcon className="w-3 h-3" />
              </span>
            );
          })() : (
            <span className="text-xs text-muted">-</span>
          )}
        </div>

        <div className="col-span-1 text-right">
          {isCoinbase ? (
            <span className="text-xs text-muted">-</span>
          ) : (() => {
            const feeZat = parseInt(tx.fee || 0);
            if (feeZat === 0) return <span className="text-xs text-muted">-</span>;
            const feeZec = zatToZec(feeZat);
            if (feeZat === 10000) {
              return <span className="text-[10px] text-muted font-mono">Standard</span>;
            }
            return (
              <span className="text-[10px] text-muted font-mono">
                {feeZec < 0.001 ? feeZec.toFixed(5) : feeZec.toFixed(4)}
              </span>
            );
          })()}
        </div>
      </div>
    </Link>
  );
}
