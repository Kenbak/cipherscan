import type { ReactNode } from 'react';
import { ShieldedIcon, ShieldingIcon, UnshieldingIcon } from '@/components/icons/shield-flow';
import { HashLink } from '@/components/ui/HashLink';
import { CURRENCY } from '@/lib/config';
import type { RiskyTransaction } from './types';
import styles from './RoundTripFlow.module.css';

function eventTime(time: number) {
  return new Date(time * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
}

function formatAmount(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

/** Label/value pair on a shared label column, so values line up down the panel. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{children}</span>
    </div>
  );
}

function PublicAddresses({ addresses, side }: { addresses: string[]; side: 'From' | 'To' }) {
  const unique = [...new Set(addresses || [])];
  if (unique.length === 0) return <Row label={side}><span className="text-muted">Not supplied</span></Row>;
  return (
    <>
      <Row label={unique.length > 1 ? `${side} (${unique.length})` : side}>
        <HashLink
          value={unique[0]}
          href={`/address/${unique[0]}`}
          lead={10}
          tail={8}
          copy={false}
          linkClassName="font-mono text-data text-primary hover:underline"
        />
      </Row>
      {unique.length > 1 && (
        <details className={styles.more}>
          <summary>+{unique.length - 1} more public {side === 'From' ? 'input' : 'output'} addresses</summary>
          <div className={styles.moreList}>
            {unique.slice(1).map((address) => (
              <HashLink key={address} value={address} href={`/address/${address}`} copy={false} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function Endpoint({
  direction,
  pool,
  addresses,
  amount,
  txid,
  time,
}: {
  direction: 'shielding' | 'deshielding';
  pool: string;
  addresses: string[];
  amount: number;
  txid: string;
  time: number;
}) {
  const shielding = direction === 'shielding';
  const Icon = shielding ? ShieldingIcon : UnshieldingIcon;
  return (
    <div className={styles.stage}>
      {/* Icon carries the direction colour; the label stays neutral. */}
      <p className={styles.stageKey}>
        <span className={shielding ? 'text-cipher-green' : 'text-cipher-orange'} aria-hidden="true">
          <Icon size={15} />
        </span>
        {shielding ? 'Shielding' : 'Deshielding'}
        <span className="text-muted"> · {pool || (shielding ? 'into pool' : 'out of pool')}</span>
      </p>

      {/* The amount is the evidence, so it leads the panel. */}
      <p className={styles.amount}>
        {formatAmount(amount)} <span className={styles.amountUnit}>{CURRENCY}</span>
      </p>

      <div className={styles.rows}>
        <PublicAddresses addresses={addresses} side={shielding ? 'From' : 'To'} />
        <Row label="Tx">
          <HashLink value={txid} href={`/tx/${txid}`} copy={false} />
        </Row>
        <Row label="Time">
          <time dateTime={new Date(time * 1000).toISOString()} className="font-mono text-data text-muted">
            {eventTime(time)} UTC
          </time>
        </Row>
      </div>
    </div>
  );
}

/** Public endpoints joined by an explicitly unobservable interval, never a traced payment. */
export function RoundTripFlow({ tx }: { tx: RiskyTransaction }) {
  const delay = tx.timeDelta?.replace(' after', '').replace('1 minutes', '1 minute').replace('1 hours', '1 hour').replace('1 days', '1 day') || 'Unknown interval';

  // Compare the public observations at ZEC's integer precision. A matching
  // amount does not establish that the same funds moved between these events.
  const differenceZat = Math.abs(Math.round(tx.shieldAmount * 1e8) - Math.round(tx.deshieldAmount * 1e8));
  const difference = differenceZat / 1e8;
  const exact = differenceZat === 0;

  return (
    <>
      <div
        className={styles.flow}
        aria-label={`Public shielding event followed by a deshielding event ${delay} later; internal transfers are not observable`}
      >
        <Endpoint
          direction="shielding"
          pool={tx.shieldPool}
          addresses={tx.shieldAddresses}
          amount={tx.shieldAmount}
          txid={tx.shieldTxid}
          time={tx.shieldTime}
        />

        {/* The rail describes the pair, not either endpoint. */}
        <div className={styles.link}>
          <div className={styles.linkRail} aria-hidden="true">
            <span className={`${styles.linkMarker} text-cipher-shielded`}><ShieldedIcon size={18} /></span>
          </div>
          <p className={styles.linkDelay}>{delay} later</p>
          <p className={styles.linkMatch}>
            {exact ? 'Amounts match exactly' : `Differs by ${formatAmount(difference)} ${CURRENCY}`}
          </p>
          <p className={styles.linkPrivacy}>Private activity is not visible</p>
        </div>

        <Endpoint
          direction="deshielding"
          pool={tx.deshieldPool}
          addresses={tx.deshieldAddresses}
          amount={tx.deshieldAmount}
          txid={tx.deshieldTxid}
          time={tx.deshieldTime}
        />
      </div>

      {/* Limitations sit below the flow rather than inside a step: they qualify
          the whole inference, and interleaving them with step data made every
          column read as an undifferentiated stack. */}
      <p className={styles.caveat}>
        <span className={styles.caveatLabel}>Possible link, not proven.</span>{' '}
        These public events may belong to different owners.
      </p>
    </>
  );
}
