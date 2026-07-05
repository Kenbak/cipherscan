/**
 * Fork Monitor — Multi-node chain tip polling
 *
 * Polls external lightwalletd servers every 60s via gRPC GetLatestBlock,
 * compares their chain tips to ours, and logs mismatches to tip_reports.
 * Purely additive — if this module fails, the rest of the system is unaffected.
 */

const POLL_INTERVAL_MS = 60_000;
const GRPC_DEADLINE_MS = 5_000;

const MAINNET_NODES = [
  { name: 'Cake Wallet', host: 'zec-node.cakewallet.com', port: 443, tls: true },
  { name: 'zprivacy', host: 'zprivacy.online', port: 443, tls: true },
  { name: 'z0n.jp', host: 'lwd.z0n.jp', port: 443, tls: true },
  { name: 'Stardust EU', host: 'eu2.zec.stardust.rest', port: 443, tls: true },
  { name: 'ombie.cash (Zaino)', host: 'z.ombie.cash', port: 443, tls: true },
  { name: 'chmodas', host: 'chmodas.org', port: 443, tls: true },
  { name: 'zec.rocks NA', host: 'na.zec.rocks', port: 443, tls: true },
  { name: 'zec.rocks SA', host: 'sa.zec.rocks', port: 443, tls: true },
  { name: 'zec.rocks EU', host: 'eu.zec.rocks', port: 443, tls: true },
  { name: 'zec.rocks AP', host: 'ap.zec.rocks', port: 443, tls: true },
];

const TESTNET_NODES = [
  { name: 'zec.rocks testnet', host: 'testnet.zec.rocks', port: 443, tls: true },
  { name: 'Stardust testnet', host: 'testnet.zec.stardust.rest', port: 443, tls: true },
  { name: 'TazMiner (Shawn)', host: 'lwd.tazminer.com', port: 18232, tls: false, rpc: true },
];

const network = (process.env.ZCASH_NETWORK || process.env.NETWORK || 'mainnet').toLowerCase();
const MONITORED_NODES = network === 'testnet' ? TESTNET_NODES : MAINNET_NODES;

class ForkMonitor {
  constructor({ pool, grpc, CompactTxStreamer }) {
    this.pool = pool;
    this.grpc = grpc;
    this.CompactTxStreamer = CompactTxStreamer;
    this.interval = null;
    this.clients = new Map();
    this.nodeStatus = new Map();

    for (const node of MONITORED_NODES) {
      this.nodeStatus.set(node.name, {
        name: node.name,
        host: `${node.host}:${node.port}`,
        nodeImpl: null,
        version: null,
        lightwalletdVersion: null,
        height: null,
        hash: null,
        ourHash: null,
        status: 'pending',
        lastChecked: null,
        error: null,
      });
    }
  }

  start() {
    if (!this.CompactTxStreamer) {
      console.error('   [ForkMonitor] CompactTxStreamer not available, skipping');
      return;
    }

    console.log(`   [ForkMonitor] Monitoring ${MONITORED_NODES.length} external nodes`);
    this._createClients();

    setTimeout(() => {
      this._fetchNodeInfo();
      this._poll();
    }, 5_000);
    this.interval = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    this._infoInterval = setInterval(() => this._fetchNodeInfo(), 10 * 60_000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this._infoInterval) {
      clearInterval(this._infoInterval);
      this._infoInterval = null;
    }
    for (const [, client] of this.clients) {
      try { client.close(); } catch (_) {}
    }
    this.clients.clear();
  }

  getStatus() {
    return Array.from(this.nodeStatus.values());
  }

  _createClients() {
    for (const node of MONITORED_NODES) {
      try {
        const address = `${node.host}:${node.port}`;
        const creds = node.tls
          ? this.grpc.credentials.createSsl()
          : this.grpc.credentials.createInsecure();

        const client = new this.CompactTxStreamer(address, creds, {
          'grpc.keepalive_time_ms': 60_000,
          'grpc.keepalive_timeout_ms': 10_000,
        });

        this.clients.set(node.name, client);
      } catch (err) {
        console.error(`   [ForkMonitor] Failed to create client for ${node.name}: ${err.message}`);
      }
    }
  }

  async _poll() {
    try {
      const tipResult = await this.pool.query(
        'SELECT height, hash FROM blocks ORDER BY height DESC LIMIT 1'
      );
      if (tipResult.rows.length === 0) return;

      const ourTip = {
        height: parseInt(tipResult.rows[0].height),
        hash: tipResult.rows[0].hash,
      };

      const checks = MONITORED_NODES.map(node => this._checkNode(node, ourTip));
      await Promise.allSettled(checks);
    } catch (err) {
      console.error(`   [ForkMonitor] Poll error: ${err.message}`);
    }
  }

