# Design-Spec — Walkable-Mode für autosplat-viewer

**Datum:** 2026-05-25
**Status:** Design abgestimmt, autonome Implementierung beauftragt
**Autor:** Johannes Kaindl + Claude
**Vorgänger-Spec:** [2026-05-22-autosplat-viewer-design.md](./2026-05-22-autosplat-viewer-design.md)

---

## 1. Kontext & Motivation

Der bestehende `autosplat-viewer` (V1, deployed auf Codeberg Pages) rendert Splats mit einer Orbit-Camera — der Nutzer kreist um die Szene. Das ist gut für Übersicht, vermittelt aber nicht das **Gefühl, an dem Ort zu sein**.

Walking-Mode ergänzt einen **First-Person-Modus**, in dem man mit WASD und Maus-Look durch die Szene läuft, mit Gravity und Boden-Kollision. Für die typischen autosplat-Captures (Außen-Szenen aus Drohnen-Flügen — Kirche, Burgstall, Straßenzüge) ist das ein deutlicher Kategorie-Sprung gegenüber Orbit-Mode.

Sekundär: Fly-Toggle erlaubt freies Inspizieren (für Architekt-/Detail-Use-Case).

## 2. Ziele & Nicht-Ziele

**Ziele (MVP)**
- Eintritts-CTA "▶ Walk through this scene" mittig auf der Stage, Auto-Fade nach 4 s.
- Walking-Mode mit WASD + Maus-Look + Space (Jump) + F (Fly-Toggle) + Escape (Exit) auf Desktop.
- Touch-Equivalent auf Mobile: Virtual-Joystick (links) + Drag-Look (rechts) + Buttons (Jump, Fly, Exit).
- Boden-Kollision via Heightmap, berechnet im Browser aus Splat-Positionen (~1 s bei 1 M Splats).
- Auto-Scale Eye-Offset basierend auf Scene-Y-Extent (Drohnenszenen sind unitless).
- HUD: Crosshair, Mode-Indicator (Walk/Fly), Controls-Hint (auto-fade), Exit-Button.
- Funktioniert ohne Build-Step, keine neuen npm-Deps für die ausgelieferte App.

**Nicht-Ziele (für diesen Burst)**
- Tier-3 Mesh-Collision (Poisson/SuGaR via pipeline `mesh`-Stage) — separater Folge-Burst.
- Indoor-Mehrraum-Szenen (Tier-2 Heightmap deckt das nicht ab).
- Head-Bobbing, Footstep-Sounds, Minimap, Onboarding-Overlay — Polish, später.
- Multiplayer, Pose-Sharing, Snapshot-Capture im Walking-Mode — nicht in scope.

## 3. Architektur

```
viewer.js (orchestrator, +30 LOC)
  ├─ Orbit-Mode (bestehend, camera-controls.mjs vom CDN)
  └─ Walking-Mode (lazy import beim ersten CTA-Klick)
        ├─ walking.js   — WalkingMode class
        ├─ heightmap.js — buildHeightmap() pure function
        ├─ controls.js  — KeyboardInput, TouchInput, unified API
        └─ hud.js       — DOM overlays
```

**Lazy Import:** Walking-Module werden erst geladen wenn der Nutzer den CTA klickt — die initial-PWA bleibt schlank (~5 KB JS heute).

**Keine neuen NPM-Deps in der ausgelieferten App.** PlayCanvas-Engine bringt eigene Physics-Primitives (Bounding-Volume + Ray-Cast); Tier-2 braucht weder Ammo.js noch eine externe Physics-Engine.

**Tests** dürfen npm-Deps haben (in `tests/` mit eigener `package.json`, `node_modules/` gitignored). Die ausgelieferte Static-Site bleibt vanilla.

## 4. Komponenten

| Modul | LOC | Verantwortung | Public API |
|---|---|---|---|
| `viewer.js` | +30 | Mode-Switch glue | `enterWalking()`, `exitWalking()`, `canWalk()` |
| `walking.js` | ~150 | `WalkingMode` class — character entity, frame update, camera control | `new WalkingMode(app, camera, sceneBounds, heightmap)`, `enter()`, `exit()`, `update(dt, input)` |
| `heightmap.js` | ~50 | Pure function: Splat-Positionen → 128×128 Grid | `buildHeightmap(positions, bounds, resolution=128)`, `sampleHeightmap(grid, bounds, x, z)` |
| `controls.js` | ~120 | Keyboard + Touch unified Input | `KeyboardInput`, `TouchInput`, beide: `read() → {forward, right, jump, fly, exit, lookDelta}` |
| `hud.js` | ~80 | DOM overlays (Crosshair, Mode-Indicator, Hint, Exit-Button) | `showHUD(mode)`, `hideHUD()`, `updateMode(mode)`, `onExit(callback)` |
| `index.html` | +10 | CTA-Element, HUD-Container | n/a |
| `css/style.css` | +60 | CTA-Styling, HUD-Layout, Touch-Buttons | n/a |
| `app.js` | +15 | CTA-Click-Handler, lazy-import Wiring | n/a |

