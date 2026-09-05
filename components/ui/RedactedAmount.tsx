import { IconTooltip } from './IconTooltip';

/** Hidden is a durable data state, not a loading animation or a numerical amount. */
export function RedactedAmount({ className = '' }: { className?: string }) {
  return (
    <IconTooltip label="Amount hidden — fully shielded transaction" className={`font-mono text-xs text-cipher-purple whitespace-nowrap ${className}`}>
      <span>Shielded</span>
    </IconTooltip>
  );
}
