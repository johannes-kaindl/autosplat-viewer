# AGENTS.md

Conventions for AI assistants working in this repo.

## What this is

Static viewer PWA for 3D Gaussian Splats. Vanilla HTML/CSS/JS, no build
step, no runtime dependencies. The PlayCanvas Engine is loaded at
runtime from the jsDelivr CDN.

## Workflow conventions

- **Tests:** `./tests/run.sh` runs unit + e2e. Unit tests use
  `node:test` with zero deps; e2e uses `puppeteer-core` which is
  auto-installed into `tests/node_modules/` (gitignored). Tests must
  pass before any commit.
- **Pages deploy:** Codeberg Pages serves the `pages` branch. To
  publish:
  ```bash
  git push origin main
  git push origin main:pages
  ```
- **Commit style:** Conventional Commits — `feat(scope): …`, `fix:`,
  `chore:`, `docs:`, `refactor:`. AI-pair commits get a
  `Co-Authored-By:` trailer.
- **No build step.** No bundlers, no transpilation, no npm runtime
  deps. Stay vanilla HTML/CSS/JS (ES modules).
- **Releases:** annotated tag (`git tag -a vX.Y.Z`), CHANGELOG entry
  in Keep-a-Changelog format, Codeberg release via the API. See
  the `codeberg-release-workflow` memory for the `has_releases`
  quirk on fresh Codeberg repos.

## Memory + logs

- **Memory** (cross-session, outside the repo):
  `~/.claude/projects/-Users-Shared-code-autosplat-viewer/memory/`
- **Session logs** (in repo, gitignored):
  `.claude/logs/YYYY-MM-DD-<topic>.md` — written at end-of-session
  by the `clean-shutdown` skill.

## Repo meta files

- `README.md` — entry point, mirrors `CHANGELOG.md` headline table.
- `CHANGELOG.md` — Keep-a-Changelog format, every release adds an entry.
- `CONTRIBUTING.md` — bug-report / PR / out-of-scope guidance.
- `SECURITY.md` — reporting channel for security-sensitive issues.
- `CITATION.cff` — academic citation block.
- `.editorconfig` — 2-space indent (HTML/CSS/JS), LF, trim trailing
  whitespace (except `.md`).
- Codeberg repo metadata (description, website, topics) is set via
  the Gitea API — see the `codeberg-release-workflow` memory.

## Architecture notes

- **Service worker** (`service-worker.js`): same-origin shell uses
  `network-first`, so installed clients pick up updates on the next
  reload. Cache constants (`SHELL`, `RUNTIME`) must be bumped whenever
  a file is added to or removed from `SHELL_FILES`.
- **Walking-mode** (`js/walking.js`, `js/heightmap.js`,
  `js/controls.js`) is loaded lazily via dynamic import in
  `viewer.js#enterWalking` — not part of the initial shell.
- **Collision editor** (`js/collision/*.js`) is loaded lazily via
  dynamic import in `viewer.js#enterCollisionEditor` — not part of
  the initial shell. The editor owns a 64³ voxel-density grid and
  runs marching cubes (Bourke tables in `mc-tables.js`) to produce
  a translucent two-sided mesh overlay. `walking.js#setCollider()`
  can opt in to using the mesh as the active collider; the heightmap
  remains the fallback when the mesh has gaps.
- **Mobile / iOS:** fullscreen on iPhone Safari uses a CSS pseudo-
  fullscreen fallback (`body.fs-fallback`), since Mobile Safari has
  no Fullscreen API for non-`<video>` elements. Safe-area-inset
  padding on stage controls and walking-mode HUD; `viewport-fit=cover`
  in the viewport meta. See `CHANGELOG.md` v1.1.0/v1.1.1 for the
  full mobile-polish surface.