## 5. Data Flow

1. **Splat geladen** → `buildHeightmap()` läuft im Background (Web Worker wenn verfügbar, sonst inline mit `requestIdleCallback`), Resultat gecached.
2. **CTA fade-in** (4 s sichtbar, dann fade-out wenn nicht geklickt — Auto-Orbit läuft parallel weiter).
3. **Klick auf "▶ Walk through this scene"** → `viewer.enterWalking()`:
   - Lazy-import `walking.js`
   - `WalkingMode.enter()`: Camera-Spawn (über Scene-Center, looking inward, am Heightmap-Boden + eye-offset), Orbit-Controls deaktivieren, PointerLock (Desktop) / TouchHandlers (Mobile), HUD show
4. **Pro Frame** (`app.on('update')`):
   - `input.read()` → desired velocity
   - `walking.update(dt, input)` → integrate, sample Heightmap an target XZ, constrain Y, clamp gegen Scene-AABB, update camera transform
   - Fly-Mode: skip Heightmap-Sample + Gravity, freie Y-Bewegung über Q/E (Desktop) bzw Up/Down-Buttons (Mobile)
5. **Escape / Exit-Tap** → `WalkingMode.exit()` → Orbit-Camera-State restoren, PointerLock release, HUD hide

## 6. Heightmap-Algorithmus

```
buildHeightmap(positions, bounds, res=128):
  grid = Float32Array(res * res); init -Infinity
  for each (x, y, z) in positions:
    i = floor((x - bounds.min.x) / bounds.size.x * res)
    j = floor((z - bounds.min.z) / bounds.size.z * res)
    if 0 <= i < res and 0 <= j < res:
      grid[j*res + i] = max(grid[j*res + i], y)
  // 3×3 box-filter, 1 pass (empty cells bleiben -Infinity)
  return grid

sampleHeightmap(grid, bounds, x, z):
  // bilinear interpolation; empty cells → -Infinity → free-fall
```

**Walking-Use:**
- `eye_offset = sceneYExtent / 8` (~12 % der Szene-Höhe; tunbar via Mausrad / Pinch).
- Jump: vy = +sqrt(2 * gravity * jumpHeight), jumpHeight = sceneYExtent / 40.
- Gravity-Accel: 2 × jumpHeight pro Sekunde² (Verhältnis-basiert, nicht in echten m/s²).
- Fallout-Respawn: wenn camera.y < bounds.min.y - 5 × eye_offset → respawn am Scene-Center auf Heightmap.

## 7. Controls

### Desktop

| Aktion | Taste |
|---|---|
| Forward / Back / Left / Right | W A S D (oder Arrow Keys) |
| Look | Maus-Bewegung (mit PointerLock) |
| Jump (nur Walking-Mode) | Space |
| Fly-Toggle | F |
| Up / Down (nur Fly-Mode) | Q / E (oder Space / Shift) |
| Sprint | Shift halten (× 2 speed) |
| Exit Walking | Escape |

### Mobile / Touch

| Aktion | Element |
|---|---|
| Move | Virtual Joystick links unten (DOM-Element, draggable) |
| Look | Drag in rechter Bildhälfte |
| Jump | Button rechts unten |
| Fly-Toggle | Button rechts unten (kleiner, neben Jump) |
| Exit | Button oben rechts (✕) |

## 8. Auto-Scale für Eye-Offset

Splats kommen aus COLMAP mit unitless Coords. Ein 1.7-m-Mensch hat keine objektive Höhe in der Szene. Auto-Scale via:

- `eye_offset = max(0.1, sceneYExtent / 8)`
- User tweakable via Mausrad während Walking (zeigt kurzes "Eye height: X.X" Overlay)
- Persistiert in `localStorage` pro Splat-URL-Hash

## 9. Error Handling

