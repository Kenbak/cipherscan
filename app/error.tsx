'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Digest identifies the server-render failure without exposing a queried
    // address, transaction, amount, or route parameter.
    console.error('CipherScan route failed', error.digest || error.name);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl items-center px-4 py-16 text-center">
      <div className="card w-full p-8" role="alert">
        <h1 className="text-xl font-semibold text-primary">This page could not be loaded</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          CipherScan kept the last known good chain data where available. Try
          this request again, or return to the explorer.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Explorer home
          </Link>
        </div>
      </div>
    </div>
  );
}
