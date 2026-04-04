/**
 * Zebra gRPC Indexer Client
 *
 * Connects to Zebra's gRPC indexer service for real-time streaming of:
 * - Mempool changes (tx added, invalidated, mined)
 * - Chain tip changes (new blocks)
 *
 * Requires Zebra compiled with --features indexer and
 * indexer_listen_addr set in zebrad.toml.
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'indexer.proto');

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

class ZebraGrpcClient {
  constructor(grpcUrl, { onMempoolChange, onChainTipChange, onConnectionChange }) {
    this.grpcUrl = grpcUrl;
    this.onMempoolChange = onMempoolChange;
    this.onChainTipChange = onChainTipChange;
    this.onConnectionChange = onConnectionChange || (() => {});
    this.client = null;
    this.mempoolStream = null;
    this.chainTipStream = null;
    this.reconnectDelay = RECONNECT_DELAY_MS;
    this.connected = false;
    this.stopped = false;
  }

  start() {
    if (!this.grpcUrl) {
      console.log('⏭️  [GRPC] ZEBRA_GRPC_URL not set — gRPC streaming disabled, falling back to polling');
      return;
    }

    console.log(`🔗 [GRPC] Connecting to Zebra indexer at ${this.grpcUrl}...`);
    this._connect();
  }

  stop() {
    this.stopped = true;
    this._closeStreams();
    if (this.client) {
      grpc.closeClient(this.client);
      this.client = null;
    }
  }

  _connect() {
    if (this.stopped) return;

    try {
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const proto = grpc.loadPackageDefinition(packageDefinition);
      const IndexerService = proto.zebra.indexer.rpc.Indexer;

      this.client = new IndexerService(
        this.grpcUrl,
        grpc.credentials.createInsecure()
      );

      this._subscribeMempoolChanges();
      this._subscribeChainTipChanges();
    } catch (err) {
      console.error(`❌ [GRPC] Failed to connect: ${err.message}`);
      this._scheduleReconnect();
    }
  }

  _subscribeMempoolChanges() {
    if (!this.client || this.stopped) return;

    this.mempoolStream = this.client.MempoolChange({});

    this.mempoolStream.on('data', (msg) => {
      if (!this.connected) {
        this.connected = true;
        this.reconnectDelay = RECONNECT_DELAY_MS;
        this.onConnectionChange(true);
        console.log('✅ [GRPC] Connected to Zebra indexer — mempool stream active');
      }

      const txHash = Buffer.from(msg.txHash).toString('hex');
      const changeType = msg.changeType;

      this.onMempoolChange({
        type: changeType,
        txid: txHash,
      });
    });

    this.mempoolStream.on('error', (err) => {
      if (err.code === grpc.status.CANCELLED) return;
      console.error(`⚠️  [GRPC] Mempool stream error: ${err.message}`);
      this._handleDisconnect();
    });

    this.mempoolStream.on('end', () => {
      console.log('⚠️  [GRPC] Mempool stream ended');
      this._handleDisconnect();
    });
  }

  _subscribeChainTipChanges() {
    if (!this.client || this.stopped) return;

    this.chainTipStream = this.client.ChainTipChange({});

    this.chainTipStream.on('data', (msg) => {
      const blockHash = Buffer.from(msg.hash).toString('hex');
      const height = msg.height;

      console.log(`📦 [GRPC] New block: ${height} (${blockHash.slice(0, 16)}...)`);

      this.onChainTipChange({
        height,
        hash: blockHash,
      });
    });

    this.chainTipStream.on('error', (err) => {
      if (err.code === grpc.status.CANCELLED) return;
      console.error(`⚠️  [GRPC] Chain tip stream error: ${err.message}`);
    });

    this.chainTipStream.on('end', () => {
      console.log('⚠️  [GRPC] Chain tip stream ended');
    });
  }

  _closeStreams() {
    if (this.mempoolStream) {
      this.mempoolStream.cancel();
      this.mempoolStream = null;
    }
    if (this.chainTipStream) {
      this.chainTipStream.cancel();
      this.chainTipStream = null;
    }
  }

  _handleDisconnect() {
    if (this.stopped) return;
    if (this.connected) {
      this.connected = false;
      this.onConnectionChange(false);
      console.log('🔌 [GRPC] Disconnected from Zebra indexer');
    }
    this._closeStreams();
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.stopped) return;
    console.log(`🔄 [GRPC] Reconnecting in ${this.reconnectDelay / 1000}s...`);
    setTimeout(() => this._connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }
}

module.exports = { ZebraGrpcClient };
