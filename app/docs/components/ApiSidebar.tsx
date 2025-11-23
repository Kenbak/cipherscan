'use client';

import { useState } from 'react';

interface ApiSidebarProps {
  categories: Array<{
    name: string;
    endpoints: Array<{ id: string; path: string; method: string }>;
  }>;
}

export default function ApiSidebar({ categories }: ApiSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const scrollToEndpoint = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsOpen(false); // Close mobile menu after click
    }
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 bg-cipher-cyan text-cipher-bg p-4 rounded-full shadow-lg hover:bg-cipher-green transition-colors"
        aria-label="Toggle navigation"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
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
          w-72 bg-cipher-surface border-r border-cipher-border
          overflow-y-auto z-40
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-white mb-6 font-mono">API Endpoints</h2>

          <nav className="space-y-6">
            {categories.map((category) => (
              <div key={category.name}>
                <h3 className="text-sm font-bold text-gray-400 uppercase mb-2 tracking-wide">
                  {category.name}
                </h3>
                <ul className="space-y-1">
                  {category.endpoints.map((endpoint) => (
                    <li key={endpoint.id}>
                      <button
                        onClick={() => scrollToEndpoint(endpoint.id)}
                        className="w-full text-left px-3 py-2 rounded text-sm hover:bg-cipher-bg transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`
                            text-xs font-mono font-bold px-1.5 py-0.5 rounded
                            ${endpoint.method === 'GET'
                              ? 'text-cipher-green bg-cipher-green/10'
                              : 'text-cipher-cyan bg-cipher-cyan/10'
                            }
                          `}>
                            {endpoint.method}
                          </span>
                          <span className="text-gray-300 group-hover:text-white transition-colors font-mono text-xs truncate">
                            {endpoint.path}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
