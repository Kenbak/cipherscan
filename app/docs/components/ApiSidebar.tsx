'use client';

import { useState } from 'react';
import { categoryId, type ApiEndpoint } from '../endpoints';
import styles from '../docs.module.css';

export interface Category { key: string; name: string; endpoints: ApiEndpoint[] }
export default function ApiSidebar({ categories, search, onSearch }: { categories: Category[]; search: string; onSearch: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return <div className={styles.navColumn}>
    <button className={styles.mobileToggle} onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-controls="docs-navigation">Browse documentation <span aria-hidden="true">{isOpen ? '−' : '+'}</span></button>
    <aside id="docs-navigation" className={styles.sidebar} data-open={isOpen}>
      <label className={styles.searchLabel} htmlFor="endpoint-search">Find an endpoint</label>
      <div className={styles.searchBox}><input id="endpoint-search" type="search" placeholder="Search routes or topics…" value={search} onChange={e => onSearch(e.target.value)} autoComplete="off" spellCheck={false} />{search && <button onClick={() => onSearch('')} aria-label="Clear endpoint search">×</button>}</div>
      <nav aria-label="API documentation">
        <div className={styles.guideLinks}>{[['quickstart','Quick start'],['response-contract','Responses & units'],['pagination','Pagination'],['errors','Errors & limits']].map(([id,label]) => <a key={id} href={`#${id}`} onClick={() => { onSearch(''); setIsOpen(false); }}>{label}</a>)}</div>
        <p className={styles.navLabel}>Public endpoints</p>
        {categories.map(category => <details key={category.key} className={styles.navGroup} open={search ? true : undefined}>
          <summary>{category.name}<span>{category.endpoints.length}</span></summary>
          <a className={styles.categoryLink} href={`#${categoryId(category.key)}`} onClick={() => setIsOpen(false)}>View {category.name.toLowerCase()} →</a>
          {category.endpoints.map(endpoint => <a key={endpoint.id} href={`#${endpoint.id}`} className={styles.routeLink} onClick={() => setIsOpen(false)} title={`${endpoint.method} ${endpoint.path}`}><span data-method={endpoint.method}>{endpoint.method}</span><code>{endpoint.path.replace(/^\/v1\//, '/')}</code></a>)}
        </details>)}
        {!categories.length && <p className={styles.hint}>No matching endpoints.</p>}
        <a className={styles.specLink} href="/openapi-v1.json" download>Download OpenAPI 3.1 ↗</a>
      </nav>
    </aside>
  </div>;
}
