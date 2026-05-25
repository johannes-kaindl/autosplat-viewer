// walking.js — first-person mode glue between PlayCanvas, the keyboard
// input, and the heightmap collision. Lazy-loaded by viewer.js so the
// initial PWA bundle does not pay for it.
//
// Controls are passive — WalkingMode reads from an input device the
// caller supplied (KeyboardInput from controls.js) and asks the supplied
// HUD to toggle its overlay.
//
// Tier-2 collision: walk on a heightmap, free-fall over empty cells,
// soft AABB walls clamp horizontal motion to scene bounds. Fly toggle
// and sprint are added in slice 5.

import { Quat, Vec3 } from 'playcanvas';

import {
  buildHeightmap, buildMedianHeightmap, smoothHeightmap, sampleHeightmap,
  robustBounds,
} from './heightmap.js';

const LOOK_SENSITIVITY = 0.0022;  // radians per pixel of mouse movement
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const RESPAWN_BELOW = 5;          // eye-offsets below ground → respawn
const SPRINT_MULT = 2;            // shift held doubles speed
const WHEEL_TO_EYE = 0.0008;      // wheel-delta * yExtent → eye-offset change
const EYE_MIN_FRAC = 0.01;        // eye-offset ≥ 1% of yExtent
const EYE_MAX_FRAC = 0.6;         //              ≤ 60% of yExtent
const EYE_STORE_KEY = 'autosplat-walking-eye-frac';

/**
 * Build a world-space heightmap from a freshly loaded splat entity.
 * Returns { heightmap, bounds, source } where source is:
 *   - 'splat'  — high-fidelity, built from raw splat positions
 *   - 'aabb'   — fallback flat floor at bounds.min.y (extraction failed)
 *   - null     — no usable bounds at all; caller should disable walking
 */
export function heightmapFromSplat(splatEntity, splatPivot, resolution = 128) {
  const root = splatPivot ?? splatEntity;
  const positions = extractSplatPositions(splatEntity);
  if (positions && positions.length > 0) {
    const world = transformPositions(positions, root);
    // Outlier-resistant bounds — Y is clamped to [2nd, 98th] percentile so a
    // few sky-splats or subterranean noise don't blow up yExtent (and with it
    // the auto-eye-offset). X/Z keep their full extents so we can still walk
    // to the edges of the captured scene.
    const bounds = robustBounds(world);
    if (!bounds) return null;
    // Median per cell, biased toward the lower quartile, is much more
    // forgiving on real-world splats than MIN/MAX pooling.
    const raw = buildMedianHeightmap(world, bounds, resolution);
    const smooth = smoothHeightmap(raw);
    return { heightmap: smooth, bounds, source: 'splat' };
  }
  // Fallback: flat floor sized to the entity's AABB. The walker can still
  // walk in a box even when we can't reach into the splat's typed arrays.
  const bounds = boundsFromEntityAabb(splatEntity, root);
  if (!bounds) return null;
  return { heightmap: flatHeightmap(bounds, 8), bounds, source: 'aabb' };
}

// Retain the simpler buildHeightmap re-export so e2e/unit tests keep working.
export { buildHeightmap };

function flatHeightmap(bounds, resolution = 8) {
  const grid = new Float32Array(resolution * resolution);
  grid.fill(bounds.min.y);
  return { grid, resolution };
}

function boundsFromEntityAabb(splatEntity, root) {
  try {
    const aabb = splatEntity?.gsplat?.instance?.aabb
              ?? splatEntity?.gsplat?.aabb
              ?? splatEntity?.aabb;
    if (aabb?.getMin && aabb?.getMax) {
      const mn = aabb.getMin(), mx = aabb.getMax();
      return {
        min: { x: mn.x, y: mn.y, z: mn.z },
        max: { x: mx.x, y: mx.y, z: mx.z },
      };
    }
    // last-ditch: derive a unit box around the entity world position
    const p = root.getPosition();
    return {
      min: { x: p.x - 1, y: p.y - 1, z: p.z - 1 },
      max: { x: p.x + 1, y: p.y + 1, z: p.z + 1 },
    };
  } catch { return null; }
}

function extractSplatPositions(splatEntity) {
  try {
    const r = splatEntity?.gsplat?.asset?.resource;
    const splatData = r?.splatData ?? r?.data;
    if (!splatData) return null;
    // PlayCanvas exposes per-attribute typed accessors; fall back to .position.
    const posX = splatData.getProp?.('x');
    const posY = splatData.getProp?.('y');
    const posZ = splatData.getProp?.('z');
    if (posX && posY && posZ) {
      const n = posX.length;
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        out[i * 3] = posX[i];
        out[i * 3 + 1] = posY[i];
        out[i * 3 + 2] = posZ[i];
      }
      return out;
    }
    const flat = splatData.position ?? splatData.positions;
    if (flat instanceof Float32Array) return flat;
  } catch { /* fall through */ }
  return null;
}

