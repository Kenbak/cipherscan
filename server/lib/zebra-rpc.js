'use strict';

const http = require('http');
const fs = require('fs');

/**
 * Shared Zebra RPC client for CipherScan jobs and scripts.
 *
 * Canonical implementation extracted from server/api/server.js.
 * Route handlers should continue using req.app.locals.callZebraRPC
 * (which points to the same code but shares the server's HTTP agent).
 */

const zebraAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 4,
  maxFreeSockets: 2,
  timeout: 10000,
});

// Caps how much of a single RPC response we will buffer in memory. A
// misbehaving/oversized response (e.g. a huge verbose block or mempool dump)
// aborts the request instead of growing `data` without bound.
const MAX_RPC_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB

let _auth = null;

function getAuth() {
  if (_auth !== null) return _auth;
  const cookieFile = process.env.ZEBRA_RPC_COOKIE_FILE || '/root/.cache/zebra/.cookie';
  try {
    const cookie = fs.readFileSync(cookieFile, 'utf8').trim();
    if (cookie) {
      _auth = Buffer.from(cookie).toString('base64');
      return _auth;
    }
  } catch {}
  const rpcUser = process.env.ZCASH_RPC_USER || '__cookie__';
  const rpcPassword = process.env.ZCASH_RPC_PASSWORD || '';
  _auth = Buffer.from(`${rpcUser}:${rpcPassword}`).toString('base64');
  return _auth;
}

async function callZebraRPC(method, params = [], { timeout = 8000 } = {}) {
  const rpcUrl = process.env.ZEBRA_RPC_URL || 'http://127.0.0.1:18232';
  const auth = getAuth();

  const requestBody = JSON.stringify({
    jsonrpc: '1.0',
    id: 'zcash-explorer',
    method,
    params,
  });
  const url = new URL(rpcUrl);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        agent: zebraAgent,
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'Authorization': `Basic ${auth}`,
        },
      },
      (res) => {
        let data = '';
        let bytes = 0;
        let aborted = false;
        res.on('data', (chunk) => {
          if (aborted) return;
          bytes += chunk.length;
          if (bytes > MAX_RPC_RESPONSE_BYTES) {
            aborted = true;
            req.destroy(new Error(`RPC response exceeded ${MAX_RPC_RESPONSE_BYTES} bytes`));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          if (aborted) return;
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(response.error.message || 'RPC error'));
            } else {
              resolve(response.result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse RPC response: ${data.slice(0, 120)}`));
          }
        });
      }
    );

    req.on('timeout', () => { req.destroy(new Error('RPC timeout')); });
    req.on('error', (error) => { reject(new Error(`RPC request failed: ${error.message}`)); });
    req.write(requestBody);
    req.end();
  });
}

module.exports = { callZebraRPC };
