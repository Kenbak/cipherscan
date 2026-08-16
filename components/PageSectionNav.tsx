'use client';

import { useEffect, useState } from 'react';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';

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
      className={`page-section-nav sticky z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-6 border-b ${className}`.trim()}
      style={{
        // Matches the same chrome stack StatsBar/IronwoodBanner position
        // themselves below — a hardcoded 96px assumed a fixed navbar+stats
        // height and no Ironwood banner, so this sat too high and overlapped
        // whichever of those was actually taller/present.
        top: 'calc(var(--app-nav-height, 4rem) + var(--app-stats-height, 2.75rem) + var(--app-ironwood-height, 0px))',
      }}
      aria-label={ariaLabel}
    >
      <SegmentedToggle options={sections} value={active} onChange={scrollTo} />
    </nav>
  );
}
