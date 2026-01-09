'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

/**
 * Input Component
 *
 * Text input with optional label, hint, error, and icon.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, icon, iconPosition = 'left', className = '', ...props }, ref) => {
    const hasIcon = !!icon;
    const iconPaddingClass = hasIcon
      ? iconPosition === 'left'
        ? 'input-with-icon-left'
        : 'input-with-icon-right'
      : '';

    return (
      <div className="input-group">
        {label && <label className="input-label">{label}</label>}
        <div className={`input-wrapper ${hasIcon ? 'input-has-icon' : ''}`}>
          {hasIcon && iconPosition === 'left' && (
            <span className="input-icon input-icon-left">{icon}</span>
          )}
          <input
            ref={ref}
            className={`input-field ${iconPaddingClass} ${error ? 'input-error' : ''} ${className}`}
            {...props}
          />
          {hasIcon && iconPosition === 'right' && (
            <span className="input-icon input-icon-right">{icon}</span>
          )}
        </div>
        {hint && !error && <span className="input-hint">{hint}</span>}
        {error && <span className="input-error-message">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea Component
 *
 * Multi-line text input.
 */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className = '', ...props }, ref) => {
    return (
      <div className="input-group">
        {label && <label className="input-label">{label}</label>}
        <textarea
          ref={ref}
          className={`textarea-field ${error ? 'input-error' : ''} ${className}`}
          {...props}
        />
        {hint && !error && <span className="input-hint">{hint}</span>}
        {error && <span className="input-error-message">{error}</span>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

/**
 * SearchInput Component
 *
 * Specialized input for search with built-in icon.
 */
interface SearchInputProps extends Omit<InputProps, 'icon' | 'iconPosition'> {
  onClear?: () => void;
  showClear?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onClear, showClear = false, className = '', value, ...props }, ref) => {
    return (
      <div className="search-input-wrapper">
        <span className="search-input-icon">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </span>
        <input
          ref={ref}
          type="text"
          className={`search-input-field ${className}`}
          value={value}
          {...props}
        />
        {showClear && value && (
          <button
            type="button"
            className="search-input-clear"
            onClick={onClear}
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
