import { createViewer } from './viewer.js';
import { initDropzone } from './dropzone.js';
import { HUD } from './hud.js';
import { KeyboardInput } from './controls.js';

const DEMO_URL = 'assets/demo/scene.sog';

const errorBox = document.getElementById('viewer-error');
const spinner = document.getElementById('viewer-spinner');
const stage = document.getElementById('stage');
const viewer = createViewer(document.getElementById('canvas-host'));
const hud = new HUD(stage);

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
    showError('Could not load the file — supported format: .ply');
  } finally {
    spinner.hidden = true;
  }
}

function syncOrbitButton() {
  const on = viewer.isAutoOrbit();
  btnOrbit.textContent = on ? '⏸ Auto-orbit' : '▶ Auto-orbit';
  btnOrbit.setAttribute('aria-pressed', String(on));
  btnOrbit.setAttribute('aria-label', on ? 'Pause auto-orbit' : 'Start auto-orbit');
}

btnOrbit.addEventListener('click', () => {
  viewer.setAutoOrbit(!viewer.isAutoOrbit());
  syncOrbitButton();
});
setInterval(syncOrbitButton, 500);

btnReset.addEventListener('click', async () => {
  await load(DEMO_URL, 'scene.sog');
  syncOrbitButton();
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const result = (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
    if (result && result.catch) result.catch(() => {});
  }
});

initDropzone({
  stage: document.getElementById('stage'),
  hint: document.getElementById('drop-hint'),
  fileInput: document.getElementById('file-input'),
  openButton: document.getElementById('btn-load'),
  onFile: (file, badName) => {
    if (file) load(file);
    else showError(`Unsupported: ${badName} — only .ply is allowed`);
  }
});

// ---------- Walking-mode wiring (slice 4) ----------

const input = new KeyboardInput();

viewer.onWalkingEnter?.(() => {
  hud.enterWalkingUI({ onExit: () => viewer.exitWalking?.(input) });
});

viewer.onWalkingExit?.(() => {
  hud.exitWalkingUI();
  syncOrbitButton();
});

viewer.onLoad?.(() => {
  hud.showCTA(async () => {
    try {
      await viewer.enterWalking?.(input);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[walking] enter failed:', err);
      showError('Could not enter walking mode — splat data unavailable');
    }
  });
});

load(DEMO_URL, 'scene.sog');
