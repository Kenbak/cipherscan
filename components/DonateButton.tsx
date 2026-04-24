'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '@/contexts/ThemeContext';

const DONATION_ADDRESS = 'u1fh3kwyl9hq9q907rx9j8mdy2r7gz4xh0y4yt63dxykk2856gr0238vxsegemyfu8s5a77ycq72tcnzkxa75ykjtcn6wp2w9rtuu3ssdzpe2fyghl8wlk3vh6f67304xe4lrxtvywtudy5t434zc07u6mh27ekufx7ssr55l8875z7f4k76c3tk23s3jzf8rxdlkequlta8lwsv09gxm';

const truncateAddress = (addr: string) =>
  `${addr.slice(0, 16)}...${addr.slice(-16)}`;

interface DonateButtonProps {
  compact?: boolean;
  variant?: 'default' | 'link';
}

export function DonateButton({ compact = false, variant = 'default' }: DonateButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, mounted: themeMounted } = useTheme();
  const isDark = theme === 'dark';

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

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = DONATION_ADDRESS;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const qrSize = 180;
  const logoSize = Math.round(qrSize * 0.14);
  const clearZone = Math.round(qrSize * 0.22);

  const modalContent = showModal ? (
    <div
      className="fixed inset-0 modal-backdrop backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setShowModal(false);
      }}
    >
      <div
        className="modal-content max-w-sm w-full animate-scale-in relative overflow-hidden"
      >
        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cipher-cyan/20 to-transparent animate-scan" />
        </div>

        <div className="p-6 sm:p-8">
          {/* Header + close */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
                {'>'} SUPPORT_CIPHERSCAN
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-primary">
                Support CipherScan
              </h2>
              <p className="text-sm text-secondary mt-1">
                Help keep this explorer free, open-source &amp; ad-free
              </p>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-primary transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* QR Code with logo overlay — theme-aware */}
          <div className="flex justify-center mb-5">
            <div className="relative p-4 rounded-lg modal-inner-card">
              {themeMounted && (
                <>
                  <QRCodeSVG
                    value={`zcash:${DONATION_ADDRESS}`}
                    size={qrSize}
                    level="H"
                    marginSize={1}
                    bgColor={isDark ? '#08090F' : '#F5F7FA'}
                    fgColor="var(--color-cyan)"
                    imageSettings={{
                      src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                      height: clearZone,
                      width: clearZone,
                      excavate: true,
                    }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.png"
                    alt=""
                    width={logoSize}
                    height={logoSize}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      display: 'block',
                      borderRadius: '4px',
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Truncated address + copy */}
          <div className="modal-inner-card rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-muted tracking-wider uppercase mb-1">
                  Shielded · Unified Address
                </p>
                <code className="text-xs font-mono text-secondary">
                  {truncateAddress(DONATION_ADDRESS)}
                </code>
              </div>
              <button
                onClick={copyAddress}
                className="flex-shrink-0 p-2 rounded-md text-muted hover:text-cipher-cyan transition-colors"
                title="Copy address"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[11px] text-muted text-center font-mono">
            Private &amp; encrypted · Open-source explorer
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {variant === 'link' ? (
        <button
          onClick={() => setShowModal(true)}
          className="footer-link text-xs font-mono transition-colors p-0 text-left"
        >
          Support Us
        </button>
      ) : (
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
      )}

      {mounted && modalContent && createPortal(
        modalContent,
        document.body
      )}
    </>
  );
}
