// Offline signature-encoding regression, not a current endpoint health check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, verify as verifySignature, X509Certificate } from 'node:crypto';
import { parse, verify } from '../../vendor/tee-attestation-js/src/tee/nitro.js';
import { encode } from '../../vendor/tee-attestation-js/src/lib/cbor.js';

const bundle = JSON.parse(readFileSync(new URL('./fixtures/testnet-leading-zero-evidence.json', import.meta.url)));
const document = Buffer.from(bundle.document, 'base64');
assert.equal(`sha256:${createHash('sha256').update(document).digest('hex')}`, bundle.evidence_digest);
const parsed = parse(document);
const message = encode(['Signature1', parsed.protectedHeader, new Uint8Array(0), parsed.payloadRaw]);
const publicKey = new X509Certificate(parsed.payload.certificate).publicKey;
const raw = Buffer.from(parsed.signature);
assert.equal(raw.subarray(48, 50).toString('hex'), '00d2');
const trim = value => {
  const index = value.findIndex(byte => byte !== 0);
  return index < 0 ? Buffer.of(0) : value.subarray(index);
};
const integer = (bytes, corrected) => {
  let value = bytes;
  if (corrected) value = trim(value);
  if (value[0] & 0x80) value = Buffer.concat([Buffer.of(0), value]);
  else value = trim(value);
  return Buffer.concat([Buffer.of(2, value.length), value]);
};
const der = corrected => {
  const body = Buffer.concat([integer(raw.subarray(0, 48), corrected), integer(raw.subarray(48), corrected)]);
  return Buffer.concat([Buffer.of(0x30, body.length), body]);
};
assert.equal(verifySignature('sha384', message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, raw), true);
assert.equal(verifySignature('sha384', message, publicKey, der(false)), false);
assert.equal(verifySignature('sha384', message, publicKey, der(true)), true);
const pcrs = JSON.parse(readFileSync(new URL('./fixtures/testnet-pcrs.json', import.meta.url)));
const evidence = await verify(document, { nonce: Buffer.from(bundle.nonce, 'base64'), pcrs: { PCR0: pcrs.pcr0, PCR1: pcrs.pcr1, PCR2: pcrs.pcr2 } });
assert.equal(evidence.verified, true, evidence.error);
console.log('Captured evidence passes raw ES384 and existing JS verification. Old DER conversion fails; corrected conversion passes. This is historical evidence, not current health.');
