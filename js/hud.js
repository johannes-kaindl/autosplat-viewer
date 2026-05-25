// hud.js — DOM overlays for walking-mode: entry CTA + in-walk HUD
// (crosshair, mode pill, exit button, controls hint). Pure DOM, no
// PlayCanvas dependency. Caller injects the stage element and wires
// callbacks; HUD owns its own timers and class toggling.

const CTA_VISIBLE_MS = 4000;    // CTA auto-fades after this idle
const CTA_FADE_MS = 500;
const HINT_VISIBLE_MS = 4000;   // controls-hint dims after this
const EYE_OVERLAY_MS = 1200;

export class HUD {
  constructor(stage) {
    this.stage = stage;
    this.cta = stage.querySelector('#cta-walk');
    this.overlay = stage.querySelector('#walk-hud');
    this.modeInd = stage.querySelector('#walk-mode-indicator');
    this.exitBtn = stage.querySelector('#walk-exit');
    this.hint = stage.querySelector('#walk-controls-hint');
    this.eyeText = stage.querySelector('#walk-eye-overlay');
    this.stageControls = stage.querySelector('#stage-controls');
    this.heroOverlay = stage.querySelector('#hero-overlay');

    this._ctaTimer = null;
    this._ctaClick = null;
    this._hintTimer = null;
    this._eyeTimer = null;
    this._exitCallback = null;

    this.exitBtn?.addEventListener('click', () => this._exitCallback?.());
  }

  // ---------- CTA (entry point to walking mode) ----------

  showCTA(onClick) {
    if (!this.cta) return;
    this._ctaClick = () => {
      onClick?.();
      this.hideCTA();
    };
    this.cta.hidden = false;
    // force reflow so the transition triggers cleanly
    void this.cta.offsetWidth;
    this.cta.classList.add('is-visible');
    this.cta.addEventListener('click', this._ctaClick, { once: true });
    clearTimeout(this._ctaTimer);
    this._ctaTimer = setTimeout(() => this.hideCTA(), CTA_VISIBLE_MS);
  }

  hideCTA() {
    if (!this.cta) return;
    clearTimeout(this._ctaTimer);
    this._ctaTimer = null;
    this.cta.classList.remove('is-visible');
    if (this._ctaClick) {
      this.cta.removeEventListener('click', this._ctaClick);
      this._ctaClick = null;
    }
    setTimeout(() => {
      if (!this.cta.classList.contains('is-visible')) this.cta.hidden = true;
    }, CTA_FADE_MS);
  }

  isCTAVisible() {
    return this.cta && !this.cta.hidden;
  }

  // ---------- In-walk overlay ----------

  enterWalkingUI({ mode = 'walk', onExit } = {}) {
    this._exitCallback = onExit ?? null;
    this.hideCTA();
    if (this.stageControls) this.stageControls.hidden = true;
    if (this.heroOverlay) this.heroOverlay.hidden = true;
    if (this.overlay) this.overlay.hidden = false;
    this.setMode(mode);
    this.showHint();
  }

  exitWalkingUI() {
    if (this.overlay) this.overlay.hidden = true;
    if (this.stageControls) this.stageControls.hidden = false;
    if (this.heroOverlay) this.heroOverlay.hidden = false;
    this._exitCallback = null;
    clearTimeout(this._hintTimer);
    clearTimeout(this._eyeTimer);
  }

  setMode(mode) {
    if (!this.modeInd) return;
    this.modeInd.textContent = mode === 'fly' ? '✈ Fly' : '🚶 Walk';
    this.modeInd.dataset.mode = mode;
  }

  showHint() {
    if (!this.hint) return;
    this.hint.classList.remove('is-dim');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hint.classList.add('is-dim'),
                                 HINT_VISIBLE_MS);
  }

  setEyeHeight(value) {
    if (!this.eyeText) return;
    this.eyeText.textContent = `Eye height: ${value.toFixed(2)}`;
    this.eyeText.classList.add('is-visible');
    clearTimeout(this._eyeTimer);
    this._eyeTimer = setTimeout(() => this.eyeText.classList.remove('is-visible'),
                                EYE_OVERLAY_MS);
  }
}
