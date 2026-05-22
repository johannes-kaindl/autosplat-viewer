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
    showError('Konnte die Datei nicht laden — unterstützt: .ply');
  } finally {
    spinner.hidden = true;
  }
}

function syncOrbitButton() {
  const on = viewer.isAutoOrbit();
  btnOrbit.textContent = on ? '⏸ Auto-Orbit' : '▶ Auto-Orbit';
  btnOrbit.setAttribute('aria-pressed', String(on));
  btnOrbit.setAttribute('aria-label', on ? 'Auto-Orbit pausieren' : 'Auto-Orbit starten');
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

const stage = document.getElementById('stage');
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
    else showError(`Nicht unterstützt: ${badName} — erlaubt ist .ply`);
  }
});

load(DEMO_URL, 'scene.sog');
