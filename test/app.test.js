// -----------------------------------------------------------------------------
// The whole integration against the SDK's fake Gladys and an in-memory
// Life360: devices, states, badges, connection status, scene events, actions.
// -----------------------------------------------------------------------------

import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { Life360Error } from '../src/life360/client.js';
import { createFakeLife360, rawMember } from './helpers/fakeLife360.js';

const HOUSE = {
  id: 'h1',
  name: 'Maison',
  selector: 'maison',
  latitude: 48.8566,
  longitude: 2.3522,
};
// About 2.3 km east of the house.
const AWAY = { latitude: 48.8566, longitude: 2.384, place: null, address1: '10 rue de Lyon' };

async function setup({
  config = { access_token: 'secret-token' },
  life360,
  houses = [HOUSE],
} = {}) {
  const life = life360 ?? createFakeLife360();
  const gladys = createFakeGladys({ config, houses });
  const app = createApp(gladys, {
    createClient: (clientConfig) => {
      life.config = clientConfig;
      return life;
    },
  });
  await gladys.connect();
  // The loop is started by 'connected': stop it, the tests drive the refreshes.
  app.stop();
  await app.service.refresh();
  return { gladys, app, life };
}

function deviceId(gladys, memberId = 'm-alice') {
  return gladys.externalIds('member', memberId).device;
}

test('publishes one device per member with its states', async (t) => {
  const { gladys } = await setup();
  t.after(() => gladys.disconnect());

  assert.equal(gladys.fake.discoveredDevices.length, 1);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'Alice Martin (Life360)');
  assert.equal(device.external_id, deviceId(gladys));
  const feature = (key) => gladys.externalIds('member', 'm-alice').feature(key);
  assert.equal(gladys.fake.lastState(feature('presence')), 1);
  assert.equal(gladys.fake.lastState(feature('battery')), 80);
  assert.equal(gladys.fake.lastState(feature('charging')), 0);
  assert.equal(gladys.fake.lastState(feature('distance')), 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a member seen in two circles is one device', async (t) => {
  const life = createFakeLife360({
    circles: [
      { id: 'c1', name: 'Family' },
      { id: 'c2', name: 'Friends' },
    ],
    members: {
      c1: [rawMember({ place: null, timestamp: '100' })],
      c2: [rawMember({ place: 'Home', timestamp: '50' })],
    },
  });
  const { gladys } = await setup({ life360: life });
  t.after(() => gladys.disconnect());

  assert.equal(gladys.fake.discoveredDevices.length, 1);
  const place = gladys.externalIds('member', 'm-alice').feature('place');
  assert.equal(gladys.fake.lastState(place), 'Home');
});

test('only the circles named in the configuration are followed', async (t) => {
  const life = createFakeLife360({
    circles: [
      { id: 'c1', name: 'Family' },
      { id: 'c2', name: 'Work' },
    ],
    members: { c1: [rawMember()], c2: [rawMember({ id: 'm-bob', firstName: 'Bob' })] },
  });
  const { gladys } = await setup({
    life360: life,
    config: { access_token: 'secret-token', circles: ' family ' },
  });
  t.after(() => gladys.disconnect());

  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Alice Martin (Life360)'],
  );
});

test('leaving home fires left_home and place_left, coming back fires arrived_home', async (t) => {
  const { gladys, app, life } = await setup();
  t.after(() => gladys.disconnect());
  // The first read only sets the reference: no "arrived home" at startup.
  assert.deepEqual(gladys.fake.sceneEvents, []);

  life.members['c-family'] = [rawMember(AWAY)];
  await app.service.refresh();
  const keys = gladys.fake.sceneEvents.map((event) => event.key);
  assert.deepEqual(keys, ['left_home', 'place_left']);
  const left = gladys.fake.sceneEvents[0].data;
  assert.equal(left.member, deviceId(gladys));
  assert.equal(left.member_name, 'Alice Martin');
  assert.ok(left.distance_km > 2 && left.distance_km < 3);
  assert.equal(gladys.fake.sceneEvents[1].data.place, 'Home');

  life.members['c-family'] = [rawMember()];
  await app.service.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.slice(2).map((event) => event.key),
    ['arrived_home', 'place_arrived'],
  );
});

test('driving and a low battery fire their triggers once', async (t) => {
  const { gladys, app, life } = await setup();
  t.after(() => gladys.disconnect());

  life.members['c-family'] = [rawMember({ isDriving: '1', battery: '15', speed: '10' })];
  await app.service.refresh();
  await app.service.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    ['driving_started', 'battery_low'],
  );
  const speed = gladys.externalIds('member', 'm-alice').feature('speed');
  assert.equal(gladys.fake.lastState(speed), 36.2);
});

