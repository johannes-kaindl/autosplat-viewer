// End-to-end smoke for the collision editor: DOM presence + HUD lifecycle.
// Mirrors walking-smoke.test.mjs — uses puppeteer-core + system Chrome
// against a python http.server. Does not exercise the WebGL pipeline; the
// build/brush/export round-trip is verified manually with ./serve.sh.

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
const PORT = 8128;
const URL_BASE = `http://localhost:${PORT}`;

let server = null;
let browser = null;

before(async () => {
  server = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(URL_BASE + '/'); if (r.ok) break; }
    catch { /* still booting */ }
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

test('collision editor: DOM elements present + hidden initially', async () => {
  const page = await browser.newPage();
  await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' });
  const present = await page.evaluate(() => ({
    btn: !!document.getElementById('btn-collision'),
    toolbar: !!document.getElementById('collision-toolbar'),
    build: !!document.getElementById('coll-build'),
    iso: !!document.getElementById('coll-iso'),
    brush: !!document.getElementById('coll-brush'),
    undo: !!document.getElementById('coll-undo'),
    exportObj: !!document.getElementById('coll-export-obj'),
    save: !!document.getElementById('coll-save'),
    status: !!document.getElementById('coll-status'),
    toolbarHidden: document.getElementById('collision-toolbar').hidden,
    toolRadios: document.querySelectorAll('input[name="coll-tool"]').length,
  }));
  for (const [k, v] of Object.entries(present)) {
    if (k === 'toolbarHidden') {
      assert.equal(v, true, 'toolbar hidden before button click');
    } else if (k === 'toolRadios') {
      assert.equal(v, 3, 'three tool radios (view/add/remove)');
    } else {
      assert.equal(v, true, `${k} present`);
    }
  }
  await page.close();
});

test('collision editor: HUD enterCollisionUI shows toolbar; wiring fires callbacks', async () => {
  const page = await browser.newPage();
  await page.goto(URL_BASE + '/tests/visual/hud-isolated.html',
                  { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { HUD } = await import('/js/hud.js');
    const stage = document.getElementById('stage');
    const hud = new HUD(stage);
    let buildFired = false, undoFired = false, isoValue = null, toolValue = null;
    hud.enterCollisionUI({
      onBuild: () => { buildFired = true; },
      onUndo:  () => { undoFired = true; },
      onIsoChange: (v) => { isoValue = v; },
      onToolChange: (v) => { toolValue = v; },
    });
    const shown = !document.getElementById('collision-toolbar').hidden;
    document.getElementById('coll-build').click();
    document.getElementById('coll-undo').click();
    const isoSlider = document.getElementById('coll-iso');
    isoSlider.value = '2.7';
    isoSlider.dispatchEvent(new Event('input', { bubbles: true }));
    const addRadio = document.querySelector('input[name="coll-tool"][value="add"]');
    addRadio.checked = true;
    addRadio.dispatchEvent(new Event('change', { bubbles: true }));
    hud.setCollisionStatus('42 tris · iso 2.70');
    const statusText = document.getElementById('coll-status').textContent;
    const toolNow = hud.getCollisionTool();
    const brushNow = hud.getCollisionBrushSize();
    hud.exitCollisionUI();
    const hidden = document.getElementById('collision-toolbar').hidden;
    return { shown, buildFired, undoFired, isoValue, toolValue, statusText, toolNow, brushNow, hidden };
  });
  assert.equal(result.shown, true, 'toolbar visible after enterCollisionUI');
  assert.equal(result.buildFired, true, 'build callback fires on click');
  assert.equal(result.undoFired, true, 'undo callback fires on click');
  assert.ok(Math.abs(result.isoValue - 2.7) < 1e-6, `iso=${result.isoValue}`);
  assert.equal(result.toolValue, 'add', 'tool callback fires with new value');
  assert.match(result.statusText, /42 tris/);
  assert.equal(result.toolNow, 'add');
  assert.ok(typeof result.brushNow === 'number');
  assert.equal(result.hidden, true, 'toolbar hidden after exitCollisionUI');
  await page.close();
});
