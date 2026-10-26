import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceMeters,
  homeStatus,
  mergeMembers,
  parseMember,
  placeLabel,
} from '../src/life360/member.js';
import { normalizeConfig } from '../src/config.js';
import { rawMember } from './helpers/fakeLife360.js';

const HOME = { latitude: 48.8566, longitude: 2.3522 };

test('parses the strings Life360 sends into numbers and booleans', () => {
  const member = parseMember(
    rawMember({ battery: '87.6', charge: '1', isDriving: '1', speed: '20', accuracy: '100' }),
    'c1',
  );
  assert.equal(member.id, 'm-alice');
  assert.equal(member.name, 'Alice Martin');
  assert.equal(member.circleId, 'c1');
  assert.equal(member.location.battery, 88);
  assert.equal(member.location.charging, true);
  assert.equal(member.location.driving, true);
  assert.equal(member.location.speed, 72.4);
  assert.equal(member.location.accuracy, 30);
  assert.equal(member.location.address, '1 rue de Rivoli, Paris');
  assert.equal(member.location.timestamp, '2026-01-01T00:00:00.000Z');
});

test('unknown values stay unknown: battery -1, negative speed', () => {
  const { location } = parseMember(rawMember({ battery: '-1', speed: '-1' }), 'c1');
  assert.equal(location.battery, null);
  assert.equal(location.speed, 0);
});

test('a member who stopped sharing has no location and says why', () => {
  const member = parseMember(
    rawMember({
      shareLocation: '0',
      location: false,
      issues: { title: 'Location paused', dialog: 'Turned off by the user' },
    }),
    'c1',
  );
  assert.equal(member.sharing, false);
  assert.equal(member.location, null);
  assert.equal(member.issue, 'Location paused: Turned off by the user');
});

test('a member without a name still gets one', () => {
  assert.equal(
    parseMember(rawMember({ firstName: '', lastName: null }), 'c1').name,
    'Life360 member',
  );
});

test('merging keeps the newest position and a place known in any circle', () => {
  const older = parseMember(rawMember({ timestamp: '100', place: 'School' }), 'c1');
  const newer = parseMember(rawMember({ timestamp: '200', place: null }), 'c2');
  const [merged] = mergeMembers([older, newer]);
  assert.equal(merged.circleId, 'c2');
  assert.equal(merged.location.place, 'School');
});

test('distance is about right', () => {
  // Paris -> Lyon, about 392 km.
  const km = distanceMeters(HOME, { latitude: 45.764, longitude: 4.8357 }) / 1000;
  assert.ok(km > 385 && km < 400, `${km}`);
});

test('at home by radius, by place name, or away', () => {
  const config = normalizeConfig({ home_radius: 150, home_place: 'Maison' });
  const near = parseMember(rawMember({ latitude: 48.8575, place: null }), 'c1');
  assert.equal(homeStatus(near, HOME, config).atHome, true);

  const far = parseMember(rawMember({ latitude: 48.87, place: 'maison' }), 'c1');
  const status = homeStatus(far, HOME, config);
  assert.equal(status.atHome, true, 'the place name is case-insensitive');
  assert.ok(status.distanceKm > 1);

  const away = parseMember(rawMember({ latitude: 48.87, place: 'Work' }), 'c1');
  assert.equal(homeStatus(away, HOME, config).atHome, false);
  assert.deepEqual(homeStatus(parseMember(rawMember({ location: false }), 'c1'), HOME, config), {
    atHome: null,
    distanceKm: null,
  });
});

test('the place label falls back to the address, then the coordinates', () => {
  assert.equal(placeLabel(parseMember(rawMember({ place: 'Work' }), 'c1')), 'Work');
  assert.equal(placeLabel(parseMember(rawMember({ place: '' }), 'c1')), '1 rue de Rivoli, Paris');
  assert.equal(
    placeLabel(parseMember(rawMember({ place: null, address1: '', address2: '' }), 'c1')),
    '48.8566, 2.3522',
  );
});
