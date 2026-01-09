'use client';

import { ReactNode, forwardRef } from 'react';

type CardVariant = 'standard' | 'compact' | 'featured' | 'glass' | 'dark';

interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Card Component
 *
 * A unified card system with consistent padding, spacing, and elevation.
 * Uses shadow for depth rather than heavy borders (Apple design philosophy).
 *
 * Variants:
 * - standard: Default card with 24px padding
 * - compact: Dense information with 16px padding
 * - featured: Highlighted content with 32px padding and accent border
 * - glass: Floating overlays with blur effect
 * - dark: Darker background for nested cards
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    children,
    variant = 'standard',
    interactive = false,
    className = '',
    onClick,
  },
  ref
) {
  // Use .card as base, add variant modifiers
  const variantClasses: Record<CardVariant, string> = {
    standard: 'card',
    compact: 'card card-compact',
    featured: 'card card-featured',
    glass: 'card-glass',
    dark: 'card-dark',
  };

  const interactiveClass = interactive ? 'card-interactive' : '';

  return (
    <div
      ref={ref}
      className={`${variantClasses[variant]} ${interactiveClass} ${className}`}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      {children}
    </div>
  );
});

/**
 * CardHeader Component
 *
 * Optional header section with title and actions.
 */
interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`card-header ${className}`}>
      {children}
    </div>
  );
}

/**
 * CardBody Component
 *
 * Main content area.
 */
interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return (
    <div className={`card-body ${className}`}>
      {children}
    </div>
  );
}

/**
 * CardFooter Component
 *
 * Optional footer section.
 */
interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`card-footer ${className}`}>
      {children}
    </div>
  );
}

/**
 * CardDivider Component
 *
 * Subtle horizontal divider within a card.
 */
export function CardDivider() {
  return <div className="card-divider" />;
}
