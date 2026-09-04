#!/usr/bin/env node
/**
 * server/api/v1/tools/write-openapi.js
 *
 * Regenerates server/api/openapi/v1.yaml from the manifest. Run this after
 * any change to server/api/v1/inventory/manifest.js:
 *
 *   node server/api/v1/tools/write-openapi.js
 *
 * server/api/test/v1/openapi.test.js fails CI if the committed YAML drifts
 * from what this script would produce.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { buildOpenApiDocument } = require('../openapi');

const OUTPUT_PATH = path.join(__dirname, '..', '..', 'openapi', 'v1.yaml');

const HEADER = [
  '# CipherScan API v1 — OpenAPI 3.1 specification',
  '#',
  '# GENERATED FILE — do not hand-edit.',
  '# Source of truth: server/api/v1/inventory/manifest.js',
  '# Regenerate with: node server/api/v1/tools/write-openapi.js',
  '# Drift is checked by: server/api/test/v1/openapi.test.js',
  '',
].join('\n');

function main() {
  const doc = buildOpenApiDocument();
  const body = yaml.dump(doc, { noRefs: true, lineWidth: 100, sortKeys: false });
  fs.writeFileSync(OUTPUT_PATH, HEADER + body, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
