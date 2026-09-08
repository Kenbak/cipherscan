'use client';

import { useRef, useEffect, useState } from 'react';
import { describeSchema, type ApiEndpoint } from '../endpoints';
import styles from '../docs.module.css';

export default function ApiEndpointComponent({ endpoint, onShowGuide }: { endpoint: ApiEndpoint; onShowGuide: () => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [copyStatus, setCopyStatus] = useState('Copy request');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const openHash = () => {
      if (location.hash.slice(1) === endpoint.id && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: 'start' });
      }
    };
    openHash();
    window.addEventListener('hashchange', openHash);
    return () => { window.removeEventListener('hashchange', openHash); if (timeout.current) clearTimeout(timeout.current); };
  }, [endpoint.id]);
  async function copy() {
    try { await navigator.clipboard.writeText(endpoint.example); setCopyStatus('Copied'); }
    catch { setCopyStatus('Copy failed — select the text'); }
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopyStatus('Copy request'), 2500);
  }
  return <details ref={ref} id={endpoint.id} className={styles.endpoint}>
    <summary><span className={styles.method} data-method={endpoint.method}>{endpoint.method}</span><span className={styles.endpointHeading}><code>{endpoint.path}</code><span>{endpoint.description}</span></span><span className={styles.chevron} aria-hidden="true">⌄</span></summary>
    <div className={styles.endpointBody}>
      <div className={styles.endpointMeta}>
        <span>{endpoint.pagination === 'cursor' ? 'Cursor pagination' : 'JSON response'}</span>
        {endpoint.category === 'crosslink' && <span>Crosslink network</span>}
        <a href={`#${endpoint.id}`} aria-label={`Permalink to ${endpoint.method} ${endpoint.path}`}>Permalink ↗</a>
      </div>
      {endpoint.ownershipToken && <p className={styles.note}>An ownership token is required to update or delete an existing registration. A new registration returns its token.</p>}
      {endpoint.path === '/v1/transactions/broadcast' && <p className={styles.note}>Submit an already signed transaction. A timeout does not establish that submission failed; check the transaction ID before retrying.</p>}
      {endpoint.parameters.length > 0 && <div className={styles.parameters}>
        <h3>Parameters</h3>
        <dl>{endpoint.parameters.map(param => <div key={`${param.in}-${param.name}`}><dt><code>{param.name}</code><small>{param.in} · {param.schema.type || 'string'}{param.required ? ' · required' : ' · optional'}</small></dt><dd>{param.description || (param.in === 'path' ? 'Resource identifier in the URL path.' : '')} {describeSchema(param.schema)}</dd></div>)}</dl>
      </div>}
      {endpoint.requestBody && <div className={styles.parameters}>
        <h3>JSON request body</h3><p>Save the body as <code>request.json</code> before running the request below.</p>
        {endpoint.requestBody.description && <p>{endpoint.requestBody.description}</p>}
        <dl>{Object.entries(endpoint.requestBody.properties || {}).map(([name, schema]) => <div key={name}><dt><code>{name}</code><small>{schema.type}{endpoint.requestBody?.required?.includes(name) ? ' · required' : ' · optional'}</small></dt><dd>{describeSchema(schema) || (schema.items ? `Array of ${schema.items.type} values.` : 'See the request schema for the accepted value.')}</dd></div>)}</dl>
        <details className={styles.schema}><summary>Full request schema</summary><pre>{JSON.stringify(endpoint.requestBody, null, 2)}</pre></details>
      </div>}
      <div className={styles.requestHeading}><h3>Request template</h3><button onClick={copy} aria-label={`${copyStatus} for ${endpoint.method} ${endpoint.path}`}>{copyStatus}</button><span className="sr-only" role="status">{copyStatus === 'Copy request' ? '' : copyStatus}</span></div>
      <pre className={styles.code}><code>{endpoint.example}</code></pre>
      <p className={styles.hint}>Replace angle-bracket placeholders before use. Requests use your selected API base; preview access may require an additional header.</p>
      {endpoint.zatoshiFields.length > 0 && <p className={styles.note}>Exact decimal-string zatoshi fields: {endpoint.zatoshiFields.map((f, i) => <span key={f}>{i > 0 && ', '}<code>{f}</code></span>)}. Other units are field-specific.</p>}
      <p className={styles.hint}>Success: <code>{'{ data, meta }'}</code>. Errors: <code>application/problem+json</code>. {endpoint.pagination === 'cursor' && <>List items are in <code>data</code>, with navigation in <code>meta.page</code>. </>}<a href="#response-contract" onClick={onShowGuide}>Response conventions →</a></p>
    </div>
  </details>;
}
