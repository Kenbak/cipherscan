'use client';

import { useEffect, useState } from 'react';

export interface PageSection {
  id: string;
  label: string;
}

interface PageSectionNavProps {
  sections: readonly PageSection[];
  ariaLabel: string;
  className?: string;
}

export function PageSectionNav({ sections, ariaLabel, className = '' }: PageSectionNavProps) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    const elements = sections.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.1, 0.25] }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  if (sections.length === 0) return null;

  return (
    <nav
      className={`sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-6 border-b backdrop-blur-xl ${className}`.trim()}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 85%, transparent)',
        borderColor: 'var(--color-border-subtle)',
      }}
      aria-label={ariaLabel}
    >
      <div
        className="inline-flex gap-1 p-1 rounded-lg overflow-x-auto no-scrollbar w-fit max-w-full"
        style={{ backgroundColor: 'var(--glass-3)' }}
      >
        {sections.map(({ id, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-mono uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-cipher-bg text-primary shadow-sm ring-1 ring-glass-12'
                  : 'text-muted hover:text-secondary'
              }`}
              aria-current={isActive ? 'true' : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
