'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface DonateFooterProps {
  address: string;
}

export function DonateFooter({ address }: DonateFooterProps) {
  const [copied, setCopied] = useState(false);
  const truncated = `${address.slice(0, 16)}…${address.slice(-16)}`;

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="nl-donate">
      <QRCodeSVG
        value={`zcash:${address}`}
        size={72}
        bgColor="transparent"
        fgColor="#56d4c8"
        level="L"
      />
      <div className="nl-donate-text">
        <span className="nl-donate-label">Support CipherScan</span>
        <button className="nl-donate-addr" onClick={handleCopy} title={address}>
          {copied ? 'Copied ✓' : truncated}
        </button>
      </div>
    </div>
  );
}
