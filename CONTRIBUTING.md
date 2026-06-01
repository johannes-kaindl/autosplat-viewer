# Contributing

`autosplat-viewer` is a small, deliberately minimal static viewer PWA — a
showcase for the [autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat)
pipeline and a general-purpose 3D Gaussian Splat viewer. Issues and PRs are
welcome.

## Ground rules

- **Vanilla web stack — no build step.** No bundlers, no transpilation, no
  npm runtime dependencies. The shipped site stays plain HTML, CSS, and
  ES modules. PlayCanvas is loaded at runtime from the jsDelivr CDN. If
  your idea requires a build pipeline, open an issue first to discuss
  scope.
- **Mobile counts.** iPhone Safari is a primary target — any UI change
  has to keep working with safe-area-inset, the pseudo-fullscreen
  fallback, and touch input. See [`CHANGELOG.md`](CHANGELOG.md) v1.1.0/v1.1.1
  for the full mobile-polish surface.
- **Service worker is shipped state.** When you add or remove a file from
  the offline app shell, bump the cache constants (`SHELL`, `RUNTIME`)
  in [`service-worker.js`](service-worker.js) so installed clients
  re-fetch.

## Bug reports

Use the [Codeberg issue tracker](https://codeberg.org/jkaindl/autosplat-viewer/issues).
Please include:

- Browser + version (e.g. `Safari 17 on iOS 17.4`, `Firefox 124 on macOS`)
- Device class (desktop / iPhone / Android / iPad)
- Steps to reproduce, ideally with a minimal `.ply` if a specific splat
  triggers the bug
- DevTools console + Network output for loading or rendering issues

For security-sensitive reports see [`SECURITY.md`](SECURITY.md).

## Development setup

```bash
git clone https://codeberg.org/jkaindl/autosplat-viewer.git
cd autosplat-viewer
./serve.sh                       # → http://localhost:8123/
./tests/run.sh                   # unit + e2e
```

A real HTTP origin is required — Service Workers do not run on `file://`.
The shipped viewer has zero npm dependencies. `tests/` is the only place
that installs anything (`puppeteer-core`, auto-installed into the
gitignored `tests/node_modules/` on first e2e run).

## Pull requests

1. **Tests where they make sense.** Pure logic (heightmap, controls)
   belongs in `tests/unit/` using `node:test` — zero deps. End-to-end
   browser flows belong in `tests/e2e/` using `puppeteer-core`. The bar
   is the existing test surface — match what's there.
2. **Run the full suite before pushing:**
   ```bash
   ./tests/run.sh
   ```
3. **Smoke-test on a real mobile device** if you touch mobile UI, the
   walking-mode HUD, or the PWA install path. iOS Safari does not
   forgive — many APIs (Fullscreen, BeforeInstallPrompt) are quietly
   absent.
4. **Conventional commits** — `feat(scope): …`, `fix(scope): …`,
   `docs:`, `chore:`, `refactor:`. Releases get an annotated tag
   (`git tag -a vX.Y.Z`) and a `CHANGELOG.md` entry in
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.
5. **AI co-author trailer** — Anthropic Claude was a heavy contributor
   here. Commits with substantial AI input use:
   ```
   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```

For deeper agent-side conventions see [`AGENTS.md`](AGENTS.md).

## License of contributions

By opening a PR you agree to the [Contributor License Agreement](CLA.md): you
keep your copyright, your contribution stays available under the project's
open-source license, **and** you grant the maintainer the right to also
license it under other terms — which keeps the project's
[dual-licensing model](LICENSING.md) (AGPL + an optional commercial license)
possible. To accept, add this line to your PR description (or as a
`Signed-off-by:` trailer on your commits):

> I have read and agree to the Contributor License Agreement (CLA.md).

Under the open-source license, your contribution is published under the same
license as the overall project: [AGPL-3.0-or-later](LICENSE).

## Out of scope

- **Splat training / capture.** That's the [autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat)
  pipeline — this repo is only the viewer.
- **Build tooling, frameworks, bundlers.** Stays vanilla.
- **Server-side anything.** Static-only. No upload, no telemetry, no
  account.
- **Indoor multi-room walking.** The current walking-mode uses a
  heightmap, which models a single walkable surface — not walls. A
  Tier-3 mesh-collision follow-up is sketched in
  [`docs/superpowers/specs/2026-05-25-walkable-viewer-design.md`](docs/superpowers/specs/2026-05-25-walkable-viewer-design.md);
  PRs in that direction are welcome but please open an issue first.

If a feature is outside that line, opening an issue to discuss first is
faster than a surprise PR.
