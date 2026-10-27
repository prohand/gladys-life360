// -----------------------------------------------------------------------------
// Life360 cloud client.
//
// Life360 has no public API: this talks to the endpoints its mobile app uses,
// the same ones the maintained Home Assistant integration relies on
// (pnbruckner/life360). Every call is an HTTPS request to
// api-cloudfront.life360.com, authenticated with `Authorization: Bearer`.
//
// Two ways to get the token:
//   - the user pastes the access token copied from the Life360 web site
//     (recommended: password sign-in is often refused since Life360 added
//     verification codes);
//   - username + password, exchanged against a token with the app's own
//     client credentials. The token is then kept in /data so a restart does
//     not sign in again (repeated sign-ins get an account blocked).
//
// The token is a password: it never reaches a log line (see `redact`).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { AUTH_METHODS } from '../config.js';

const logger = createLogger({ name: 'life360-client' });

export const API_BASE = 'https://api-cloudfront.life360.com';

// The Android app's own identity: Life360 answers 403 to unknown clients.
const USER_AGENT = 'com.life360.android.safetymapd/KOKO/23.50.0 android/13';
const CLIENT_TOKEN =
  'Y2F0aGFwYWNyQVBoZUtVc3RlOGV2ZXZldnVjSGFmZVRydVl1ZnJhYzpkOEM5ZVlVdkE2dUZ1YnJ1SmVnZXRyZVZ1dFJlQ1JVWQ==';

const REQUEST_TIMEOUT_MS = 15_000;
// Cloudflare in front of Life360 answers these when the origin hiccups: worth
// one more try, a 4xx never is.
const RETRY_STATUSES = new Set([500, 502, 503, 504, 520, 522, 525]);
const MAX_ATTEMPTS = 2;

export const TOKEN_FILE = `${process.env.DATA_DIR ?? '/data'}/life360-token.json`;

/** Why a Life360 call failed, in a form the rest of the code can branch on. */
export class Life360Error extends Error {
  /**
   * @param {'unauthorized'|'forbidden'|'blocked'|'not_found'|'rate_limited'|'network'|'server'|'invalid'} kind
   * @param {string} message
   * @param {{ status?: number, retryAfter?: number }} [details]
   */
  constructor(kind, message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'Life360Error';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Replace every secret of `secrets` found in `text` with REDACTED. */
export function redact(text, secrets) {
  let result = String(text);
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      result = result.split(secret).join('REDACTED');
    }
  }
  return result.replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer REDACTED');
}

// Cloudflare's own "Sorry, you have been blocked" page: an HTML 403 that says
// nothing about the token. Life360's API answers JSON or an empty body.
function isCloudflareBlock(status, contentType, text) {
  return status === 403 && /html/i.test(contentType) && /cloudflare/i.test(text);
}

function kindOf(status) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'server';
}

export class Life360Client {
  /**
   * @param {object} config normalized configuration (see src/config.js)
   * @param {{ fetch?: typeof fetch, tokenFile?: string }} [options] injected in the tests
   */
  constructor(config, { fetch: fetchImpl = globalThis.fetch, tokenFile = TOKEN_FILE } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.tokenFile = tokenFile;
    // Token obtained by password sign-in (the pasted one lives in the config).
    this.passwordToken = null;
  }

  get secrets() {
    return [this.config.access_token, this.config.password, this.passwordToken];
  }

  // The token store is keyed by the account, so changing the username in the
  // configuration never reuses the previous account's token.
  accountKey() {
    return createHash('sha256').update(this.config.username.toLowerCase()).digest('hex');
  }

  async loadStoredToken() {
    try {
      const stored = JSON.parse(await readFile(this.tokenFile, 'utf8'));
      if (stored.account === this.accountKey() && typeof stored.token === 'string') {
        return stored.token;
      }
    } catch {
      // No file yet, or unreadable: sign in again.
    }
    return null;
  }

  async storeToken(token) {
    try {
      await mkdir(dirname(this.tokenFile), { recursive: true });
      await writeFile(this.tokenFile, JSON.stringify({ account: this.accountKey(), token }), {
        mode: 0o600,
      });
    } catch (err) {
      // Not fatal: the next restart signs in again.
      logger.warn(`Could not keep the Life360 token in ${this.tokenFile}: ${err.message}`);
    }
  }

