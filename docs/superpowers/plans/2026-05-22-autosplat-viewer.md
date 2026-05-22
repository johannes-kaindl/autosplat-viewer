# autosplat-viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static viewer PWA that renders trained Gaussian Splats in the browser — a showcase for the autosplat project and a general-purpose splat viewer.

**Architecture:** Single static HTML page, no build step. PlayCanvas Engine loaded at runtime via `importmap` from the jsDelivr CDN. Three isolated JS modules — `viewer.js` (PlayCanvas + rendering), `dropzone.js` (file input), `app.js` (wiring + UI state). Service Worker makes it an installable, offline-capable PWA. Deploys as static files to Codeberg Pages.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), PlayCanvas Engine (CDN/ESM), PWA (manifest + Service Worker), Python `http.server` for local dev.

**Spec:** `docs/superpowers/specs/2026-05-22-autosplat-viewer-design.md`

---

## Testing approach

This is a static Vanilla-JS site with **no test framework** (per spec §11 — matches the yijing sister project). Classic red-green TDD does not apply. Instead, **every task ends with an explicit manual verification step**: start the local server, open the page, and confirm a concrete observable outcome before committing. Treat the verification step as the test — do not commit if it fails.

## Repo location

The new repository is created at **`/Users/Shared/code/autosplat-viewer/`** (sibling of `auto-splat-pipeline`). All paths below are relative to that directory unless absolute.

## File Structure

| File | Responsibility |
|------|----------------|
| `index.html` | Single page: importmap, Hero stage, autosplat section, footer |
| `css/style.css` | All styling — Layout A |
| `js/viewer.js` | PlayCanvas app, splat loading, camera, auto-orbit. Exports `createViewer()` |
| `js/dropzone.js` | Drag-and-drop + file-picker. Exports `initDropzone()` |
| `js/app.js` | Entry module — wires viewer + dropzone, holds UI state |
| `assets/demo/scene.sog` | Church demo splat (12.4 MB) |
| `assets/og-image.jpg` | Static social-preview screenshot |
| `icons/` | PWA icons (192, 512, maskable) |
| `manifest.webmanifest` | PWA manifest |
| `service-worker.js` | Precache app-shell, runtime-cache engine + demo splat |
| `serve.sh` | Local dev server |
| `README.md` | Project readme |
| `LICENSE` | AGPL-3.0 |

---

## Task 1: Repository scaffold

**Files:**
- Create: `/Users/Shared/code/autosplat-viewer/.gitignore`
- Create: `/Users/Shared/code/autosplat-viewer/serve.sh`
- Create: `/Users/Shared/code/autosplat-viewer/LICENSE`
- Create: `/Users/Shared/code/autosplat-viewer/README.md`

- [ ] **Step 1: Create directory, init git, create folder structure**

```bash
mkdir -p /Users/Shared/code/autosplat-viewer/{css,js,assets/demo,icons}
cd /Users/Shared/code/autosplat-viewer
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
.DS_Store
*.swp
.superpowers/
```

- [ ] **Step 3: Create `serve.sh`**

```bash
#!/usr/bin/env bash
# Local dev server. Service Workers require a real http origin (not file://).
PORT="${1:-8123}"
echo "autosplat-viewer → http://localhost:${PORT}/"
exec python3 -m http.server "$PORT"
```

Then: `chmod +x serve.sh`

- [ ] **Step 4: Create `LICENSE`**

Fetch the full AGPL-3.0 text and write it to `LICENSE`:

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
```

- [ ] **Step 5: Create `README.md`**

```markdown
# autosplat-viewer

Static viewer PWA for 3D Gaussian Splats — a showcase for the
[autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat)
pipeline and a general-purpose splat viewer.

Renders `.sog` and `.ply` splats in the browser via the PlayCanvas
Engine. No build step, no server, no upload — drag a splat onto the
page and it renders locally.

## Local development

```bash
./serve.sh        # → http://localhost:8123/
```

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
```

- [ ] **Step 6: Verify**

Run: `cd /Users/Shared/code/autosplat-viewer && ./serve.sh`
Open `http://localhost:8123/` — expect a directory listing showing `css/`, `js/`, `assets/`, `icons/`, `serve.sh`, `README.md`, `LICENSE`. Stop the server (Ctrl-C).

- [ ] **Step 7: Commit**

```bash
git add .gitignore serve.sh LICENSE README.md
git commit -m "chore: repository scaffold"
```

---

