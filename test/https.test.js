// -----------------------------------------------------------------------------
// The node:https `fetch` used for Life360, against an in-process TLS server on
// 127.0.0.1: no ALPN in the handshake (what Cloudflare blocks), the form body,
// compressed answers, headers, timeouts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, createServer } from 'node:https';
import { gzipSync } from 'node:zlib';
import { httpsFetch } from '../src/life360/https.js';
import { TEST_CERT, TEST_KEY } from './helpers/tls.js';

const agent = new Agent({ ca: TEST_CERT });

/** Start a TLS server; `handler(req, body, res)`; returns its URL and what it saw. */
async function server(handler) {
  const seen = { alpn: [] };
  const srv = createServer({
    key: TEST_KEY,
    cert: TEST_CERT,
    ALPNCallback: ({ protocols }) => {
      seen.alpn.push(protocols);
      return protocols.includes('http/1.1') ? 'http/1.1' : undefined;
    },
  });
  srv.on('request', async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.request = { method: req.method, url: req.url, headers: req.headers };
    seen.body = Buffer.concat(chunks).toString('utf8');
    handler(req, seen.body, res);
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return {
    url: `https://localhost:${srv.address().port}`,
    seen,
    close: () => new Promise((resolve) => srv.close(resolve)),
  };
}

test('the handshake offers no ALPN protocol, unlike the built-in fetch', async () => {
  const srv = await server((_req, _body, res) => res.end('{}'));
  try {
    await httpsFetch(`${srv.url}/v4/circles`, { agent });
    // ALPNCallback only runs when the client sends the ALPN extension.
    assert.deepEqual(srv.seen.alpn, []);
  } finally {
    await srv.close();
  }
});

test('a GET sends the headers and reads a gzip JSON answer', async () => {
  const srv = await server((_req, _body, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'cf-ray': 'abc-MAD',
    });
    res.end(gzipSync(JSON.stringify({ circles: [{ id: 'c1' }] })));
  });
  try {
    const response = await httpsFetch(`${srv.url}/v4/circles`, {
      agent,
      headers: { accept: 'application/json', authorization: 'Bearer t', skipped: undefined },
    });
    assert.equal(response.ok, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('CF-Ray'), 'abc-MAD');
    assert.equal(response.headers.get('retry-after'), null);
    assert.deepEqual(await response.json(), { circles: [{ id: 'c1' }] });
    assert.equal(srv.seen.request.method, 'GET');
    assert.equal(srv.seen.request.url, '/v4/circles');
    assert.equal(srv.seen.request.headers.authorization, 'Bearer t');
    assert.equal(srv.seen.request.headers.skipped, undefined);
  } finally {
    await srv.close();
  }
});

test('a URLSearchParams body is sent as a form, like fetch does', async () => {
  const srv = await server((_req, _body, res) => res.end('{"access_token":"x"}'));
  try {
    const body = new URLSearchParams({ grant_type: 'password', username: 'a@b.c' });
    await httpsFetch(`${srv.url}/v3/oauth2/token`, { agent, method: 'POST', body });
    assert.equal(srv.seen.request.method, 'POST');
    assert.match(srv.seen.request.headers['content-type'], /^application\/x-www-form-urlencoded/);
    assert.equal(srv.seen.body, 'grant_type=password&username=a%40b.c');
  } finally {
    await srv.close();
  }
});

test('an error answer can be read as text, and json() rejects on HTML', async () => {
  const srv = await server((_req, _body, res) => {
    res.writeHead(403, { 'content-type': 'text/html' });
    res.end('<html>Cloudflare</html>');
  });
  try {
    const response = await httpsFetch(`${srv.url}/v4/circles`, { agent });
    assert.equal(response.ok, false);
    assert.equal(response.status, 403);
    assert.equal(await response.text(), '<html>Cloudflare</html>');
    await assert.rejects(response.json(), SyntaxError);
  } finally {
    await srv.close();
  }
});

test('an aborted request rejects', async () => {
  const srv = await server(() => {
    // Never answers.
  });
  try {
    await assert.rejects(
      httpsFetch(`${srv.url}/v4/circles`, { agent, signal: AbortSignal.timeout(50) }),
    );
  } finally {
    await srv.close();
  }
});
