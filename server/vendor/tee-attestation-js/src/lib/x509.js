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

export function parseCertificate(der) {
  if (!(der instanceof Uint8Array)) {
    der = new Uint8Array(der);
  }
  let offset = 0;

  function readByte() {
    return der[offset++];
  }

  function readLength() {
    const first = readByte();
    if (first < 128) return first;
    const numBytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | readByte();
    }
    return length;
  }

  function expectTag(expected) {
    const tag = readByte();
    if (tag !== expected) throw new Error(`Expected tag ${expected}, got ${tag}`);
    return readLength();
  }

  function skipElement() {
    readByte();
    const len = readLength();
    offset += len;
  }

  expectTag(0x30);

  const tbsStart = offset;
  const tbsLen = expectTag(0x30);
  const tbsEnd = offset + tbsLen;
  const tbsCertificate = der.slice(tbsStart, tbsEnd);

  if (der[offset] === 0xa0) {
    offset++;
    const vLen = readLength();
    offset += vLen;
  }

  skipElement();
  skipElement();
  skipElement();

  const validityLen = expectTag(0x30);
  const validityEnd = offset + validityLen;

  readByte();
  const notBeforeLen = readLength();
  const notBeforeBytes = der.slice(offset, offset + notBeforeLen);
  const notBeforeStr = new TextDecoder().decode(notBeforeBytes);
  offset += notBeforeLen;

  readByte();
  const notAfterLen = readLength();
  const notAfterBytes = der.slice(offset, offset + notAfterLen);
  const notAfterStr = new TextDecoder().decode(notAfterBytes);
  offset = validityEnd;

  skipElement();

  const pubKeyStart = offset;
  const pubKeyOuterLen = expectTag(0x30);
  const pubKeyEnd = offset + pubKeyOuterLen;
  const publicKeyRaw = der.slice(pubKeyStart, pubKeyEnd);

  offset = tbsEnd;

  skipElement();

  readByte();
  const sigLen = readLength();
  readByte();
  const signature = der.slice(offset, offset + sigLen - 1);

  return {
    tbsCertificate,
    signature,
    publicKeyRaw,
    notBefore: parseASN1Time(notBeforeStr),
    notAfter: parseASN1Time(notAfterStr)
  };
}

export function parseASN1Time(str) {
  str = str.replace('Z', '');
  if (str.length === 12) {
    const year = parseInt(str.slice(0, 2), 10);
    const fullYear = year >= 50 ? 1900 + year : 2000 + year;
    return new Date(Date.UTC(fullYear, parseInt(str.slice(2, 4), 10) - 1, parseInt(str.slice(4, 6), 10),
      parseInt(str.slice(6, 8), 10), parseInt(str.slice(8, 10), 10), parseInt(str.slice(10, 12), 10)));
  }
  return new Date(Date.UTC(parseInt(str.slice(0, 4), 10), parseInt(str.slice(4, 6), 10) - 1, parseInt(str.slice(6, 8), 10),
    parseInt(str.slice(8, 10), 10), parseInt(str.slice(10, 12), 10), parseInt(str.slice(12, 14), 10)));
}

export function ecdsaDerToRaw(der, curveBytes = 48) {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error('Invalid DER signature');
  const seqLen = der[offset++];
  if (seqLen & 0x80) offset += (seqLen & 0x7f);

  if (der[offset++] !== 0x02) throw new Error('Invalid DER integer');
  let rLen = der[offset++];
  let rStart = offset;
  if (der[rStart] === 0x00) { rStart++; rLen--; }
  const r = der.slice(rStart, rStart + rLen);
  offset = rStart + rLen;

  if (der[offset++] !== 0x02) throw new Error('Invalid DER integer');
  let sLen = der[offset++];
  let sStart = offset;
  if (der[sStart] === 0x00) { sStart++; sLen--; }
  const s = der.slice(sStart, sStart + sLen);

  const result = new Uint8Array(curveBytes * 2);
  result.set(r, curveBytes - r.length);
  result.set(s, curveBytes * 2 - s.length);
  return result;
}

export function ecdsaRawToDer(r, s) {
  function encodeInteger(bytes) {
    let i = 0;
    while (i < bytes.length && bytes[i] === 0) i++;
    if (i === bytes.length) return new Uint8Array([0x02, 0x01, 0x00]);

    const needsPadding = bytes[i] & 0x80;
    const len = bytes.length - i + (needsPadding ? 1 : 0);
    const result = new Uint8Array(2 + len);
    result[0] = 0x02;
    result[1] = len;
    if (needsPadding) {
      result[2] = 0x00;
      result.set(bytes.slice(i), 3);
    } else {
      result.set(bytes.slice(i), 2);
    }
    return result;
  }

  const rDer = encodeInteger(r);
  const sDer = encodeInteger(s);
  const seqLen = rDer.length + sDer.length;
  const result = new Uint8Array(2 + seqLen);
  result[0] = 0x30;
  result[1] = seqLen;
  result.set(rDer, 2);
  result.set(sDer, 2 + rDer.length);
  return result;
}

export function pemToDer(pem) {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  if (!bytes) return '';
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function verifyECDSASignature(publicKeyRaw, data, signature, curve = 'P-384', hash = 'SHA-384') {
  const publicKey = await crypto.subtle.importKey(
    'spki',
    publicKeyRaw,
    { name: 'ECDSA', namedCurve: curve },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    { name: 'ECDSA', hash },
    publicKey,
    signature,
    data
  );
}
