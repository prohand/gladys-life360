// -----------------------------------------------------------------------------
// The Life360 refresh loop and everything Gladys sees of it.
//
// One refresh = one request per followed circle (plus the circle list), every
// member of every circle read at once. From that read the service:
//   1. publishes the member devices when the set of members changed;
//   2. publishes the states that changed (publishChangedStates);
//   3. fires the scene triggers of what changed since the previous read;
//   4. publishes the transport badges (cloud / unreachable / degraded);
//   5. reports the connection status shown in the Configuration screen.
//
// The loop is a chain of timers, never an interval: a slow Life360 answer
// never stacks two refreshes, a 429 stretches the next delay to what Life360
// asked for (Retry-After), and refused credentials to 15 minutes.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { followedCircleNames, hasCredentials } from '../config.js';
import { Life360Client, Life360Error } from './client.js';
import { homeStatus, mergeMembers, parseMember } from './member.js';
import { buildMemberDevice, memberIds, memberStates } from '../devices/member.js';
import { detectSceneEvents } from '../capabilities/scenes.js';
import { MESSAGES, connectionReport, errorMessage } from '../messages.js';

const logger = createLogger({ name: 'life360' });

// An unchanged value is re-sent this often, so it stays recently dated in
// Gladys (a phone left at home all week is still "at home today").
const HEARTBEAT_MS = 30 * 60 * 1000;
// Refused credentials or a Cloudflare block never clear by themselves within a
// minute: retrying that often only keeps the block going (and repeated
// sign-ins get an account blocked). A configuration change retries at once.
const REFUSED_DELAY_MS = 15 * 60 * 1000;
const REFUSED_KINDS = new Set(['unauthorized', 'forbidden', 'blocked']);
// After a location request the phone answers within seconds: read it then.
const REFRESH_AFTER_REQUEST_MS = 15_000;
const TRANSPORT_BATCH = 100;

export class Life360Service {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {{ createClient?: (config: object) => Life360Client, onChange?: () => void }} [options]
   *   `createClient` is injected by the tests; `onChange` is called after every
   *   refresh that changed something the widget shows.
   */
  constructor(gladys, { createClient = (config) => new Life360Client(config), onChange } = {}) {
    this.gladys = gladys;
    this.createClient = createClient;
    this.onChange = onChange ?? (() => {});
    this.config = null;
    this.client = null;
    this.home = null;
    this.circles = [];
    // member id -> { member, status }
    this.entries = new Map();
    this.publishedDeviceSignature = null;
    this.lastRefreshAt = null;
    this.lastError = null;
    this.connectionSignature = null;
    this.timer = null;
    this.running = false;
    this.refreshing = null;
  }

  /** (Re)apply a configuration: new credentials, new home, new circles. */
  async configure(config) {
    const credentialsChanged =
      !this.config ||
      this.config.auth_method !== config.auth_method ||
      this.config.access_token !== config.access_token ||
      this.config.username !== config.username ||
      this.config.password !== config.password;
    this.config = config;
    if (credentialsChanged || !this.client) {
      this.client = this.createClient(config);
    } else {
      this.client.config = config;
    }
    this.home = await this.resolveHome();
  }

  /**
   * The Gladys house used as home: the one picked in the configuration, else
   * the first house that has coordinates. Needs `location: true` in the
   * manifest; without coordinates, only the Life360 place name says "home".
   */
  async resolveHome() {
    let houses;
    try {
      houses = await this.gladys.getHouses();
    } catch (err) {
      logger.warn(`Could not read the Gladys houses: ${err.message}`);
      return null;
    }
    const located = houses.filter((house) => house.latitude !== null && house.longitude !== null);
    const chosen =
      located.find((house) => house.selector === this.config.home_house) ?? located[0] ?? null;
    if (!chosen) {
      logger.info('No Gladys house has coordinates: "at home" relies on the Life360 place name');
      return null;
    }
    return {
      name: chosen.name,
      selector: chosen.selector,
      latitude: Number(chosen.latitude),
      longitude: Number(chosen.longitude),
    };
  }

