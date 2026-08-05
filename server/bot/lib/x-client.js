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
    const boundary = `----CipherScan${crypto.randomBytes(8).toString('hex')}`;

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media_data"\r\n\r\n` +
      imageData.toString('base64') + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media_category"\r\n\r\n` +
      `tweet_image\r\n` +
      `--${boundary}--\r\n`
    );

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'upload.twitter.com',
          path: '/1.1/media/upload.json',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': preamble.length,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode === 200 && parsed.media_id_string) {
                this.logger.info(`[XClient] Uploaded media ${parsed.media_id_string}`);
                resolve(parsed.media_id_string);
              } else {
                const errMsg = parsed.error || parsed.errors?.[0]?.message || data.slice(0, 200);
                this.logger.error(`[XClient] Media upload failed (${res.statusCode}): ${errMsg}`);
                reject(new Error(`Media upload ${res.statusCode}: ${errMsg}`));
              }
            } catch (e) {
              reject(new Error(`Media upload parse error: ${data.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(preamble);
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
