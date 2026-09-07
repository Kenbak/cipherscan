'use strict';

// Private, read-only contract preview. Mainnet data remains on the API server.
// Never mount this development entry point on a public interface or proxy.
const express = require('express');
const cors = require('cors');
const createV1Router = require('./v1');
const { sendProblem } = require('./v1/lib/problem');

function createLocalPreview({ upstream = 'https://api.mainnet.cipherscan.app', port = 3002 } = {}) {
  const url = new URL(upstream);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Preview upstream must be an HTTPS origin or a loopback HTTP origin, without credentials.');
  }
  const app = express();
  app.disable('x-powered-by');
  const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    // Host validation also prevents a public domain rebinding to loopback.
    if (!hosts.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) {
      res.set('Cache-Control', 'no-store');
      return sendProblem(res, 'preview-auth-required', { status: 403, detail: 'Local preview requests only.' });
    }
    next();
  });
  app.use(cors({ origin: [...origins], methods: ['GET', 'HEAD', 'OPTIONS'], exposedHeaders: ['X-Request-Id', 'Retry-After'] }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.set('Allow', 'GET, HEAD, OPTIONS');
      res.set('Cache-Control', 'no-store');
      return sendProblem(res, 'method-not-allowed', { detail: 'This local mainnet preview is read-only.' });
    }
    next();
  });
  const router = createV1Router({
    API_V1_ENABLED: 'true',
    API_V1_LAUNCHED: 'true', // This loopback process only; never changes production flags.
    NEXT_PUBLIC_NETWORK: 'mainnet',
    V1_INTERNAL_API_BASE_URL: url.origin,
    V1_INTERNAL_SERVICE_KEY: '', // Do not borrow privileged production credentials.
  });
  app.use('/v1', router);
  app.use((req, res) => sendProblem(res, 'not-found', { detail: 'No local preview route matches this path.' }));
  return { app, stop: () => router.__stopRateLimiters?.() };
}

if (require.main === module) {
  const preview = createLocalPreview({ upstream: process.env.V1_PREVIEW_UPSTREAM });
  const server = preview.app.listen(3002, '127.0.0.1', () => {
    console.log('Private v1 preview: http://127.0.0.1:3002/v1 (read-only mainnet data; no public listener)');
  });
  const shutdown = () => { preview.stop(); server.close(); server.closeAllConnections(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = { createLocalPreview };
