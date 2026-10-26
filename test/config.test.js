import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  followedCircleNames,
  hasCredentials,
  normalizeConfig,
  normalizeToken,
} from '../src/config.js';

test('an empty config gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('form strings become numbers, clamped to the manifest bounds', () => {
  const config = normalizeConfig({
    refresh_interval: '5',
    home_radius: '99999',
    battery_low_threshold: 'x',
  });
  assert.equal(config.refresh_interval, 15);
  assert.equal(config.home_radius, 5000);
  assert.equal(config.battery_low_threshold, 20);
});

test('a pasted token is cleaned whatever its shape', () => {
  for (const pasted of ['abc', ' Bearer abc ', 'Authorization: Bearer abc', '"abc"']) {
    assert.equal(normalizeToken(pasted), 'abc', pasted);
  }
  assert.equal(normalizeToken(undefined), '');
});

test('an unknown sign-in method falls back to the token', () => {
  assert.equal(normalizeConfig({ auth_method: 'magic' }).auth_method, 'token');
});

test('credentials needed by each method', () => {
  assert.equal(hasCredentials(normalizeConfig({ access_token: 'x' })), true);
  assert.equal(hasCredentials(normalizeConfig({ auth_method: 'password', username: 'u' })), false);
  assert.equal(
    hasCredentials(normalizeConfig({ auth_method: 'password', username: 'u', password: ' p ' })),
    true,
  );
  assert.equal(normalizeConfig({ password: ' p ' }).password, ' p ', 'never trimmed');
});

test('circle names are split, trimmed and lowercased', () => {
  assert.deepEqual(followedCircleNames(normalizeConfig({ circles: ' Family, Work ,,' })), [
    'family',
    'work',
  ]);
  assert.deepEqual(followedCircleNames(normalizeConfig()), []);
});

test('an emptied home place stays empty', () => {
  assert.equal(normalizeConfig({ home_place: '' }).home_place, '');
  assert.equal(normalizeConfig({}).home_place, 'Home');
});
