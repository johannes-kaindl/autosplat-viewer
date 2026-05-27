import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBvh, raycast, capsuleSweep } from '../../js/collision/mesh-bvh.js';

// ---------- build ----------

test('buildBvh: empty mesh → null root', () => {
  const bvh = buildBvh(new Float32Array(0), new Uint32Array(0));
  assert.equal(bvh.root, null);
  assert.equal(bvh.triCount, 0);
});

test('buildBvh: single triangle → leaf root with that triangle', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  assert.equal(bvh.triCount, 1);
  assert.ok(bvh.root);
  assert.equal(bvh.root.tris.length, 1);
  assert.equal(bvh.root.tris[0], 0);
});

test('buildBvh: 100 random triangles → internal-node tree', () => {
  const positions = new Float32Array(100 * 9);
  const indices = new Uint32Array(100 * 3);
  for (let t = 0; t < 100; t++) {
    for (let v = 0; v < 9; v++) positions[t * 9 + v] = Math.random();
    indices[t * 3]     = t * 3;
    indices[t * 3 + 1] = t * 3 + 1;
    indices[t * 3 + 2] = t * 3 + 2;
  }
  const bvh = buildBvh(positions, indices);
  assert.equal(bvh.triCount, 100);
  assert.ok(bvh.root.left && bvh.root.right);
});

// ---------- raycast ----------

test('raycast: ray hits a single triangle at expected t', () => {
  const positions = new Float32Array([
    -1, -1, 2,  1, -1, 2,  0, 1, 2,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  const hit = raycast(bvh, [0, 0, 0], [0, 0, 1]);
  assert.ok(hit, 'should hit');
  assert.ok(Math.abs(hit.t - 2) < 1e-4, `t=${hit.t}`);
});

test('raycast: ray misses (parallel) returns null', () => {
  const positions = new Float32Array([
    -1, -1, 2,  1, -1, 2,  0, 1, 2,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  const hit = raycast(bvh, [0, 0, 0], [1, 0, 0]);
  assert.equal(hit, null);
});

test('raycast: ray pointing away from triangle returns null', () => {
  const positions = new Float32Array([
    -1, -1, 2,  1, -1, 2,  0, 1, 2,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  const hit = raycast(bvh, [0, 0, 0], [0, 0, -1]);
  assert.equal(hit, null);
});

// ---------- capsule sweep ----------

test('capsuleSweep: vertical capsule with no nearby tris → no penetration', () => {
  const positions = new Float32Array([
    -10, -10, -10,  10, -10, -10,  0, -10, 10,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  const result = capsuleSweep(bvh, [0, 5, 0], [0, 5, 0], 0.5, 1.5);
  assert.equal(result.hits.length, 0);
});

test('capsuleSweep: capsule approaching a wall is clipped back', () => {
  // Large wall triangle in the X=1 plane.
  const positions = new Float32Array([
    1, -10, -10,  1, -10, 10,  1, 10, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  // Capsule radius 0.4, height 1. Step from x=0 to x=0.8 — the destination
  // capsule penetrates the wall (distance 0.2 < radius 0.4). Sweep should
  // push the destination back to x ≤ 0.6.
  const result = capsuleSweep(bvh, [0, 0, 0], [0.8, 0, 0], 0.4, 1.0);
  assert.ok(result.hits.length > 0, 'should report a wall hit');
  assert.ok(result.endX <= 0.61, `endX=${result.endX} should be ≤ 0.6 (= 1 - radius)`);
});

test('capsuleSweep: pure-tunnel (start and end on opposite sides) is NOT detected', () => {
  // Documented limitation: single-step sweep checks only the destination,
  // so a capsule that fully passes through a thin wall in one step misses
  // the collision. Walking step-size is small enough that this doesn't
  // happen in practice — test guards against accidentally "fixing" it in
  // a way that breaks the simple destination-check semantics.
  const positions = new Float32Array([
    1, -10, -10,  1, -10, 10,  1, 10, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const bvh = buildBvh(positions, indices);
  // Step from x=0 to x=2 — capsule starts and ends well clear of the wall
  // at radius 0.4. Distance from destination to wall is 1, radius 0.4 →
  // no penetration reported.
  const result = capsuleSweep(bvh, [0, 0, 0], [2, 0, 0], 0.4, 1.0);
  assert.equal(result.hits.length, 0);
});
