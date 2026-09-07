import { ShieldedIcon, ShieldingIcon, UnshieldingIcon } from '@/components/icons/shield-flow';
import { HashLink } from '@/components/ui/HashLink';
import { CURRENCY } from '@/lib/config';
import type { RiskyTransaction } from './types';
import styles from './RoundTripFlow.module.css';

function eventTime(time: number) {
  return new Date(time * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
}

function PublicAddresses({ addresses, side }: { addresses: string[]; side: 'Input' | 'Output' }) {
  const unique = [...new Set(addresses || [])];
  return <div className="mt-2">
    <span className="text-xs text-muted mr-2">{side}{unique.length > 1 ? `s (${unique.length})` : ''}</span>
    {unique[0] ? <HashLink value={unique[0]} href={`/address/${unique[0]}`} lead={10} tail={8} copy={false} linkClassName="font-mono text-sm text-primary hover:underline" /> : <p className="text-sm text-muted">Not supplied</p>}
    {unique.length > 1 && <details className="mt-1 text-xs text-secondary"><summary className="cursor-pointer py-1">+{unique.length - 1} more public {side.toLowerCase()} addresses</summary><div className="space-y-2 py-2">{unique.slice(1).map(address => <div key={address}><HashLink value={address} href={`/address/${address}`} copy={false} /></div>)}</div></details>}
  </div>;
}

/** Public endpoints joined by an explicitly unobservable interval, never a traced payment. */
export function RoundTripFlow({ tx }: { tx: RiskyTransaction }) {
  const delay = tx.timeDelta?.replace(' after', '').replace('1 minutes', '1 minute').replace('1 hours', '1 hour').replace('1 days', '1 day') || 'Unknown interval';
  return <div className={styles.flow} aria-label={`Public shielding event followed by a deshielding event ${delay} later; internal transfers are not observable`}>
    <div className={styles.stage}>
      <span className={`${styles.marker} text-cipher-green`} aria-hidden="true"><ShieldingIcon size={18} /></span>
      <div className={styles.content}>
        <p className="text-xs font-medium text-primary">Shielding <span className="text-muted capitalize">· {tx.shieldPool || 'into pool'}</span></p>
        <PublicAddresses addresses={tx.shieldAddresses} side="Input" />
        <p className="mt-2 font-mono text-lg sm:text-xl text-primary tabular-nums">{tx.shieldAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} <span className="text-sm text-muted">{CURRENCY}</span></p>
        <div className="mt-2 text-xs text-muted">Tx <HashLink value={tx.shieldTxid} href={`/tx/${tx.shieldTxid}`} copy={false} /></div>
        <time dateTime={new Date(tx.shieldTime * 1000).toISOString()} className="block mt-1 text-xs text-muted">{eventTime(tx.shieldTime)} UTC</time>
      </div>
    </div>
    <div className={`${styles.stage} ${styles.privateStage}`}>
      <span className={`${styles.marker} ${styles.privateMarker} text-cipher-shielded`} aria-hidden="true"><ShieldedIcon size={18} /></span>
      <div className={styles.content}>
        <p className="font-mono text-sm text-primary">{delay} later</p>
        <p className="mt-1 text-xs text-muted">Possible link · not proven</p><p className="mt-1 text-xs text-muted">Internal transfers not visible</p>
      </div>
    </div>
    <div className={styles.stage}>
      <span className={`${styles.marker} text-cipher-orange`} aria-hidden="true"><UnshieldingIcon size={18} /></span>
      <div className={styles.content}>
        <p className="text-xs font-medium text-primary">Deshielding <span className="text-muted capitalize">· {tx.deshieldPool || 'out of pool'}</span></p>
        <PublicAddresses addresses={tx.deshieldAddresses} side="Output" />
        <p className="mt-2 font-mono text-lg sm:text-xl text-primary tabular-nums">{tx.deshieldAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} <span className="text-sm text-muted">{CURRENCY}</span></p>
        <div className="mt-2 text-xs text-muted">Tx <HashLink value={tx.deshieldTxid} href={`/tx/${tx.deshieldTxid}`} copy={false} /></div>
        <time dateTime={new Date(tx.deshieldTime * 1000).toISOString()} className="block mt-1 text-xs text-muted">{eventTime(tx.deshieldTime)} UTC</time>
      </div>
    </div>
  </div>;
}
