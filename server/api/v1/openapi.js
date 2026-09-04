/**
 * server/api/v1/openapi.js
 *
 * Builds the OpenAPI 3.1 document for the /v1 contract layer directly from
 * the manifest (inventory/manifest.js), so the spec cannot drift from the
 * actually-mounted routes. server/api/openapi/v1.yaml is a generated
 * artifact — regenerate it with `node server/api/v1/tools/write-openapi.js`
 * after editing the manifest, and see server/api/test/v1/openapi.test.js
 * for the drift check that runs in CI.
 */

const { MANIFEST } = require('./inventory/manifest');

const PROBLEM_SCHEMA = {
  type: 'object',
  description: 'RFC 9457 problem+json error body.',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string', format: 'uri', description: 'A URI identifying the problem category.' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, issue: { type: 'string' } },
      },
    },
  },
};

const ZATOSHI_STRING_SCHEMA = {
  type: 'string',
  pattern: '^-?[0-9]+$',
  description: 'Integer amount in zatoshis (1 ZEC = 100,000,000 zatoshis), encoded as a decimal string to avoid float precision loss. Never a JSON number.',
};

const META_SCHEMA = {
  type: 'object',
  required: ['requestId', 'network', 'generatedAt', 'cache'],
  properties: {
    requestId: { type: 'string', format: 'uuid' },
    network: { type: 'string', enum: ['mainnet', 'testnet', 'crosslink-testnet'] },
    generatedAt: { type: 'string', format: 'date-time' },
    indexedHeight: { type: ['integer', 'null'] },
    cache: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['hit', 'miss', 'stale', 'unknown'] },
        ageSeconds: { type: ['number', 'null'] },
      },
    },
    dataAgeSeconds: { type: 'number' },
    warnings: {
      type: 'array',
      items: { type: 'object', properties: { field: { type: 'string' }, issue: { type: 'string' } } },
    },
    page: {
      type: 'object',
      description: 'Present on cursor-paginated list endpoints.',
      properties: {
        limit: { type: 'integer' },
        hasNext: { type: 'boolean' },
        hasPrev: { type: 'boolean' },
        nextCursor: { type: ['string', 'null'] },
        prevCursor: { type: ['string', 'null'] },
        total: { type: ['integer', 'null'] },
      },
    },
  },
};

function successEnvelopeSchema(dataSchema) {
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: dataSchema,
      meta: { $ref: '#/components/schemas/Meta' },
    },
  };
}

function pathParams(v1Path) {
  const names = [...v1Path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function toOpenApiPath(v1Path) {
  return v1Path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
}

function operationId(method, v1Path) {
  const slug = v1Path
    .replace(/^\/v1\//, '')
    .replace(/[:{}]/g, '')
    .split('/')
    .filter(Boolean)
    .map((seg, i) => (i === 0 ? seg : seg[0].toUpperCase() + seg.slice(1)))
    .join('_');
  return `${method.toLowerCase()}_${slug || 'root'}`;
}

const ERROR_RESPONSES = {
  '400': { description: 'Validation error.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
  '404': { description: 'Resource not found.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
  '429': { description: 'Rate limited (enforced by the legacy endpoint this proxies to).', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
  '500': { description: 'Internal error.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
  '502': { description: 'Upstream (legacy API) error.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
  '504': { description: 'Upstream (legacy API) timeout.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
};

function buildOperation(entry) {
  const isList = entry.v1.shape === 'list';
  const isStub = entry.v1.status === 'stub';

  const dataSchema = isList
    ? { type: 'array', items: {} }
    : { oneOf: [{ type: 'object' }, { type: 'array', items: {} }] };

  const parameters = [...pathParams(entry.v1.path)];
  if (isList) {
    parameters.push(
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
      { name: 'cursor', in: 'query', required: false, description: 'Opaque cursor from a previous response\'s meta.page.nextCursor/prevCursor.', schema: { type: 'string' } },
    );
  }

  const responses = isStub
    ? {
      '501': {
        description: 'Not yet available under /v1 (fails closed) — see the `detail` field for why.',
        content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
      },
    }
    : {
      '200': {
        description: entry.description || 'Successful response.',
        content: { 'application/json': { schema: successEnvelopeSchema(dataSchema) } },
      },
      ...ERROR_RESPONSES,
    };

  const finalResponses = entry.v1.rateLimitKey && !isStub
    ? { ...responses, '429': ERROR_RESPONSES['429'] }
    : responses;

  return {
    operationId: operationId(entry.method, entry.v1.path),
    summary: entry.description,
    tags: [entry.domain],
    ...(parameters.length ? { parameters } : {}),
    'x-cipherscan-legacy-path': entry.legacyPath,
    'x-cipherscan-legacy-method': entry.method,
    'x-cipherscan-classification': entry.classification,
    'x-cipherscan-v1-status': entry.v1.status,
    ...(entry.v1.validateKey ? { 'x-cipherscan-v1-validation': entry.v1.validateKey } : {}),
    ...(entry.v1.rateLimitKey ? { 'x-cipherscan-v1-rate-limit-key': entry.v1.rateLimitKey } : {}),
    responses: finalResponses,
  };
}

function buildOpenApiDocument() {
  const paths = {};
  const tagSet = new Set();

  for (const entry of MANIFEST) {
    if (entry.v1.status === 'excluded') continue;
    tagSet.add(entry.domain);
    const contractPath = toOpenApiPath(entry.v1.path);
    paths[contractPath] = paths[contractPath] || {};
    paths[contractPath][entry.method.toLowerCase()] = buildOperation(entry);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CipherScan API v1',
      version: '1.0.0-preview',
      summary: 'Versioned, contract-stable read/write API for the Zcash blockchain data and privacy-intelligence features exposed by CipherScan.',
      description: [
        'This is the v1 contract layer. It is gated behind API_V1_ENABLED and,',
        'pre-launch, an X-API-Preview-Key header (see the previewKey security',
        'scheme) — see server/api/v1/README.md in the repository for exact',
        'mount instructions and current caveats. Every success response uses',
        'the {data, meta} envelope; every error response is an RFC 9457',
        'problem+json document. Every public inventory entry is adapted;',
        'private, internal, operational, and deprecated surfaces are excluded.',
      ].join(' '),
      contact: { name: 'CipherScan / Atmosphere Labs' },
    },
    servers: [
      { url: 'https://api.mainnet.cipherscan.app', description: 'Mainnet API host.' },
      { url: 'https://api.testnet.cipherscan.app', description: 'Testnet API host.' },
      { url: 'http://127.0.0.1:3001', description: 'Local development API host.' },
    ],
    tags: [...tagSet].sort().map((name) => ({ name })),
    security: [{ previewKey: [] }],
    components: {
      securitySchemes: {
        previewKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Preview-Key',
          description: 'Required while API_V1_LAUNCHED=false. Dropped once v1 is generally available.',
        },
      },
      schemas: {
        Problem: PROBLEM_SCHEMA,
        Meta: META_SCHEMA,
        ZatoshiString: ZATOSHI_STRING_SCHEMA,
      },
    },
    paths,
  };
}

module.exports = { buildOpenApiDocument, toOpenApiPath };