- **WebGL2 fehlt** → CTA versteckt (bestehender Fallback-Pfad).
- **Splat ohne Positionen** (Load fehlgeschlagen) → CTA disabled, Tooltip "Splat lädt noch".
- **PointerLock denied** (Safari iOS Quirks) → Fallback "Drag-to-look": Touch/Maus halten + bewegen → Camera.
- **Heightmap-Build > 5 s** (Riesen-Splat) → Fallback Tier-1 Flat-Floor (`grid` gefüllt mit `bounds.min.y`), Toast "Heightmap übersprungen — flat floor".
- **Empty Heightmap-Cell** (kein Splat im Bin) → `-Infinity` → User fällt → Respawn.
- **Touch-Events nicht erkannt** (Desktop in Touch-fähigem Browser) → KeyboardInput parallel aktiv, beide funktionieren.

## 10. Testing-Strategie

Der Viewer hat aktuell **kein Test-Framework**. Wir folgen dem Pattern (vanilla, lightweight) und ergänzen:

### `tests/` Verzeichnis (gitignored `node_modules/`)

- `tests/package.json` — `puppeteer-core` als devDep, nutzt installiertes Chrome.app
- `tests/unit/heightmap.test.mjs` — pure-function Tests mit Node's built-in `node:test`
- `tests/unit/controls.test.mjs` — Input-Mapping mit synthetischen Events
- `tests/e2e/walking-smoke.test.mjs` — Puppeteer: server hochziehen, Demo-Splat laden, CTA klicken, WASD simulieren, HUD-State checken, Exit-Tap, alles auf Console-Errors prüfen
- `tests/run.sh` — startet `./serve.sh` im Hintergrund, ruft `node --test tests/`, killt server

### Manuelle Smoke-Checkliste

`docs/superpowers/specs/2026-05-25-walkable-checklist.md` — User-Walkthrough für nach-Rückkehr-Test:
- Demo laden → CTA erscheint → Klick → spawn position sichtbar → WASD bewegt → Maus dreht → Space springt → F toggelt Fly → Q/E vertikal → Escape exit → Orbit-Mode wiederhergestellt
- Mobile (iPad Safari): gleiche Sequenz mit Touch-Joystick, Drag-Look, Buttons

## 11. Slicing

Atomic Slices, jeder einzeln committet, jeder mit Tests:

| Slice | Inhalt | Tests |
|---|---|---|
| 0 | Tests-Infrastruktur (tests/package.json, puppeteer-core install, run.sh, .gitignore) | tests/sanity.test.mjs (trivial assertion) läuft grün |
| 1 | `heightmap.js` pure functions + unit tests | `heightmap.test.mjs` deckt build + sample + bilinear + empty-cell |
| 2 | `controls.js` KeyboardInput + unit tests | `controls.test.mjs` synthetische Events |
| 3 | `hud.js` + CSS für CTA + HUD-Layout | DOM-render Test (puppeteer) |
| 4 | `walking.js` Skelett (Walking ohne Fly) + viewer.js Integration + index.html CTA | E2E: CTA klick, WASD bewegt camera, ESC exit |
| 5 | Fly-Toggle + Sprint + Auto-Scale Eye-Offset | E2E: F toggelt, Mausrad ändert eye-height |
| 6 | TouchInput + Touch-Buttons im HUD | DOM Touch-Events simuliert |
| 7 | Error-Handling: PointerLock-fallback, Heightmap-timeout, Splat-load-state | E2E Edge-Cases |
| 8 | README-Update, manuelle Smoke-Checkliste, Polish-Pass | Manueller Walk-through Doc geschrieben |

Effort geschätzt **3 Sessions** für Slices 0–8; einzelne können parallelisiert oder skippt werden falls Tests genug Vertrauen geben.

## 12. Out-of-Scope für diesen Burst (für späteren Burst gemerkt)

- **Pipeline `mesh`-Stage** (Poisson/SuGaR → collision.glb): macht Tier-3-Mesh-Collision möglich, ist autosplat-pipeline-side, separater Burst.
- **Viewer Tier-3-Path**: Viewer lädt optional collision.glb wenn präsent, fällt zurück auf Heightmap. Pflegeleicht zu ergänzen wenn Pipeline-Side fertig.
- **Polish**: Head-Bob, Footstep-Sound, Minimap, Onboarding-Overlay (~1 zusätzliche Session jeweils).
- **Snapshot-im-Walking**: Screenshot-Button im HUD, speichert PNG des aktuellen FOV.
- **Pose-Sharing via URL**: Walking-Position in URL-Hash, Share-Link reproduziert den Standpunkt.

## 13. Release-Plan

- Alle Commits auf `main`, Conventional-Commit-Style (`feat(walking):`, `test(walking):`, `docs(walking):`, etc.).
- **Kein automatischer Push nach Codeberg** — User pusht explizit nach Review.
- Nach Slice 8 (oder wenn User Stopp sagt): Status-Report mit Commit-Liste, Test-Status, manueller Checklist-Link, Empfehlung zu Tag/Release.