  start() {
    this.stop();
    this.running = true;
    this.schedule(0);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delayMs) {
    clearTimeout(this.timer);
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      const next = await this.refresh().catch((err) => {
        logger.error('Refresh failed', err);
        return this.config.refresh_interval * 1000;
      });
      this.schedule(next);
    }, delayMs);
    this.timer.unref?.();
  }

  /**
   * One refresh. Concurrent calls (the loop, a widget button, a scene) share
   * the refresh already running instead of doubling the Life360 requests.
   *
   * @returns {Promise<number>} the delay before the next one, in ms
   */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    const interval = this.config.refresh_interval * 1000;
    if (!hasCredentials(this.config)) {
      await this.reportConnection(false, MESSAGES.notConfigured);
      return interval;
    }
    let members;
    try {
      members = await this.readMembers();
    } catch (err) {
      this.lastError = err;
      logger.error(`Life360 refresh failed: ${err.message}`);
      await this.reportConnection(false, errorMessage(err, this.config));
      await this.publishTransports();
      this.onChange();
      if (err instanceof Life360Error && err.kind === 'rate_limited') {
        return Math.max(interval * 2, (err.retryAfter ?? 0) * 1000);
      }
      if (err instanceof Life360Error && REFUSED_KINDS.has(err.kind)) {
        return Math.max(interval, REFUSED_DELAY_MS);
      }
      return interval;
    }
    this.lastError = null;
    this.lastRefreshAt = new Date().toISOString();
    await this.apply(members);
    await this.reportConnection(
      this.circles.length > 0,
      this.circles.length > 0 ? undefined : MESSAGES.noCircle,
    );
    return interval;
  }

  /** Read every member of the followed circles, merged by member id. */
  async readMembers() {
    const wanted = followedCircleNames(this.config);
    const circles = await this.client.getCircles();
    this.circles = wanted.length
      ? circles.filter((circle) => wanted.includes(circle.name.trim().toLowerCase()))
      : circles;
    const members = [];
    for (const circle of this.circles) {
      for (const raw of await this.client.getCircleMembers(circle.id)) {
        members.push(parseMember(raw, circle.id));
      }
    }
    return mergeMembers(members);
  }

  async apply(members) {
    const previous = this.entries;
    this.entries = new Map(
      members.map((member) => [
        member.id,
        { member, status: homeStatus(member, this.home, this.config) },
      ]),
    );

    await this.publishDevicesIfChanged();

    const states = [...this.entries.values()].flatMap(({ member, status }) =>
      memberStates(this.gladys, member, status),
    );
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }

    for (const [id, entry] of this.entries) {
      const deviceId = memberIds(this.gladys, id).device;
      for (const [key, data] of detectSceneEvents(
        previous.get(id) ?? null,
        entry,
        deviceId,
        this.config,
      )) {
        logger.info(`Scene event ${key} <- ${entry.member.name}`);
        // One event failing (429) must not stop the others nor the refresh.
        await this.gladys
          .publishSceneEvent(key, data)
          .catch((err) => logger.error(`publishSceneEvent ${key} failed: ${err.message}`));
      }
    }

    await this.publishTransports();
    this.onChange();
  }

  buildDevices() {
    return [...this.entries.values()].map(({ member }) => buildMemberDevice(this.gladys, member));
  }

  async publishDevicesIfChanged() {
    const devices = this.buildDevices();
    const signature = JSON.stringify(devices.map((device) => [device.external_id, device.name]));
    if (signature === this.publishedDeviceSignature) return;
    await this.gladys.publishDiscoveredDevices(devices);
    this.publishedDeviceSignature = signature;
  }

  /**
   * Answer a Discovery scan: read Life360 again (a member who just joined
   * the circle shows up at once), then publish the full list, changed or not.
   */
  async publishDevices() {
    await this.refresh();
    this.publishedDeviceSignature = null;
    await this.publishDevicesIfChanged();
  }

  /**
   * The badge of every member device. `cloud` when Life360 answered; flagged
   * degraded when it answered without a position (sharing turned off, phone
   * silent), with Life360's own reason when it gives one; `unreachable` when
   * the last refresh failed.
   */
  transportEntries() {
    return [...this.entries.values()].map(({ member }) => {
      const external_id = memberIds(this.gladys, member.id).device;
      if (this.lastError) {
        return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
      }
      if (member.location) {
        return { external_id, transport: DEVICE_TRANSPORTS.CLOUD };
      }
      const message = member.sharing ? MESSAGES.noLocation : MESSAGES.notSharing;
      return {
        external_id,
        transport: DEVICE_TRANSPORTS.CLOUD,
        degraded: true,
        message: member.issue
          ? Object.fromEntries(
              Object.entries(message).map(([language, text]) => [
                language,
                `${text} (${member.issue})`.slice(0, 200),
              ]),
            )
          : message,
      };
    });
  }

  async publishTransports() {
    const entries = this.transportEntries();
    for (let i = 0; i < entries.length; i += TRANSPORT_BATCH) {
      await this.gladys
        .publishTransports(entries.slice(i, i + TRANSPORT_BATCH))
        .catch((err) => logger.warn(`publishTransports failed: ${err.message}`));
    }
  }

  /** Report the connection status, only when it changed. */
  async reportConnection(connected, message) {
    const signature = JSON.stringify([connected, message ?? null]);
    if (signature === this.connectionSignature) return;
    this.connectionSignature = signature;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  /** Forget the last reported status: the next refresh reports it again. */
  resetConnectionStatus() {
    this.connectionSignature = null;
  }

  /** The `{ member, status }` of a Gladys device external_id, or undefined. */
  findByDevice(deviceExternalId) {
    return [...this.entries.values()].find(
      ({ member }) => memberIds(this.gladys, member.id).device === deviceExternalId,
    );
  }

  /**
   * Ask a member's phone for a fresh position, then read it once it had the
   * time to answer.
   *
   * @returns {Promise<boolean>} false when the member is unknown
   */
  async requestLocationUpdate(deviceExternalId) {
    const entry = this.findByDevice(deviceExternalId);
    if (!entry) return false;
    await this.client.requestLocationUpdate(entry.member.circleId, entry.member.id);
    if (this.running) this.schedule(REFRESH_AFTER_REQUEST_MS);
    return true;
  }

  /** Ask every followed member for a fresh position. */
  async requestAllLocationUpdates() {
    let count = 0;
    for (const { member } of this.entries.values()) {
      await this.client.requestLocationUpdate(member.circleId, member.id);
      count += 1;
    }
    if (count > 0 && this.running) this.schedule(REFRESH_AFTER_REQUEST_MS);
    return count;
  }

  /** The "Test the connection" action: one fresh read, said in words. */
  async testConnection() {
    if (!hasCredentials(this.config)) {
      return MESSAGES.notConfigured;
    }
    try {
      const members = await this.readMembers();
      await this.apply(members);
      this.lastError = null;
      this.lastRefreshAt = new Date().toISOString();
      if (this.circles.length === 0) {
        return MESSAGES.noCircle;
      }
      await this.reportConnection(true);
      return connectionReport({ circles: this.circles, members, home: this.home });
    } catch (err) {
      logger.error(`Test the connection failed: ${err.message}`);
      return errorMessage(err, this.config);
    }
  }
}
