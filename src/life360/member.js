// -----------------------------------------------------------------------------
// Turn a raw Life360 member into the values Gladys publishes.
//
// Life360 sends almost every value as a string ("1", "87.0", "1735689600"),
// some in imperial units, and a battery of -1 when it does not know. Everything
// is converted here, once, so the devices, scenes and widget read plain
// numbers and booleans.
// -----------------------------------------------------------------------------

// Life360 speed unit to km/h. The app reports a unit that becomes mph once
// multiplied by 2.25 (same factor as the Home Assistant integration).
const SPEED_TO_KMH = 2.25 * 1.609344;
const FEET_TO_METERS = 0.3048;

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toFlag(value) {
  return toNumber(value) === 1 || value === true;
}

function toDate(seconds) {
  const number = toNumber(seconds);
  return number && number > 0 ? new Date(number * 1000).toISOString() : null;
}

function memberName(raw) {
  const name = [raw.firstName, raw.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');
  return name || 'Life360 member';
}

/**
 * @typedef {object} Member
 * @property {string} id               Life360 member id (stable, the device platform id)
 * @property {string} name             first and last name
 * @property {string} circleId         a circle where this member is seen (for location requests)
 * @property {boolean} sharing         false when the member stopped sharing their location
 * @property {string|null} issue       why there is no location, when Life360 says
 * @property {object|null} location    null when there is no location
 */

/**
 * @param {object} raw a member from GET /v3/circles/:id/members
 * @param {string} circleId the circle it was read from
 * @returns {Member}
 */
export function parseMember(raw, circleId) {
  const sharing = toNumber(raw?.features?.shareLocation) !== 0;
  const member = {
    id: String(raw.id),
    name: memberName(raw),
    circleId,
    sharing,
    issue: null,
    location: null,
  };
  const loc = raw.location;
  const latitude = toNumber(loc?.latitude);
  const longitude = toNumber(loc?.longitude);
  if (!sharing || !loc || latitude === null || longitude === null) {
    const title = raw?.issues?.title;
    const dialog = raw?.issues?.dialog;
    member.issue = title ? (dialog ? `${title}: ${dialog}` : title) : null;
    return member;
  }

  const battery = toNumber(loc.battery);
  const speed = toNumber(loc.speed);
  const accuracy = toNumber(loc.accuracy);
  const address = [loc.address1, loc.address2]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ');
  member.location = {
    latitude,
    longitude,
    accuracy: accuracy === null ? null : Math.round(accuracy * FEET_TO_METERS),
    // -1 means "unknown", never "empty".
    battery: battery === null || battery < 0 ? null : Math.round(Math.min(100, battery)),
    charging: toFlag(loc.charge),
    wifi: toFlag(loc.wifiState),
    driving: toFlag(loc.isDriving),
    // A negative speed is Life360's "unknown".
    speed: speed === null || speed < 0 ? 0 : Math.round(speed * SPEED_TO_KMH * 10) / 10,
    place: typeof loc.name === 'string' && loc.name.trim() ? loc.name.trim() : null,
    address: address || null,
    since: toDate(loc.since),
    timestamp: toDate(loc.timestamp),
  };
  return member;
}

/**
 * Merge the members read from several circles: one person in two circles is
 * one Gladys device. The most recent position wins, and a place named in any
 * circle is kept (places are per circle in Life360).
 *
 * @param {Member[]} members
 * @returns {Member[]} one entry per member id, in first-seen order
 */
export function mergeMembers(members) {
  const byId = new Map();
  for (const member of members) {
    const known = byId.get(member.id);
    if (!known) {
      byId.set(member.id, member);
      continue;
    }
    if (!known.location) {
      byId.set(member.id, member);
      continue;
    }
    if (!member.location) continue;
    const newer = (member.location.timestamp ?? '') > (known.location.timestamp ?? '');
    const kept = newer ? member : known;
    const other = newer ? known : member;
    byId.set(member.id, {
      ...kept,
      location: { ...kept.location, place: kept.location.place ?? other.location.place },
    });
  }
  return [...byId.values()];
}

/** Great-circle distance between two points, in metres (haversine). */
export function distanceMeters(a, b) {
  const R = 6_371_000;
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Where the member is, relative to home.
 *
 * At home when the Life360 place matches the configured home place name, or
 * when the position is within the radius of the Gladys house (the accuracy of
 * the fix is given the benefit of the doubt, up to the radius itself: a phone
 * indoors often reports a 100 m wide fix).
 *
 * @param {Member} member
 * @param {{ latitude: number, longitude: number } | null} home Gladys house coordinates
 * @param {object} config normalized configuration
 * @returns {{ atHome: boolean|null, distanceKm: number|null }} null when unknown
 */
export function homeStatus(member, home, config) {
  const location = member.location;
  if (!location) {
    return { atHome: null, distanceKm: null };
  }
  const distance = home ? distanceMeters(location, home) : null;
  const placeIsHome =
    config.home_place !== '' &&
    location.place !== null &&
    location.place.toLowerCase() === config.home_place.toLowerCase();
  const slack = Math.min(location.accuracy ?? 0, config.home_radius);
  const withinRadius = distance !== null && distance <= config.home_radius + slack;
  return {
    atHome: placeIsHome || withinRadius,
    distanceKm: distance === null ? null : Math.round(distance / 10) / 100,
  };
}

/** Where the member is, in words: the place, else the address, else the coordinates. */
export function placeLabel(member) {
  const location = member.location;
  if (!location) return '';
  return (
    location.place ??
    location.address ??
    `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
  );
}
