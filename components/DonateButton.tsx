'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

const DONATION_ADDRESS = 'u19l33nnr9qnhekptmjacyj95a565tcns09xvyxmt777xnk2q6c6s0jrthgme6dkeevc24zue9yqlmspdla5fw5mjws9j7fq5lwcra6yurct42fsxy09agzanh296p2wcq597udtdgj79wc8mnm5eefuwrs8495g42queg9xmhagmp8tj0';

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-3 sm:p-4" onClick={() => setShowModal(false)}>
      <div className="bg-cipher-surface border border-cipher-border rounded-lg max-w-2xl w-full p-4 sm:p-8 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-mono text-cipher-cyan mb-1 sm:mb-2">
              💚 Support CipherScan
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 font-mono">
              Help us keep this explorer free and open-source
            </p>
          </div>
          <button
            onClick={() => setShowModal(false)}
            className="text-gray-400 hover:text-white text-2xl flex-shrink-0 ml-2"
          >
            ×
          </button>
        </div>

        <div className="bg-cipher-bg rounded-lg p-3 sm:p-6 border border-cipher-border mb-4 sm:mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="badge badge-success text-[10px] sm:text-xs px-1.5 sm:px-2">🛡️ SHIELDED</span>
            <span className="badge badge-info text-[10px] sm:text-xs px-1.5 sm:px-2">UNIFIED ADDRESS</span>
          </div>

          <label className="text-xs font-mono text-gray-500 uppercase tracking-wider block mb-2">
            Donation Address (Zcash)
          </label>

          <div className="bg-cipher-surface p-3 sm:p-4 rounded border border-cipher-border mb-3 sm:mb-4 max-h-32 sm:max-h-none overflow-y-auto">
            <code className="text-[10px] sm:text-xs text-cipher-cyan break-all font-mono">
              {DONATION_ADDRESS}
            </code>
          </div>

          <button
            onClick={copyAddress}
            className="w-full py-2 sm:py-2.5 bg-cipher-cyan hover:bg-cipher-green text-cipher-bg font-mono font-bold rounded transition-colors text-sm"
          >
            {copied ? '✓ Copied!' : '📋 Copy Address'}
          </button>
        </div>

        <div className="bg-cipher-green/5 border border-cipher-green/30 rounded-lg p-3 sm:p-4">
          <p className="text-xs text-gray-400 font-mono flex items-start">
            <span className="mr-2 flex-shrink-0">💚</span>
            <span>
              Your donation is <strong className="text-cipher-green">private and encrypted</strong>.
              Thank you for supporting open-source blockchain tools! 🙏
            </span>
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`inline-flex items-center justify-center ${compact ? 'p-2 hover:bg-cipher-bg' : 'space-x-2 px-3 sm:px-4 py-2'} border border-cipher-border hover:border-cipher-cyan text-cipher-cyan hover:text-cipher-green transition-all rounded-lg ${compact ? '' : 'bg-cipher-surface font-mono text-xs sm:text-sm'}`}
        title={compact ? 'Support CipherScan' : undefined}
        aria-label={compact ? 'Support CipherScan' : undefined}
      >
        {/* Gift Icon */}
        <svg
          className={compact ? 'w-4 h-4' : 'w-4 h-4 flex-shrink-0'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <polyline points="20 12 20 22 4 22 4 12"/>
          <rect x="2" y="7" width="20" height="5"/>
          <line x1="12" y1="22" x2="12" y2="7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
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
