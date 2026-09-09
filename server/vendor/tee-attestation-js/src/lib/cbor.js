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

export const MAX_CBOR_BYTES = 32 * 1024 * 1024;

const MAX_CBOR_DEPTH = 32;
const MAX_CBOR_CONTAINER_ITEMS = 65_536;
const MAX_CBOR_NODES = MAX_CBOR_CONTAINER_ITEMS * 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Encode the strict CBOR subset used by the supported attestation formats.
 * Existing supported values retain their original byte encoding.
 *
 * @param {*} value
 * @returns {Uint8Array}
 */
export function encode(value) {
  const chunks = [];
  const activeContainers = new WeakSet();
  let encodedLength = 0;

  function push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      chunk = new Uint8Array(chunk);
    }
    if (chunk.length > MAX_CBOR_BYTES - encodedLength) {
      throw new Error('CBOR output exceeds size limit');
    }
    chunks.push(chunk);
    encodedLength += chunk.length;
  }

  function encodeArgument(majorType, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('CBOR integer is out of range');
    }
    if (value < 24) {
      push(Uint8Array.of((majorType << 5) | value));
    } else if (value < 0x100) {
      push(Uint8Array.of((majorType << 5) | 24, value));
    } else if (value < 0x1_0000) {
      push(Uint8Array.of(
        (majorType << 5) | 25,
        value >>> 8,
        value & 0xff
      ));
    } else if (value <= 0xffff_ffff) {
      push(Uint8Array.of(
        (majorType << 5) | 26,
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
      ));
    } else {
      const encoded = new Uint8Array(9);
      encoded[0] = (majorType << 5) | 27;
      let remaining = BigInt(value);
      for (let index = 8; index > 0; index -= 1) {
        encoded[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
      }
      push(encoded);
    }
  }

  function encodeItem(item, depth) {
    if (depth > MAX_CBOR_DEPTH) {
      throw new Error('CBOR nesting exceeds depth limit');
    }
    if (item === null) {
      push(Uint8Array.of(0xf6));
    } else if (item === undefined) {
      push(Uint8Array.of(0xf7));
    } else if (typeof item === 'boolean') {
      push(Uint8Array.of(item ? 0xf5 : 0xf4));
    } else if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) {
        throw new Error('CBOR supports only safe integers');
      }
      if (item >= 0) {
        encodeArgument(0, item);
      } else {
        encodeArgument(1, -1 - item);
      }
    } else if (typeof item === 'string') {
      const bytes = textEncoder.encode(item);
      encodeArgument(3, bytes.length);
      push(bytes);
    } else if (item instanceof Uint8Array) {
      encodeArgument(2, item.length);
      push(item);
    } else if (Array.isArray(item)) {
      if (item.length > MAX_CBOR_CONTAINER_ITEMS) {
        throw new Error('CBOR container exceeds item limit');
      }
      if (activeContainers.has(item)) {
        throw new Error('CBOR cannot encode cyclic values');
      }
      activeContainers.add(item);
      encodeArgument(4, item.length);
      for (const value of item) {
        encodeItem(value, depth + 1);
      }
      activeContainers.delete(item);
    } else if (typeof item === 'object') {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('CBOR supports only plain objects');
      }
      const keys = Object.keys(item);
      if (keys.length > MAX_CBOR_CONTAINER_ITEMS) {
        throw new Error('CBOR container exceeds item limit');
      }
      if (activeContainers.has(item)) {
        throw new Error('CBOR cannot encode cyclic values');
      }
      activeContainers.add(item);
      encodeArgument(5, keys.length);
      for (const key of keys) {
        encodeItem(key, depth + 1);
        encodeItem(item[key], depth + 1);
      }
      activeContainers.delete(item);
    } else {
      throw new Error(`unsupported CBOR value type: ${typeof item}`);
    }
  }

  encodeItem(value, 0);
  const output = new Uint8Array(encodedLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Decode one bounded CBOR value with no trailing bytes.
 * Non-preferred argument encodings, duplicate keys, malformed UTF-8, nested
 * tags, and unsupported simple values are rejected. Indefinite-length items
 * are rejected unless explicitly enabled for a protocol that permits them.
 *
 * @param {ArrayBuffer|ArrayBufferView} input
 * @param {{
 *   allowedTags?: number[],
 *   requiredTag?: number,
 *   allowIndefinite?: boolean
 * }} [options]
 * @returns {*}
 */
export function decode(
  input,
  {
    allowedTags = [],
    requiredTag,
    allowIndefinite = false
  } = {}
) {
  const bytes = input instanceof Uint8Array
    ? input
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : null;
  if (!bytes) throw new TypeError('CBOR input must be bytes');
  if (bytes.length > MAX_CBOR_BYTES) {
    throw new Error('CBOR input exceeds size limit');
  }

  const acceptedTags = new Set(allowedTags);
  if (requiredTag !== undefined) acceptedTags.add(requiredTag);
  let decodedNodes = 0;
  let rootTag;
  let offset = 0;

  function requireBytes(length) {
    if (!Number.isSafeInteger(length)
        || length < 0
        || length > MAX_CBOR_BYTES
        || length > bytes.length - offset) {
      throw new Error('truncated or oversized CBOR value');
    }
  }

  function readArgument(additionalInfo) {
    if (additionalInfo < 24) return additionalInfo;
    let width;
    let minimumValue;
    switch (additionalInfo) {
      case 24:
        width = 1;
        minimumValue = 24n;
        break;
      case 25:
        width = 2;
        minimumValue = 0x100n;
        break;
      case 26:
        width = 4;
        minimumValue = 0x1_0000n;
        break;
      case 27:
        width = 8;
        minimumValue = 0x1_0000_0000n;
        break;
      case 31:
        throw new Error('indefinite-length CBOR is not supported');
      default:
        throw new Error(`unsupported CBOR additional info: ${additionalInfo}`);
    }
    requireBytes(width);
    let value = 0n;
    for (let index = 0; index < width; index += 1) {
      value = (value << 8n) | BigInt(bytes[offset]);
      offset += 1;
    }
    if (value < minimumValue) {
      throw new Error('non-preferred CBOR argument encoding');
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('CBOR integer exceeds safe integer range');
    }
    return Number(value);
  }

  function claimMapProperty(keys, key) {
    if (typeof key !== 'string' && typeof key !== 'number') {
      throw new Error('CBOR map keys must be strings or integers');
    }
    const property = String(key);
    if (keys.has(property)) {
      throw new Error('duplicate CBOR map key');
    }
    keys.add(property);
    return property;
  }

  function defineMapEntry(result, property, value) {
    Object.defineProperty(result, property, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  }

  function readIndefiniteString(majorType, depth) {
    const chunks = [];
    let decodedLength = 0;

    while (true) {
      requireBytes(1);
      if (bytes[offset] === 0xff) {
        offset += 1;
        break;
      }
      if (chunks.length >= MAX_CBOR_CONTAINER_ITEMS) {
        throw new Error('CBOR container exceeds item limit');
      }

      const chunkInitial = bytes[offset];
      const chunkMajorType = chunkInitial >> 5;
      const chunkAdditionalInfo = chunkInitial & 0x1f;
      if (chunkMajorType !== majorType || chunkAdditionalInfo === 31) {
        throw new Error('invalid indefinite-length CBOR string chunk');
      }

      const chunk = read(depth + 1);
      decodedLength += majorType === 2 ? chunk.length : textEncoder.encode(chunk).length;
      if (decodedLength > MAX_CBOR_BYTES) {
        throw new Error('CBOR string exceeds size limit');
      }
      chunks.push(chunk);
    }

    if (majorType === 3) return chunks.join('');

    const result = new Uint8Array(decodedLength);
    let resultOffset = 0;
    for (const chunk of chunks) {
      result.set(chunk, resultOffset);
      resultOffset += chunk.length;
    }
    return result;
  }

  function readIndefiniteArray(depth) {
    const result = [];
    while (true) {
      requireBytes(1);
      if (bytes[offset] === 0xff) {
        offset += 1;
        return result;
      }
      if (result.length >= MAX_CBOR_CONTAINER_ITEMS) {
        throw new Error('CBOR container exceeds item limit');
      }
      result.push(read(depth + 1));
    }
  }

  function readIndefiniteMap(depth) {
    const result = {};
    const keys = new Set();
    let itemCount = 0;

    while (true) {
      requireBytes(1);
      if (bytes[offset] === 0xff) {
        offset += 1;
        return result;
      }
      if (itemCount >= MAX_CBOR_CONTAINER_ITEMS) {
        throw new Error('CBOR container exceeds item limit');
      }

      const key = read(depth + 1);
      requireBytes(1);
      if (bytes[offset] === 0xff) {
        throw new Error('indefinite-length CBOR map has a dangling key');
      }
      const property = claimMapProperty(keys, key);
      defineMapEntry(result, property, read(depth + 1));
      itemCount += 1;
    }
  }

  function read(depth) {
    if (depth > MAX_CBOR_DEPTH) {
      throw new Error('CBOR nesting exceeds depth limit');
    }
    requireBytes(1);
    decodedNodes += 1;
    if (decodedNodes > MAX_CBOR_NODES) {
      throw new Error('CBOR exceeds node limit');
    }
    const initial = bytes[offset];
    offset += 1;
    const majorType = initial >> 5;
    const additionalInfo = initial & 0x1f;

    if (majorType === 7) {
      switch (additionalInfo) {
        case 20:
          return false;
        case 21:
          return true;
        case 22:
          return null;
        case 23:
          return undefined;
        case 31:
          throw new Error('unexpected CBOR break marker');
        default:
          throw new Error(`unsupported CBOR simple value: ${additionalInfo}`);
      }
    }

    if (additionalInfo === 31) {
      if (!allowIndefinite) {
        throw new Error('indefinite-length CBOR is not supported');
      }
      switch (majorType) {
        case 2:
        case 3:
          return readIndefiniteString(majorType, depth);
        case 4:
          return readIndefiniteArray(depth);
        case 5:
          return readIndefiniteMap(depth);
        default:
          throw new Error(`invalid indefinite-length CBOR major type: ${majorType}`);
      }
    }

    const value = readArgument(additionalInfo);
    switch (majorType) {
      case 0:
        return value;
      case 1: {
        const result = -1 - value;
        if (!Number.isSafeInteger(result)) {
          throw new Error('CBOR integer exceeds safe integer range');
        }
        return result;
      }
      case 2: {
        requireBytes(value);
        const result = bytes.slice(offset, offset + value);
        offset += value;
        return result;
      }
      case 3: {
        requireBytes(value);
        const encoded = bytes.subarray(offset, offset + value);
        offset += value;
        try {
          return textDecoder.decode(encoded);
        } catch {
          throw new Error('invalid UTF-8 in CBOR text string');
        }
      }
      case 4: {
        if (value > MAX_CBOR_CONTAINER_ITEMS) {
          throw new Error('CBOR container exceeds item limit');
        }
        const result = [];
        for (let index = 0; index < value; index += 1) {
          result.push(read(depth + 1));
        }
        return result;
      }
      case 5: {
        if (value > MAX_CBOR_CONTAINER_ITEMS) {
          throw new Error('CBOR container exceeds item limit');
        }
        const result = {};
        const keys = new Set();
        for (let index = 0; index < value; index += 1) {
          const key = read(depth + 1);
          const property = claimMapProperty(keys, key);
          defineMapEntry(result, property, read(depth + 1));
        }
        return result;
      }
      case 6:
        if (depth !== 0 || !acceptedTags.has(value)) {
          throw new Error(`unsupported CBOR tag: ${value}`);
        }
        rootTag = value;
        return read(depth + 1);
      default:
        throw new Error(`unsupported CBOR major type: ${majorType}`);
    }
  }

  const value = read(0);
  if (requiredTag !== undefined && rootTag !== requiredTag) {
    throw new Error(`required CBOR tag: ${requiredTag}`);
  }
  if (offset !== bytes.length) {
    throw new Error('trailing bytes after CBOR value');
  }
  return value;
}