## Task 2: Static page — Layout A (index.html + style.css)

**Files:**
- Create: `index.html`
- Create: `css/style.css`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>autosplat viewer — 3D Gaussian Splats im Browser</title>
  <meta name="description" content="Trainierte 3D Gaussian Splats direkt im Browser ansehen. Showcase der autosplat-Pipeline.">
  <link rel="stylesheet" href="css/style.css">
  <script type="importmap">
  {
    "imports": {
      "playcanvas": "https://cdn.jsdelivr.net/npm/playcanvas@VERSION/+esm"
    }
  }
  </script>
</head>
<body>
  <main>
    <section id="stage">
      <div id="canvas-host"></div>
      <div id="hero-overlay">
        <h1>Drohnen-Video → 3D Gaussian Splat</h1>
        <p>Trainierte Splats, direkt im Browser. Lokal gerendert — nichts wird hochgeladen.</p>
        <div class="cta-row">
          <button id="btn-load" type="button">Eigenen Splat laden</button>
          <a class="btn-secondary" href="#about">Was ist autosplat?</a>
        </div>
      </div>
      <div id="stage-controls">
        <button id="btn-orbit" type="button" aria-pressed="true">Auto-Orbit: an</button>
        <button id="btn-reset" type="button">Demo zurücksetzen</button>
      </div>
      <div id="drop-hint" hidden>Splat-Datei hier ablegen</div>
      <div id="viewer-error" role="alert" hidden></div>
      <input id="file-input" type="file" accept=".sog,.ply" hidden>
    </section>

    <section id="about">
      <h2>Was ist autosplat?</h2>
      <p>
        autosplat ist eine lokale Pipeline, die Drohnen- oder Handvideo in
        trainierte 3D Gaussian Splats verwandelt: Frame-Extraktion, COLMAP
        Structure-from-Motion, Quality-Gate, Brush-Training, Kompression.
        Alles lokal auf Apple Silicon, ohne Cloud.
      </p>
      <ol id="pipeline-flow">
        <li>Video</li><li>Frames</li><li>COLMAP SfM</li>
        <li>Brush-Training</li><li>Gaussian Splat</li>
      </ol>
      <p>
        <a href="https://codeberg.org/jkaindl/video-to-3d-gaussian-splat">
          autosplat auf Codeberg →</a>
      </p>
    </section>
  </main>

  <footer>
    <a href="https://codeberg.org/jkaindl/video-to-3d-gaussian-splat">autosplat</a>
    <span>·</span>
    <a href="LICENSE">AGPL-3.0</a>
    <span>·</span>
    <span>powered by PlayCanvas</span>
  </footer>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

Note: `@VERSION` in the importmap is replaced with a concrete version in Task 4, Step 1.

- [ ] **Step 2: Create `css/style.css`**

```css
:root {
  --bg: #0e0f13;
  --fg: #e8e9ee;
  --muted: #9aa0ab;
  --accent: #6080ff;
  --panel: rgba(14, 15, 19, 0.72);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--fg);
  font-family: system-ui, -apple-system, sans-serif; }

#stage { position: relative; width: 100%; height: 82vh; overflow: hidden; }
#canvas-host { position: absolute; inset: 0; }
#canvas-host canvas { width: 100%; height: 100%; display: block; }

#hero-overlay { position: absolute; left: 5vw; bottom: 8vh; max-width: 30rem;
  background: var(--panel); padding: 1.5rem; border-radius: 10px;
  backdrop-filter: blur(8px); }
#hero-overlay h1 { font-size: 1.9rem; line-height: 1.15; }
#hero-overlay p { color: var(--muted); margin: 0.6rem 0 1rem; }

.cta-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
button, .btn-secondary { font: inherit; padding: 0.6rem 1rem; border-radius: 7px;
  border: 1px solid var(--accent); cursor: pointer; text-decoration: none; }
button#btn-load, button { background: var(--accent); color: #fff; }
.btn-secondary { background: transparent; color: var(--fg); }

#stage-controls { position: absolute; right: 1rem; top: 1rem;
  display: flex; gap: 0.5rem; }
#stage-controls button { background: var(--panel); color: var(--fg);
  border-color: rgba(255,255,255,0.2); font-size: 0.85rem; }

#drop-hint { position: absolute; inset: 0; display: flex;
  align-items: center; justify-content: center; font-size: 1.4rem;
  background: rgba(96,128,255,0.25); border: 3px dashed var(--accent); }
#viewer-error { position: absolute; left: 50%; top: 1rem;
  transform: translateX(-50%); background: #5a1f1f; color: #ffd9d9;
  padding: 0.6rem 1rem; border-radius: 7px; }

#about { max-width: 48rem; margin: 0 auto; padding: 4rem 1.5rem; }
#about h2 { font-size: 1.5rem; margin-bottom: 0.8rem; }
#about p { color: var(--muted); line-height: 1.6; margin-bottom: 1rem; }
#pipeline-flow { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem;
  margin: 1.2rem 0; }
#pipeline-flow li { background: #1a1c24; padding: 0.4rem 0.8rem;
  border-radius: 6px; font-size: 0.85rem; }
#pipeline-flow li + li::before { content: "→"; color: var(--accent);
  margin-right: 0.5rem; margin-left: -0.3rem; }
#about a { color: var(--accent); }

footer { display: flex; gap: 0.6rem; justify-content: center;
  padding: 2rem 1rem; color: var(--muted); font-size: 0.85rem;
  border-top: 1px solid #1a1c24; }
footer a { color: var(--muted); }

@media (max-width: 600px) {
  #stage { height: 70vh; }
  #hero-overlay { left: 3vw; right: 3vw; max-width: none; }
}
```

