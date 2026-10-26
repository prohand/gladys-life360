// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// Triggers say "this happened": a member arrived home, left a place, started
// driving, their phone battery ran low. They are computed by comparing two
// successive reads of the same member (`detectSceneEvents`), so a restart of
// the integration never fires "arrived home" for everyone: the first read
// after a start only sets the reference.
//
// Actions are operations a scene author places in a scene: ask a member's
// phone for a fresh position, read where a member is. The handlers receive the
// RESOLVED fields (the member is the device external_id chosen in a
// `"source": "devices"` select) and return the declared scalar outputs.
//
// Keys are stored by the users' scenes: never rename one (CLAUDE.md).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { placeLabel } from '../life360/member.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  ARRIVED_HOME: 'arrived_home',
  LEFT_HOME: 'left_home',
  PLACE_ARRIVED: 'place_arrived',
  PLACE_LEFT: 'place_left',
  DRIVING_STARTED: 'driving_started',
  BATTERY_LOW: 'battery_low',
};

/**
 * The scene events between two reads of one member.
 *
 * @param {object|null} before previous `{ member, status }`, null on the first read
 * @param {{ member: object, status: object }} after current read
 * @param {string} deviceExternalId the member's Gladys device
 * @param {object} config normalized configuration
 * @returns {Array<[string, object]>} `[triggerKey, data]` pairs, in firing order
 */
export function detectSceneEvents(before, after, deviceExternalId, config) {
  const was = before?.member?.location;
  const now = after.member.location;
  // No reference, or no position on either side: nothing can be said to
  // have changed (a phone going silent is not "left home").
  if (!was || !now) {
    return [];
  }
  const common = {
    member: deviceExternalId,
    member_name: after.member.name,
    place: placeLabel(after.member),
    address: now.address ?? '',
    battery: now.battery,
    distance_km: after.status.distanceKm,
  };
  const events = [];

  if (before.status.atHome === true && after.status.atHome === false) {
    events.push([SCENE_TRIGGERS.LEFT_HOME, common]);
  }
  if (was.place && was.place !== now.place) {
    events.push([SCENE_TRIGGERS.PLACE_LEFT, { ...common, place: was.place }]);
  }
  if (before.status.atHome === false && after.status.atHome === true) {
    events.push([SCENE_TRIGGERS.ARRIVED_HOME, common]);
  }
  if (now.place && now.place !== was.place) {
    events.push([SCENE_TRIGGERS.PLACE_ARRIVED, { ...common, place: now.place }]);
  }
  if (!was.driving && now.driving) {
    events.push([SCENE_TRIGGERS.DRIVING_STARTED, common]);
  }
  const threshold = config.battery_low_threshold;
  if (
    was.battery !== null &&
    now.battery !== null &&
    was.battery > threshold &&
    now.battery <= threshold &&
    !now.charging
  ) {
    events.push([SCENE_TRIGGERS.BATTERY_LOW, common]);
  }
  return events;
}

/**
 * Handlers of the manifest `scene_actions`, keyed by their `key`; index.js
 * registers each one with `gladys.onSceneAction(key, ...)`.
 *
 * Throwing fails this action only and the scene goes on: a member the
 * integration does not know (deleted from the circle) is reported as an
 * output, never thrown, so the scene author can gate on it.
 */
export const SCENE_ACTIONS = {
  async request_location_update(service, { fields }) {
    logger.info(`Scene action request_location_update <- ${fields.member}`);
    const requested = await service.requestLocationUpdate(fields.member);
    return { requested };
  },

  async get_member_status(service, { fields }) {
    logger.info(`Scene action get_member_status <- ${fields.member}`);
    const entry = service.findByDevice(fields.member);
    const location = entry?.member.location;
    if (!location) {
      return {
        found: false,
        at_home: false,
        place: '',
        distance_km: -1,
        battery: -1,
        charging: false,
        driving: false,
        last_seen: '',
      };
    }
    return {
      found: true,
      at_home: entry.status.atHome === true,
      place: placeLabel(entry.member),
      // -1 is the documented "unknown" (no Gladys house located).
      distance_km: entry.status.distanceKm ?? -1,
      battery: location.battery ?? -1,
      charging: location.charging,
      driving: location.driving,
      last_seen: location.timestamp ?? '',
    };
  },
};
