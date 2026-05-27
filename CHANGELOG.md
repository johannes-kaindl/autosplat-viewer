# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Collision editor

- Extract a triangle mesh from the loaded splat via marching cubes on a
  64³ voxel-density grid (Bourke's 256-case lookup tables, embedded
  verbatim — zero runtime dependencies).
- Voxel-brush editor with Add / Remove tools, quadratic-falloff sphere
  brush, drag-to-paint, and an iso-threshold slider for live surface
  tuning. Per-stroke undo ring (depth 8).
- Mesh BVH with two-sided Möller-Trumbore raycast (for brush picking)
  and a capsule-sweep query for walking-mode horizontal collision.
- Walking-mode `setCollider()` strategy switch — mesh collider gives
  real walls and overhangs; falls back to the existing heightmap when
  the mesh has gaps.
- Export `.obj` (triangulated, with normals) and a JSON sidecar
  (`<name>.collision.json`) with RLE-packed 8-bit quantised density
  so the same collider can be re-attached on the next page load.
- New stage-controls button `⬛ Collider` toggles the editor; right-rail
  toolbar on desktop, bottom-sheet on mobile.

## [1.1.1] — 2026-05-26

### Added
- Honour the OS-level `prefers-reduced-motion` setting — auto-orbit
  no longer starts spinning by default for users who have opted out
  of spontaneous motion. The orbit toggle still works manually.
- `og:image:width` / `og:image:height` meta-tags (1200×630) so
  social-card crawlers (Mastodon, Discord, etc.) render the preview
  reliably.

### Changed
- Dropped a redundant ID selector in the button background CSS rule
  — pure hygiene, no behavioural change.

## [1.1.0] — 2026-05-26

### Added — Walking-mode
- First-person walk-through with WASD + mouse-look (pointer-lock).
- In-browser heightmap collision built from the splat's own point cloud
  — 128×128 grid, ~30 ms for 1 M splats, no extra files.
- Fly mode (`F`), sprint (`Shift`), mouse-wheel eye-height (remembered),
  jump (`Space`), `Esc` to exit.
- Mobile virtual-stick — drag in the left half to move, right half to
  look around, on-screen Jump (`↑`) and Fly (`✈`) buttons.
- HUD with mode indicator, crosshair and adaptive controls-hint.
- Graceful fallbacks for hostile splats (no walkable ground) and
  pointer-lock loss.
- Ground level estimation hardened against outlier splats — median per
  cell with outlier-resistant bounds.

### Added — Mobile / iOS polish
- iOS PWA meta-tags (`apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`) — "Add to
  Home Screen" now opens standalone instead of in a mini-browser.
- `viewport-fit=cover` + safe-area-inset padding on stage-controls and
  walking-mode HUD — no more clipping under the iPhone notch / Dynamic
  Island / home indicator.
- Mobile `#stage` uses dynamic viewport height (`100dvh`) so it tracks
  Mobile Safari's collapsing URL bar.

### Fixed
- iPhone fullscreen button silently failed — Mobile Safari exposes no
  Fullscreen API for non-`<video>` elements. The button now toggles a
  CSS pseudo-fullscreen (`position: fixed; inset: 0; height: 100dvh`)
  as a fallback on devices without the API.
- iOS tap-flash and 300 ms tap delay eliminated via global
  `touch-action: manipulation` and transparent
  `-webkit-tap-highlight-color` on buttons.
- Pull-to-refresh no longer triggers while dragging on the WebGL canvas
  — `overscroll-behavior: contain` on `#stage` and `touch-action: none`
  on the canvas.

### Changed
- Service-worker cache version bumped to `v5` so installed clients
  re-fetch the updated shell.

## [1.0.0] — 2026-05-22

Initial public release on Codeberg Pages.

### Added
- Static viewer PWA — renders compressed Gaussian Splats (`.sog`) and
  user-supplied `.ply` splats entirely in the browser. No build step,
  no server, no upload.
- PlayCanvas Engine integration loaded at runtime from the jsDelivr CDN.
- Auto-orbit camera with play / pause control and orbit / pan / zoom
  controls.
- Drag-and-drop and file-picker for user `.ply` splats.
- Fullscreen mode that hides the intro overlay for a distraction-free
  view.
- Installable PWA — manifest, icons, offline-capable app shell via
  service worker.
- Graceful WebGL2 fallback to a still image when WebGL2 is
  unavailable.
- AGPL-3.0-or-later license with source link in the footer
  (network-served compliance per AGPL §13).

[1.1.1]: https://codeberg.org/jkaindl/autosplat-viewer/compare/v1.1.0...v1.1.1
[1.1.0]: https://codeberg.org/jkaindl/autosplat-viewer/compare/v1.0.0...v1.1.0
[1.0.0]: https://codeberg.org/jkaindl/autosplat-viewer/releases/tag/v1.0.0
