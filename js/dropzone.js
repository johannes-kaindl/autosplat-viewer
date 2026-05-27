// Dropzone for files dropped onto the viewer.
// - .ply: splat file (PlayCanvas SOG loader can't read blob: URLs, so user
//   uploads are limited to .ply; the bundled demo is SOG over http).
// - .collision.json: collision-mesh sidecar — routed to onSidecar handler.

const PLY = /\.ply$/i;
const SIDECAR = /\.collision\.json$/i;

export function initDropzone({ stage, hint, fileInput, openButton, onFile, onSidecar }) {
  async function handleFile(file) {
    if (!file) { onFile(null, ''); return; }
    if (SIDECAR.test(file.name)) {
      if (onSidecar) {
        const text = await file.text();
        onSidecar(text);
      }
      return;
    }
    if (PLY.test(file.name)) { onFile(file); return; }
    onFile(null, file.name);
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
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  openButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
}
