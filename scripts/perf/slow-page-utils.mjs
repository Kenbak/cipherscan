import fs from 'node:fs';

function decodeExport(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function parseTsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === '\t' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

export function readSlowPageExport(filename) {
  const text = decodeExport(fs.readFileSync(filename));
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseTsvLine(lines.shift() || '');

  return lines.map((line) => {
    const fields = parseTsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, fields[index] || '']));
  });
}

export function routeGroup(rawUrl) {
  const pathname = new URL(rawUrl).pathname;
  if (/^\/block\/[^/]+$/.test(pathname)) return '/block/[id]';
  if (/^\/tx\/[^/]+$/.test(pathname)) return '/tx/[txid]';
  if (/^\/address\/[^/]+$/.test(pathname)) return '/address/[address]';
  return pathname;
}

export function sampleAcrossRoutes(rows, limit) {
  const groups = new Map();
  for (const row of rows) {
    const route = routeGroup(row.URL);
    if (!groups.has(route)) groups.set(route, []);
    groups.get(route).push(row);
  }

  const selected = [];
  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      const row = group.shift();
      if (!row) continue;
      selected.push(row);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

export function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(fraction * (sorted.length - 1))];
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
