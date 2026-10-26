// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object (form values may arrive as strings), so
// the rest of the code never deals with `undefined`.
// -----------------------------------------------------------------------------

export const AUTH_METHODS = { TOKEN: 'token', PASSWORD: 'password' };

// Bounds of the refresh interval, in seconds. Life360 rate-limits its API
// (429 with a Retry-After): below 15 s a circle of a few members already hits it.
export const MIN_REFRESH_SECONDS = 15;
export const MAX_REFRESH_SECONDS = 3600;

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  auth_method: AUTH_METHODS.TOKEN,
  access_token: '',
  username: '',
  password: '',
  // Comma-separated circle names to follow; empty follows every circle.
  circles: '',
  // Selector of the Gladys house used as "home"; empty takes the first
  // house that has coordinates.
  home_house: '',
  // Name of the Life360 place that means "home" (case-insensitive).
  home_place: 'Home',
  // Radius around the house coordinates counted as "home", in metres.
  home_radius: 150,
  refresh_interval: 60,
  battery_low_threshold: 20,
  debug_logs: false,
};

function toNumber(value, fallback, min, max) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const authMethod = Object.values(AUTH_METHODS).includes(raw.auth_method)
    ? raw.auth_method
    : DEFAULT_CONFIG.auth_method;
  return {
    ...DEFAULT_CONFIG,
    auth_method: authMethod,
    access_token: normalizeToken(raw.access_token),
    username: toText(raw.username),
    // A password is never trimmed: a trailing space may be part of it.
    password: typeof raw.password === 'string' ? raw.password : '',
    circles: toText(raw.circles),
    home_house: toText(raw.home_house),
    home_place: raw.home_place === undefined ? DEFAULT_CONFIG.home_place : toText(raw.home_place),
    home_radius: toNumber(raw.home_radius, DEFAULT_CONFIG.home_radius, 25, 5000),
    refresh_interval: toNumber(
      raw.refresh_interval,
      DEFAULT_CONFIG.refresh_interval,
      MIN_REFRESH_SECONDS,
      MAX_REFRESH_SECONDS,
    ),
    battery_low_threshold: toNumber(
      raw.battery_low_threshold,
      DEFAULT_CONFIG.battery_low_threshold,
      5,
      50,
    ),
    debug_logs: raw.debug_logs === true || raw.debug_logs === 'true',
  };
}

/**
 * The access token as Life360 expects it after `Bearer `. Users copy it from
 * the browser in many shapes: with the `Bearer ` prefix, with quotes, with
 * the whole `Authorization:` header line.
 */
export function normalizeToken(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .trim()
    .replace(/^authorization:\s*/i, '')
    .replace(/^bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

/** The circle names to follow, lowercased; an empty list follows them all. */
export function followedCircleNames(config) {
  return config.circles
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether the configuration holds what the chosen sign-in method needs. */
export function hasCredentials(config) {
  if (config.auth_method === AUTH_METHODS.PASSWORD) {
    return config.username !== '' && config.password !== '';
  }
  return config.access_token !== '';
}
