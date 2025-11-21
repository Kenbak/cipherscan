import React from 'react';

interface ValueChangeProps {
  current: number;
  previous?: number;
  showIcon?: boolean;
  className?: string;
}

/**
 * Component to show value changes with visual indicators (↑↓)
 * Useful for real-time data updates via WebSocket
 */
export function ValueChange({ current, previous, showIcon = true, className = '' }: ValueChangeProps) {
  if (previous === undefined || previous === current) {
    return <span className={className}>{current.toLocaleString()}</span>;
  }

  const isIncrease = current > previous;
  const icon = isIncrease ? '↑' : '↓';
  const color = isIncrease ? 'text-cipher-green' : 'text-red-400';
  const animationClass = 'animate-pulse';

  return (
    <span className={`${className} ${color} ${animationClass} transition-colors duration-300`}>
      {showIcon && <span className="mr-1">{icon}</span>}
      {current.toLocaleString()}
    </span>
  );
}

interface PercentageChangeProps {
  current: number;
  previous?: number;
  decimals?: number;
  showIcon?: boolean;
  className?: string;
}

/**
 * Component to show percentage changes with visual indicators
 */
export function PercentageChange({
  current,
  previous,
  decimals = 2,
  showIcon = true,
  className = ''
}: PercentageChangeProps) {
  if (previous === undefined || previous === current) {
    return <span className={className}>{current.toFixed(decimals)}%</span>;
  }

  const isIncrease = current > previous;
  const icon = isIncrease ? '↑' : '↓';
  const color = isIncrease ? 'text-cipher-green' : 'text-red-400';
  const animationClass = 'animate-pulse';

  return (
    <span className={`${className} ${color} ${animationClass} transition-colors duration-300`}>
      {showIcon && <span className="mr-1">{icon}</span>}
      {current.toFixed(decimals)}%
    </span>
  );
}
