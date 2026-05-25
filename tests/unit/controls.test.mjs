import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardInput } from '../../js/controls.js';

// Minimal EventTarget shim so the input class can attach/detach without a DOM.
class FakeTarget {
  constructor() { this.l = new Map(); }
  addEventListener(type, fn) {
    if (!this.l.has(type)) this.l.set(type, new Set());
    this.l.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.l.get(type)?.delete(fn);
  }
  dispatch(type, event) {
    for (const fn of (this.l.get(type) ?? [])) fn(event);
  }
  listenerCount(type) {
    return this.l.get(type)?.size ?? 0;
  }
}

function key(code) { return { code, preventDefault: () => {} }; }

test('KeyboardInput: initial state is all zero/false', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  const s = input.read();
  assert.equal(s.forward, 0);
  assert.equal(s.right, 0);
  assert.equal(s.vertical, 0);
  assert.equal(s.sprint, false);
  assert.equal(s.jump, false);
  assert.equal(s.fly, false);
  assert.equal(s.exit, false);
  assert.equal(s.lookDeltaX, 0);
  assert.equal(s.lookDeltaY, 0);
});

test('KeyboardInput: W → forward=1, S → forward=-1, W+S → 0', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);

  t.dispatch('keydown', key('KeyW'));
  assert.equal(input.read().forward, 1);

  t.dispatch('keyup', key('KeyW'));
  t.dispatch('keydown', key('KeyS'));
  assert.equal(input.read().forward, -1);

  t.dispatch('keydown', key('KeyW'));
  assert.equal(input.read().forward, 0);  // both held → cancel
});

test('KeyboardInput: D/A and Arrow keys map to right axis', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);

  t.dispatch('keydown', key('KeyD'));
  assert.equal(input.read().right, 1);
  t.dispatch('keyup', key('KeyD'));

  t.dispatch('keydown', key('ArrowLeft'));
  assert.equal(input.read().right, -1);
  t.dispatch('keyup', key('ArrowLeft'));

  t.dispatch('keydown', key('ArrowUp'));
  assert.equal(input.read().forward, 1);
});

test('KeyboardInput: Q/E map to vertical (fly-mode up/down)', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('KeyE'));
  assert.equal(input.read().vertical, 1);
  t.dispatch('keyup', key('KeyE'));
  t.dispatch('keydown', key('KeyQ'));
  assert.equal(input.read().vertical, -1);
});

test('KeyboardInput: Shift held → sprint=true (continuous)', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('ShiftLeft'));
  assert.equal(input.read().sprint, true);
  assert.equal(input.read().sprint, true);  // still held — still true
  t.dispatch('keyup', key('ShiftLeft'));
  assert.equal(input.read().sprint, false);
});

test('KeyboardInput: Space → jump=true once, then consumed', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('Space'));
  assert.equal(input.read().jump, true);
  assert.equal(input.read().jump, false);  // edge-triggered, consumed
});

test('KeyboardInput: Space repeats (key already down) do not re-fire jump', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('Space'));
  input.read();
  t.dispatch('keydown', key('Space'));  // OS auto-repeat
  assert.equal(input.read().jump, false);
  t.dispatch('keyup', key('Space'));
  t.dispatch('keydown', key('Space'));
  assert.equal(input.read().jump, true);  // fresh press fires again
});

test('KeyboardInput: KeyF → fly=true once, then consumed', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('KeyF'));
  assert.equal(input.read().fly, true);
  assert.equal(input.read().fly, false);
});

test('KeyboardInput: Escape → exit=true once, then consumed', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('Escape'));
  assert.equal(input.read().exit, true);
  assert.equal(input.read().exit, false);
});

test('KeyboardInput: mousemove accumulates lookDelta, read clears it', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('mousemove', { movementX: 5, movementY: -2 });
  t.dispatch('mousemove', { movementX: 3, movementY: 1 });
  const s = input.read();
  assert.equal(s.lookDeltaX, 8);
  assert.equal(s.lookDeltaY, -1);
  // read clears
  const s2 = input.read();
  assert.equal(s2.lookDeltaX, 0);
  assert.equal(s2.lookDeltaY, 0);
});

test('KeyboardInput: detach removes all listeners', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  assert.ok(t.listenerCount('keydown') > 0);
  assert.ok(t.listenerCount('mousemove') > 0);
  input.detach();
  assert.equal(t.listenerCount('keydown'), 0);
  assert.equal(t.listenerCount('keyup'), 0);
  assert.equal(t.listenerCount('mousemove'), 0);
});

test('KeyboardInput: events stop firing after detach', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  input.detach();
  t.dispatch('keydown', key('KeyW'));
  assert.equal(input.read().forward, 0);
});

test('KeyboardInput: reset() clears all held keys and pending edges', () => {
  const t = new FakeTarget();
  const input = new KeyboardInput();
  input.attach(t);
  t.dispatch('keydown', key('KeyW'));
  t.dispatch('keydown', key('Space'));
  t.dispatch('mousemove', { movementX: 10, movementY: 10 });
  input.reset();
  const s = input.read();
  assert.equal(s.forward, 0);
  assert.equal(s.jump, false);
  assert.equal(s.lookDeltaX, 0);
});
