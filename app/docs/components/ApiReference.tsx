'use client';

import { useMemo, useState, type ReactNode } from 'react';
import ApiSidebar, { type Category } from './ApiSidebar';
import ApiEndpoint from './ApiEndpoint';
import { categoryId } from '../endpoints';
import styles from '../docs.module.css';

export default function ApiReference({ categories, children }: { categories: Category[]; children: ReactNode }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return categories.map(c => ({ ...c, endpoints: c.endpoints.filter(e => terms.every(term => `${c.name} ${e.method} ${e.path} ${e.description}`.toLowerCase().includes(term))) })).filter(c => c.endpoints.length);
  }, [categories, search]);
  const count = filtered.reduce((n, c) => n + c.endpoints.length, 0);
  return <div className={styles.layout}>
    <ApiSidebar categories={filtered} search={search} onSearch={setSearch} />
    <div className={styles.content}>
      {!search && children}
      <div className={styles.referenceHeading}><h2>Endpoint reference</h2><span role="status">{count} {search ? 'matching' : 'public'} operations</span></div>
      {!count && <div className={styles.note}>No endpoints match “{search}”. <button onClick={() => setSearch('')}>Clear search</button></div>}
      {filtered.map(c => <section key={c.key} id={categoryId(c.key)} className={styles.category}><div className={styles.categoryHeading}><h2>{c.name}</h2><span>{c.endpoints.length}</span></div><div className={styles.endpointList}>{c.endpoints.map(e => <ApiEndpoint key={e.id} endpoint={e} onShowGuide={() => setSearch('')} />)}</div></section>)}
    </div>
  </div>;
}
