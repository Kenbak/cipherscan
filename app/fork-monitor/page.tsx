'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import {
  AnchorsTable,
  CheckerPanel,
  ForkTimeline,
  GuidancePanel,
  NodeRegistryPanel,
  ReferenceFooter,
  StatusHero,
} from '@/components/fork-monitor/ForkMonitorViews';
import type { CheckResult, ForkMonitorData } from '@/components/fork-monitor/types';
import { makeCommunityReport, parseHeightHashLines } from '@/components/fork-monitor/utils';
import { getApiUrl } from '@/lib/api-config';

type Tab = 'anchors' | 'checker' | 'registry';

export default function ForkMonitorPage() {
  const [data, setData] = useState<ForkMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('anchors');

  const [checkHeight, setCheckHeight] = useState('');
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [checking, setChecking] = useState(false);

  const [bulkInput, setBulkInput] = useState('');
  const [bulkResults, setBulkResults] = useState<{
    matches: number[];
    mismatches: { height: number; ref: string; got: string }[];
    unknown: number[];
  } | null>(null);

  const [reportName, setReportName] = useState('');
  const [reportTip, setReportTip] = useState('');
  const [reportHash, setReportHash] = useState('');
  const [reportPeers, setReportPeers] = useState('');
  const [reportMining, setReportMining] = useState(false);
  const [reportSamples, setReportSamples] = useState('');
  const [reportTtl, setReportTtl] = useState<'1h' | '24h'>('24h');
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCheck = async () => {
    const heights = checkHeight
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0);
    if (heights.length === 0) return;
    setChecking(true);
    try {
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heights }),
      });
      const json = await resp.json();
      if (json.success) setCheckResults(json.results);
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  };

  const handleBulkCompare = () => {
    if (!data) return;
    const refMap = new Map<string, string>();
    for (const a of data.anchors) {
      if (a.cipherscan_hash) refMap.set(String(a.height), a.cipherscan_hash.toLowerCase());
    }
    if (data.cipherscan.tip_hash) {
      refMap.set(String(data.cipherscan.tip), data.cipherscan.tip_hash.toLowerCase());
    }
    if (data.ctaz?.tip_hash) {
      refMap.set(String(data.ctaz.tip), data.ctaz.tip_hash.toLowerCase());
    }

    const matches: number[] = [];
    const mismatches: { height: number; ref: string; got: string }[] = [];
    const unknown: number[] = [];

    for (const m of bulkInput.matchAll(/(\d+)\s+([0-9a-fA-F]{64})/g)) {
      const h = m[1];
      const hash = m[2].toLowerCase();
      const ref = refMap.get(h);
      if (!ref) unknown.push(parseInt(h, 10));
      else if (ref === hash) matches.push(parseInt(h, 10));
      else mismatches.push({ height: parseInt(h, 10), ref, got: hash });
    }
    setBulkResults({ matches, mismatches, unknown });
  };

  const handleReport = async () => {
    setReportStatus(null);
    try {
      const sample_hashes = parseHeightHashLines(reportSamples);
      const body: Record<string, unknown> = {
        name: reportName,
        tip: parseInt(reportTip, 10),
        mining: reportMining,
        ttl: reportTtl,
      };
      if (reportHash) body.tip_hash = reportHash;
      if (reportPeers) body.peers = parseInt(reportPeers, 10);
      if (sample_hashes.length > 0) body.sample_hashes = sample_hashes;
      const resp = await fetch(`${getApiUrl()}/api/crosslink/fork-monitor/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (json.success) {
        setReportStatus('Registered — visible in the registry tab.');
        setReportName('');
        setReportTip('');
        setReportHash('');
        setReportPeers('');
        setReportMining(false);
        setReportSamples('');
        setReportTtl('24h');
        setActiveTab('registry');
        fetchData();
      } else {
        setReportStatus(json.error || 'Failed');
      }
    } catch {
      setReportStatus('Network error');
    }
  };

  const handleDeleteNode = async (name: string) => {
    if (!confirm(`Remove "${name}" from the registry?`)) return;
    try {
      const resp = await fetch(
        `${getApiUrl()}/api/crosslink/fork-monitor/report/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      if (resp.ok) {
        setData((prev) => (prev ? { ...prev, nodes: prev.nodes.filter((n) => n.name !== name) } : prev));
      }
    } catch {
      /* ignore */
    }
  };

  const communityReport = useMemo(() => (data ? makeCommunityReport(data) : ''), [data]);

  const tabs: { id: Tab; label: string; count?: number }[] = data
    ? [
        { id: 'anchors', label: 'Anchors', count: data.anchors.length },
        { id: 'checker', label: 'Check your chain' },
        { id: 'registry', label: 'Node registry', count: data.nodes.length },
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <div className="mb-8">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; FORK_MONITOR</span>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-primary mt-1">Crosslink Fork Monitor</h1>
        <p className="text-xs text-muted mt-2 max-w-2xl leading-relaxed">
          Compare CipherScan and cTAZ at fixed anchor heights during chain incidents. Verify your node,
          report your tip, and see which branch other operators follow.
        </p>
      </div>

      {loading && (
        <Card>
          <CardBody className="text-center py-12">
            <div className="animate-pulse text-muted font-mono text-sm">Loading fork monitor…</div>
          </CardBody>
        </Card>
      )}

      {error && !loading && (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-cipher-orange font-mono text-sm mb-4">{error}</p>
            <button type="button" onClick={fetchData} className="btn-sm btn-ghost">
              Retry
            </button>
          </CardBody>
        </Card>
      )}

      {data && !loading && !error && (
        <>
          <StatusHero data={data} />
          <ForkTimeline data={data} />
          <GuidancePanel data={data} />

          <div className="flex gap-1 mb-6 border-b border-cipher-border overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-xs font-mono whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-cipher-cyan text-cipher-cyan'
                    : 'border-transparent text-muted hover:text-secondary'
                }`}
              >
                {tab.label}
                {tab.count !== undefined ? ` (${tab.count})` : ''}
              </button>
            ))}
          </div>

          <Card className="mb-6">
            <CardBody className={activeTab === 'anchors' ? 'p-0' : 'p-4 sm:p-5'}>
              {activeTab === 'anchors' && (
                <>
                  <p className="text-xs text-muted px-4 pt-4 pb-2 sm:px-5">
                    Block hashes at known fork points, compared between reference nodes.
                  </p>
                  <AnchorsTable anchors={data.anchors} />
                </>
              )}
              {activeTab === 'checker' && (
                <CheckerPanel
                  checkHeight={checkHeight}
                  setCheckHeight={setCheckHeight}
                  checkResults={checkResults}
                  checking={checking}
                  onCheck={handleCheck}
                  bulkInput={bulkInput}
                  setBulkInput={setBulkInput}
                  bulkResults={bulkResults}
                  onBulkCompare={handleBulkCompare}
                />
              )}
              {activeTab === 'registry' && (
                <NodeRegistryPanel
                  data={data}
                  reportName={reportName}
                  setReportName={setReportName}
                  reportTip={reportTip}
                  setReportTip={setReportTip}
                  reportHash={reportHash}
                  setReportHash={setReportHash}
                  reportPeers={reportPeers}
                  setReportPeers={setReportPeers}
                  reportMining={reportMining}
                  setReportMining={setReportMining}
                  reportSamples={reportSamples}
                  setReportSamples={setReportSamples}
                  reportTtl={reportTtl}
                  setReportTtl={setReportTtl}
                  reportStatus={reportStatus}
                  onReport={handleReport}
                  onDelete={handleDeleteNode}
                  parseSamples={parseHeightHashLines}
                />
              )}
            </CardBody>
          </Card>

          <ReferenceFooter communityReport={communityReport} hints={data.split_hints} />
        </>
      )}
    </div>
  );
}
