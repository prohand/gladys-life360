# Security policy

## Supported versions

Only the latest release of the Life360 integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-life360](https://github.com/prohand/gladys-life360/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords, names and positions first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes, in
particular how it handles the Life360 credentials (access token, password, the token
kept in `/data/life360-token.json`) and the positions of the circle members.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), and
Life360 and its API (report to Life360).

## What the integration does with your data

- The access token and the password are stored by Gladys in the integration's
  secret fields. They are sent only to `api-cloudfront.life360.com`, over HTTPS, and
  never written to a log line.
- With the username and password method, the token Life360 returns is kept in
  `/data/life360-token.json` (file mode `0600`), so a restart does not sign in again.
  The file holds a hash of the username, never the username or the password.
- The positions of the members are published to Gladys only: places, distance from
  home, battery and speed. The exact coordinates are not stored in Gladys, except as
  the place text when Life360 gives neither a place name nor an address.
- The house coordinates (manifest `location: true`) are read from Gladys to compute
  the distance from home; they are never sent to Life360.

## Good practices for users

- Prefer the access token method: it never gives the integration your password.
- Use a dedicated Life360 account in your circle if you can, so the token gives access
  to that account only.
- Revoke the token by signing out of all sessions in the Life360 app if you think it
  leaked, then paste a new one.
- Keep Gladys and the integration up to date.