- [ ] **Step 3: Verify**

Run: `./serve.sh` and open `http://localhost:8123/`.
Expect: the page renders with an empty dark Hero stage, the overlay box bottom-left ("Drohnen-Video → 3D Gaussian Splat" + two buttons), control buttons top-right, the "Was ist autosplat?" section below, and the footer. No splat yet (expected). Browser console shows no errors except possibly an importmap warning (the `@VERSION` placeholder — fixed in Task 4).

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: static page layout (Layout A)"
```

---

## Task 3: Demo splat asset

**Files:**
- Create: `assets/demo/scene.sog`

- [ ] **Step 1: Copy the compressed demo splat into the repo**

```bash
cp ~/Documents/temp/2026-05-17_scenery/scene.sog \
   /Users/Shared/code/autosplat-viewer/assets/demo/scene.sog
```

- [ ] **Step 2: Verify**

Run: `ls -lh assets/demo/scene.sog`
Expect: a file of ~12–13 MB.

- [ ] **Step 3: Commit**

```bash
git add assets/demo/scene.sog
git commit -m "feat: add church demo splat (SOG, 12.4 MB)"
```

---

## Task 4: viewer.js + app.js — demo splat renders

**Files:**
- Create: `js/viewer.js`
- Create: `js/app.js`
- Modify: `index.html` (importmap version)

- [ ] **Step 1: Pin the PlayCanvas version**

Run: `npm view playcanvas version`
This prints the current stable version (e.g. `2.12.3`). In `index.html`, replace `@VERSION` in the importmap with `@<that-version>`, e.g.:

```html
"playcanvas": "https://cdn.jsdelivr.net/npm/playcanvas@2.12.3/+esm"
```

Record the version — it is reused for the camera-controls script URL in Step 2.

- [ ] **Step 2: Create `js/viewer.js`**

Replace `2.12.3` in the `CAMERA_CONTROLS_URL` constant with the version from Step 1.

```javascript
import {
  Application, Asset, AssetListLoader, Entity,
  FILLMODE_FILL_WINDOW, RESOLUTION_AUTO
} from 'playcanvas';

const CAMERA_CONTROLS_URL =
  'https://cdn.jsdelivr.net/npm/playcanvas@2.12.3/scripts/esm/camera-controls.mjs';
const ORBIT_SPEED = 8; // degrees per second

