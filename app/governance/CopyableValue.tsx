import { CopyButton } from '@/components/CopyButton';

/** Keep the full value in the document and copy it without display formatting. */
export function CopyableValue({ value, label }: { value: string; label: string }) {
  return <span className="inline-flex max-w-full items-start gap-2">
    <code className="min-w-0 break-all font-mono text-xs leading-relaxed text-secondary">{value}</code>
    <CopyButton text={value} label={label} size="xs" className="min-h-8 min-w-8 inline-flex items-center justify-center" />
  </span>;
}

export function CopyableCommand({ command, label }: { command: string; label: string }) {
  return <div className="overflow-hidden rounded-lg border border-cipher-border bg-glass-3">
    <div className="flex items-center justify-between gap-3 border-b border-cipher-border px-3 py-2">
      <span className="font-mono text-caption text-muted">{label}</span>
      <CopyButton text={command} label={label} size="sm" className="min-h-8 min-w-8 inline-flex items-center justify-center" />
    </div>
    <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-primary"><code>{command}</code></pre>
  </div>;
}
