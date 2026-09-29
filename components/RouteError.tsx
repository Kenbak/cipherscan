'use client';

import Link from 'next/link';

/** Shared recovery state; detail layouts that already own an H1 use an H2. */
export function RouteError({ reset, subject = 'page', titleAsHeading = true }: {
  reset: () => void;
  subject?: string;
  titleAsHeading?: boolean;
}) {
  const Heading = titleAsHeading ? 'h1' : 'h2';
  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:py-16" role="alert">
      <p className="type-label text-muted mb-3">REQUEST_UNAVAILABLE</p>
      <Heading className={`${titleAsHeading ? 'type-page' : 'type-section'} font-sans text-primary`}>
        This {subject} could not be loaded
      </Heading>
      <p className="mt-3 text-sm leading-relaxed text-secondary">
        Try the request again, or return to the explorer.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-md btn-primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn btn-md btn-secondary">Explorer home</Link>
      </div>
    </section>
  );
}