  /** The bearer token to use, signing in with the password when needed. */
  async token() {
    if (this.config.auth_method !== AUTH_METHODS.PASSWORD) {
      if (!this.config.access_token) {
        throw new Life360Error('invalid', 'No Life360 access token configured');
      }
      return this.config.access_token;
    }
    if (!this.passwordToken) {
      this.passwordToken = (await this.loadStoredToken()) ?? (await this.signIn());
    }
    return this.passwordToken;
  }

  /** Exchange the username and password for an access token. */
  async signIn() {
    if (!this.config.username || !this.config.password) {
      throw new Life360Error('invalid', 'Life360 username or password missing');
    }
    logger.info('Signing in to Life360 with the username and password');
    const body = new URLSearchParams({
      grant_type: 'password',
      username: this.config.username,
      password: this.config.password,
    });
    const reply = await this.request('/v3/oauth2/token', {
      method: 'POST',
      body,
      authorization: `Basic ${CLIENT_TOKEN}`,
    });
    if (typeof reply?.access_token !== 'string' || reply.access_token === '') {
      throw new Life360Error('invalid', 'Unexpected answer from the Life360 sign-in');
    }
    await this.storeToken(reply.access_token);
    return reply.access_token;
  }

  /**
   * An authenticated call. A password-based token refused with 401 is
   * renewed once: Life360 tokens expire after a few weeks.
   */
  async call(path, options = {}) {
    const token = await this.token();
    try {
      return await this.request(path, { ...options, authorization: `Bearer ${token}` });
    } catch (err) {
      if (
        err instanceof Life360Error &&
        err.kind === 'unauthorized' &&
        this.config.auth_method === AUTH_METHODS.PASSWORD
      ) {
        logger.info('Life360 token refused, signing in again');
        this.passwordToken = await this.signIn();
        return this.request(path, { ...options, authorization: `Bearer ${this.passwordToken}` });
      }
      throw err;
    }
  }

  async request(path, { method = 'GET', body, authorization } = {}) {
    const headers = {
      accept: 'application/json',
      'cache-control': 'no-cache',
      'user-agent': USER_AGENT,
      authorization,
    };
    for (let attempt = 1; ; attempt += 1) {
      let response;
      try {
        response = await this.fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) continue;
        throw new Life360Error(
          'network',
          redact(`Life360 unreachable: ${err.message}`, this.secrets),
        );
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new Life360Error('server', 'Life360 answered something that is not JSON', {
            status: response.status,
          });
        }
      }
      if (RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) continue;

      let text = '';
      try {
        text = await response.text();
      } catch {
        // No body: the status says enough.
      }
      let kind = kindOf(response.status);
      let detail = '';
      if (isCloudflareBlock(response.status, response.headers?.get?.('content-type') ?? '', text)) {
        kind = 'blocked';
        const ray = response.headers?.get?.('cf-ray');
        detail = `blocked by Cloudflare${ray ? ` (Ray ID ${ray})` : ''}`;
      } else {
        try {
          const payload = JSON.parse(text);
          detail = payload?.errorMessage ?? payload?.message ?? '';
        } catch {
          // Not JSON (Life360 sends an empty body on some 401/403).
        }
      }
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      throw new Life360Error(
        kind,
        redact(`Life360 HTTP ${response.status}${detail ? `: ${detail}` : ''}`, this.secrets),
        {
          status: response.status,
          retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        },
      );
    }
  }

  /** @returns {Promise<Array<{ id: string, name: string }>>} */
  async getCircles() {
    const reply = await this.call('/v4/circles');
    return (reply?.circles ?? []).map((circle) => ({
      id: String(circle.id),
      name: String(circle.name ?? ''),
    }));
  }

  /** @returns {Promise<object[]>} the raw members, as Life360 sends them */
  async getCircleMembers(circleId) {
    const reply = await this.call(`/v3/circles/${encodeURIComponent(circleId)}/members`);
    return reply?.members ?? [];
  }

  /**
   * Ask a member's phone to report its position now. Life360 then sends a
   * fresh position every few seconds for about a minute.
   */
  async requestLocationUpdate(circleId, memberId) {
    const body = new URLSearchParams({ type: 'location' });
    return this.call(
      `/v3/circles/${encodeURIComponent(circleId)}/members/${encodeURIComponent(memberId)}/request`,
      { method: 'POST', body },
    );
  }
}
