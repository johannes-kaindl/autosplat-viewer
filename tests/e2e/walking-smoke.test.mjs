// End-to-end smoke for walking-mode: drives the page with puppeteer-core
// + the system Chrome. We focus on DOM lifecycle (CTA → HUD → exit)
// which doesn't need WebGL2 — visual fidelity of the rendered splat is
// verified manually with ./serve.sh on a real browser.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8127;
const URL_BASE = `http://localhost:${PORT}`;

let server = null;
let browser = null;

before(async () => {
  server = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // wait until the port is responsive
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(URL_BASE + '/');
      if (r.ok) break;
    } catch { /* still booting */ }
    await wait(100);
  }
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-features=Translate', '--hide-scrollbars'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) { server.kill(); await wait(200); }
});

test('viewer page: loads, exposes walking DOM elements (all hidden initially)', async () => {
  const page = await browser.newPage();
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  const present = await page.evaluate(() => ({
    cta: !!document.getElementById('cta-walk'),
    hud: !!document.getElementById('walk-hud'),
    crosshair: !!document.getElementById('walk-crosshair'),
    exit: !!document.getElementById('walk-exit'),
    mode: !!document.getElementById('walk-mode-indicator'),
    hint: !!document.getElementById('walk-controls-hint'),
    ctaHidden: document.getElementById('cta-walk').hidden,
    hudHidden: document.getElementById('walk-hud').hidden,
  }));
  assert.equal(present.cta, true);
  assert.equal(present.hud, true);
  assert.equal(present.crosshair, true);
  assert.equal(present.exit, true);
  assert.equal(present.mode, true);
  assert.equal(present.hint, true);
  assert.equal(present.ctaHidden, true, 'CTA hidden before splat loads');
  assert.equal(present.hudHidden, true, 'HUD hidden before walking enters');
  await page.close();
});

test('HUD preview page: CTA visible, HUD overlay shown for visual smoke', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE + '/tests/visual/hud-preview.html',
                  { waitUntil: 'domcontentloaded' });
  const state = await page.evaluate(() => ({
    ctaVisible: document.getElementById('cta-walk').classList.contains('is-visible'),
    ctaText: document.getElementById('cta-walk').textContent.trim(),
    hudHidden: document.getElementById('walk-hud').hidden,
    mode: document.getElementById('walk-mode-indicator').textContent.trim(),
    hint: document.getElementById('walk-controls-hint').textContent.trim(),
  }));
  assert.equal(state.ctaVisible, true);
  assert.match(state.ctaText, /Walk through this scene/);
  assert.equal(state.hudHidden, false);
  assert.match(state.mode, /Walk/);
  assert.match(state.hint, /WASD/);
  assert.deepEqual(errors, [], `unexpected JS errors: ${errors.join(', ')}`);
  await page.close();
});

test('HUD lifecycle: showCTA → click → onClick fires → CTA hides', async () => {
  const page = await browser.newPage();
  // Use the isolated fixture so app.js / viewer auto-load don't race the test.
  await page.goto(URL_BASE + '/tests/visual/hud-isolated.html',
                  { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { HUD } = await import('/js/hud.js');
    const stage = document.getElementById('stage');
    const hud = new HUD(stage);
    let clicked = false;
    hud.showCTA(() => { clicked = true; });
    const ctaVisibleAfterShow = !document.getElementById('cta-walk').hidden;
    document.getElementById('cta-walk').click();
    // wait longer than CTA_FADE_MS (500) so the hide setTimeout has fired
    await new Promise(r => setTimeout(r, 900));
    const cta = document.getElementById('cta-walk');
    return {
      ctaVisibleAfterShow, clicked,
      ctaHiddenAfterClick: cta.hidden,
      ctaClassList: cta.className,
    };
  });
  assert.equal(result.ctaVisibleAfterShow, true,
               'CTA visible right after showCTA()');
  assert.equal(result.clicked, true, 'onClick callback fired');
  assert.equal(result.ctaHiddenAfterClick, true,
               `CTA hidden after click+fade (classList="${result.ctaClassList}")`);
  await page.close();
});

test('HUD lifecycle: enterWalkingUI shows overlay, exit-button fires callback', async () => {
  const page = await browser.newPage();
  await page.goto(URL_BASE + '/tests/visual/hud-isolated.html',
                  { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { HUD } = await import('/js/hud.js');
    const stage = document.getElementById('stage');
    const hud = new HUD(stage);
    let exitFired = false;
    hud.enterWalkingUI({ onExit: () => { exitFired = true; } });
    const hudShown = !document.getElementById('walk-hud').hidden;
    const stageControlsHidden = document.getElementById('stage-controls').hidden;
    document.getElementById('walk-exit').click();
    hud.exitWalkingUI();
    const hudHiddenAfter = document.getElementById('walk-hud').hidden;
    return { hudShown, stageControlsHidden, exitFired, hudHiddenAfter };
  });
  assert.equal(result.hudShown, true, 'walk-hud visible after enterWalkingUI');
  assert.equal(result.stageControlsHidden, true, 'stage-controls hidden in walking mode');
  assert.equal(result.exitFired, true, 'exit button callback fired');
  assert.equal(result.hudHiddenAfter, true, 'walk-hud hidden after exitWalkingUI');
  await page.close();
});
