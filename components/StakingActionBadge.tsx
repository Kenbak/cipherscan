'use client';

import { Badge } from '@/components/ui/Badge';

type StakingActionType =
  | 'CreateNewDelegationBond'
  | 'BeginDelegationUnbonding'
  | 'WithdrawDelegationBond'
  | 'RetargetDelegationBond'
  | 'RegisterFinalizer'
  | 'ConvertFinalizerRewardToDelegationBond'
  | 'UpdateFinalizerKey'
  | string;

type BadgeColor = 'cyan' | 'purple' | 'green' | 'orange' | 'muted';

interface StakingActionBadgeProps {
  type: StakingActionType | null | undefined;
  compact?: boolean;
}

const CONFIG: Record<string, { label: string; color: BadgeColor; short: string }> = {
  CreateNewDelegationBond: { label: 'Stake', short: 'STAKE', color: 'green' },
  BeginDelegationUnbonding: { label: 'Unstake', short: 'UNSTAKE', color: 'orange' },
  WithdrawDelegationBond: { label: 'Withdraw', short: 'WITHDRAW', color: 'cyan' },
  RetargetDelegationBond: { label: 'Retarget', short: 'RETARGET', color: 'cyan' },
  RegisterFinalizer: { label: 'Register Finalizer', short: 'REGISTER', color: 'cyan' },
  ConvertFinalizerRewardToDelegationBond: {
    label: 'Convert Reward',
    short: 'CONVERT',
    color: 'muted',
  },
  UpdateFinalizerKey: { label: 'Update Finalizer Key', short: 'UPDATE_KEY', color: 'muted' },
};

export function StakingActionBadge({ type, compact = false }: StakingActionBadgeProps) {
  if (!type) return null;
  const cfg = CONFIG[type] ?? { label: type, short: type.toUpperCase(), color: 'muted' as const };

  return (
    <Badge color={cfg.color}>
      {compact ? cfg.short : cfg.label}
    </Badge>
  );
}

/**
 * Human-readable label for a staking action (for use outside of badges).
 */
export function stakingActionLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return CONFIG[type]?.label ?? type;
}