export function createViewer(hostElement) {
  const canvas = document.createElement('canvas');
  hostElement.appendChild(canvas);

  const app = new Application(canvas, {
    graphicsDeviceOptions: { antialias: false }
  });
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);
  app.start();
  window.addEventListener('resize', () => app.resizeCanvas());

  const camera = new Entity('camera');
  camera.addComponent('camera', { clearColor: [0.055, 0.059, 0.075, 1] });
  camera.setPosition(0, 0, 3);
  app.root.addChild(camera);

  let cameraReady = (async () => {
    const ccAsset = new Asset('camera-controls', 'script', { url: CAMERA_CONTROLS_URL });
    await new Promise(res => new AssetListLoader([ccAsset], app.assets).load(res));
    camera.addComponent('script');
    camera.script.create('cameraControls');
  })();

  let splatEntity = null;
  let autoOrbit = true;

  app.on('update', (dt) => {
    if (autoOrbit && splatEntity) splatEntity.rotate(0, ORBIT_SPEED * dt, 0);
  });

  // user interaction pauses auto-orbit
  for (const ev of ['pointerdown', 'wheel']) {
    canvas.addEventListener(ev, () => { autoOrbit = false; });
  }

  async function loadSplat(url, filename) {
    await cameraReady;
    const asset = new Asset('splat', 'gsplat', { url, filename });
    await new Promise((resolve, reject) => {
      asset.once('load', resolve);
      asset.once('error', reject);
      app.assets.add(asset);
      app.assets.load(asset);
    });
    if (splatEntity) splatEntity.destroy();
    splatEntity = new Entity('splat');
    splatEntity.addComponent('gsplat', { asset });
    // splats are commonly Z-up / inverted — adjust in the verify step
    splatEntity.setEulerAngles(0, 0, 180);
    app.root.addChild(splatEntity);
  }

  return {
    loadSplat,
    setAutoOrbit(on) { autoOrbit = on; },
    isAutoOrbit() { return autoOrbit; }
  };
}
```

- [ ] **Step 3: Create `js/app.js`**

```javascript
import { createViewer } from './viewer.js';

const DEMO_URL = 'assets/demo/scene.sog';

const viewer = createViewer(document.getElementById('canvas-host'));
viewer.loadSplat(DEMO_URL, 'scene.sog');
```

- [ ] **Step 4: Verify**

Run: `./serve.sh` and open `http://localhost:8123/`.
Expect: the church splat appears in the Hero stage. Left-drag orbits the camera, mouse-wheel zooms.
**Adjust if needed:** if the church is upside-down or sideways, change `splatEntity.setEulerAngles(0, 0, 180)` in `viewer.js` until it sits upright. If it is off-screen or too small/large, adjust `camera.setPosition(0, 0, 3)`. Re-verify until the church is upright and framed.

- [ ] **Step 5: Commit**

```bash
git add index.html js/viewer.js js/app.js
git commit -m "feat: render demo splat via PlayCanvas engine"
```

---

## Task 5: Auto-orbit toggle

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Wire the orbit toggle button in `app.js`**

Replace the contents of `js/app.js` with:

```javascript
import { createViewer } from './viewer.js';

const DEMO_URL = 'assets/demo/scene.sog';

const viewer = createViewer(document.getElementById('canvas-host'));
viewer.loadSplat(DEMO_URL, 'scene.sog');

const btnOrbit = document.getElementById('btn-orbit');

function syncOrbitButton() {
  const on = viewer.isAutoOrbit();
  btnOrbit.textContent = `Auto-Orbit: ${on ? 'an' : 'aus'}`;
  btnOrbit.setAttribute('aria-pressed', String(on));
}

btnOrbit.addEventListener('click', () => {
  viewer.setAutoOrbit(!viewer.isAutoOrbit());
  syncOrbitButton();
});

// the canvas pauses auto-orbit on interaction — keep the button label in sync
setInterval(syncOrbitButton, 500);
```

- [ ] **Step 2: Verify**

Run: `./serve.sh`, open the page.
Expect: the splat slowly rotates on load. Left-dragging the canvas stops the rotation and the button label flips to "Auto-Orbit: aus" within ~0.5 s. Clicking the button toggles rotation back on/off.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: auto-orbit toggle"
```

---

## Task 6: dropzone.js — drag-and-drop + file picker

**Files:**
- Create: `js/dropzone.js`

- [ ] **Step 1: Create `js/dropzone.js`**

```javascript
const ACCEPT = /\.(sog|ply)$/i;

export function initDropzone({ stage, hint, fileInput, openButton, onFile }) {
  function handleFile(file) {
    if (file && ACCEPT.test(file.name)) onFile(file);
    else onFile(null, file ? file.name : '');
  }

  ['dragenter', 'dragover'].forEach(ev =>
    stage.addEventListener(ev, (e) => {
      e.preventDefault();
      hint.hidden = false;
    }));

  ['dragleave', 'drop'].forEach(ev =>
    stage.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'dragleave' && stage.contains(e.relatedTarget)) return;
      hint.hidden = true;
    }));

  stage.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  });

  openButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
}
```

- [ ] **Step 2: Temporarily wire it for verification in `app.js`**

Append to `js/app.js`:

```javascript
import { initDropzone } from './dropzone.js';

