import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getNetwork } from '@/lib/seo';

export const alt = 'ZecBlock — Zcash block explorer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  // Dark share card, so the white-lettering variant.
  const logo = await readFile(join(process.cwd(), 'public/brand/zecblock-logotype.png'));
  const network = getNetwork();
  const title = network === 'mainnet' ? 'Zcash Block Explorer' : network === 'testnet' ? 'Zcash Testnet Explorer' : 'Zcash Crosslink Explorer';
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0B0C0E', color: '#F1F3F5' }}>
      {/* Supplied identity is embedded unchanged. */}
      <img src={`data:image/png;base64,${logo.toString('base64')}`} alt="" width={280} height={65} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 58, letterSpacing: -2 }}>{title}</div>
        <div style={{ fontSize: 25, color: '#C2C7CF' }}>Blocks. Transactions. Shielded pools.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #2C3037', paddingTop: 24, fontSize: 20, color: '#F8BC21' }}>
        <span>zecblock.com</span><span>{network.toUpperCase()}</span>
      </div>
    </div>, size,
  );
}