function transformPositions(local, entity) {
  const m = entity.getWorldTransform();
  const d = m.data;  // column-major: see PlayCanvas Mat4
  const out = new Float32Array(local.length);
  for (let i = 0; i < local.length; i += 3) {
    const x = local[i], y = local[i + 1], z = local[i + 2];
    out[i]     = d[0] * x + d[4] * y + d[8]  * z + d[12];
    out[i + 1] = d[1] * x + d[5] * y + d[9]  * z + d[13];
    out[i + 2] = d[2] * x + d[6] * y + d[10] * z + d[14];
  }
  return out;
}

function boundsFromPositions(positions) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

export class WalkingMode {
  constructor({
    app, camera, splatBounds, heightmap, input,
    onExit, onModeChange, onEyeChange,
  }) {
    this.app = app;
    this.camera = camera;
    this.bounds = splatBounds;
    this.hm = heightmap;
    this.input = input;
    this.onExit = onExit;
    this.onModeChange = onModeChange;
    this.onEyeChange = onEyeChange;
    this._yaw = 0;
    this._pitch = 0;
    this._vy = 0;
    this._mode = 'walk';
    this._active = false;
    this._savedPose = null;
    this._updateFn = null;

    const yExtent = this.bounds.max.y - this.bounds.min.y;
    const sceneSize = Math.max(
      this.bounds.max.x - this.bounds.min.x,
      yExtent,
      this.bounds.max.z - this.bounds.min.z,
    );
    this._yExtent    = Math.max(0.01, yExtent);
    this._eyeFrac    = restoreEyeFrac() ?? 1 / 8;
    this._eyeOffset  = this._eyeFrac * this._yExtent;
    this._jumpHeight = Math.max(0.02, yExtent / 40);
    this._gravity    = this._jumpHeight * 8;
    this._walkSpeed  = sceneSize * 0.18;  // ~5.5s to cross the longest axis
    this._flySpeed   = this._walkSpeed * 1.3;
  }

  enter() {
    if (this._active) return;
    this._active = true;
    this._savedPose = {
      pos: this.camera.getPosition().clone(),
      rot: this.camera.getRotation().clone(),
    };

    const spawn = this._chooseSpawn();
    this.camera.setPosition(spawn.x, spawn.y, spawn.z);
    this._yaw = 0;
    this._pitch = 0;
    this._vy = 0;
    this._applyRotation();

    // Diagnostic so users can debug "spawned underground / in the air" by
    // checking the browser console — bounds + spawn tell the whole story.
    console.log('[walking] enter:', {
      bounds: this.bounds,
      yExtent: this._yExtent,
      eyeOffset: this._eyeOffset,
      spawn,
    });

    this._updateFn = (dt) => this._step(dt);
    this.app.on('update', this._updateFn);
  }

