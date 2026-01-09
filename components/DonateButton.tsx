'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

const DONATION_ADDRESS = 'u1fh3kwyl9hq9q907rx9j8mdy2r7gz4xh0y4yt63dxykk2856gr0238vxsegemyfu8s5a77ycq72tcnzkxa75ykjtcn6wp2w9rtuu3ssdzpe2fyghl8wlk3vh6f67304xe4lrxtvywtudy5t434zc07u6mh27ekufx7ssr55l8875z7f4k76c3tk23s3jzf8rxdlkequlta8lwsv09gxm';

interface DonateButtonProps {
  compact?: boolean;
}

export function DonateButton({ compact = false }: DonateButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText(DONATION_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modalContent = showModal ? (
    <div className="fixed inset-0 modal-backdrop backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={() => setShowModal(false)}>
      <div className="modal-content max-w-2xl w-full p-6 sm:p-8 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cipher-cyan/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-cipher-cyan"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
                <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
                <line x1="6" y1="2" x2="6" y2="4"/>
                <line x1="10" y1="2" x2="10" y2="4"/>
                <line x1="14" y1="2" x2="14" y2="4"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary">
                Support CipherScan
              </h2>
              <p className="text-sm text-secondary">
                Help us keep this explorer free and open-source
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-cipher-hover transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Address Card */}
        <div className="modal-inner-card rounded-xl p-5 sm:p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="badge badge-purple">🛡️ SHIELDED</span>
            <span className="badge badge-cyan">UNIFIED ADDRESS</span>
          </div>

          <label className="text-xs font-mono text-muted uppercase tracking-wider block mb-2">
            Donation Address (Zcash)
          </label>

          <div className="modal-code-block p-4 rounded-lg mb-4 max-h-32 sm:max-h-none overflow-y-auto">
            <code className="text-xs text-cipher-cyan break-all font-mono">
              {DONATION_ADDRESS}
            </code>
          </div>

          <button
            onClick={copyAddress}
            className="btn btn-primary w-full py-3 font-mono"
          >
            {copied ? '✓ Copied!' : 'Copy Address'}
          </button>
        </div>

        {/* Info Footer */}
        <div className="alert alert-info">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm">
            Your donation is <strong>private and encrypted</strong>.
            Thank you for supporting open-source blockchain tools!
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`donate-btn inline-flex items-center justify-center ${compact ? 'p-1.5' : 'space-x-2 px-3 sm:px-4 py-2'} transition-all rounded-lg ${compact ? '' : 'font-mono text-xs sm:text-sm'}`}
        title={compact ? 'Support CipherScan' : undefined}
        aria-label={compact ? 'Support CipherScan' : undefined}
      >
        {/* Coffee Icon */}
        <svg
          className={compact ? 'w-4 h-4' : 'w-4 h-4 flex-shrink-0'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
          <line x1="6" y1="2" x2="6" y2="4"/>
          <line x1="10" y1="2" x2="10" y2="4"/>
          <line x1="14" y1="2" x2="14" y2="4"/>
        </svg>
        {!compact && <span>Support Us</span>}
      </button>

      {mounted && modalContent && createPortal(
        modalContent,
        document.body
      )}
    </>
  );
}
