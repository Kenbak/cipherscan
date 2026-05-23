'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'network-overview', label: 'Overview' },
  { id: 'network-supply', label: 'Supply' },
  { id: 'network-mining', label: 'Mining' },
] as const;

export function NetworkSectionNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
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
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <nav
      className="sticky top-16 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-6 border-b backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 85%, transparent)',
        borderColor: 'var(--color-border-subtle)',
      }}
      aria-label="Network page sections"
    >
      <div className="flex gap-1 p-1 rounded-lg max-w-md" style={{ backgroundColor: 'var(--glass-3)' }}>
        {SECTIONS.map(({ id, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={`flex-1 px-3 py-2 text-xs font-mono uppercase tracking-wider rounded-md transition-all ${
                isActive
                  ? 'bg-cipher-bg text-primary shadow-sm ring-1 ring-cipher-cyan/20'
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
