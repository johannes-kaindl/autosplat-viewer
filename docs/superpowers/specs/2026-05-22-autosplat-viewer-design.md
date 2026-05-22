# Design-Spec — autosplat-viewer

**Datum:** 2026-05-22
**Status:** Design abgestimmt, bereit für Implementierungsplan
**Autor:** Johannes Kaindl + Claude

---

## 1. Kontext & Motivation

`autosplat` ist eine lokale Pipeline, die Drohnen-/Handvideo in trainierte 3D Gaussian Splats verwandelt. Die Pipeline selbst (COLMAP-SfM, Brush-Training, FFmpeg) ist schwere native Compute-Last und kann nicht im Browser oder auf statischem Hosting laufen.

Die **Ergebnisse** dagegen sind web-nativ: Gaussian Splats rendern via WebGL2/WebGPU im Browser. Ziel ist eine statische **Viewer-PWA** auf Codeberg Pages — analog zum Schwester-Projekt `yijing` (Vanilla-JS, kein Build-Step, Service Worker, Codeberg Pages).

Vorhandenes Demo-Material: ein trainierter Splat eines Kirchen-Rundflugs (Prien), komprimiert nach SOG (`scene.sog`, 12,4 MB; aus 167,8 MB PLY, 92,3 % Reduktion).

## 2. Ziele & Nicht-Ziele

**Ziele**
- Statische PWA, die trainierte Gaussian Splats im Browser rendert.
- Doppelfunktion gleichwertig: **Showcase** für das autosplat-Projekt **und** allgemeines **Viewer-Tool**, in das Nutzer eigene Splats ziehen.
- Hero-Bereich = Live-Splat mit Auto-Orbit (kein vorgerendertes GIF).
- Deploybar auf Codeberg Pages, kein Build-Step, keine npm-Dependencies im Repo.

**Nicht-Ziele**
- Kein browserseitiges Training / keine Pipeline-Steuerung — das macht `autosplat webui`.
- Kein Splat-Editor (Trimmen, Kamerapfade) — dafür gibt es SuperSplat.
- Keine serverseitige Komponente, kein Upload — alles bleibt lokal im Browser.
- v1: ein einzelner Demo-Splat, keine Galerie.

## 3. Architektur & Tech-Stack

- **Neues, eigenständiges Repo `autosplat-viewer`** (getrennt von `auto-splat-pipeline`).
- Reine statische Site: HTML/CSS/Vanilla-JS, kein Build-Step.
- **Renderer:** PlayCanvas Engine, zur Laufzeit per `importmap` vom jsDelivr-CDN geladen (`https://cdn.jsdelivr.net/npm/playcanvas/+esm`). PlayCanvas unterstützt SOG nativ seit Engine 2.11.0 — dieselbe Tech-Familie wie SuperSplat und `splat-transform` (das `autosplat compress` bereits nutzt).
- **PWA:** `manifest.webmanifest` + Service Worker (offline-fähig, installierbar).
- Eine Seite (`index.html`).

## 4. Repo-Struktur

```
autosplat-viewer/
├── index.html              # die eine Seite
├── css/style.css
├── js/
│   ├── viewer.js           # PlayCanvas-Setup, SOG/PLY laden, Auto-Orbit
│   ├── dropzone.js         # Drag-and-drop + File-Picker
│   └── app.js              # UI-State, Verdrahtung
├── assets/
│   ├── demo/scene.sog      # Kirchen-Demo-Splat (12,4 MB)
│   └── og-image.jpg        # statisches Social-Preview-Bild (Screenshot)
├── icons/                  # PWA-Icons (192, 512, maskable)
├── manifest.webmanifest
├── service-worker.js
├── serve.sh                # lokaler Dev-Server (Python)
├── README.md
└── LICENSE                 # AGPL-3.0 (konsistent mit autosplat)
```

**Drei klar getrennte JS-Einheiten:**
- `viewer.js` — kennt nur PlayCanvas und das Rendern. Eingabe: eine Splat-Quelle (URL oder File). Ausgabe: laufende Szene. Bietet `loadSplat(source)`, Auto-Orbit-Steuerung, Kamera-Reset.
- `dropzone.js` — kennt nur Datei-Eingabe (Drag-and-drop + File-Picker). Ausgabe: ein File-Objekt via Callback.
- `app.js` — verdrahtet beide, hält den UI-Zustand (aktive Quelle, Orbit an/aus, Fehlermeldungen).

Jede Einheit ist isoliert testbar.

## 5. Seitenlayout (Variante A)

Single-Page, von oben nach unten:

1. **Hero-Bühne** — Live-Splat-Viewer über volle Breite (~80vh). Demo-Splat lädt automatisch, Auto-Orbit läuft. Halbtransparentes Text-Overlay: Headline, Subtitle, zwei CTA-Buttons — „Eigenen Splat laden" (öffnet den File-Picker aus §6) und „Was ist autosplat?" (scrollt zur autosplat-Sektion). Drag-and-drop wirkt direkt auf diese Bühne.
2. **autosplat-Sektion** — kurze Erklärung der Pipeline (Video → Splat), Pipeline-Flow-Darstellung, Link zum `auto-splat-pipeline`-Repo. Showcase-Teil.
3. **Footer** — Links: autosplat-Repo (Codeberg), Lizenz (AGPL-3.0), „powered by PlayCanvas".

