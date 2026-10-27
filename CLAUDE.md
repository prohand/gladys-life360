# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors working in
this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Life360**: each member of the followed
circles becomes a Gladys device (at home, phone battery, charging, distance from home, speed,
place). Cloud only (`"transports": ["cloud"]`). Requires Gladys 5.3+. Scene triggers (arrived /
left home, arrived at / left a place, started driving, battery low), scene actions (locate a
member, read a member) and a "Life360 circle" widget. Started from the official JavaScript
template; workflows copied from prohand/gladys-devmel.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/app.test.js                # one file
node --test --test-name-pattern "home"      # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, plus the store checks and a Docker
build on pull requests: run the three commands before pushing. Releases: **Actions → Release**
only (bumps `package.json`, manifest `version` + `docker_image`, rolls the changelog, re-runs
Prettier, tags, builds, publishes the GitHub Release).

## Architecture

```
index.js                  SDK bootstrap only (connect, shutdown, unhandled rejections)
src/app.js                every handler registration; tests run it on createFakeGladys()
src/config.js             DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js               LANGUAGES = en, fr, de, es; pick / localize
src/messages.js           connection status, action answers, badge tooltips (4 languages)
src/life360/client.js     HTTPS client (fetch): token or password sign-in, errors, redaction
src/life360/member.js     raw member -> numbers/booleans, merge across circles, home status
src/life360/service.js    refresh loop: devices, changed states, scene events, badges, status
src/devices/member.js     the member device (features) and its states
src/capabilities/         scenes.js (triggers + actions), widget.js (dashboard widget)
docs/{en,fr,de,es}.md     user documentation, re-hosted by Gladys (mandatory)
test/helpers/             fakeLife360.js (in-memory Life360), quiet.js (silences logs)
```

### Invariants worth knowing

- **External ids are forever.** A member device is `gladys.externalIds('member', <Life360
member id>)`, never the name. Feature keys (`presence`, `battery`, `charging`, `distance`,
  `speed`, `place`), config keys, action, scene trigger, scene action and widget keys are stored
  by users: never rename one.
- **One refresh reads everything**: the circle list, then one request per followed circle. The
  devices carry no `poll_frequency`; the service's own timer chain drives the refresh (never an
  interval, so a slow answer never stacks two). A 429 stretches the next delay to `Retry-After`; a 401/403 or a Cloudflare block (HTML 403, kind
  `blocked`) to 15 minutes (a configuration change retries at once).
- **States go through `publishChangedStates`** with a 30-minute heartbeat (300 states/minute host
  limit). An unknown value (no position, battery -1, no located house) is left out, never
  published as 0.
- **Scene events compare two reads**: the first read after a start only sets the reference, so a
  restart never fires "arrived home" for everyone. One event per transition.
- **A member in several circles is one device**: the newest position wins, a place named in any
  circle is kept (`mergeMembers`).
- **"At home"** = within `home_radius` (+ the fix accuracy, capped at the radius) of the Gladys
  house (`getHouses()`, manifest `location: true`), OR the Life360 place equals `home_place`.
- **Secrets**: the access token and password never reach a log line (`redact` in client.js). The
  password-based token is kept in `/data/life360-token.json` (mode 0600, keyed by a hash of the
  username), the only writable path. `DATA_DIR` overrides `/data` for local runs.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features included (0/0).
- **Widget budget**: ≤ 8 components (3 battery tiles + status + caption + 2 buttons); checked
  with the SDK's `validateWidgetContent` in `test/capabilities.test.js`.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with the code: version
= `package.json` = `docker_image` tag, `transports` = `["cloud"]`, `gladys_version >=5.3.0`,
every text in the four languages, store field rules, defaults = `DEFAULT_CONFIG`, every action /
scene trigger / scene action (with its exact outputs) / widget handled, docs in four languages
naming every scene key. Change both sides together.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version
  heading: the Release workflow moves the section.
- **User-facing text** is `{ en, fr, de, es }`: manifest texts, messages, widget, and the four
  `docs/*.md`, kept in sync.
- **Tests never touch the network**: Life360 is `test/helpers/fakeLife360.js` or a replaced
  `fetch`, Gladys is `createFakeGladys()`.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
