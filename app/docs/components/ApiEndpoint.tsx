'use client';

import { useRef, useEffect } from 'react';
import { describeSchema, parameterUsage, type ApiEndpoint } from '../endpoints';
import styles from '../docs.module.css';
import CopyCodeButton from './CopyCodeButton';

export default function ApiEndpointComponent({ endpoint, onShowGuide }: { endpoint: ApiEndpoint; onShowGuide: () => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openHash = () => {
      if (location.hash.slice(1) === endpoint.id && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: 'start' });
      }
    };
    openHash();
    window.addEventListener('hashchange', openHash);
    return () => { window.removeEventListener('hashchange', openHash); };
  }, [endpoint.id]);
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
        <h3>Parameters</h3><p>Replace path placeholders, add query values after <code>?</code>, and send headers with <code>-H</code>. Optional values can be omitted. <a href="#parameters" onClick={onShowGuide}>How to use parameters →</a></p>
        <dl>{endpoint.parameters.map(param => <div key={`${param.in}-${param.name}`}><dt><code>{param.name}</code><small>{param.in} · {param.schema.type || 'string'}{param.required ? ' · required' : ' · optional'}</small></dt><dd>{param.description || (param.in === 'path' ? 'Resource identifier in the URL path.' : '')} {describeSchema(param.schema)}<code className={styles.parameterUsage}>{parameterUsage(param, endpoint.path)}</code></dd></div>)}</dl>
      </div>}
      {endpoint.requestBody && <div className={styles.parameters}>
        <h3>JSON request body</h3><p>Save the body as <code>request.json</code> before running the request below.</p>
        {endpoint.requestBody.description && <p>{endpoint.requestBody.description}</p>}
        <dl>{Object.entries(endpoint.requestBody.properties || {}).map(([name, schema]) => <div key={name}><dt><code>{name}</code><small>{schema.type}{endpoint.requestBody?.required?.includes(name) ? ' · required' : ' · optional'}</small></dt><dd>{describeSchema(schema) || (schema.items ? `Array of ${schema.items.type} values.` : 'See the request schema for the accepted value.')}</dd></div>)}</dl>
        <div className={styles.requestHeading}><h3>Example request.json</h3><CopyCodeButton text={endpoint.bodyExample!} label={`JSON body for ${endpoint.path}`} /></div><pre className={styles.code}><code>{endpoint.bodyExample}</code></pre><p className={styles.hint}>Adjust example values for your network and replace any angle-bracket placeholders. Block heights are illustrative; no request runs on this page.</p>
        <details className={styles.schema}><summary>Full request schema</summary><pre>{JSON.stringify(endpoint.requestBody, null, 2)}</pre></details>
      </div>}
      <div className={styles.requestHeading}><h3>Request template</h3><CopyCodeButton text={endpoint.example} label={`request for ${endpoint.method} ${endpoint.path}`} /></div>
      <pre className={styles.code}><code>{endpoint.example}</code></pre>
      <p className={styles.hint}>Replace angle-bracket placeholders before use. Requests use your selected API base; preview access may require an additional header.</p>
      {endpoint.zatoshiFields.length > 0 && <p className={styles.note}>Exact decimal-string zatoshi fields: {endpoint.zatoshiFields.map((f, i) => <span key={f}>{i > 0 && ', '}<code>{f}</code></span>)}. Other units are field-specific.</p>}
      <p className={styles.hint}>Success: <code>{'{ data, meta }'}</code>. Errors: <code>application/problem+json</code>. {endpoint.pagination === 'cursor' && <>List items are in <code>data</code>, with navigation in <code>meta.page</code>. </>}<a href="#response-contract" onClick={onShowGuide}>Response conventions →</a></p>
    </div>
  </details>;
}
