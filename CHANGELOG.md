# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [0.0.3] - 2026-10-27

### Fixed

- Life360 calls no longer get "HTTP 403: blocked by Cloudflare" on some internet connections: the
  integration now connects the way the Home Assistant Life360 integration does (the Node.js
  `fetch` handshake, which offers only HTTP/1.1, was the one Cloudflare blocked).

## [0.0.2] - 2026-10-27

### Fixed

- An HTTP 403 from Life360 no longer says the token expired: a token Life360 does not accept and a
  Cloudflare block of the Gladys internet address now each have their own message, and the log
  gives the Cloudflare Ray ID.
- After a refused token or a Cloudflare block, the integration waits 15 minutes before the next
  try instead of retrying every minute (saving the configuration still retries at once).

## [0.0.1] - 2026-10-26

### Added

- First version of the Life360 integration, built from the official Gladys JavaScript template.
- One Gladys device per member of the followed Life360 circles: at home, phone battery, phone
  charging, distance from home, speed and current place.
- Sign-in with the access token copied from life360.com (recommended), or with the username and
  password (the token is then kept in `/data`).
- "At home" from the coordinates of a Gladys house (configurable radius) and/or the name of a
  Life360 place.
- Scene triggers: member arrived home, left home, arrived at a place, left a place, started
  driving, phone battery low.
- Scene actions: locate a Life360 member (fresh position), read a Life360 member (at home,
  place, distance, battery, charging, driving).
- "Life360 circle" dashboard widget: where everyone is, battery tiles, Refresh and Locate
  everyone buttons.
- Configuration screen actions: Test the connection, Locate a member now.
- Cloud transport badge per member, degraded when a member stopped sharing their location.
- English, French, German and Spanish translations (configuration screen, messages, widget,
  documentation).
- `SECURITY.md`, `CLAUDE.md`, CI, Release, image build and GitHub release workflows.

[Unreleased]: https://github.com/prohand/gladys-life360/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/prohand/gladys-life360/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/prohand/gladys-life360/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/prohand/gladys-life360/releases/tag/v0.0.1
