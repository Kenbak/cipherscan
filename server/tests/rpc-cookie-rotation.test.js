const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
test('shared RPC client reloads a node cookie after rotation without restarting', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cipherscan-rpc-cookie-'));
  const cookie = path.join(directory, 'cookie');
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.authorization);
    res.end(JSON.stringify({ result: 42, error: null }));
  });
  const oldUrl = process.env.ZEBRA_RPC_URL;
  const oldCookie = process.env.ZEBRA_RPC_COOKIE_FILE;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.ZEBRA_RPC_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.ZEBRA_RPC_COOKIE_FILE = cookie;
    const { callZebraRPC } = require('../lib/zebra-rpc');
    for (const value of ['__cookie__:first', '__cookie__:second']) {
      fs.writeFileSync(cookie, value);
      assert.equal(await callZebraRPC('getblockcount'), 42);
    }
    assert.deepEqual(seen, ['__cookie__:first', '__cookie__:second'].map(value => 'Basic ' + Buffer.from(value).toString('base64')));
  } finally {
    if (oldUrl === undefined) delete process.env.ZEBRA_RPC_URL; else process.env.ZEBRA_RPC_URL = oldUrl;
    if (oldCookie === undefined) delete process.env.ZEBRA_RPC_COOKIE_FILE; else process.env.ZEBRA_RPC_COOKIE_FILE = oldCookie;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true });
  }
});
