import { CURRENCY } from '@/lib/config';
import { AddressDisplay } from '@/components/AddressWithLabel';
import { Badge } from '@/components/ui/Badge';
import { TokenChainIcon } from '@/components/TokenChainIcon';
import { Icons } from './Icons';
import type { TransactionData, TxClassification } from './types';

export function TxHeroFlow({
  data,
  classification,
}: {
  data: TransactionData;
  classification: TxClassification;
}) {
  const { txType, allBridges, migrationSourcePool, valueBalance, isCoinbase } = classification;

  const FlowArrow = () => <span className="text-muted hidden sm:inline">→</span>;
  const FlowArrowDown = () => <span className="text-muted sm:hidden">↓</span>;

  if (allBridges.length > 0) {
    const b = allBridges[0];
    if (b.direction === 'entry') {
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <TokenChainIcon token={b.otherToken} chain={b.otherChain} size={24} />
            <span className="text-sm font-mono text-primary">
              {b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
              {b.otherToken}
            </span>
          </div>
          <span className="text-muted hidden sm:inline">→</span>
          <span className="text-muted sm:hidden">↓</span>
          <div className="flex items-center gap-2">
            <TokenChainIcon token="ZEC" chain="zec" size={24} />
            <span className="text-sm font-mono text-primary">
              {b.zecAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || '?'} {CURRENCY}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <TokenChainIcon token="ZEC" chain="zec" size={24} />
          <span className="text-sm font-mono text-primary">
            {b.zecAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || ''} {CURRENCY}
          </span>
        </div>
        <span className="text-muted hidden sm:inline">→</span>
        <span className="text-muted sm:hidden">↓</span>
        <div className="flex items-center gap-2">
          <TokenChainIcon token={b.otherToken} chain={b.otherChain} size={24} />
          <span className="text-sm font-mono text-primary">
            {b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken}
          </span>
        </div>
      </div>
    );
  }

  if (txType === 'MIGRATION') {
    const ironwoodAmt = Math.abs(data.valueBalanceIronwood || 0);
    const srcColor = migrationSourcePool === 'Sapling' ? 'cyan' : 'purple';
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        <Badge color={srcColor} icon={<Icons.Shield />}>
          {migrationSourcePool}
        </Badge>
        <FlowArrow />
        <FlowArrowDown />
        <span className="text-sm font-mono font-bold text-cipher-yellow">
          {ironwoodAmt.toFixed(4)} {CURRENCY}
        </span>
        <FlowArrow />
        <FlowArrowDown />
        <Badge color="amber" icon={<Icons.Shield />}>
          Ironwood
        </Badge>
      </div>
    );
  }

  if (txType === 'IRONWOOD') {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        <Badge color="amber" icon={<Icons.Shield />}>
          Ironwood
        </Badge>
        <FlowArrow />
        <FlowArrowDown />
        <span className="text-cipher-yellow/40 font-mono text-sm">████████ {CURRENCY}</span>
        <FlowArrow />
        <FlowArrowDown />
        <Badge color="amber" icon={<Icons.Shield />}>
          Ironwood
        </Badge>
      </div>
    );
  }

  if (txType === 'ORCHARD' || txType === 'SHIELDED') {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        <Badge color="purple" icon={<Icons.Shield />}>
          Shielded
        </Badge>
        <FlowArrow />
        <FlowArrowDown />
        <span className="text-cipher-purple/40 font-mono text-sm">████████ {CURRENCY}</span>
        <FlowArrow />
        <FlowArrowDown />
        <Badge color="purple" icon={<Icons.Shield />}>
          Shielded
        </Badge>
      </div>
    );
  }

  if (txType === 'SHIELDING') {
    const fromAddr = data.inputs[0]?.address;
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        {fromAddr ? (
          <AddressDisplay address={fromAddr} className="text-xs" />
        ) : (
          <span className="text-sm text-secondary font-mono">Transparent</span>
        )}
        <FlowArrow />
        <FlowArrowDown />
        <span className="text-sm font-mono text-primary">
          {Math.abs(valueBalance).toFixed(4)} {CURRENCY}
        </span>
        <FlowArrow />
        <FlowArrowDown />
        <Badge color="purple" icon={<Icons.Shield />}>
          Shielded Pool
        </Badge>
      </div>
    );
  }

  if (txType === 'UNSHIELDING') {
    const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        <Badge color="purple" icon={<Icons.Shield />}>
          Shielded Pool
        </Badge>
        <FlowArrow />
        <FlowArrowDown />
        <span className="text-sm font-mono text-primary">
          {Math.abs(valueBalance).toFixed(4)} {CURRENCY}
        </span>
        <FlowArrow />
        <FlowArrowDown />
        {toAddr ? (
          <AddressDisplay address={toAddr} className="text-xs" />
        ) : (
          <span className="text-sm text-secondary font-mono">Transparent</span>
        )}
      </div>
    );
  }

  if (isCoinbase) {
    const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
    // valueBalance < 0 here means part of the subsidy went straight into the
    // shielded pool as a lockbox/funding-stream output — public and consensus-
    // enforced, not a private spend, so it belongs in "total reward" the same
    // way the transparent output does.
    const shieldedPortion = valueBalance < 0 ? Math.abs(valueBalance) : 0;
    const totalReward = data.totalOutput + shieldedPortion;
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
        <Badge color="green" icon={<Icons.Currency />}>
          Block Reward
        </Badge>
        <FlowArrow />
        <FlowArrowDown />
        <span className="text-sm font-mono text-primary">{totalReward.toFixed(4)} {CURRENCY}</span>
        <FlowArrow />
        <FlowArrowDown />
        {shieldedPortion > 0 ? (
          <div className="flex flex-col items-center gap-1.5">
            {toAddr && <AddressDisplay address={toAddr} className="text-xs" />}
            <Badge color="amber" icon={<Icons.Shield />}>
              Ironwood Pool
            </Badge>
          </div>
        ) : toAddr ? (
          <AddressDisplay address={toAddr} className="text-xs" />
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </div>
    );
  }

  const fromAddr = data.inputs[0]?.address;
  const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
      {fromAddr ? (
        <AddressDisplay address={fromAddr} className="text-xs" />
      ) : (
        <span className="text-sm text-muted">—</span>
      )}
      <FlowArrow />
      <FlowArrowDown />
      <span className="text-sm font-mono text-primary">{data.totalOutput.toFixed(4)} {CURRENCY}</span>
      <FlowArrow />
      <FlowArrowDown />
      {toAddr ? (
        <AddressDisplay address={toAddr} className="text-xs" />
      ) : (
        <span className="text-sm text-muted">—</span>
      )}
    </div>
  );
}
