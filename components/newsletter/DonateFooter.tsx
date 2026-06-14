'use client';

import { QRCodeSVG } from 'qrcode.react';

interface DonateFooterProps {
  address: string;
}

export function DonateFooter({ address }: DonateFooterProps) {
  const truncated = `${address.slice(0, 16)}…${address.slice(-16)}`;

  return (
    <div className="nl-donate">
      <QRCodeSVG
        value={`zcash:${address}`}
        size={56}
        bgColor="transparent"
        fgColor="#56d4c8"
        level="L"
      />
      <div className="nl-donate-text">
        <span className="nl-donate-label">Support CipherScan</span>
        <code className="nl-donate-addr" title={address}>{truncated}</code>
      </div>
    </div>
  );
}