initDropzone({
  stage: document.getElementById('stage'),
  hint: document.getElementById('drop-hint'),
  fileInput: document.getElementById('file-input'),
  openButton: document.getElementById('btn-load'),
  onFile: (file, badName) => console.log('dropzone:', file ?? `rejected: ${badName}`)
});
```

(The `import` statement must move to the top of the file with the other import. The real `onFile` handler is added in Task 7.)

- [ ] **Step 3: Verify**

Run: `./serve.sh`, open the page, open the browser console.
Expect: dragging any file over the stage shows the "Splat-Datei hier ablegen" overlay; dropping a `.ply`/`.sog` logs `dropzone: File {...}`; dropping a `.txt` logs `dropzone: rejected: ...`. Clicking "Eigenen Splat laden" opens the OS file picker; choosing a file logs the same way.

- [ ] **Step 4: Commit**

```bash
git add js/dropzone.js js/app.js
git commit -m "feat: drag-and-drop and file-picker input"
```

---

## Task 7: app.js wiring — load own file + reset

**Files:**
- Modify: `js/app.js`
- Modify: `js/viewer.js`

- [ ] **Step 1: Make `viewer.loadSplat` accept File objects**

In `js/viewer.js`, replace the `loadSplat` function with this version (accepts either a URL string or a `File`):

```javascript
  async function loadSplat(source, filename) {
    await cameraReady;
    let url = source;
    let name = filename;
    let revoke = null;
    if (source instanceof File) {
      url = URL.createObjectURL(source);
      name = source.name;
      revoke = url;
    }
    const asset = new Asset('splat', 'gsplat', { url, filename: name });
    try {
      await new Promise((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
        app.assets.add(asset);
        app.assets.load(asset);
      });
    } finally {
      if (revoke) URL.revokeObjectURL(revoke);
    }
    if (splatEntity) splatEntity.destroy();
    splatEntity = new Entity('splat');
    splatEntity.addComponent('gsplat', { asset });
    splatEntity.setEulerAngles(0, 0, 180);
    app.root.addChild(splatEntity);
  }
```

(Keep the `setEulerAngles` value you settled on in Task 4, Step 4.)

- [ ] **Step 2: Replace `js/app.js` with the full wired version**

```javascript
import { createViewer } from './viewer.js';
import { initDropzone } from './dropzone.js';

const DEMO_URL = 'assets/demo/scene.sog';

const viewer = createViewer(document.getElementById('canvas-host'));
viewer.loadSplat(DEMO_URL, 'scene.sog');

const btnOrbit = document.getElementById('btn-orbit');
const btnReset = document.getElementById('btn-reset');

function syncOrbitButton() {
  const on = viewer.isAutoOrbit();
  btnOrbit.textContent = `Auto-Orbit: ${on ? 'an' : 'aus'}`;
  btnOrbit.setAttribute('aria-pressed', String(on));
}
btnOrbit.addEventListener('click', () => {
  viewer.setAutoOrbit(!viewer.isAutoOrbit());
  syncOrbitButton();
});
setInterval(syncOrbitButton, 500);

btnReset.addEventListener('click', () => {
  viewer.loadSplat(DEMO_URL, 'scene.sog');
  viewer.setAutoOrbit(true);
  syncOrbitButton();
});

initDropzone({
  stage: document.getElementById('stage'),
  hint: document.getElementById('drop-hint'),
  fileInput: document.getElementById('file-input'),
  openButton: document.getElementById('btn-load'),
  onFile: (file) => {
    if (file) viewer.loadSplat(file);
  }
});
```

- [ ] **Step 3: Verify**

Run: `./serve.sh`, open the page.
Expect: the demo church loads. Drag a different `.ply`/`.sog` (e.g. `~/Documents/temp/2026-05-17_scenery/scene.ply`) onto the stage → it replaces the church. Click "Demo zurücksetzen" → the church returns and auto-orbit resumes.

- [ ] **Step 4: Commit**

```bash
git add js/viewer.js js/app.js
git commit -m "feat: load user splats and reset to demo"
```

---

## Task 8: Static assets — og-image + PWA icons

**Files:**
- Create: `assets/og-image.jpg`
- Create: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`

- [ ] **Step 1: Capture the og-image**

Run `./serve.sh`, open the page, let the church render and orbit to a flattering angle, pause auto-orbit. Capture the stage region to `assets/og-image.jpg`:

```bash
# macOS interactive region capture (PNG), then convert to JP) :
screencapture -i -t jpg /Users/Shared/code/autosplat-viewer/assets/og-image.jpg
```

