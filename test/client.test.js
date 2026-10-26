// -----------------------------------------------------------------------------
// The Life360 HTTP client, with `fetch` replaced: headers, sign-in, token
// store, error kinds, and no secret in any error message.
// -----------------------------------------------------------------------------

import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Life360Client, Life360Error, redact } from '../src/life360/client.js';
import { normalizeConfig } from '../src/config.js';

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('no body');
      return body;
    },
  };
}

function fakeFetch(handlers) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    const handler = handlers.shift();
    if (!handler) throw new Error(`unexpected request ${url}`);
    return typeof handler === 'function' ? handler(url, options) : handler;
  };
  return { fetch, calls };
}

async function tokenFile() {
  return join(await mkdtemp(join(tmpdir(), 'life360-')), 'token.json');
}

test('a pasted token is sent as a Bearer, with the app user agent', async () => {
  const { fetch, calls } = fakeFetch([reply(200, { circles: [{ id: 'c1', name: 'Family' }] })]);
  const client = new Life360Client(normalizeConfig({ access_token: 'Bearer abc.def' }), {
    fetch,
    tokenFile: await tokenFile(),
  });

  assert.deepEqual(await client.getCircles(), [{ id: 'c1', name: 'Family' }]);
  assert.equal(calls[0].url, 'https://api-cloudfront.life360.com/v4/circles');
  assert.equal(calls[0].headers.authorization, 'Bearer abc.def');
  assert.match(calls[0].headers['user-agent'], /life360/);
});

test('password sign-in stores the token and reuses it after a restart', async () => {
  const file = await tokenFile();
  const config = normalizeConfig({
    auth_method: 'password',
    username: 'me@example.com',
    password: 'hunter2!',
  });
  const first = fakeFetch([
    reply(200, { access_token: 'tok-1', token_type: 'Bearer' }),
    reply(200, { members: [] }),
  ]);
  await new Life360Client(config, { fetch: first.fetch, tokenFile: file }).getCircleMembers('c1');
  assert.equal(first.calls[0].url, 'https://api-cloudfront.life360.com/v3/oauth2/token');
  assert.equal(first.calls[0].body.get('grant_type'), 'password');
  assert.match(first.calls[0].headers.authorization, /^Basic /);
  assert.equal(first.calls[1].headers.authorization, 'Bearer tok-1');
  assert.equal((await stat(file)).mode & 0o777, 0o600);

  const second = fakeFetch([reply(200, { members: [] })]);
  await new Life360Client(config, { fetch: second.fetch, tokenFile: file }).getCircleMembers('c1');
  assert.equal(second.calls.length, 1, 'no second sign-in');
  assert.equal(second.calls[0].headers.authorization, 'Bearer tok-1');

  // Another account never reuses that token.
  const other = normalizeConfig({ ...config, username: 'you@example.com' });
  const third = fakeFetch([reply(200, { access_token: 'tok-2' }), reply(200, { members: [] })]);
  await new Life360Client(other, { fetch: third.fetch, tokenFile: file }).getCircleMembers('c1');
  assert.equal(third.calls[1].headers.authorization, 'Bearer tok-2');
  assert.doesNotMatch(await readFile(file, 'utf8'), /you@example/);
});

test('an expired password token is renewed once', async () => {
  const config = normalizeConfig({ auth_method: 'password', username: 'me', password: 'pw' });
  const { fetch, calls } = fakeFetch([
    reply(200, { access_token: 'old' }),
    reply(401, { errorMessage: 'expired' }),
    reply(200, { access_token: 'new' }),
    reply(200, { circles: [] }),
  ]);
  const client = new Life360Client(config, { fetch, tokenFile: await tokenFile() });
  assert.deepEqual(await client.getCircles(), []);
  assert.equal(calls[3].headers.authorization, 'Bearer new');
});

test('error kinds: 401, 403, 404, 429 with Retry-After, network', async () => {
  const config = normalizeConfig({ access_token: 'secret-token-123' });
  const cases = [
    [reply(401, {}), 'unauthorized'],
    [reply(403, { errorMessage: 'blocked' }), 'forbidden'],
    [reply(404, {}), 'not_found'],
  ];
  for (const [response, kind] of cases) {
    const { fetch } = fakeFetch([response]);
    const client = new Life360Client(config, { fetch, tokenFile: await tokenFile() });
    await assert.rejects(
      client.getCircles(),
      (err) => err instanceof Life360Error && err.kind === kind,
    );
  }

  const limited = fakeFetch([reply(429, {}, { 'retry-after': '120' })]);
  await assert.rejects(
    new Life360Client(config, { fetch: limited.fetch, tokenFile: await tokenFile() }).getCircles(),
    (err) => err.kind === 'rate_limited' && err.retryAfter === 120,
  );

  const down = fakeFetch([
    () => Promise.reject(new Error('ECONNRESET secret-token-123')),
    () => Promise.reject(new Error('ECONNRESET secret-token-123')),
  ]);
  await assert.rejects(
    new Life360Client(config, { fetch: down.fetch, tokenFile: await tokenFile() }).getCircles(),
    (err) => err.kind === 'network' && !err.message.includes('secret-token-123'),
  );
});

test('a Cloudflare 5xx is retried once', async () => {
  const { fetch, calls } = fakeFetch([reply(522, undefined), reply(200, { circles: [] })]);
  const client = new Life360Client(normalizeConfig({ access_token: 'tok' }), {
    fetch,
    tokenFile: await tokenFile(),
  });
  assert.deepEqual(await client.getCircles(), []);
  assert.equal(calls.length, 2);
});

test('a location request posts type=location for the member', async () => {
  const { fetch, calls } = fakeFetch([reply(200, { requestId: 'r' })]);
  const client = new Life360Client(normalizeConfig({ access_token: 'tok' }), {
    fetch,
    tokenFile: await tokenFile(),
  });
  await client.requestLocationUpdate('c 1', 'm/2');
  assert.equal(
    calls[0].url,
    'https://api-cloudfront.life360.com/v3/circles/c%201/members/m%2F2/request',
  );
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.get('type'), 'location');
});

test('redact hides the secrets and any bearer token', () => {
  assert.equal(
    redact('pw=hunter2 auth=Bearer abc.DEF-123', ['hunter2']),
    'pw=REDACTED auth=Bearer REDACTED',
  );
});
