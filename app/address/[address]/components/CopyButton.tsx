'use client';

interface CopyButtonProps {
  text: string;
  label: string;
  copiedText: string | null;
  onCopy: (text: string, label: string) => void;
}

export function CopyButton({ text, label, copiedText, onCopy }: CopyButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCopy(text, label);
      }}
      className="ml-2 p-1 text-muted hover:text-primary transition-colors"
      title="Copy to clipboard"
    >
      {copiedText === label ? (
        <svg className="w-4 h-4 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}