Target roughly 1200×630 (the standard OG ratio). If the capture is a different size, crop/resize with `sips`:

```bash
sips -z 630 1200 assets/og-image.jpg
```

This image is a placeholder-quality screenshot; Johannes may replace it later with a nicer frame — that does not block the plan.

- [ ] **Step 2: Generate PWA icons**

Create a 512×512 icon from a centered crop of the og-image (or a flat-color tile if the crop is unclear):

```bash
sips -c 512 512 assets/og-image.jpg --out icons/icon-512.png
sips -z 192 192 icons/icon-512.png --out icons/icon-192.png
cp icons/icon-512.png icons/icon-maskable-512.png
```

The maskable icon should have safe padding; if the cropped image touches the edges, that is acceptable for v1 — Johannes can refine icons later.

- [ ] **Step 3: Verify**

Run: `ls -lh assets/og-image.jpg icons/`
Expect: `og-image.jpg` (~50–300 KB) and three PNG icons (192, 512, maskable-512) all present and non-empty. Open `og-image.jpg` in Preview to confirm it shows the church splat.

- [ ] **Step 4: Commit**

```bash
git add assets/og-image.jpg icons/
git commit -m "feat: add og-image and PWA icons"
```

---

## Task 9: Error handling

**Files:**
- Modify: `js/viewer.js`
- Modify: `js/app.js`
- Modify: `index.html`

- [ ] **Step 1: Add a WebGL2 guard + error helpers to `viewer.js`**

At the top of `createViewer`, before creating the `Application`, add the WebGL2 check. If it fails, render the fallback and return a no-op viewer:

```javascript
export function createViewer(hostElement) {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    hostElement.innerHTML =
      '<img src="assets/og-image.jpg" alt="Gaussian Splat" ' +
      'style="width:100%;height:100%;object-fit:cover">' +
      '<p style="position:absolute;left:0;right:0;bottom:0;margin:0;' +
      'padding:0.8rem;text-align:center;background:rgba(14,15,19,0.85)">' +
      'Dein Browser unterstützt kein WebGL2 — hier ein Standbild.</p>';
    return {
      loadSplat: () => {}, setAutoOrbit: () => {}, isAutoOrbit: () => false,
      unsupported: true
    };
  }
  // ...existing canvas + Application setup follows
```

Ensure the rest of the existing `createViewer` body stays after this block, and the existing `return { loadSplat, setAutoOrbit, isAutoOrbit }` gains `unsupported: false`.

- [ ] **Step 2: Make `loadSplat` report load failures**

In `viewer.js`, change `loadSplat` so a failed load does **not** destroy the current splat and instead rethrows. The `await new Promise(...)` already rejects on `asset.once('error', reject)`; wrap the whole body so the entity swap only happens on success — it already does, because the throw happens before `splatEntity.destroy()`. Add a leading guard and re-throw:

```javascript
  async function loadSplat(source, filename) {
    await cameraReady;
    let url = source, name = filename, revoke = null;
    if (source instanceof File) {
      url = URL.createObjectURL(source);
      name = source.name;
      revoke = url;
    }
    const asset = new Asset('splat', 'gsplat', { url, filename: name });
    try {
      await new Promise((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
        app.assets.add(asset);
        app.assets.load(asset);
      });
    } catch (err) {
      if (revoke) URL.revokeObjectURL(revoke);
      asset.unload();
      throw new Error('splat-load-failed');
    }
    if (revoke) URL.revokeObjectURL(revoke);
    if (splatEntity) splatEntity.destroy();
    splatEntity = new Entity('splat');
    splatEntity.addComponent('gsplat', { asset });
    splatEntity.setEulerAngles(0, 0, 180);
    app.root.addChild(splatEntity);
  }
```

- [ ] **Step 2b: Add a loading spinner element to `index.html`**

Inside `<section id="stage">`, after the `viewer-error` div, add:

```html
      <div id="viewer-spinner" hidden>Lädt…</div>
```

And in `css/style.css` append:

```css
#viewer-spinner { position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%); background: var(--panel);
  padding: 0.6rem 1.2rem; border-radius: 7px; color: var(--fg); }
```

- [ ] **Step 3: Handle errors + spinner in `app.js`**

Replace the `initDropzone` call and add a `load` helper. The full new `app.js`:

