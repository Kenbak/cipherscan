import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { AddressWithLabel, AddressDisplay } from '@/components/AddressWithLabel';
import type { TransactionData, TxClassification } from './types';

export function generateTxSummary(
  data: TransactionData,
  classification: TxClassification,
): React.ReactNode {
  const { txType, allBridges, migrationSourcePool, valueBalance } = classification;

  if (allBridges.length > 0) {
    if (allBridges.length === 1) {
      const b = allBridges[0];
      const addr =
        b.zecAddress ||
        (b.direction === 'exit' ? data.inputs[0]?.address : null) ||
        (b.direction === 'entry' ? data.outputs[0]?.scriptPubKey?.addresses?.[0] : null);
      const addrNode = addr ? (
        <AddressDisplay address={addr} className="text-xs inline" />
      ) : (
        <span className="text-cipher-purple font-mono">a shielded address</span>
      );
      const zecAmt = b.zecAmount
        ? `${b.zecAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${CURRENCY}`
        : null;

      if (b.direction === 'entry') {
        return (
          <>
            {b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken}{' '}
            was bridged from {b.otherChain.toUpperCase()} to{' '}
            {zecAmt ? (
              <>
                {zecAmt} on{' '}
              </>
            ) : null}
            {addrNode} via NEAR Intents.
            {b.otherAmountUsd > 0 && (
              <span className="text-muted">
                {' '}
                (≈$
                {b.otherAmountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})
              </span>
            )}
          </>
        );
      }
      return (
        <>
          {zecAmt || CURRENCY} was bridged out by {addrNode} to{' '}
          {b.otherAmount?.toLocaleString(undefined, { maximumFractionDigits: 4 })} {b.otherToken} on{' '}
          {b.otherChain.toUpperCase()} via NEAR Intents.
          {b.otherAmountUsd > 0 && (
            <span className="text-muted">
              {' '}
              (≈${b.otherAmountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})
            </span>
          )}
        </>
      );
    }
    return <>Batched bridge transaction with {allBridges.length} swaps via NEAR Intents.</>;
  }

  if (classification.isCoinbase) {
    const recipient = data.outputs[0]?.scriptPubKey?.addresses?.[0];
    // A lockbox/funding-stream output sends part of the subsidy straight into
    // the shielded pool. That amount is consensus-public (not a private
    // spend), so the summary should account for it rather than implying the
    // named address received the entire newly-created supply.
    const shieldedPortion = valueBalance < 0 ? Math.abs(valueBalance) : 0;
    if (shieldedPortion > 0) {
      const transparentPortion = data.totalOutput;
      if (recipient && transparentPortion > 0) {
        return (
          <>
            New {CURRENCY} created as a block reward: {transparentPortion.toFixed(4)} {CURRENCY} sent
            to the address <AddressWithLabel address={recipient} />, plus {shieldedPortion.toFixed(4)}{' '}
            {CURRENCY} deposited directly into the shielded pool as a protocol-mandated funding
            stream.
          </>
        );
      }
      return `New ${CURRENCY} created as a block reward, entirely deposited into the shielded pool as a protocol-mandated funding stream.`;
    }
    if (recipient) {
      return (
        <>
          New {CURRENCY} created as a block reward, sent to the address{' '}
          <AddressWithLabel address={recipient} />.
        </>
      );
    }
    return `New ${CURRENCY} created as a block reward.`;
  }

  if (txType === 'MIGRATION') {
    const ironwoodAmt = Math.abs(data.valueBalanceIronwood || 0);
    return `${migrationSourcePool} → Ironwood pool migration. ${ironwoodAmt.toFixed(4)} ${CURRENCY} crosses the turnstile into the formally-verified Ironwood pool. Senders and recipients remain shielded.`;
  }

  if (txType === 'IRONWOOD') {
    return 'Fully private transaction using the Ironwood shielded pool (NU6.3). All amounts, senders, and recipients are encrypted.';
  }

  if (txType === 'ORCHARD') {
    return 'Fully private transaction. All amounts, senders, and recipients are encrypted and hidden from public view.';
  }

  if (txType === 'SHIELDED') {
    return 'Fully private transaction using Sapling shielded proofs. No amounts or addresses are publicly visible.';
  }

  if (txType === 'SHIELDING') {
    const amount = Math.abs(valueBalance);
    const fromAddr = data.inputs[0]?.address;
    if (fromAddr) {
      return (
        <>
          {amount.toFixed(4)} {CURRENCY} moved from the public address{' '}
          <AddressWithLabel address={fromAddr} /> into the private shielded pool, making future
          spending invisible.
        </>
      );
    }
    return `${amount.toFixed(4)} ${CURRENCY} moved from a public address into the private shielded pool, making future spending invisible.`;
  }

  if (txType === 'UNSHIELDING') {
    const amount = Math.abs(valueBalance);
    const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];
    if (toAddr) {
      return (
        <>
          {amount.toFixed(4)} {CURRENCY} moved out of the private shielded pool to the public
          address <AddressWithLabel address={toAddr} />.
        </>
      );
    }
    return `${amount.toFixed(4)} ${CURRENCY} moved out of the private shielded pool to a public transparent address.`;
  }

  if (txType === 'MIXED') {
    return 'This transaction combines public and private funds in a single operation. Some inputs or outputs are visible on-chain, while shielded parts remain encrypted.';
  }

  const fromAddr = data.inputs[0]?.address;
  const toAddr = data.outputs[0]?.scriptPubKey?.addresses?.[0];

  if (fromAddr && toAddr) {
    const recipientOutputs = data.outputs.filter(
      (out: any) => out.scriptPubKey?.addresses?.[0] !== fromAddr,
    );

    const primaryOutput =
      recipientOutputs.length > 0
        ? recipientOutputs.sort((a: any, b: any) => (b.value || 0) - (a.value || 0))[0]
        : data.outputs[0];

    const primaryAddr = primaryOutput?.scriptPubKey?.addresses?.[0];
    const primaryAmount = primaryOutput?.value || 0;
    const otherRecipients = recipientOutputs.length - 1;

    return (
      <>
        The address <AddressWithLabel address={fromAddr} />
        {' sent '}
        <span className="text-primary font-semibold">
          {primaryAmount.toFixed(4)} {CURRENCY}
        </span>
        {' to the address '}
        <AddressWithLabel address={primaryAddr || toAddr} />
        {otherRecipients > 0 && (
          <span>
            {' '}
            and {otherRecipients} other{otherRecipients > 1 ? 's' : ''}
          </span>
        )}
        .
      </>
    );
  }

  return `A transparent transaction with ${data.inputs.length} input${data.inputs.length !== 1 ? 's' : ''} and ${data.outputs.length} output${data.outputs.length !== 1 ? 's' : ''}.`;
}
