// -----------------------------------------------------------------------------
// A tiny `fetch` on top of node:https, for the Life360 calls only.
//
// Why not the built-in fetch: its TLS ClientHello offers "http/1.1" as the only
// ALPN protocol, and the Cloudflare in front of Life360 blocks that handshake
// for some internet addresses (HTML 403 "you have been blocked"). node:https
// sends no ALPN at all, like the Python client of the maintained Home Assistant
// integration (pnbruckner/ha-life360, which hit and fixed the same block).
//
// Only what client.js reads is implemented: ok, status, headers.get, json, text.
// -----------------------------------------------------------------------------

import { request } from 'node:https';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const DECODERS = {
  gzip: createGunzip,
  deflate: createInflate,
  br: createBrotliDecompress,
};

function decoded(res) {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
  const decoder = DECODERS[encoding];
  return decoder ? res.pipe(decoder()) : res;
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string|undefined>, body?: URLSearchParams|string, signal?: AbortSignal, agent?: import('node:https').Agent }} [options]
 */
export function httpsFetch(url, { method = 'GET', headers = {}, body, signal, agent } = {}) {
  const sent = { 'accept-encoding': 'gzip, deflate, br' };
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) sent[name.toLowerCase()] = value;
  }
  let payload;
  if (body !== undefined) {
    payload = Buffer.from(String(body));
    // What fetch adds on its own for a URLSearchParams body.
    if (body instanceof URLSearchParams && !sent['content-type']) {
      sent['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    }
    sent['content-length'] = String(payload.length);
  }

  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers: sent, signal, agent }, (res) => {
      // Read once, so text() and json() can both be called.
      const text = readAll(decoded(res));
      text.catch(() => {});
      resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: {
          get: (name) => {
            const value = res.headers[name.toLowerCase()];
            if (value === undefined) return null;
            return Array.isArray(value) ? value.join(', ') : String(value);
          },
        },
        text: () => text,
        json: async () => JSON.parse(await text),
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