## 6. Viewer-Verhalten

- Seitenaufruf → Demo-Splat (`assets/demo/scene.sog`) lädt automatisch in die Hero-Bühne → Auto-Orbit startet (langsame Kamerarotation).
- User-Interaktion (Maus-Drag) pausiert Auto-Orbit; Toggle-Button startet ihn wieder.
- Kamera: Drag = Orbit, Scroll = Zoom.
- Drag-and-drop einer `.sog`/`.ply` auf die Bühne ersetzt den Demo-Splat. „Datei laden"-Button (File-Picker) als Touch-/Mobile-Alternative.
- „Reset"-Button kehrt zum Demo-Splat zurück.

## 7. Data Flow

1. `app.js` initialisiert `viewer.js` (PlayCanvas-App, Canvas in der Hero-Bühne).
2. `viewer.js` lädt `assets/demo/scene.sog` → rendert → Auto-Orbit.
3. Drop/Pick → `dropzone.js` liefert ein File-Objekt an `app.js` → `app.js` ruft `viewer.loadSplat(file)`.
4. Lokale Dateien werden als ArrayBuffer im Browser geladen — **nichts wird hochgeladen**, alles bleibt lokal (Datenschutz-Prinzip, wie bei yijing — kein Server).

## 8. Fehlerbehandlung

- **Kein WebGL2:** PlayCanvas benötigt WebGL2 (WebGPU wird genutzt, wenn verfügbar). Schlägt die GPU-Initialisierung fehl → Fallback auf das statische `og-image.jpg` + Hinweis „Browser unterstützt kein WebGL2".
- **Ungültige/kaputte Datei:** Lade-Fehler wird gefangen → Inline-Meldung („Konnte die Datei nicht laden — unterstützt: .sog, .ply"), der vorherige Splat bleibt sichtbar.
- **Sehr große `.ply`:** kein harter Fehler, Lade-Spinner während des Parsens.
- **Demo offline noch nicht gecacht:** App-Shell läuft offline (Service Worker), aber Hinweis „Demo offline nicht verfügbar — zieh eine eigene Datei rein".

## 9. PWA

- `manifest.webmanifest`: Name „autosplat viewer", Icons (192/512/maskable), `theme-color`, `display: standalone`, `start_url: "."`.
- `service-worker.js`:
  - **Precache** (Cache-First) der App-Shell: `index.html`, CSS, JS, Icons, Manifest.
  - **PlayCanvas-Engine** vom CDN: Runtime-Cache, stale-while-revalidate.
  - **Demo-Splat** (`scene.sog`, 12,4 MB): **nicht** im Precache — wird beim ersten Anzeigen in einen separaten Runtime-Cache gelegt. Hält die Erst-Installation leichtgewichtig.
- Installierbar (Add to Home Screen); offline läuft die App-Shell, ohne gecachten Demo-Splat erscheint der Drop-Hinweis.

## 10. Deploy — Codeberg Pages

- Repo `autosplat-viewer` auf Codeberg; Codeberg Pages serviert es unter `jkaindl.codeberg.page/autosplat-viewer/`.
- Pages-Quelle: `main`-Branch direkt (Site ist rein statisch).
- **Relative Pfade** in `index.html` (kein führender `/`), da die Site im Unterpfad `/autosplat-viewer/` läuft.
- Custom-Domain nicht nötig (keine `.domains`-Datei).

## 11. Testing

Rein statische Vanilla-JS-Site — kein Test-Framework-Overhead.

- `serve.sh` startet einen lokalen Python-Server für manuelles Testen.
- Golden-Path-Sichtprüfung: Demo lädt + orbitet; Drop einer eigenen Datei ersetzt den Splat; Reset kehrt zurück; WebGL2-Fallback (simuliert).
- Smoke-Checks: HTML/JS valide, Service Worker registriert sich, `manifest.webmanifest` valide, PWA installierbar (DevTools/Lighthouse).
- Cross-Browser-Sichtprüfung: Safari (primärer Mac-Browser) + Chrome.

## 12. Annahmen & offene Detailpunkte

- **Demo-Asset:** `scene.sog` aus `~/Documents/temp/2026-05-17_scenery/` wird nach `assets/demo/scene.sog` ins neue Repo kopiert.
- **og-image.jpg:** statischer Screenshot des gerenderten Splats — wird im Zuge der Implementierung erzeugt.
- **PWA-Icons:** werden im Zuge der Implementierung erstellt (aus einem Splat-Screenshot oder einem schlichten Logo-Mark).
- **Codeberg-Repo-Anlage** und Pages-Aktivierung erfolgen durch Johannes bzw. werden als Handover-Schritt markiert (externer Service-Account).
- **PlayCanvas-Versionspinning:** Engine-Version im `importmap` auf eine konkrete Version pinnen (nicht `latest`), für reproduzierbares Verhalten.
