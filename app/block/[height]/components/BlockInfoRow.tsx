import { InfoRow as SharedInfoRow } from '@/components/ui/InfoRow';

// Adapter over the shared InfoRow primitive: this page passes icons as
// components and uses a `clickable` flag; keep its call sites unchanged.
export function BlockInfoRow({
  icon: Icon,
  label,
  value,
  tooltip,
  valueClass = 'text-primary',
  clickable = false,
  onClick,
}: {
  icon: React.ComponentType;
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  valueClass?: string;
  clickable?: boolean;
  onClick?: () => void;
}) {
  return (
    <SharedInfoRow
      label={label}
      value={value}
      icon={<Icon />}
      tooltip={tooltip}
      valueClass={valueClass}
      onClick={clickable ? onClick : undefined}
    />
  );
}
