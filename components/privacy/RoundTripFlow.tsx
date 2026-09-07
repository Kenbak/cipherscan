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

function PublicAddresses({ addresses, side }: { addresses: string[]; side: 'From' | 'To' }) {
  const unique = [...new Set(addresses || [])];
  return (
    <>
      <div className={styles.address}>
        <span className={styles.addressLabel}>{side}{unique.length > 1 ? ` (${unique.length})` : ''}</span>
        {unique[0] ? <HashLink
          value={unique[0]}
          href={`/address/${unique[0]}`}
          lead={10}
          tail={8}
          copy={false}
          linkClassName="font-mono text-xs text-primary hover:underline"
        /> : <span className="text-xs text-muted">Not supplied</span>}
      </div>
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

function PossibleLink({ tx }: { tx: RiskyTransaction }) {
  const inputs = [...new Set(tx.shieldAddresses || [])];
  const outputs = [...new Set(tx.deshieldAddresses || [])];
  const address = (value: string) => <HashLink value={value} href={`/address/${value}`} lead={8} tail={6} copy={false} linkClassName="font-mono text-xs text-primary hover:underline" />;

  return <div className={styles.caveat}>
    <p className={styles.caveatLabel}>
      {inputs.length === 1 && outputs.length === 1 ? <>
        Possible link between {address(inputs[0])} and {address(outputs[0])}.
      </> : inputs.length && outputs.length ? <>
        Possible link between {inputs.length} public input {inputs.length === 1 ? 'address' : 'addresses'} and {outputs.length} public output {outputs.length === 1 ? 'address' : 'addresses'}.
      </> : 'Possible link between these public events.'}
    </p>
    <p className={styles.caveatDetail}>Not proven. Matching observations do not establish a transfer or common ownership.</p>
  </div>;
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
      <span className={`${styles.endpointMarker} ${shielding ? 'text-cipher-green' : 'text-cipher-orange'}`} aria-hidden="true">
        <Icon size={18} />
      </span>
      <p className={styles.stageKey}>
        {shielding ? 'Shielding' : 'Deshielding'}
        <span className={styles.pool}>· {pool || (shielding ? 'into pool' : 'out of pool')}</span>
      </p>

      {/* The amount is the evidence, so it leads the panel. */}
      <p className={styles.amount}>
        {formatAmount(amount)} <span className={styles.amountUnit}>{CURRENCY}</span>
      </p>

      <div className={styles.rows}>
        <PublicAddresses addresses={addresses} side={shielding ? 'From' : 'To'} />
        <div className={styles.eventMeta}>
          <span>Transaction</span>
          <HashLink value={txid} href={`/tx/${txid}`} copy={false} linkClassName="font-mono text-xs text-secondary hover:text-primary hover:underline" />
        </div>
        <time dateTime={new Date(time * 1000).toISOString()} className={styles.eventTime}>
          {eventTime(time)} UTC
        </time>
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
      <PossibleLink tx={tx} />
    </>
  );
}
