'use client';

import { useEffect, useState } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { AttestationData, AttestationEndpoint } from '@/lib/attestations';
import { attestationStatus, matchesReproducedBuild } from '@/lib/attestation-status';

const STATES: Record<string, { label: string; color: string }> = {
  verified: { label: 'Evidence verified', color: 'text-cipher-green' },
  failed: { label: 'Check failed', color: 'text-danger' },
  stale: { label: 'Stale observation', color: 'text-cipher-yellow' },
  unreachable: { label: 'Endpoint unreachable', color: 'text-cipher-yellow' },
  unavailable: { label: 'Observation unavailable', color: 'text-muted' },
  not_checked: { label: 'Not checked yet', color: 'text-muted' },
};
const ERRORS: Record<string, string> = {
  invalid_attestation: 'The signature or challenge could not be verified.',
  invalid_certificate_chain: 'The attestation certificate chain could not be validated.',
  invalid_measurements: 'Required measurements are missing, invalid or from a debug enclave.',
  invalid_timestamp: 'The signed timestamp is too old or ahead of the observer’s clock.',
  tls_binding_mismatch: 'The attested certificate or domain differs from the observed connection.',
  verifier_unavailable: 'The observer’s certificate verifier is unavailable.',
  invalid_baseline: 'The configured release baseline is invalid.',
  invalid_document: 'The endpoint returned an invalid attestation document.',
  invalid_response: 'The endpoint did not return valid JSON.',
  response_too_large: 'The endpoint exceeded the response size limit.',
  private_address: 'The endpoint resolved to a disallowed network address.',
  timeout: 'The endpoint did not finish responding before the deadline.',
  http_error: 'The endpoint returned an unsuccessful HTTP response.',
  connection_failed: 'A secure connection could not be completed.',
};
function timestamp(value: string | null | undefined) {
  const time = value ? new Date(value) : null;
  return time && Number.isFinite(time.getTime()) ? `${time.toISOString().replace('T', ' ').slice(0, 19)} UTC` : 'Not available';
}
function CheckValue({ label, value, color = 'text-secondary' }: { label: string; value: string; color?: string }) {
  return <div><dt className="text-xs text-muted mb-1.5">{label}</dt><dd className={`text-sm font-medium ${color}`}>{value}</dd></div>;
}
function EndpointCard({ endpoint, endpoints, now, apiUrl }: { endpoint: AttestationEndpoint; endpoints: AttestationEndpoint[]; now: number; apiUrl: string }) {
  const check = endpoint.latest;
  const buildMatches = matchesReproducedBuild(endpoint, now);
  const status = attestationStatus(check, now);
  const state = STATES[status] ?? STATES.unavailable;
  const current = !['stale', 'unavailable', 'not_checked'].includes(status);
  const hub = endpoints.find((item) => item.id === endpoint.hubId);
  const releaseLabels = { unconfirmed: 'Unconfirmed', published_match: 'Published measurements match', reproduced_match: 'Reproduced build matches', mismatch: 'Measurements differ' };
  return <article id={endpoint.id} className="card p-0! overflow-hidden scroll-mt-28">
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div><div className="flex items-center gap-2 mb-1"><h3 className="font-semibold text-primary">{endpoint.name}</h3><span className="text-xs font-mono uppercase text-muted border border-cipher-border rounded px-1.5 py-0.5">{endpoint.role}</span></div>
          <p className="font-mono text-xs sm:text-sm text-secondary break-all">{endpoint.hostname}:443</p></div>
        <span className={`text-xs font-medium flex items-center gap-2 ${state.color}`}><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />{state.label}</span>
      </div>
      <dl className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-4 border-t border-cipher-border pt-4">
        <CheckValue label="Enclave evidence" value={current ? (check?.evidence === 'verified' ? 'Verified' : check?.evidence === 'failed' ? 'Failed' : 'Not checked') : status === 'stale' ? 'Stale' : 'Not checked'} color={current && check?.evidence === 'verified' ? 'text-cipher-green' : 'text-secondary'} />
        <CheckValue label="TLS certificate" value={current ? (check?.tlsBinding === 'matched' ? 'Matched' : check?.tlsBinding === 'mismatch' ? 'Mismatch' : 'Not checked') : status === 'stale' ? 'Stale' : 'Not checked'} color={current && check?.tlsBinding === 'matched' ? 'text-cipher-green' : 'text-secondary'} />
        <CheckValue label="Software release" value={current && check ? releaseLabels[check.release] : 'Unconfirmed'} color="text-secondary" />
      </dl>
      <dl className="mt-5 grid gap-5 sm:grid-cols-2 border-t border-cipher-border pt-4">
        <div>
          <dt className="text-xs text-muted mb-1.5">{!endpoint.baseline ? 'Build version' : buildMatches ? 'Running build · reproduced match' : 'Reviewed build · current match unconfirmed'}</dt>
          <dd className="text-sm text-secondary break-all">
            {endpoint.baseline ? <>
              {endpoint.baseline.tag && endpoint.baseline.tagReferenceUrl
                ? <a href={endpoint.baseline.tagReferenceUrl} target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">{endpoint.baseline.tag}</a>
                : <span>No tagged release identified</span>}
              <span className="block font-mono text-xs mt-2">Commit: {endpoint.baseline.commit}</span>
              <span className="block text-xs text-muted mt-2">Deployment source tag; pinned to the reviewed commit.</span>
            </> : 'Source/build version not confirmed'}
          </dd>
        </div>
        {endpoint.role === 'shim' ? <div>
          <dt className="text-xs text-muted mb-1.5">Configured hub</dt>
          <dd className="text-sm text-secondary break-all">
            {endpoint.hubConfiguration ? <>
              <span className="font-mono">{endpoint.hubConfiguration.hostname}</span>
              <span className="block text-xs mt-2">{buildMatches ? 'Confirmed by matching reproduced build' : 'Reviewed configuration · current match unconfirmed'}</span>
              <a href={endpoint.hubConfiguration.referenceUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-cipher-cyan hover:underline mt-2">Configuration evidence ↗</a>
            </> : hub ? <><span>{hub.hostname}</span><span className="block text-xs mt-2">Published configuration · not build-confirmed</span></> : 'Not confirmed'}
            {hub ? <a href={`#${hub.id}`} className="block text-xs hover:text-cipher-cyan mt-2">Hub’s own check: {STATES[attestationStatus(hub.latest, now)]?.label} ↓</a> : null}
          </dd>
        </div> : null}
      </dl>
      {check?.errorCode ? <p className="mt-4 text-sm text-secondary" role="status">{ERRORS[check.errorCode] ?? 'The check could not be completed.'}</p> : null}
      {check?.release === 'mismatch' ? <p className="mt-4 text-sm text-danger">The measurements differ from the configured release baseline.</p> : null}
      <div className="mt-5 text-xs text-muted flex flex-wrap justify-between gap-x-4 gap-y-2">
        <span>Last attempt <time dateTime={check?.checkedAt}>{timestamp(check?.checkedAt)}</time></span>
        <span>{endpoint.role === 'shim' ? 'Configuration does not prove live routing or hub availability' : 'Hub observed independently'}</span>
      </div>
    </div>
    <details className="border-t border-cipher-border">
      <summary className="cursor-pointer px-5 sm:px-6 py-3 text-xs text-secondary hover:text-cipher-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-cyan">Measurements &amp; source</summary>
      <div className="px-5 sm:px-6 pb-5 text-xs space-y-4">
        <p className="text-muted">Measurements below describe the last attempt. Unsigned source claims are separate from the reviewed build and configuration evidence above.</p>
        <dl className="space-y-3">
          {['PCR0', 'PCR1', 'PCR2'].map((key) => <div key={key}><dt className="text-muted mb-1">{key}</dt><dd className="text-secondary font-mono break-all">{check?.pcrs?.[key] ?? 'Not available'}</dd></div>)}
          <div><dt className="text-muted mb-1">TLS certificate SHA-256</dt><dd className="text-secondary font-mono break-all">{check?.certificateFingerprint ?? 'Not available'}</dd></div>
          <div><dt className="text-muted mb-1">Attestation document SHA-256</dt><dd className="text-secondary font-mono break-all">{check?.documentSha256 ?? 'Not available'}</dd></div>
          <div><dt className="text-muted mb-1">Claimed source commit · unverified metadata</dt><dd className="text-secondary font-mono break-all">{check?.claimedCommit ?? 'Not provided for the registered source'}</dd></div>
          <div><dt className="text-muted mb-1">Signed timestamp</dt><dd className="text-secondary">{timestamp(check?.attestedAt)}</dd></div>
          <div><dt className="text-muted mb-1">Last successful evidence and TLS check</dt><dd className="text-secondary">{timestamp(endpoint.lastSuccessful?.checkedAt)}</dd></div>
          <div><dt className="text-muted mb-1">Verifier</dt><dd className="text-secondary font-mono break-all">{check?.verifier ?? 'Not checked'}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-4 text-cipher-cyan">
          {endpoint.sourceUrl ? <a href={endpoint.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">Registered source ↗</a> : null}
          {endpoint.baseline ? <a href={endpoint.baseline.referenceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">Release baseline ↗</a> : null}
          <a href={endpoint.referenceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">Endpoint reference ↗</a>
          <a href={`${apiUrl}/api/network/attestations/${endpoint.id}`} className="hover:underline">Observation JSON ↗</a>
        </div>
      </div>
    </details>
  </article>;
}

export default function AttestationsClient({ initialData, initialNow, network, apiUrl }: { initialData: AttestationData | null; initialNow: number; network: string; apiUrl: string }) {
  const [now, setNow] = useState(initialNow);
  const query = useApiQuery<AttestationData>('/api/network/attestations', undefined, {
    initialData: initialData ?? undefined, initialFetchedAt: initialNow, refreshInterval: 60_000,
  });
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 15_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const data = query.data?.network === network && Array.isArray(query.data.endpoints) ? query.data : null;
  const endpoints = data?.endpoints ?? [];
  const verified = endpoints.filter((endpoint) => attestationStatus(endpoint.latest, now) === 'verified').length;
  const releaseVerified = endpoints.filter((endpoint) => attestationStatus(endpoint.latest, now) === 'verified' && ['published_match', 'reproduced_match'].includes(endpoint.latest?.release ?? '')).length;
  return <>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {[{ value: endpoints.length, label: 'Registered endpoints', note: 'A curated list, not an operator census' }, { value: verified, label: 'Fresh evidence + TLS matches', note: 'Both checks must pass within 15 minutes' }, { value: releaseVerified, label: 'Confirmed software releases', note: 'Requires an independent build baseline' }].map((item) => <div key={item.label} className="card p-5 sm:p-6"><p className="text-xs text-muted mb-2">{item.label}</p><p className="text-3xl font-mono text-primary tabular-nums">{data?.available ? item.value : '—'}</p><p className="text-xs text-muted mt-2">{item.note}</p></div>)}
    </div>
    <div className="border border-cipher-border rounded-lg p-4 sm:p-5 mb-8 text-sm text-secondary leading-relaxed">
      <p><strong className="text-primary">Evidence and release status are separate.</strong> We can check signed enclave evidence and its connection certificate today. Endpoints without independently established build measurements remain release-unconfirmed.</p>
    </div>
    {query.error || !data?.available ? <p role="status" className="mb-5 text-sm text-cipher-yellow">{data?.available ? 'Could not refresh observations. Retained results expire after 15 minutes.' : 'Observations are currently unavailable. No endpoint is being reported as verified.'}</p> : null}
    <div className="flex flex-wrap justify-between gap-3 mb-4">
      <h2 className="font-mono text-sm text-secondary uppercase tracking-wider">Endpoint observations</h2>
      <p className="text-xs text-muted">Checks scheduled every 5 minutes · This page refreshes every minute</p>
    </div>
    {endpoints.length ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">{endpoints.map((endpoint) => <EndpointCard key={endpoint.id} endpoint={endpoint} endpoints={endpoints} now={now} apiUrl={apiUrl} />)}</div>
      : <div className="card p-6 text-sm text-muted">{query.loading ? 'Loading the endpoint registry…' : 'The endpoint registry could not be loaded. Please try again shortly.'}</div>}
  </>;
}
