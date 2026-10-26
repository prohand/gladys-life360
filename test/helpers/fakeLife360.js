// -----------------------------------------------------------------------------
// An in-memory Life360, standing in for Life360Client in the tests: no
// network, the circles and members are plain objects the test edits between
// two refreshes, as if people moved.
// -----------------------------------------------------------------------------

/** A raw member as GET /v3/circles/:id/members returns it (strings included). */
export function rawMember({
  id = 'm-alice',
  firstName = 'Alice',
  lastName = 'Martin',
  latitude = 48.8566,
  longitude = 2.3522,
  place = 'Home',
  address1 = '1 rue de Rivoli',
  address2 = 'Paris',
  battery = '80',
  charge = '0',
  isDriving = '0',
  speed = '0',
  accuracy = '50',
  timestamp = '1767225600',
  shareLocation = '1',
  location = true,
  issues,
} = {}) {
  return {
    id,
    firstName,
    lastName,
    features: { shareLocation },
    issues: issues ?? {},
    location: location
      ? {
          latitude: String(latitude),
          longitude: String(longitude),
          accuracy,
          name: place,
          address1,
          address2,
          battery,
          charge,
          wifiState: '1',
          isDriving,
          speed,
          since: timestamp,
          timestamp,
        }
      : null,
  };
}

export function createFakeLife360({
  circles = [{ id: 'c-family', name: 'Family' }],
  members,
} = {}) {
  const fake = {
    circles,
    // circle id -> raw members
    members: members ?? { 'c-family': [rawMember()] },
    requests: [],
    calls: 0,
    // Set to a Life360Error-like object to make the next calls fail.
    error: null,
    config: null,
    async getCircles() {
      fake.calls += 1;
      if (fake.error) throw fake.error;
      return fake.circles;
    },
    async getCircleMembers(circleId) {
      if (fake.error) throw fake.error;
      return structuredClone(fake.members[circleId] ?? []);
    },
    async requestLocationUpdate(circleId, memberId) {
      fake.requests.push({ circleId, memberId });
      return { requestId: 'r-1' };
    },
  };
  return fake;
}
