'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

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

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showModal]);

  const copyAddress = () => {
    navigator.clipboard.writeText(DONATION_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modalContent = showModal ? (
    <div
      className="fixed inset-0 modal-backdrop backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={() => setShowModal(false)}
    >
      <div
        className="modal-content max-w-lg w-full animate-scale-in relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cipher-cyan/20 to-transparent animate-scan" />
        </div>

        <div className="p-6 sm:p-8">
          {/* Terminal header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
                {'>'} SUPPORT_CIPHERSCAN
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-primary">
                Support CipherScan
              </h2>
              <p className="text-sm text-secondary mt-1">
                Help us keep this explorer free and open-source
              </p>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-cipher-hover transition-colors flex-shrink-0 ml-4"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Address section */}
          <div className="modal-inner-card rounded-xl p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge badge-purple">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                SHIELDED
              </span>
              <span className="badge badge-cyan">UNIFIED ADDRESS</span>
            </div>

            <label className="text-[10px] font-mono text-muted tracking-widest uppercase block mb-2">
              Donation Address (Zcash)
            </label>

            <div className="modal-code-block p-3 rounded-lg mb-4 max-h-28 overflow-y-auto">
              <code className="text-[11px] text-cipher-cyan break-all font-mono leading-relaxed">
                {DONATION_ADDRESS}
              </code>
            </div>

            <button
              onClick={copyAddress}
              className={`w-full py-2.5 rounded-lg font-mono text-sm transition-all duration-200 border ${
                copied
                  ? 'bg-cipher-green/10 border-cipher-green/30 text-cipher-green'
                  : 'bg-cipher-cyan/5 border-cipher-cyan/20 text-cipher-cyan hover:bg-cipher-cyan/10 hover:border-cipher-cyan/40'
              }`}
            >
              {copied ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied to clipboard
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy Address
                </span>
              )}
            </button>
          </div>

          {/* Privacy note */}
          <div className="flex items-start gap-3 px-1">
            <svg className="w-4 h-4 text-cipher-green flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs text-secondary leading-relaxed">
              Your donation is <span className="text-cipher-green font-medium">private and encrypted</span>.
              Thank you for supporting privacy-first blockchain tools.
            </p>
          </div>
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
