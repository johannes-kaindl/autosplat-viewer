# Security Policy

## Scope

`autosplat-viewer` is a **static, client-side-only Progressive Web App**.
There is no backend, no server-side rendering, no account system, no
telemetry, and no upload — every splat the viewer renders stays in the
user's browser.

The attack surface is therefore narrow:

- The static site served from Codeberg Pages
  (<https://jkaindl.codeberg.page/autosplat-viewer/>)
- The service worker (`service-worker.js`) that caches the app shell
- The runtime import of the PlayCanvas Engine from the jsDelivr CDN
  (`https://cdn.jsdelivr.net/npm/playcanvas@<pinned-version>/+esm`)
- Local parsing of user-supplied `.ply` / `.sog` files via the PlayCanvas
  GSplat loader

Notably **out of scope** as a deliverable: any hosted instance other than
the one at `jkaindl.codeberg.page`. Anyone is free to host the static
files themselves under the AGPL.

## Supported versions

Only the latest minor release receives fixes. The currently supported
line is `v1.1.x` (see [`CHANGELOG.md`](CHANGELOG.md)). Older releases
are kept as historical references.

## Reporting a vulnerability

**Please do not file a public issue for security-sensitive reports.**

Preferred channel:

- Email: **code.jkaindl@mailbox.org** (in-repo Git identity)
- Subject line: `[security] autosplat-viewer: <short description>`

If you don't get an acknowledgement within 7 days, please open a
placeholder Codeberg issue titled `Security report pending` (no details)
and mention you tried email — that flags it without disclosing the
vulnerability.

Please include:

- Affected version (visible in the live site's footer / `CHANGELOG.md`,
  or `package.json#version` in the repo)
- Browser + version + device class
- A minimal reproduction (URL, steps, an example `.ply` if relevant)
- Expected vs. observed behaviour
- Your suggested severity / impact assessment

## Disclosure

This is a solo-maintained, low-traffic project. Realistic timeline:

- **Acknowledgement:** within 7 days
- **Triage + fix or mitigation:** best-effort within 30 days for
  high-severity issues
- **Public disclosure:** after a fix is released and pushed to the
  `pages` branch, with credit to the reporter unless they request
  anonymity

## Out of scope

- Issues that require the user to install a malicious browser extension
  or a malicious PWA from a different origin
- Issues in the PlayCanvas Engine itself — please report those at
  <https://github.com/playcanvas/engine>
- Issues in jsDelivr's CDN delivery — please report those at
  <https://github.com/jsdelivr/jsdelivr>
- "User-supplied `.ply` could crash the browser tab" — by design, the
  user controls the splat they load; the page reload recovers. We will
  still treat reproducible browser-hangs as bugs in the loader path,
  just not as security issues.
- Dependency-chain CVEs that don't affect the viewer's actual code paths
  — please report those upstream first

Thanks for taking the time to report responsibly.