  async _checkNode(node, ourTip) {
    if (node.rpc) return this._checkRpcNode(node, ourTip);

    const client = this.clients.get(node.name);
    if (!client) {
      this._updateStatus(node.name, { status: 'offline', error: 'No client' });
      return;
    }

    try {
      const response = await this._getLatestBlock(client);
      const remoteHeight = parseInt(response.height);
      const remoteHash = this._hashToHex(response.hash);

      let status = 'syncing';
      let ourHashAtRemoteHeight = null;

      if (remoteHeight === ourTip.height) {
        ourHashAtRemoteHeight = ourTip.hash;
        status = remoteHash === ourTip.hash ? 'agree' : 'fork';
      } else if (remoteHeight < ourTip.height) {
        const dbResult = await this.pool.query(
          'SELECT hash FROM blocks WHERE height = $1', [remoteHeight]
        );
        if (dbResult.rows.length > 0) {
          ourHashAtRemoteHeight = dbResult.rows[0].hash;
          status = remoteHash === ourHashAtRemoteHeight ? 'behind' : 'fork';
        } else {
          status = 'behind';
        }
      } else {
        status = 'ahead';
      }

      this._updateStatus(node.name, {
        height: remoteHeight,
        hash: remoteHash,
        ourHash: ourHashAtRemoteHeight,
        status,
        error: null,
      });

      if (status === 'fork') {
        console.warn(`   [ForkMonitor] FORK: ${node.name} at height ${remoteHeight} — ${remoteHash.slice(0, 16)} != ${ourHashAtRemoteHeight?.slice(0, 16)}`);
        await this._recordMismatch(node.name, remoteHeight, remoteHash, ourHashAtRemoteHeight);
      }
    } catch (err) {
      this._updateStatus(node.name, { status: 'offline', error: err.message });
    }
  }

  async _checkRpcNode(node, ourTip) {
    const http = require('http');
    const url = `http://${node.host}:${node.port}/`;
    try {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getblockcount', params: [] });
      const result = await new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: GRPC_DEADLINE_MS }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });
      const remoteHeight = result.result;
      if (!remoteHeight) throw new Error('No result');
      const status = remoteHeight === ourTip.height ? 'agree'
        : remoteHeight > ourTip.height ? 'ahead' : 'behind';
      this._updateStatus(node.name, { height: remoteHeight, hash: null, ourHash: null, status, error: null });
    } catch (err) {
      this._updateStatus(node.name, { status: 'offline', error: err.message });
    }
  }

  async _fetchNodeInfo() {
    const checks = MONITORED_NODES.map(async (node) => {
      const client = this.clients.get(node.name);
      if (!client) return;
      try {
        const info = await this._getLightdInfo(client);
        const subversion = info.zcashdSubversion || '';
        // Extract version from subversion string like "/Zebra:5.0.0/" or "/MagicBean:6.20.0/"
        const match = subversion.match(/\/([\w.-]+):([\d.]+)/);
        const nodeImpl = match ? match[1] : null;
        const nodeVersion = match ? match[2] : null;
        this._updateStatus(node.name, {
          nodeImpl: nodeImpl,
          version: nodeVersion,
          lightwalletdVersion: info.version || null,
        });
      } catch (_) {}
    });
    await Promise.allSettled(checks);
  }

  _getLightdInfo(client) {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + GRPC_DEADLINE_MS);
      client.getLightdInfo({}, { deadline }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  _getLatestBlock(client) {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + GRPC_DEADLINE_MS);
      client.getLatestBlock({}, { deadline }, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }

  _hashToHex(hashBytes) {
    if (!hashBytes || hashBytes.length === 0) return '';
    const buf = Buffer.from(hashBytes);
    return Buffer.from(buf).reverse().toString('hex');
  }

  _updateStatus(name, updates) {
    const current = this.nodeStatus.get(name);
    if (current) {
      Object.assign(current, updates, { lastChecked: new Date().toISOString() });
    }
  }

  async _recordMismatch(nodeName, height, remoteHash, ourHash) {
    try {
      await this.pool.query(
        `INSERT INTO tip_reports (height, hash, node_id, ip_hash, is_match)
         VALUES ($1, $2, $3, 'monitor', false)
         ON CONFLICT (height, hash, COALESCE(node_id, '')) DO NOTHING`,
        [height, remoteHash, `monitor:${nodeName}`]
      );
    } catch (err) {
      console.error(`   [ForkMonitor] DB write error: ${err.message}`);
    }
  }
}

module.exports = { ForkMonitor };
