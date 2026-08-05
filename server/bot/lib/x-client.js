'use strict';

/**
 * CipherScan Data Bot — X API Client
 *
 * OAuth2 user-context posting via the X API v2.
 * Supports dry-run mode (logs posts without publishing).
 */

const https = require('https');

class XClient {
  constructor({ accessToken, dryRun = false, logger = console }) {
    this.accessToken = accessToken;
    this.dryRun = dryRun;
    this.logger = logger;
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
