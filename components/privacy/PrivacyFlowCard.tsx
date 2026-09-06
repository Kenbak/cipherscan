import type { ReactNode } from 'react';
import { Card, CardBody } from '@/components/ui/Card';

/** Shared vertical geometry keeps adjacent public-flow plots aligned. */
export function PrivacyFlowCard({ title, description, controls, children }: {
  title: string; description: ReactNode; controls: ReactNode; children: ReactNode;
}) {
  return <Card className="h-full privacy-flow-card"><CardBody>
    <h2 className="text-sm font-mono text-primary mb-4">{title}</h2>
    <div className="min-h-10 flex flex-wrap items-start gap-3 mb-4">{controls}</div>
    <p className="min-h-20 text-caption text-muted leading-relaxed mb-3">{description}</p>
    {children}
    <div className="chart-signature mt-5" aria-hidden="true">zecblock.com</div>
  </CardBody></Card>;
}
