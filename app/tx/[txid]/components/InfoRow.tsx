import { Tooltip } from '@/components/Tooltip';

export function InfoRow({
  icon: Icon,
  label,
  value,
  tooltip,
  valueClass = 'text-primary',
}: {
  icon: React.ComponentType;
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-3 border-b block-info-border last:border-0 gap-2 sm:gap-0">
      <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-secondary">
        <span className="mr-2">
          <Icon />
        </span>
        <span className="text-xs sm:text-sm">{label}</span>
        {tooltip && (
          <span className="ml-2">
            <Tooltip content={tooltip} />
          </span>
        )}
      </div>
      <div className={`flex-1 font-mono text-xs sm:text-sm ${valueClass} break-all`}>{value}</div>
    </div>
  );
}