test('a member without a position gets a degraded badge and no state', async (t) => {
  const life = createFakeLife360({
    members: {
      'c-family': [
        rawMember({ id: 'm-bob', firstName: 'Bob', shareLocation: '0', location: false }),
      ],
    },
  });
  const { gladys } = await setup({ life360: life });
  t.after(() => gladys.disconnect());

  assert.equal(gladys.fake.states.length, 0);
  const [badge] = gladys.fake.transports;
  assert.equal(badge.transport, 'cloud');
  assert.equal(badge.degraded, true);
  assert.match(badge.message.en, /stopped sharing/);
});

test('a refused token is reported and the badges turn unreachable', async (t) => {
  const { gladys, app, life } = await setup();
  t.after(() => gladys.disconnect());

  life.error = new Life360Error('unauthorized', 'Life360 HTTP 401', { status: 401 });
  await app.service.refresh();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the access token/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
});

test('a 429 stretches the next refresh to what Life360 asked', async (t) => {
  const { gladys, app, life } = await setup();
  t.after(() => gladys.disconnect());

  life.error = new Life360Error('rate_limited', 'Life360 HTTP 429', {
    status: 429,
    retryAfter: 600,
  });
  assert.equal(await app.service.refresh(), 600_000);
});

test('without credentials the status says what to do', async (t) => {
  const life = createFakeLife360();
  const { gladys } = await setup({ life360: life, config: {} });
  t.after(() => gladys.disconnect());

  assert.equal(life.calls, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /Pas encore configurée/);
});

test('without a located house, the Life360 home place still says "at home"', async (t) => {
  const { gladys } = await setup({ houses: [] });
  t.after(() => gladys.disconnect());

  const presence = gladys.externalIds('member', 'm-alice').feature('presence');
  const distance = gladys.externalIds('member', 'm-alice').feature('distance');
  assert.equal(gladys.fake.lastState(presence), 1);
  // No house, no distance: never a fake "0 km".
  assert.equal(gladys.fake.lastState(distance), undefined);
});

test('Test the connection lists the circles and members', async (t) => {
  const { gladys } = await setup();
  t.after(() => gladys.disconnect());

  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(
    ack.data.message.en,
    /Circles: Family\. 1 member\(s\), 1 with a position\. Home: Maison\./,
  );
  assert.match(ack.data.message.de, /Kreise: Family/);
  assert.match(ack.data.message.es, /Círculos: Family/);
});

test('Locate a member asks Life360 for that member', async (t) => {
  const { gladys, life } = await setup();
  t.after(() => gladys.disconnect());

  const ack = await gladys.fake.action('request_location', { member: deviceId(gladys) });
  assert.match(ack.data.message.en, /Position requested/);
  assert.deepEqual(life.requests, [{ circleId: 'c-family', memberId: 'm-alice' }]);

  const unknown = await gladys.fake.action('request_location', { member: 'ext:x:member:nobody' });
  assert.match(unknown.data.message.en, /no longer in the followed/);
});

test('scene actions return their declared outputs', async (t) => {
  const { gladys, life } = await setup();
  t.after(() => gladys.disconnect());

  const status = await gladys.fake.sceneAction('get_member_status', { member: deviceId(gladys) });
  assert.deepEqual(status.data.outputs, {
    found: true,
    at_home: true,
    place: 'Home',
    distance_km: 0,
    battery: 80,
    charging: false,
    driving: false,
    last_seen: '2026-01-01T00:00:00.000Z',
  });

  const missing = await gladys.fake.sceneAction('get_member_status', { member: 'ext:x:nobody' });
  assert.equal(missing.data.outputs.found, false);

  const requested = await gladys.fake.sceneAction('request_location_update', {
    member: deviceId(gladys),
  });
  assert.equal(requested.data.outputs.requested, true);
  assert.equal(life.requests.length, 1);
});

test('a configuration change reconnects with the new credentials', async (t) => {
  const { gladys, app, life } = await setup();
  t.after(() => gladys.disconnect());

  await gladys.fake.configUpdated({ access_token: 'Bearer new-token', refresh_interval: '120' });
  app.stop();
  assert.equal(life.config.access_token, 'new-token');
  assert.equal(life.config.refresh_interval, 120);
});
