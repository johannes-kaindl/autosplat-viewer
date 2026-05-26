# autosplat-viewer

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Live](https://img.shields.io/badge/live-jkaindl.codeberg.page-green)](https://jkaindl.codeberg.page/autosplat-viewer/)

Static viewer PWA for 3D Gaussian Splats — a showcase for the
[autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat)
pipeline and a general-purpose splat viewer.

**▶ Live: <https://jkaindl.codeberg.page/autosplat-viewer/>**

Renders Gaussian Splats in the browser via the PlayCanvas Engine — the
bundled demo is a compressed `.sog`; drop your own `.ply` splat to view
it. No build step, no server, no upload — everything renders locally.

## Features

- Live Gaussian-Splat rendering with auto-orbit
- Orbit / pan / zoom camera (left-drag, right-drag, mouse wheel)
- **Walking-mode** — first-person walk-through with WASD + mouse-look,
  collision via an in-browser heightmap (no server, no extra files)
- Drag-and-drop or file-picker for your own `.ply` splats
- Fullscreen mode — distraction-free, intro overlay hidden (with a
  CSS-fallback on iPhone Safari where no Fullscreen API exists)
- Installable PWA with an offline-capable app shell — including a
  fully-supported "Add to Home Screen" on iOS
- iPhone-aware UI — safe-area handling around the notch / Dynamic
  Island / home indicator
- Graceful WebGL2 fallback to a still image

## Walking-mode

After a splat loads, a **"▶ Walk through this scene"** prompt appears
on the stage. Click it to drop into first-person mode. The viewer
builds a 128×128 heightmap from the splat's own point positions
(~30 ms for 1 M splats) and uses it as the walkable surface.

### Desktop controls

| Action | Key |
|---|---|
| Move | `W` `A` `S` `D` or arrow keys |
| Look | Mouse (pointer-lock — click the canvas to re-acquire if lost) |
| Jump | `Space` |
| Sprint | Hold `Shift` |
| Toggle fly mode | `F` |
| Up / down (in fly mode) | `Q` / `E` |
| Adjust eye height | Mouse wheel — setting is remembered |
| Exit | `Esc` |

### Mobile controls

| Action | Touch |
|---|---|
| Move | Drag in the **left** half of the screen (virtual joystick) |
| Look | Drag in the **right** half of the screen |
| Sprint | Push the joystick to the rim |
| Jump | `↑` button (right edge) |
| Toggle fly mode | `✈` button (right edge) |
| Exit | `✕` button (top right) |

Walking-mode is tuned for outdoor scenes captured from drone-style
flyovers — the kind of capture `autosplat` is built for. Indoor
multi-room scenes don't work well today (collision is a heightmap, not
real walls); see [docs/superpowers/specs/2026-05-25-walkable-viewer-design.md](docs/superpowers/specs/2026-05-25-walkable-viewer-design.md)
for the planned Tier-3 mesh-collision follow-up.

## Local development

```bash
./serve.sh                       # → http://localhost:8123/
./tests/run.sh                   # unit + e2e tests
./tests/run.sh unit              # unit tests only (no deps)
./tests/run.sh e2e               # browser smoke (installs puppeteer-core)
```

A real http origin is required — Service Workers do not run on `file://`.

Tests live under `tests/` and stay separate from the shipped viewer.
The shipped site has zero npm dependencies; `tests/node_modules/` is
gitignored. See [docs/superpowers/specs/2026-05-25-walkable-checklist.md](docs/superpowers/specs/2026-05-25-walkable-checklist.md)
for the manual walking-mode smoke checklist.

## Deployment — Codeberg Pages

Codeberg Pages serves the `pages` branch at
`https://jkaindl.codeberg.page/autosplat-viewer/`. The site is fully
static — update the live site with:

```bash
git push origin main         # development branch
git push origin main:pages   # publish to the pages branch
```

All asset paths are relative, so the site works under the
`/autosplat-viewer/` sub-path.

## Install as an app

The viewer is a PWA — install it for a fullscreen, app-like experience:

- **iOS (Safari):** Share → *Add to Home Screen*. Launches standalone
  with no Safari chrome.
- **Android / desktop Chrome / Edge:** address-bar install icon, or the
  browser's "Install app" menu entry.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the per-release history.

## Tech

Vanilla HTML/CSS/JS (ES modules), no build step. The PlayCanvas Engine
is loaded at runtime from the jsDelivr CDN. PWA: installable, with an
offline app shell.

## Relationship to autosplat

This viewer is the browser-facing companion to
[autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat) — a
local pipeline that turns drone or handheld video into trained 3D
Gaussian Splats. autosplat produces the splats; this viewer shows them
off and lets anyone inspect their own.

## Contributing

Issues and pull requests are welcome. The viewer is intentionally small
and build-step-free — please keep changes vanilla HTML/CSS/JS.

## License

GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later) —
see [LICENSE](LICENSE).

This is the same license autosplat uses: contributions to the commons
stay in the commons, even when the software is served over a network.
Because this viewer runs as a network-served application, the footer
links to its own source — as required by AGPL §13.

The PlayCanvas Engine is MIT-licensed and loaded as a separate
component from a CDN.

Copyright (C) 2026 Johannes Kaindl. Licensed under AGPL-3.0-or-later.
