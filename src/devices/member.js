// -----------------------------------------------------------------------------
// Device type: LIFE360 MEMBER
//
// One Gladys device per person of the followed circles. The device is keyed
// on the Life360 member id, never on the name: a renamed member keeps their
// device, history and scenes. A member seen in two circles is one device.
//
// Features (their keys are forever, see CLAUDE.md):
//   - presence  at home (1) or away (0), presence-sensor binary
//   - battery   phone battery, %
//   - charging  phone charging (1) or not (0)
//   - distance  distance to the Gladys house, km
//   - speed     km/h, 0 when still
//   - place     Life360 place name, else the street address (text)
//
// No `poll_frequency`: one Life360 request per circle refreshes every member
// at once, so the refresh loop (src/life360/service.js) drives the states
// instead of a Gladys poll per device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { placeLabel } from '../life360/member.js';

export const DEVICE_TYPE = 'member';

export const FEATURE = {
  PRESENCE: 'presence',
  BATTERY: 'battery',
  CHARGING: 'charging',
  DISTANCE: 'distance',
  SPEED: 'speed',
  PLACE: 'place',
};

// Gladys stores a text state as a string: keep it short enough for a card.
const MAX_TEXT_LENGTH = 200;

export function memberIds(gladys, memberId) {
  return gladys.externalIds(DEVICE_TYPE, memberId);
}

/**
 * The discovery payload of one member.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ id: string, name: string }} member
 */
export function buildMemberDevice(gladys, member) {
  const ids = memberIds(gladys, member.id);
  return {
    name: `${member.name} (Life360)`,
    external_id: ids.device,
    features: [
      {
        name: 'At home',
        external_id: ids.feature(FEATURE.PRESENCE),
        category: DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
      {
        name: 'Phone battery',
        external_id: ids.feature(FEATURE.BATTERY),
        category: DEVICE_FEATURE_CATEGORIES.BATTERY,
        type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 100,
      },
      {
        name: 'Phone charging',
        external_id: ids.feature(FEATURE.CHARGING),
        category: DEVICE_FEATURE_CATEGORIES.BATTERY,
        type: DEVICE_FEATURE_TYPES.BATTERY.CHARGING,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
      {
        name: 'Distance from home',
        external_id: ids.feature(FEATURE.DISTANCE),
        category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.KM,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 20000,
      },
      {
        name: 'Speed',
        external_id: ids.feature(FEATURE.SPEED),
        category: DEVICE_FEATURE_CATEGORIES.SPEED_SENSOR,
        type: DEVICE_FEATURE_TYPES.SPEED_SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.KILOMETER_PER_HOUR,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 400,
      },
      {
        name: 'Place',
        external_id: ids.feature(FEATURE.PLACE),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        keep_history: false,
        min: 0,
        max: 0,
      },
    ],
  };
}

/**
 * The states of one member, in the `publishStates` format. A value Life360
 * does not know (no location, battery -1, no Gladys house) is left out rather
 * than published as 0: "0 km from home" would be a lie.
 *
 * @param {object} gladys
 * @param {import('../life360/member.js').Member} member
 * @param {{ atHome: boolean|null, distanceKm: number|null }} status from homeStatus()
 */
export function memberStates(gladys, member, status) {
  const ids = memberIds(gladys, member.id);
  const location = member.location;
  if (!location) {
    return [];
  }
  const states = [];
  const push = (feature, state) => {
    if (state !== null && state !== undefined) {
      states.push({ device_feature_external_id: ids.feature(feature), state });
    }
  };
  push(FEATURE.PRESENCE, status.atHome === null ? null : status.atHome ? 1 : 0);
  push(FEATURE.BATTERY, location.battery);
  push(FEATURE.CHARGING, location.charging ? 1 : 0);
  push(FEATURE.DISTANCE, status.distanceKm);
  push(FEATURE.SPEED, location.speed);
  const label = placeLabel(member).slice(0, MAX_TEXT_LENGTH);
  if (label) {
    states.push({ device_feature_external_id: ids.feature(FEATURE.PLACE), text: label });
  }
  return states;
}
