
/**
 * Privacy Stats Update Server
 *
 * This server runs on the RPC machine and provides an endpoint to trigger
 * incremental privacy stats updates. It executes the calculate-privacy-stats.mjs
 * script when requested.
 *
 * Security:
 * - Listens only on localhost (127.0.0.1)
 * - Requires Bearer token authentication
 * - Rate limited to prevent abuse
 */

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = process.env.UPDATE_SERVER_PORT || 8082;
const HOST = '127.0.0.1'; // Always localhost for security
const AUTH_TOKEN = process.env.PRIVACY_STATS_UPDATE_TOKEN;
const SCRIPT_PATH = '/root/zcash-explorer/scripts/debug-wrapper.sh';

// Validate required environment variables
if (!AUTH_TOKEN) {
  console.error('❌ Missing required environment variable: PRIVACY_STATS_UPDATE_TOKEN');
  process.exit(1);
}

// Rate limiting: max 1 update per minute
let lastUpdateTime = 0;
const UPDATE_COOLDOWN = 60000; // 1 minute

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only allow POST to /update
  if (req.method !== 'POST' || req.url !== '/update') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
    return;
  }

  // Check authentication
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
    console.log('❌ Unauthorized update attempt');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
    return;
  }

  // Rate limiting
  const now = Date.now();
  if (now - lastUpdateTime < UPDATE_COOLDOWN) {
    const waitTime = Math.ceil((UPDATE_COOLDOWN - (now - lastUpdateTime)) / 1000);
    console.log(`⏳ Rate limited: wait ${waitTime}s`);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: `Rate limited. Try again in ${waitTime} seconds.`
    }));
    return;
  }

  // Trigger update
  console.log('🔄 Privacy stats update triggered...');
  lastUpdateTime = now;

  const startTime = Date.now();

  console.log('🔧 Spawning:', SCRIPT_PATH);
  console.log('🔧 CWD:', '/root/zcash-explorer');
  console.log('🔧 Env vars:', {
    ZCASH_RPC_URL: process.env.ZCASH_RPC_URL ? '✓' : '✗',
    ZCASH_RPC_USER: process.env.ZCASH_RPC_USER ? '✓' : '✗',
    ZCASH_RPC_PASS: process.env.ZCASH_RPC_PASS ? '✓' : '✗',
  });

  const child = spawn(SCRIPT_PATH, [], {
    cwd: '/root/zcash-explorer',
    env: {
      ...process.env, // Pass ALL env vars
      ZCASH_RPC_URL: process.env.ZCASH_RPC_URL,
      ZCASH_RPC_USER: process.env.ZCASH_RPC_USER,
      ZCASH_RPC_PASS: process.env.ZCASH_RPC_PASS,
    }
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    console.log('📤 stdout:', text.trim());
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    stderr += text;
    console.log('📤 stderr:', text.trim());
  });

  child.on('error', (error) => {
    console.error('❌ Spawn error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message,
    }));
  });

  child.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🏁 Process exited with code ${code} in ${duration}s`);

    if (code === 0) {
      console.log(`✅ Update completed successfully`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Privacy stats updated successfully',
        duration: `${duration}s`,
        output: stdout.split('\n').slice(-10).join('\n'),
      }));
    } else {
      console.error(`❌ Update failed with code ${code}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Process exited with code ${code}`,
        stderr: stderr,
      }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Privacy Stats Update Server running on ${HOST}:${PORT}`);
  console.log(`📊 Script: ${SCRIPT_PATH}`);
  console.log(`🔐 Auth: Bearer token required`);
  console.log(`⏱️  Rate limit: 1 update per minute`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
