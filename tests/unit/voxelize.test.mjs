import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voxelize, smoothDensity, defaultIso } from '../../js/collision/voxelize.js';

const bounds10 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

function flat(...pts) {
  const f = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i++) f[i] = pts[i];
  return f;
}

test('voxelize: empty positions → all-zero grid', () => {
  const { density, resolution } = voxelize(new Float32Array(0), bounds10, 8);
  assert.equal(resolution, 8);
  assert.equal(density.length, 8 ** 3);
  for (const v of density) assert.equal(v, 0);
});

test('voxelize: single splat at centre → exactly one non-zero cell', () => {
  const { density } = voxelize(flat(5, 5, 5), bounds10, 8);
  let nonZero = 0;
  for (const v of density) if (v > 0) nonZero++;
  assert.equal(nonZero, 1);
  const idx = 4 * 64 + 4 * 8 + 4;
  assert.equal(density[idx], 1);
});

test('voxelize: out-of-bounds splats are rejected', () => {
  const { density } = voxelize(flat(-1, -1, -1, 11, 11, 11), bounds10, 8);
  for (const v of density) assert.equal(v, 0);
});

test('voxelize: degenerate bounds (zero extent) → all-zero', () => {
  const bad = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const { density } = voxelize(flat(0, 0, 0), bad, 4);
  for (const v of density) assert.equal(v, 0);
});

test('smoothDensity: single non-zero cell spreads to 3x3x3 neighbourhood', () => {
  const res = 5;
  const density = new Float32Array(res ** 3);
  density[2 * 25 + 2 * 5 + 2] = 27;
  const out = smoothDensity(density, res);
  assert.equal(out[2 * 25 + 2 * 5 + 2], 1);
  assert.equal(out[2 * 25 + 2 * 5 + 3], 1);
  assert.equal(out[0], 0);
});

test('smoothDensity: empty grid stays empty', () => {
  const out = smoothDensity(new Float32Array(64), 4);
  for (const v of out) assert.equal(v, 0);
});

test('defaultIso: empty grid → 1.5 fallback', () => {
  assert.equal(defaultIso(new Float32Array(64)), 1.5);
});

test('defaultIso: 50th-percentile of non-zero × 0.5, floored at 1.5', () => {
  const density = new Float32Array(100);
  for (let i = 0; i < 10; i++) density[i] = i + 1;
  // median of [1..10] sorted = nz[Math.floor(9/2)] = nz[4] = 5 → * 0.5 = 2.5
  assert.equal(defaultIso(density), 2.5);
});

test('defaultIso: small values → falls back to 1.5', () => {
  const density = new Float32Array(10);
  density[0] = 1; density[1] = 2;
  // median = nz[Math.floor(1/2)] = nz[0] = 1, * 0.5 = 0.5 → max(1.5, 0.5) = 1.5
  assert.equal(defaultIso(density), 1.5);
});
