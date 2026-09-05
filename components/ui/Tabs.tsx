'use client';

import { useRef } from 'react';

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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const next = tabs[index];
    if (!next) return;
    onChange(next.id);
    tabRefs.current[index]?.focus();
  };

  return (
    <div className={`flex flex-wrap items-end gap-y-2 border-b border-cipher-border ${className}`}>
      <div className="flex min-w-0 items-center gap-6 overflow-x-auto no-scrollbar" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                focusTab((index + 1) % tabs.length);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                focusTab((index - 1 + tabs.length) % tabs.length);
              } else if (event.key === 'Home') {
                event.preventDefault();
                focusTab(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                focusTab(tabs.length - 1);
              }
            }}
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
      {children && (
        <div className="w-full min-w-0 overflow-x-auto pb-1 no-scrollbar sm:ml-auto sm:w-auto">
          {children}
        </div>
      )}
    </div>
  );
}
