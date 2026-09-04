const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  isValidBase58CheckAddress,
  isValidUnifiedAddress,
  isValidSaplingAddress,
} = require('../lib/zcash-address');

const MAINNET_UA = 'u1fh3kwyl9hq9q907rx9j8mdy2r7gz4xh0y4yt63dxykk2856gr0238vxsegemyfu8s5a77ycq72tcnzkxa75ykjtcn6wp2w9rtuu3ssdzpe2fyghl8wlk3vh6f67304xe4lrxtvywtudy5t434zc07u6mh27ekufx7ssr55l8875z7f4k76c3tk23s3jzf8rxdlkequlta8lwsv09gxm';

test('accepts a checksummed mainnet unified address', () => {
  assert.equal(isValidUnifiedAddress(MAINNET_UA), true);
});

test('rejects prefix-only and checksum-corrupted unified addresses', () => {
  assert.equal(isValidUnifiedAddress('u1not-an-address'), false);
  assert.equal(isValidUnifiedAddress(`${MAINNET_UA.slice(0, -1)}q`), false);
  assert.equal(isValidUnifiedAddress(`${MAINNET_UA.slice(0, 10).toUpperCase()}${MAINNET_UA.slice(10)}`), false);
});

test('does not confuse unified and Sapling encodings', () => {
  assert.equal(isValidSaplingAddress(MAINNET_UA), false);
});

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58Check(payload) {
  const checksum = crypto.createHash('sha256')
    .update(crypto.createHash('sha256').update(payload).digest())
    .digest()
    .subarray(0, 4);
  const bytes = Buffer.concat([payload, checksum]);
  let value = BigInt(`0x${bytes.toString('hex')}`);
  let encoded = '';
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

test('validates Base58Check envelopes and rejects corrupted transparent/Sprout-like strings', () => {
  const valid = encodeBase58Check(Buffer.from('1cb8'.padEnd(44, '0'), 'hex'));
  assert.equal(isValidBase58CheckAddress(valid), true);
  assert.equal(isValidBase58CheckAddress(`${valid.slice(0, -1)}1`), false);
  assert.equal(isValidBase58CheckAddress('t1not-a-real-zcash-address'), false);
  assert.equal(isValidBase58CheckAddress('zcnot-a-real-zcash-address'), false);
  assert.equal(
    isValidBase58CheckAddress(encodeBase58Check(Buffer.from('0000'.padEnd(44, '0'), 'hex'))),
    false,
    'a valid checksum with an unsupported version is not a Zcash address',
  );
});
