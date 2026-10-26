# Life360 for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that brings the members
of your [Life360](https://www.life360.com) circles into Gladys: who is at home, where everyone
is, their phone battery and their distance from home — with scene triggers, scene actions and a
dashboard widget.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
on [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

- **Transport: cloud only** (`"transports": ["cloud"]`): Life360 is reached through its cloud
  API, there is no local channel.
- **Requires Gladys 5.3+** (catalog `keywords`; widgets and scenes need 5.1, the house select 5.2).
- **Languages**: English, French, German, Spanish (configuration screen, messages, widget and
  documentation).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md).

> Life360 has no official public API. The integration uses the endpoints of the Life360 mobile
> app (`api-cloudfront.life360.com`), the same ones the maintained Home Assistant integration
> relies on. Life360 may change them without notice.

## What it does

| Surface               | Content                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Devices               | One per member of the followed circles: at home, phone battery, phone charging, distance from home, speed, place.       |
| Scene triggers        | `arrived_home`, `left_home`, `place_arrived`, `place_left`, `driving_started`, `battery_low`.                           |
| Scene actions         | `request_location_update` (ask a phone for a fresh position), `get_member_status` (at home, place, distance, battery…). |
| Dashboard widget      | `life360_circle`: battery tiles, where everyone is, Refresh and Locate everyone buttons.                                |
| Configuration actions | `test_connection`, `request_location`.                                                                                  |
| Transport badge       | `cloud` per member, degraded when Life360 has no position (sharing off), `unreachable` when Life360 cannot be reached.  |

"At home" uses the coordinates of a Gladys house (manifest `"location": true`, configurable
radius) and/or the name of a Life360 place.

## Project structure

```
.
├─ index.js                          # SDK bootstrap only
├─ src/
│  ├─ app.js                         # handler registration (testable with the fake Gladys)
│  ├─ config.js                      # defaults (mirror the manifest) + normalization
│  ├─ i18n.js                        # the four languages, pick / localize
│  ├─ messages.js                    # connection status, action answers, badge tooltips
│  ├─ life360/
│  │  ├─ client.js                   # HTTPS client: token / password sign-in, errors, redaction
│  │  ├─ member.js                   # raw member -> numbers, merge across circles, home status
│  │  └─ service.js                  # refresh loop: devices, states, events, badges, status
│  ├─ devices/member.js              # the member device and its states
│  └─ capabilities/
│     ├─ scenes.js                   # scene triggers (transition detection) and actions
│     └─ widget.js                   # the "Life360 circle" dashboard widget
├─ docs/{en,fr,de,es}.md             # user documentation, re-hosted by Gladys
├─ test/                             # node --test, fake Gladys + in-memory Life360, no network
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, non-root, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, Release, image build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # node --test
npm run lint           # ESLint
npm run format:check   # Prettier (CI gate)
npm run format         # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a local Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="life360" \
DATA_DIR=./data LOG_LEVEL=debug npm start
```

## Workflows

The same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

| Workflow                                                     | When                                  | What                                                                                             |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`ci.yml`](.github/workflows/ci.yml)                         | push on `main`, pull requests         | Prettier, ESLint, tests on Node 22 and 24; on PRs: store checks and Docker build (amd64).        |
| [`release.yml`](.github/workflows/release.yml)               | Actions → Release → Run workflow      | Bumps the version (package + manifest + image tag), rolls the changelog, tags, builds, releases. |
| [`build.yml`](.github/workflows/build.yml)                   | `v*` tag, manual, called by Release   | Multi-arch image (`linux/amd64` + `linux/arm64`) to `ghcr.io/prohand/gladys-life360`.            |
| [`github-release.yml`](.github/workflows/github-release.yml) | push on `main`, manual, after Release | Creates the missing GitHub Releases, notes taken from `CHANGELOG.md`.                            |
| [`dependabot.yml`](.github/dependabot.yml)                   | weekly / monthly                      | npm (the SDK first), GitHub Actions and the Docker base image.                                   |

## Publishing

1. Add the GitHub topic `gladys-assistant-integration` to the repository, and turn on
   **Private vulnerability reporting** (see [SECURITY.md](SECURITY.md)).
2. Describe the changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
3. **Actions → Release → Run workflow**. The repository starts at `0.0.0`: pick **major** for the
   first release, so it ships as `1.0.0`.

## License

Apache-2.0
