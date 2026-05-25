import { ReactNode } from 'react';

interface SectionShellProps {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}

export function SectionShell({ id, label, children, className = '' }: SectionShellProps) {
  return (
    <section id={id} className={`nl-section scroll-mt-24 ${className}`}>
      <p className="nl-section-label">{label}</p>
      {children}
    </section>
  );
}
