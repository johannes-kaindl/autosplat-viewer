# autosplat-viewer

Static viewer PWA for 3D Gaussian Splats — a showcase for the
[autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat)
pipeline and a general-purpose splat viewer.

Renders `.sog` and `.ply` splats in the browser via the PlayCanvas
Engine. No build step, no server, no upload — drag a splat onto the
page and it renders locally.

## Features

- Live Gaussian-Splat rendering with auto-orbit
- Orbit / pan / zoom camera (left-drag, right-drag, wheel)
- Drag-and-drop or file-picker for your own `.sog` / `.ply` splats
- Installable PWA, offline-capable app shell
- WebGL2 fallback to a still image

## Local development

```bash
./serve.sh        # → http://localhost:8123/
```

A real http origin is required — Service Workers do not run on `file://`.

## Deployment — Codeberg Pages

Codeberg Pages serves the `pages` branch of this repo at
`https://jkaindl.codeberg.page/autosplat-viewer/`. The site is fully
static — update the live site with:

```bash
git push origin main         # development branch
git push origin main:pages   # publish to the pages branch
```

All asset paths are relative, so the site works under the
`/autosplat-viewer/` sub-path.

## Tech

Vanilla HTML/CSS/JS (ES modules), no build step. PlayCanvas Engine
loaded at runtime from the jsDelivr CDN. PWA: installable, offline
app shell.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
