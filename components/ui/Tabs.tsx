'use client';

/**
 * Tabs — the one way to switch between content views.
 *
 * Underline style: mono uppercase labels on a bottom border, active tab
 * gets a cyan underline. Use for content switching (Overview / Raw, etc.).
 * For data *filters* and small toggles use `.filter-group` / FilterGroup
 * (the segmented pill pattern) instead.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className = '',
  children,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  /** Optional content rendered on the right side of the tab bar (e.g. filters) */
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center border-b border-cipher-border ${className}`} role="tablist">
      <div className="flex items-center gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onChange(tab.id)}
            className={`pb-2 font-mono text-xs tracking-wider uppercase transition-colors ${
              active === tab.id
                ? 'text-primary border-b-2 border-cipher-cyan -mb-[1px]'
                : 'text-muted hover:text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children && <div className="ml-auto pb-1">{children}</div>}
    </div>
  );
}