```javascript
import { createViewer } from './viewer.js';
import { initDropzone } from './dropzone.js';

const DEMO_URL = 'assets/demo/scene.sog';

const errorBox = document.getElementById('viewer-error');
const spinner = document.getElementById('viewer-spinner');
const viewer = createViewer(document.getElementById('canvas-host'));

const btnOrbit = document.getElementById('btn-orbit');
const btnReset = document.getElementById('btn-reset');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
  setTimeout(() => { errorBox.hidden = true; }, 5000);
}

async function load(source, filename) {
  if (viewer.unsupported) return;
  errorBox.hidden = true;
  spinner.hidden = false;
  try {
    await viewer.loadSplat(source, filename);
  } catch {
    showError('Konnte die Datei nicht laden — unterstützt: .sog, .ply');
  } finally {
    spinner.hidden = true;
  }
}

function syncOrbitButton() {
  const on = viewer.isAutoOrbit();
  btnOrbit.textContent = `Auto-Orbit: ${on ? 'an' : 'aus'}`;
  btnOrbit.setAttribute('aria-pressed', String(on));
}

btnOrbit.addEventListener('click', () => {
  viewer.setAutoOrbit(!viewer.isAutoOrbit());
  syncOrbitButton();
});
setInterval(syncOrbitButton, 500);

btnReset.addEventListener('click', async () => {
  await load(DEMO_URL, 'scene.sog');
  viewer.setAutoOrbit(true);
  syncOrbitButton();
});

initDropzone({
  stage: document.getElementById('stage'),
  hint: document.getElementById('drop-hint'),
  fileInput: document.getElementById('file-input'),
  openButton: document.getElementById('btn-load'),
  onFile: (file, badName) => {
    if (file) load(file);
    else showError(`Nicht unterstützt: ${badName} — erlaubt sind .sog und .ply`);
  }
});

load(DEMO_URL, 'scene.sog');
```

- [ ] **Step 4: Verify**

Run: `./serve.sh`, open the page.
Expect: (a) demo loads normally, spinner flashes briefly during load; (b) dropping a `.txt` shows the red "Nicht unterstützt" message which disappears after 5 s; (c) dropping a renamed/corrupt `.ply` shows "Konnte die Datei nicht laden" and the previous splat stays visible. To check the WebGL2 fallback: in Safari, disable WebGL (Develop ▸ Experimental Features) or temporarily change the guard to `if (true)` — expect the og-image + "kein WebGL2" notice. Revert the guard after checking.

- [ ] **Step 5: Commit**

```bash
git add js/viewer.js js/app.js index.html css/style.css
git commit -m "feat: error handling — WebGL2 fallback, load errors, spinner"
```

---

## Task 10: PWA — manifest + service worker

**Files:**
- Create: `manifest.webmanifest`
- Create: `service-worker.js`
- Modify: `index.html`

- [ ] **Step 1: Create `manifest.webmanifest`**

