'use client';

import { useEffect, useState, type ReactNode } from 'react';

export interface PageSection { id: string; label: string }
interface PageSectionNavProps {
  sections: readonly PageSection[];
  ariaLabel: string;
  className?: string;
  actions?: ReactNode;
}

/** In-page navigation is a list of links, distinct from chart/view switches. */
export function PageSectionNav({ sections, ariaLabel, className = '', actions }: PageSectionNavProps) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offset = document.querySelector('header')?.getBoundingClientRect().bottom ?? 120;
        const reached = sections.filter(({ id }) => {
          const el = document.getElementById(id);
          return el && el.getBoundingClientRect().top <= Math.max(offset, 120) + 48;
        });
        setActive(reached.at(-1)?.id ?? sections[0]?.id ?? '');
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('hashchange', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('hashchange', update); };
  }, [sections]);
  if (!sections.length) return null;
  return <nav aria-label={ariaLabel} className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-cipher-border pb-5 mb-8 ${className}`}>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-caption font-mono">
      {sections.map(({ id, label }) => <a key={id} href={`#${id}`} onClick={() => setActive(id)} aria-current={active === id ? 'location' : undefined} className={`rounded-sm py-1 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cipher-gold ${active === id ? 'text-primary' : 'text-muted'}`}>{label}</a>)}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </nav>;
}
