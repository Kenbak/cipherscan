'use client';

import { useState, useEffect } from 'react';
import { SingleTxDecrypt } from '@/components/SingleTxDecrypt';
import { ScanMyTransactions } from '@/components/ScanMyTransactions';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// Icons - consistent w-4 h-4 size
const Icons = {
  Shield: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Info: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Mail: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
};

export default function DecryptPage() {
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
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Icons.Lock className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary">
                Decrypt Shielded Memo
              </h1>
              <p className="text-sm text-secondary">
                Decode encrypted memos from shielded transactions
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="filter-group">
            <button
              onClick={() => setActiveTab('single')}
              className={`filter-btn ${activeTab === 'single' ? 'filter-btn-active' : ''}`}
            >
              Single Message
            </button>
            <button
              onClick={() => setActiveTab('scan')}
              className={`filter-btn ${activeTab === 'scan' ? 'filter-btn-active' : ''}`}
            >
              Inbox
            </button>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="alert alert-success mb-8">
          <Icons.Shield className="w-5 h-5 text-cipher-green flex-shrink-0" />
          <div>
            <p className="font-medium text-cipher-green">100% Client-Side Decryption</p>
            <p className="text-sm text-secondary mt-1">
              Your viewing key <strong className="text-primary">never leaves your browser</strong>. All decryption happens locally using WebAssembly.
            </p>
          </div>
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
                    href="https://ywallet.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card card-compact card-interactive text-center"
                  >
                    <span className="text-sm font-medium text-cipher-cyan">YWallet</span>
                    <span className="text-xs text-muted block mt-1">Mobile & Desktop</span>
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

      </div>
    </div>
  );
}
