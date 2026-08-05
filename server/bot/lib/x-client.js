'use strict';

/**
 * CipherScan Data Bot — X API Client
 *
 * OAuth2 user-context posting via the X API v2.
 * Supports dry-run mode (logs posts without publishing).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class XClient {
  constructor({ accessToken, dryRun = false, logger = console }) {
    this.accessToken = accessToken;
    this.dryRun = dryRun;
    this.logger = logger;
  }

  /**
   * Upload an image to X and return the media_id string.
   * Uses the v1.1 media/upload endpoint (simple upload, < 5MB).
   */
  async uploadMedia(imagePath) {
    const imageData = fs.readFileSync(imagePath);
    const mediaType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const totalBytes = imageData.length;

    // Step 1: INIT
    const initBody = JSON.stringify({
      media_type: mediaType,
      media_category: 'tweet_image',
      total_bytes: totalBytes,
    });

    const mediaId = await this._apiRequest('api.x.com', '/2/media/upload/initialize', 'POST', initBody, {
      'Content-Type': 'application/json',
    }).then(res => {
      const id = res.data?.id || res.id || res.media_id_string;
      if (!id) throw new Error(`Init failed: ${JSON.stringify(res).slice(0, 200)}`);
      return id;
    });

    this.logger.info(`[XClient] Media init: ${mediaId}`);

    // Step 2: APPEND (single chunk for images <5MB)
    const boundary = `----CipherScan${crypto.randomBytes(8).toString('hex')}`;
    const segIndexPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="segment_index"\r\n\r\n` +
      `0\r\n`
    );
    const mediaPart = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="image.png"\r\n` +
      `Content-Type: ${mediaType}\r\n\r\n`
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([segIndexPart, mediaPart, imageData, suffix]);

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.x.com',
        path: `/2/media/upload/${mediaId}/append`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
        },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Append failed (${res.statusCode}): ${data.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    this.logger.info(`[XClient] Media appended`);

    // Step 3: FINALIZE
    const finalRes = await this._apiRequest('api.x.com', `/2/media/upload/${mediaId}/finalize`, 'POST', '{}', {
      'Content-Type': 'application/json',
    });

    const finalId = finalRes.data?.id || finalRes.id || mediaId;
    this.logger.info(`[XClient] Media finalized: ${finalId}`);
    return finalId;
  }

  _apiRequest(hostname, path, method, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname,
        path,
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          ...extraHeaders,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`API ${path} (${res.statusCode}): ${data.slice(0, 300)}`));
            }
          } catch (e) {
            reject(new Error(`API parse error ${path}: ${data.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * Post a tweet with an attached image card.
   * Uploads the image, then creates the tweet referencing it.
   * Falls back to text-only post if upload fails.
   */
  async postWithMedia(text, imagePath) {
    if (this.dryRun) {
      this.logger.info(`[XClient DRY RUN] Would post with media:\n${text}\nImage: ${imagePath}\n---`);
      return { id: `dry_run_${Date.now()}`, text };
    }

    let mediaId = null;
    try {
      mediaId = await this.uploadMedia(imagePath);
    } catch (err) {
      this.logger.warn(`[XClient] Media upload failed, falling back to text-only: ${err.message}`);
    }

    if (text.length > 280) {
      this.logger.warn(`[XClient] Post exceeds 280 chars (${text.length}), truncating`);
      text = text.slice(0, 277) + '...';
    }

    const tweetPayload = { text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const body = JSON.stringify(tweetPayload);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.x.com',
          path: '/2/tweets',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode === 201 && parsed.data) {
                this.logger.info(`[XClient] Posted tweet ${parsed.data.id}${mediaId ? ' (with media)' : ''}`);
                resolve({ id: parsed.data.id, text: parsed.data.text });
              } else {
                const errMsg = parsed.detail || parsed.title || JSON.stringify(parsed);
                this.logger.error(`[XClient] Post failed (${res.statusCode}): ${errMsg}`);
                reject(new Error(`X API ${res.statusCode}: ${errMsg}`));
              }
            } catch (e) {
              reject(new Error(`X API response parse error: ${data.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Post a tweet. Returns { id, text } on success, or throws on failure.
   */
  async post(text) {
    if (text.length > 280) {
      this.logger.warn(`[XClient] Post exceeds 280 chars (${text.length}), truncating`);
      text = text.slice(0, 277) + '...';
    }

    if (this.dryRun) {
      this.logger.info(`[XClient DRY RUN] Would post:\n${text}\n---`);
      return { id: `dry_run_${Date.now()}`, text };
    }

    const body = JSON.stringify({ text });

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.x.com',
          path: '/2/tweets',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode === 201 && parsed.data) {
                this.logger.info(`[XClient] Posted tweet ${parsed.data.id}`);
                resolve({ id: parsed.data.id, text: parsed.data.text });
              } else {
                const errMsg = parsed.detail || parsed.title || JSON.stringify(parsed);
                this.logger.error(`[XClient] Post failed (${res.statusCode}): ${errMsg}`);
                reject(new Error(`X API ${res.statusCode}: ${errMsg}`));
              }
            } catch (e) {
              reject(new Error(`X API response parse error: ${data.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Refresh the OAuth2 access token using a refresh token.
   * Returns { access_token, refresh_token } or throws.
   */
  async refreshToken({ clientId, clientSecret, refreshToken }) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString();

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.x.com',
          path: '/2/oauth2/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode === 200 && parsed.access_token) {
                this.accessToken = parsed.access_token;
                this.logger.info('[XClient] Token refreshed successfully');
                resolve({
                  access_token: parsed.access_token,
                  refresh_token: parsed.refresh_token,
                });
              } else {
                reject(new Error(`Token refresh failed (${res.statusCode}): ${data.slice(0, 200)}`));
              }
            } catch (e) {
              reject(new Error(`Token refresh parse error: ${data.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = { XClient };
