'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SingleTxDecrypt } from '@/components/SingleTxDecrypt';
import { ScanMyTransactions } from '@/components/ScanMyTransactions';
import { Card, CardBody, Tabs } from '@/components/ui';

const Icons = {
  Info: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function DecryptPageClient() {
  const [activeTab, setActiveTab] = useState<'single' | 'scan'>('single');

  // Check for prefill parameter
  const [prefillTxid, setPrefillTxid] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const prefill = params.get('prefill');
      const tab = params.get('tab');

      if (prefill) {
        setPrefillTxid(prefill);
        setActiveTab('single'); // Ensure we're on the Single Message tab
      } else if (tab === 'scan') {
        setActiveTab('scan'); // Open Inbox tab directly
      }
    }
  }, []);

  return (
    <>
      <div className="mb-8">
        <Link
          href="/tools"
          className="text-xs font-mono text-muted hover:text-primary transition-colors mb-4 inline-block"
        >
          &larr; All Tools
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-primary">Decrypt Shielded Memo</h1>
        <p className="text-sm text-secondary mt-1">
          Decode encrypted memos from Orchard and Ironwood transactions. 100% client-side — your viewing key never leaves this browser.
        </p>
      </div>

      {/* Mode switch */}
      <div className="mb-6">
        <Tabs
          tabs={[
            { id: 'single', label: 'Single Message' },
            { id: 'scan', label: 'Inbox' },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab Content */}
      {activeTab === 'single' && <SingleTxDecrypt prefillTxid={prefillTxid} />}
      {activeTab === 'scan' && <ScanMyTransactions />}

      {/* Help Card */}
      <Card variant="glass" className="mt-8">
        <CardBody>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center flex-shrink-0">
              <Icons.Info className="w-5 h-5 text-cipher-cyan" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-primary text-lg mb-3">How to Get a Viewing Key</h3>
              <p className="text-secondary text-sm mb-4 leading-relaxed">
                To decrypt memos, you need a <strong className="text-primary">Unified Full Viewing Key (UFVK)</strong>.
                This key allows you to view transaction details without exposing your spending keys.
              </p>
              <p className="text-xs text-muted uppercase tracking-wide mb-3">Compatible wallets:</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <a
                  href="https://vizor.cash/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card card-compact card-interactive text-center"
                >
                  <span className="text-sm font-medium text-cipher-cyan">Vizor</span>
                  <span className="text-xs text-muted block mt-1">Mobile</span>
                </a>
                <a
                  href="https://github.com/hhanh00/zkool2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card card-compact card-interactive text-center"
                >
                  <span className="text-sm font-medium text-cipher-cyan">Zkool</span>
                  <span className="text-xs text-muted block mt-1">Mobile</span>
                </a>
                <a
                  href="https://github.com/zingolabs/zingolib"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card card-compact card-interactive text-center"
                >
                  <span className="text-sm font-medium text-cipher-cyan">Zingo CLI</span>
                  <span className="text-xs text-muted block mt-1">Command-line</span>
                </a>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
