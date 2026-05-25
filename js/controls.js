// controls.js — input devices for walking-mode. KeyboardInput handles
// keyboard + relative mouse-look (pointer-lock movementX/Y). TouchInput
// for mobile lives in the same module so consumers have a single import,
// and is added in slice 6.
//
// Read returns a snapshot per frame:
//   { forward, right, vertical, sprint, jump, fly, exit, lookDeltaX, lookDeltaY }
// - Continuous axes (forward/right/vertical/sprint): reflect current held state.
// - Edge events (jump/fly/exit): true ONCE per fresh press, then consumed.
// - lookDelta: mouse movement accumulated since last read, then cleared.

const HELD_AXIS = {
  KeyW: ['forward', +1], ArrowUp: ['forward', +1],
  KeyS: ['forward', -1], ArrowDown: ['forward', -1],
  KeyD: ['right', +1], ArrowRight: ['right', +1],
  KeyA: ['right', -1], ArrowLeft: ['right', -1],
  KeyE: ['vertical', +1],
  KeyQ: ['vertical', -1],
};

const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const EDGE_KEYS = { Space: 'jump', KeyF: 'fly', Escape: 'exit' };

export class KeyboardInput {
  constructor() {
    this._keys = new Set();
    this._pending = { jump: false, fly: false, exit: false };
    this._lookX = 0;
    this._lookY = 0;
    this._target = null;
    this._handlers = null;
  }

  attach(target) {
    if (!target) return;
    if (this._target) this.detach();
    this._handlers = {
      keydown: (e) => this._onKeyDown(e),
      keyup: (e) => this._onKeyUp(e),
      mousemove: (e) => this._onMouseMove(e),
    };
    target.addEventListener('keydown', this._handlers.keydown);
    target.addEventListener('keyup', this._handlers.keyup);
    target.addEventListener('mousemove', this._handlers.mousemove);
    this._target = target;
  }

  detach() {
    if (!this._target) return;
    this._target.removeEventListener('keydown', this._handlers.keydown);
    this._target.removeEventListener('keyup', this._handlers.keyup);
    this._target.removeEventListener('mousemove', this._handlers.mousemove);
    this._target = null;
    this._handlers = null;
    this.reset();
  }

  reset() {
    this._keys.clear();
    this._pending.jump = false;
    this._pending.fly = false;
    this._pending.exit = false;
    this._lookX = 0;
    this._lookY = 0;
  }

  _onKeyDown(e) {
    const k = e.code;
    if (!k) return;
    if (this._keys.has(k)) return;        // suppress OS auto-repeat
    this._keys.add(k);
    const edge = EDGE_KEYS[k];
    if (edge) this._pending[edge] = true;
    // some keys (Space, F, arrow keys) trigger browser defaults like
    // page-scroll; consumers can opt out via preventDefault in the event
    // since we already saw the key.
    if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault?.();
  }

  _onKeyUp(e) {
    const k = e.code;
    if (k) this._keys.delete(k);
  }

  _onMouseMove(e) {
    // movementX/Y are only meaningful under PointerLock; when not locked
    // they fall back to 0 in most browsers, so this stays a no-op.
    this._lookX += e.movementX ?? 0;
    this._lookY += e.movementY ?? 0;
  }

  read() {
    const out = { forward: 0, right: 0, vertical: 0, sprint: false };
    for (const k of this._keys) {
      const axis = HELD_AXIS[k];
      if (axis) out[axis[0]] += axis[1];
      if (SPRINT_KEYS.has(k)) out.sprint = true;
    }
    out.jump = this._pending.jump;
    out.fly = this._pending.fly;
    out.exit = this._pending.exit;
    out.lookDeltaX = this._lookX;
    out.lookDeltaY = this._lookY;
    this._pending.jump = false;
    this._pending.fly = false;
    this._pending.exit = false;
    this._lookX = 0;
    this._lookY = 0;
    return out;
  }
}
