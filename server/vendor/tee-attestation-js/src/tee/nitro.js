/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2025 Distrust LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { decode as decodeCBOR, encode as encodeCBOR } from '../lib/cbor.js';
import {
  parseCertificate,
  ecdsaDerToRaw,
  pemToDer,
  bytesToHex,
  arraysEqual
} from '../lib/x509.js';

const COSE_SIGN1_TAG = 18;
const NITRO_PROTECTED_HEADER = Uint8Array.of(0xa1, 0x01, 0x38, 0x22);

function validateProtectedHeader(protectedHeader) {
  let decodedHeader;
  try {
    decodedHeader = decodeCBOR(protectedHeader);
  } catch {
    throw new Error('Invalid COSE protected header');
  }

  if (!decodedHeader
      || Object.getPrototypeOf(decodedHeader) !== Object.prototype
      || Object.keys(decodedHeader).length !== 1
      || decodedHeader[1] !== -35
      || !arraysEqual(protectedHeader, NITRO_PROTECTED_HEADER)) {
    throw new Error('Invalid COSE protected header');
  }
}

export const ROOT_CERT = `-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPkxdWgbkK/hHUbMtOTn+FYwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoMBkFtYXpvbjEMMAoGA1UECwwDQVdTMRswGQYD
VQQDDBJhd3Mubml0cm8tZW5jbGF2ZXMwHhcNMTkxMDI4MTMyODA1WhcNNDkxMDI4
MTQyODA1WjBJMQswCQYDVQQGEwJVUzEPMA0GA1UECgwGQW1hem9uMQwwCgYDVQQL
DANBV1MxGzAZBgNVBAMMEmF3cy5uaXRyby1lbmNsYXZlczB2MBAGByqGSM49AgEG
BSuBBAAiA2IABPwCVOumCMHzaHDimtqQvkY4MpJzbolL//Zy2YlES1BR5TSksfbb
48C8WBoyt7F2Bw7eEtaaP+ohG2bnUs990d0JX28TcPQXCEPZ3BABIeTPYwEoCWZE
h8l5YoQwTcU/9KNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUkCW1DdkF
R+eWw5b6cp3PmanfS5YwDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2kAMGYC
MQCjfy+Rocm9Xue4YnwWmNJVA44fA0P5W2OpYow9OYCVRaEevL8uO1XYru5xtMPW
rfMCMQCi85sWBbJwKKXdS6BptQFuZbT73o/gBh1qUxl/nNr12UO8Yfwr6wPLb+6N
IwLz3/Y=
-----END CERTIFICATE-----`;

/**
 * Parse a Nitro attestation document without verification
 * @param {Uint8Array} document - Raw attestation document bytes
 * @returns {object} Parsed attestation structure
 */
export function parse(document) {
  // RFC 9052 and AWS's Nitro attestation specification both permit tagged and
  // untagged COSE_Sign1 structures. The NSM currently emits the untagged form.
  const coseSign1 = decodeCBOR(document, { allowedTags: [COSE_SIGN1_TAG] });

  if (!Array.isArray(coseSign1) || coseSign1.length !== 4) {
    throw new Error('Invalid COSE Sign1 structure');
  }

  const [protectedHeader, unprotectedHeader, payload, signature] = coseSign1;
  if (!(protectedHeader instanceof Uint8Array)
      || !unprotectedHeader
      || Object.getPrototypeOf(unprotectedHeader) !== Object.prototype
      || Object.keys(unprotectedHeader).length !== 0
      || !(payload instanceof Uint8Array)
      || !(signature instanceof Uint8Array)) {
    throw new Error('Invalid COSE Sign1 structure');
  }
  validateProtectedHeader(protectedHeader);

  // Nitro's signed CBOR payload currently uses an indefinite-length map.
  // RFC 8949 permits that encoding, so accept it here while the generic CBOR
  // decoder remains definite-length-only by default.
  const decodedPayload = decodeCBOR(payload, { allowIndefinite: true });
  if (!decodedPayload
      || Object.getPrototypeOf(decodedPayload) !== Object.prototype) {
    throw new Error('Invalid Nitro attestation payload');
  }

  const pcrs = {};
  if (decodedPayload.pcrs) {
    for (const [index, value] of Object.entries(decodedPayload.pcrs)) {
      pcrs[`PCR${index}`] = bytesToHex(value);
    }
  }

  let userData = null;
  if (decodedPayload.user_data) {
    try {
      userData = JSON.parse(new TextDecoder().decode(decodedPayload.user_data));
    } catch {
      userData = { raw: bytesToHex(decodedPayload.user_data) };
    }
  }

  return {
    protectedHeader,
    payloadRaw: payload,
    payload: decodedPayload,
    signature,
    cabundle: decodedPayload.cabundle,
    pcrs,
    userData,
    nonce: decodedPayload.nonce ? bytesToHex(decodedPayload.nonce) : null,
    publicKey: decodedPayload.public_key || null,
    moduleId: decodedPayload.module_id,
    digest: decodedPayload.digest,
    timestamp: decodedPayload.timestamp
  };
}

