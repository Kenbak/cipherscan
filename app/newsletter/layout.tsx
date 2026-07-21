import './newsletter.css';

/**
 * Newsletter segment layout — exists to scope the newsletter prose styles
 * (newsletter.css, ~880 lines of nl-* markdown styling) to these routes
 * instead of shipping them app-wide in globals.css.
 */
export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
