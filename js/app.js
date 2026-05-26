import { createViewer } from './viewer.js';
import { initDropzone } from './dropzone.js';
import { HUD } from './hud.js';
import { KeyboardInput, TouchInput, CompositeInput } from './controls.js';

const DEMO_URL = 'assets/demo/scene.sog';
const PREFERS_REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

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
    // Honour the OS-level reduced-motion preference: each fresh load
    // resets autoOrbit to true inside the viewer; turn it back off
    // for users who don't want spontaneous motion.
    if (PREFERS_REDUCED_MOTION.matches) viewer.setAutoOrbit(false);
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
  const enter = stage.requestFullscreen || stage.webkitRequestFullscreen;
  const exit  = document.exitFullscreen  || document.webkitExitFullscreen;
  const fsEl  = document.fullscreenElement || document.webkitFullscreenElement;

  // iOS Safari on iPhone exposes no Fullscreen API for non-<video> elements.
  if (!enter) {
    document.body.classList.toggle('fs-fallback');
    window.dispatchEvent(new Event('resize'));
    return;
  }

  if (fsEl) {
    exit.call(document);
  } else {
    const result = enter.call(stage);
    if (result && result.catch) result.catch(() => {
      document.body.classList.add('fs-fallback');
      window.dispatchEvent(new Event('resize'));
    });
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

// ---------- Walking-mode wiring (slices 4–6) ----------

const keyboard = new KeyboardInput();
const touch = new TouchInput();
const input = new CompositeInput(keyboard, touch);

// Touch is attached/detached separately from keyboard because it binds
// to DOM elements that only matter inside walking-mode.
function attachInputs() {
  keyboard.attach(window);
  touch.attach({
    root: document.getElementById('canvas-host'),
    jumpBtn: document.getElementById('walk-btn-jump'),
    flyBtn: document.getElementById('walk-btn-fly'),
    exitBtn: document.getElementById('walk-exit'),
  });
}
function detachInputs() {
  keyboard.detach();
  touch.detach();
}

viewer.onWalkingEnter?.(() => {
  attachInputs();
  hud.enterWalkingUI({ onExit: () => viewer.exitWalking?.(input) });
});

viewer.onWalkingExit?.(() => {
  detachInputs();
  hud.exitWalkingUI();
  syncOrbitButton();
});

viewer.onWalkingModeChange?.((mode) => {
  hud.setMode(mode);
  hud.showHint();
});

viewer.onWalkingEyeChange?.((value) => {
  hud.setEyeHeight(value);
});

viewer.onLoad?.(() => {
  hud.showCTA(async () => {
    try {
      await viewer.enterWalking?.(input);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[walking] enter failed:', err);
      const msg = err?.message === 'heightmap-build-failed'
        ? 'Splat has no usable geometry for walking-mode.'
        : 'Could not enter walking mode.';
      showError(msg);
    }
  });
});

// Re-acquire pointer-lock if it's lost while still in walking-mode (clicking
// outside the canvas, alt-tab, etc.). The click itself is the user gesture
// the browser needs to grant the lock again.
document.getElementById('canvas-host')?.addEventListener('click', () => {
  if (viewer.isWalking?.() &&
      document.pointerLockElement !== document.querySelector('#canvas-host canvas')) {
    document.querySelector('#canvas-host canvas')?.requestPointerLock?.();
  }
});

load(DEMO_URL, 'scene.sog');