/**
 * Verify a Nitro attestation document
 * @param {Uint8Array} document - Raw attestation document bytes
 * @param {object} options - Verification options
 * @param {Uint8Array} [options.nonce] - Expected nonce for replay protection
 * @param {string} [options.rootCert] - Custom root certificate (defaults to AWS Nitro root)
 * @param {object} [options.pcrs] - Expected PCR values to match (e.g., { PCR0: '...' })
 * @returns {Promise<object>} Verification result
 */
export async function verify(document, options = {}) {
  const result = {
    verified: false,
    pcrs: {},
    userData: null,
    error: null
  };

  try {
    const parsed = parse(document);
    const rootCert = options.rootCert || ROOT_CERT;

    const signingCert = parsed.payload.certificate;
    if (!signingCert) {
      throw new Error('No signing certificate in attestation document');
    }

    await verifyCertificateChain([...parsed.cabundle, signingCert], rootCert);
    await verifyCOSESignature(
      parsed.protectedHeader,
      parsed.payloadRaw,
      parsed.signature,
      signingCert
    );

    if (options.nonce) {
      const expectedNonce = options.nonce instanceof Uint8Array
        ? options.nonce
        : new Uint8Array(options.nonce);
      const receivedNonce = parsed.payload.nonce;

      if (!receivedNonce || !arraysEqual(new Uint8Array(receivedNonce), expectedNonce)) {
        throw new Error('Nonce mismatch - possible replay attack');
      }
    }

    if (options.pcrs) {
      for (const [pcr, expectedValue] of Object.entries(options.pcrs)) {
        const actualValue = parsed.pcrs[pcr];
        if (actualValue !== expectedValue.toLowerCase()) {
          throw new Error(`PCR mismatch: ${pcr} expected ${expectedValue}, got ${actualValue}`);
        }
      }
    }

    result.verified = true;
    result.pcrs = parsed.pcrs;
    result.userData = parsed.userData;
    result.publicKey = parsed.publicKey;
    result.moduleId = parsed.moduleId;
    result.digest = parsed.digest;
    result.timestamp = parsed.timestamp;

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

async function verifyCertificateChain(cabundle, rootCertPem) {
  if (!cabundle || !Array.isArray(cabundle)) {
    throw new Error('Missing certificate bundle');
  }

  const rootDer = pemToDer(rootCertPem);
  const rootCert = parseCertificate(rootDer);
  let parentPublicKeyRaw = rootCert.publicKeyRaw;

  for (let i = 0; i < cabundle.length; i++) {
    const cert = parseCertificate(cabundle[i]);

    const now = Date.now();
    if (now < cert.notBefore.getTime() || now > cert.notAfter.getTime()) {
      throw new Error(`Certificate ${i} is not within validity period`);
    }

    const publicKey = await crypto.subtle.importKey(
      'spki',
      parentPublicKeyRaw,
      { name: 'ECDSA', namedCurve: 'P-384' },
      false,
      ['verify']
    );

    const rawSignature = ecdsaDerToRaw(cert.signature);
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-384' },
      publicKey,
      rawSignature,
      cert.tbsCertificate
    );

    if (!isValid) {
      throw new Error(`Certificate ${i} signature verification failed`);
    }

    parentPublicKeyRaw = cert.publicKeyRaw;
  }
}

async function verifyCOSESignature(protectedHeader, payload, signature, signingCertDer) {
  const cert = parseCertificate(signingCertDer);

  const sigStructure = encodeCBOR([
    'Signature1',
    protectedHeader,
    new Uint8Array(0),
    payload
  ]);

  const publicKey = await crypto.subtle.importKey(
    'spki',
    cert.publicKeyRaw,
    { name: 'ECDSA', namedCurve: 'P-384' },
    false,
    ['verify']
  );

  const isValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-384' },
    publicKey,
    signature,
    sigStructure
  );

  if (!isValid) {
    throw new Error('COSE signature verification failed');
  }
}
