'use client';

import { useState } from 'react';

/**
 * Tiny inline "copy to clipboard" button. Shows a brief checkmark on success.
 * Defaults to a small size suitable for sitting next to mono hex strings.
 */
export function CopyButton({
  text,
  size = 'sm',
  label,
  className = '',
}: {
  text: string;
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const px = size === 'xs' ? 'p-1' : size === 'md' ? 'p-2' : 'p-1.5';
  const iconCls = size === 'xs' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className={`${px} text-neutral-500 dark:text-neutral-400 hover:text-cipher-cyan transition-colors shrink-0 rounded ${className}`}
      title={copied ? 'Copied!' : label || 'Copy'}
      aria-label={label || 'Copy to clipboard'}
    >
      {copied ? (
        <svg
          className={`${iconCls} text-cipher-green`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className={iconCls}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}