  /**
   * Find a spawn point near the scene centre with a defined ground sample.
   * If the centre cell is empty (sky-only / data hole), spiral outward and
   * pick the first defined cell — keeps the user from spawning in free-fall.
   */
  _chooseSpawn() {
    const cx = (this.bounds.min.x + this.bounds.max.x) / 2;
    const cz = (this.bounds.min.z + this.bounds.max.z) / 2;
    const xStep = (this.bounds.max.x - this.bounds.min.x) / 16;
    const zStep = (this.bounds.max.z - this.bounds.min.z) / 16;
    const RING = 6;
    for (let r = 0; r <= RING; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const x = cx + dx * xStep;
          const z = cz + dz * zStep;
          const g = this._sampleGround(x, z);
          if (Number.isFinite(g)) {
            return { x, y: g + this._eyeOffset, z };
          }
        }
      }
    }
    // total fallback: dead-centre at bounds.min.y + eyeOffset (won't be great
    // but at least it's defined).
    return { x: cx, y: this.bounds.min.y + this._eyeOffset, z: cz };
  }

  exit() {
    if (!this._active) return;
    this._active = false;
    if (this._updateFn) {
      this.app.off('update', this._updateFn);
      this._updateFn = null;
    }
    if (this._savedPose) {
      this.camera.setPosition(this._savedPose.pos);
      this.camera.setRotation(this._savedPose.rot);
      this._savedPose = null;
    }
  }

  isActive() { return this._active; }

  _sampleGround(x, z) {
    return sampleHeightmap(this.hm, this.bounds, x, z);
  }

  _applyRotation() {
    // FPS look = yaw around world Y, then pitch around local X.
    // Compose explicitly to avoid Euler order ambiguity.
    const yawQ = new Quat();
    const pitchQ = new Quat();
    yawQ.setFromAxisAngle(Vec3.UP, this._yaw * 180 / Math.PI);
    pitchQ.setFromAxisAngle(Vec3.RIGHT, this._pitch * 180 / Math.PI);
    yawQ.mul(pitchQ);
    this.camera.setRotation(yawQ);
  }

  setMode(mode) {
    if (mode !== 'walk' && mode !== 'fly') return;
    if (mode === this._mode) return;
    this._mode = mode;
    if (mode === 'fly') this._vy = 0;
    this.onModeChange?.(mode);
  }

  getMode() { return this._mode; }

  setEyeFrac(frac) {
    const clamped = Math.max(EYE_MIN_FRAC, Math.min(EYE_MAX_FRAC, frac));
    this._eyeFrac = clamped;
    this._eyeOffset = clamped * this._yExtent;
    persistEyeFrac(clamped);
    this.onEyeChange?.(this._eyeOffset);
  }

  _step(dt) {
    if (!this.input) return;
    const s = this.input.read();

    if (s.exit) { this.onExit?.(); return; }
    if (s.fly) this.setMode(this._mode === 'walk' ? 'fly' : 'walk');
    if (s.wheelDelta) {
      this.setEyeFrac(this._eyeFrac - s.wheelDelta * WHEEL_TO_EYE);
    }

    // mouse look
    this._yaw   -= s.lookDeltaX * LOOK_SENSITIVITY;
    this._pitch -= s.lookDeltaY * LOOK_SENSITIVITY;
    if (this._pitch >  PITCH_LIMIT) this._pitch =  PITCH_LIMIT;
    if (this._pitch < -PITCH_LIMIT) this._pitch = -PITCH_LIMIT;
    this._applyRotation();

    const sprint = s.sprint ? SPRINT_MULT : 1;
    const speed = (this._mode === 'fly' ? this._flySpeed : this._walkSpeed) * sprint;

    // horizontal motion in world XZ, projected from yaw only
    let fx = 0, fz = 0;
    if (s.forward || s.right) {
      const sy = Math.sin(this._yaw), cy = Math.cos(this._yaw);
      let dx = -sy * s.forward + cy * s.right;
      let dz = -cy * s.forward - sy * s.right;
      const len = Math.hypot(dx, dz);
      if (len > 0) { dx /= len; dz /= len; }
      const step = speed * dt;
      fx = dx * step;
      fz = dz * step;
    }

    const pos = this.camera.getPosition();
    let nx = pos.x + fx;
    let nz = pos.z + fz;

    // soft clamp to scene bounds (Tier-2 "walls"). Fly mode keeps walls too —
    // they keep the user from drifting infinitely off-scene.
    if (nx < this.bounds.min.x) nx = this.bounds.min.x;
    if (nx > this.bounds.max.x) nx = this.bounds.max.x;
    if (nz < this.bounds.min.z) nz = this.bounds.min.z;
    if (nz > this.bounds.max.z) nz = this.bounds.max.z;

    let ny;
    if (this._mode === 'fly') {
      // Vertical from Q/E (s.vertical) or jump-impulse-as-up.
      const flyV = s.vertical + (s.jump ? 1 : 0);
      ny = pos.y + flyV * speed * dt;
      // soft Y clamp so you can't drift forever into the sky
      const yMax = this.bounds.max.y + 5 * this._eyeOffset;
      const yMin = this.bounds.min.y - 2 * this._eyeOffset;
      if (ny > yMax) ny = yMax;
      if (ny < yMin) ny = yMin;
      this._vy = 0;
    } else {
      // Walking: gravity + jump + ground snap.
      const groundY = this._sampleGround(nx, nz);
      const haveGround = Number.isFinite(groundY);
      const eyeY = haveGround ? groundY + this._eyeOffset : NaN;
      const onGround = haveGround && pos.y <= eyeY + 0.01;
      if (s.jump && onGround) {
        this._vy = Math.sqrt(2 * this._gravity * this._jumpHeight);
      }
      this._vy -= this._gravity * dt;
      ny = pos.y + this._vy * dt;
      if (haveGround && ny < eyeY) {
        ny = eyeY;
        this._vy = 0;
      }
      if (ny < this.bounds.min.y - RESPAWN_BELOW * this._eyeOffset) {
        const spawn = this._chooseSpawn();
        this.camera.setPosition(spawn.x, spawn.y, spawn.z);
        this._vy = 0;
        return;
      }
    }

    this.camera.setPosition(nx, ny, nz);
  }
}

function restoreEyeFrac() {
  try {
    const v = parseFloat(globalThis.localStorage?.getItem(EYE_STORE_KEY) ?? '');
    if (Number.isFinite(v) && v >= EYE_MIN_FRAC && v <= EYE_MAX_FRAC) return v;
  } catch { /* localStorage unavailable */ }
  return null;
}

function persistEyeFrac(v) {
  try { globalThis.localStorage?.setItem(EYE_STORE_KEY, String(v)); }
  catch { /* localStorage unavailable */ }
}
