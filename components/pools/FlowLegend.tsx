'use client';

import { ShieldFlowIcon, SHIELD_FLOW_LABELS } from '@/components/icons/shield-flow';

/** Teaches shield/deshield semantics — matches home page ShieldFlowLegend. */
export function FlowLegend({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-muted ${className}`.trim()}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldFlowIcon type="shielding" size={14} />
        <span>{SHIELD_FLOW_LABELS.shielding} — into privacy</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ShieldFlowIcon type="unshielding" size={14} />
        <span>{SHIELD_FLOW_LABELS.unshielding} — out of privacy</span>
      </span>
    </div>
  );
}
