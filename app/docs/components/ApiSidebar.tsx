'use client';

import { useState, useMemo } from 'react';

interface ApiSidebarProps {
  categories: Array<{
    name: string;
    endpoints: Array<{ id: string; path: string; method: string }>;
  }>;
}

export default function ApiSidebar({ categories }: ApiSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map(cat => ({
        ...cat,
        endpoints: cat.endpoints.filter(
          e => e.path.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.endpoints.length > 0);
  }, [categories, search]);

  const totalResults = filtered.reduce((sum, c) => sum + c.endpoints.length, 0);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 bg-cipher-cyan text-cipher-bg p-4 rounded-full shadow-lg hover:bg-cipher-green transition-colors"
        aria-label="Toggle API navigation"
        aria-expanded={isOpen}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen
          w-72 docs-sidebar border-r border-cipher-border
          overflow-y-auto z-40
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-primary mb-4 font-mono">API Endpoints</h2>

          {/* Search */}
          <div className="relative mb-5">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter endpoints..."
              className="w-full pl-8 pr-3 py-2 text-xs font-mono rounded border border-cipher-border bg-transparent text-primary placeholder:text-muted focus:border-cipher-cyan focus:outline-none transition-colors"
            />
            {search && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted">
                {totalResults}
              </span>
            )}
          </div>

          <nav className="space-y-6">
            {filtered.map((category) => (
              <div key={category.name}>
                <h3 className="text-sm font-bold text-muted uppercase mb-2 tracking-wide">
                  {category.name}
                </h3>
                <ul className="space-y-1">
                  {category.endpoints.map((endpoint) => (
                    <li key={endpoint.id}>
                      <a
                        href={`#${endpoint.id}`}
                        onClick={() => setIsOpen(false)}
                        className="block w-full text-left px-3 py-2 rounded text-sm docs-sidebar-item transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`
                            text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0
                            ${endpoint.method === 'GET'
                              ? 'text-cipher-green bg-cipher-green/10'
                              : 'text-cipher-cyan bg-cipher-cyan/10'
                            }
                          `}>
                            {endpoint.method}
                          </span>
                          <span className="text-secondary group-hover:text-primary transition-colors font-mono text-xs truncate">
                            {endpoint.path}
                          </span>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted px-3">No endpoints match &ldquo;{search}&rdquo;</p>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