```json
{
  "name": "autosplat viewer",
  "short_name": "autosplat",
  "description": "3D Gaussian Splats im Browser ansehen",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#0e0f13",
  "theme_color": "#0e0f13",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512",
      "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Create `service-worker.js`**

```javascript
const SHELL = 'autosplat-shell-v1';
const RUNTIME = 'autosplat-runtime-v1';
const SHELL_FILES = [
  './', './index.html', './css/style.css',
  './js/app.js', './js/viewer.js', './js/dropzone.js',
  './manifest.webmanifest', './assets/og-image.jpg',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME)
      .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // app shell: cache-first
  e.respondWith((async () => {
    const shellHit = await caches.match(req, { ignoreSearch: true });
    if (shellHit) return shellHit;

    // runtime cache: CDN engine + demo splat — stale-while-revalidate
    const cached = await caches.open(RUNTIME).then(c => c.match(req));
    const network = fetch(req).then(async (res) => {
      if (res.ok) {
        const cache = await caches.open(RUNTIME);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
```

- [ ] **Step 3: Register the SW and add meta tags in `index.html`**

In `<head>`, after the `<meta name="description">` line, add:

```html
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#0e0f13">
  <meta property="og:title" content="autosplat viewer">
  <meta property="og:description" content="3D Gaussian Splats im Browser ansehen">
  <meta property="og:image" content="assets/og-image.jpg">
  <meta property="og:type" content="website">
```

At the end of `<body>`, after the `app.js` script tag, add:

```html
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () =>
        navigator.serviceWorker.register('service-worker.js'));
    }
  </script>
```

- [ ] **Step 4: Verify**

Run: `./serve.sh`, open `http://localhost:8123/` in Chrome.
Expect: DevTools ▸ Application ▸ Service Workers shows `service-worker.js` activated; ▸ Manifest shows "autosplat viewer" with icons and no errors; the install icon appears in the address bar. Reload with DevTools ▸ Network ▸ Offline checked — the page shell still loads (the splat shows the offline hint only if not yet runtime-cached; after one online view it stays cached).

- [ ] **Step 5: Commit**

```bash
git add manifest.webmanifest service-worker.js index.html
git commit -m "feat: PWA — manifest and service worker"
```

---

## Task 11: README finalize + deploy prep

**Files:**
- Modify: `README.md`
- Verify: all paths in `index.html` are relative

- [ ] **Step 1: Confirm all asset paths are relative**

Run: `grep -nE '(src|href)="/' index.html`
Expect: **no output**. Any match means an absolute path that breaks under the `/autosplat-viewer/` sub-path on Codeberg Pages — fix it to a relative path (drop the leading `/`).

- [ ] **Step 2: Expand `README.md`**

```markdown
# autosplat-viewer

Static viewer PWA for 3D Gaussian Splats — a showcase for the
[autosplat](https://codeberg.org/jkaindl/video-to-3d-gaussian-splat)
pipeline and a general-purpose splat viewer.

Renders `.sog` and `.ply` splats in the browser via the PlayCanvas
Engine. No build step, no server, no upload — drag a splat onto the
page and it renders locally.

## Local development

```bash
./serve.sh        # → http://localhost:8123/
```

A real http origin is required (Service Workers do not run on `file://`).

## Deployment — Codeberg Pages

Codeberg serves this repo's `main` branch at
`https://jkaindl.codeberg.page/autosplat-viewer/`. The site is fully
static; pushing to `main` updates the live site. All paths are
relative so the site works under the `/autosplat-viewer/` sub-path.

## Tech

Vanilla HTML/CSS/JS, no build step. PlayCanvas Engine via CDN/ESM.
PWA (installable, offline app-shell).

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
```

- [ ] **Step 3: Verify**

Run: `./serve.sh`, open the page, do a final pass — demo loads and orbits, load a custom file, reset, toggle orbit, no console errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: finalize README with deployment notes"
```

---

## Handover: Codeberg repository + Pages

These steps need Johannes (external service account — not automatable by Claude):

1. Create an empty repository `autosplat-viewer` on Codeberg.
2. Add the remote and push:
   ```bash
   git remote add origin https://codeberg.org/jkaindl/autosplat-viewer.git
   git push -u origin main
   ```
3. In Codeberg repo settings, confirm Pages is serving the `main` branch.
4. Open `https://jkaindl.codeberg.page/autosplat-viewer/` and do the final smoke test (demo loads, drag-and-drop works, installable).

---

## Self-Review

**Spec coverage:**
- §3 Architecture (static, PlayCanvas CDN, no build) → Tasks 2, 4. ✓
- §4 Repo structure → Tasks 1–11 create every listed file. ✓
- §5 Layout A (Hero, autosplat section, footer) → Task 2. ✓
- §6 Viewer behavior (auto-load, auto-orbit, drag-and-drop, reset) → Tasks 4–7. ✓
- §7 Data flow (ArrayBuffer/object-URL, no upload) → Task 7 Step 1 (`URL.createObjectURL`). ✓
- §8 Error handling (WebGL2 fallback, bad file, spinner) → Task 9. ✓
- §9 PWA (manifest, SW, shell precache, demo lazy-cached) → Task 10. ✓
- §10 Deploy (Codeberg Pages, relative paths) → Task 11 + Handover. ✓
- §11 Testing (serve.sh, manual smoke) → every task's verify step. ✓
- §12 Assets (scene.sog copy, og-image, icons, version pin) → Tasks 3, 8, 4 Step 1. ✓

**Placeholder scan:** `@VERSION` in Task 2 is intentional and resolved by an explicit command in Task 4 Step 1 (`npm view playcanvas version`). The `2.12.3` literals in Task 4 are example values the engineer replaces with that command's output. No unresolved placeholders.

**Type consistency:** `createViewer()` returns `{ loadSplat, setAutoOrbit, isAutoOrbit, unsupported }` — used consistently in `app.js` across Tasks 4, 5, 7, 9. `initDropzone({ stage, hint, fileInput, openButton, onFile })` — same shape in Tasks 6 and 9. `loadSplat(source, filename)` signature stable from Task 4 onward.
