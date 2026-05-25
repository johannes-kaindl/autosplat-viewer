import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeightmap, smoothHeightmap, sampleHeightmap
} from '../../js/heightmap.js';

const bounds10 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 5, z: 10 } };

function flat(...pts) {
  // helper: turn [x,y,z, x,y,z, ...] objects into Float32Array
  const f = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i++) f[i] = pts[i];
  return f;
}

test('buildHeightmap: empty positions → all Infinity', () => {
  const hm = buildHeightmap(new Float32Array(0), bounds10, 4);
  assert.equal(hm.resolution, 4);
  assert.equal(hm.grid.length, 16);
  for (const v of hm.grid) assert.equal(v, Infinity);
});

test('buildHeightmap: single point lands in correct cell with its y', () => {
  // point at x=5,y=2,z=5 with res=10 → cell (5,5)
  const hm = buildHeightmap(flat(5, 2, 5), bounds10, 10);
  assert.equal(hm.grid[5 * 10 + 5], 2);
  // a neighbor cell stays Infinity
  assert.equal(hm.grid[0], Infinity);
});

test('buildHeightmap: multiple points in same cell → min y wins (ground level)', () => {
  // MIN-pool: lowest Y per cell, so a tree-top splat doesn't make us walk on
  // air. The lowest of 1, 3, 2 is 1.
  const hm = buildHeightmap(flat(5, 1, 5, 5, 3, 5, 5, 2, 5), bounds10, 10);
  assert.equal(hm.grid[5 * 10 + 5], 1);
});

test('buildHeightmap: out-of-bounds points are silently dropped', () => {
  const hm = buildHeightmap(flat(-1, 99, -1, 100, 99, 100), bounds10, 10);
  for (const v of hm.grid) assert.equal(v, Infinity);
});

test('buildHeightmap: custom resolution respected', () => {
  const hm = buildHeightmap(new Float32Array(0), bounds10, 32);
  assert.equal(hm.resolution, 32);
  assert.equal(hm.grid.length, 32 * 32);
});

test('buildHeightmap: edge points clamp into the last bin (not out of bounds)', () => {
  // x = 10 (== bounds.max.x) would be res=10 → bin 10, but valid bins are 0..9
  const hm = buildHeightmap(flat(10, 4, 10), bounds10, 10);
  assert.equal(hm.grid[9 * 10 + 9], 4);
});

test('smoothHeightmap: 3×3 box filter averages defined neighbors', () => {
  // 3×3 grid all = 1 → after smoothing center stays 1 (mean of 9 ones)
  const grid = new Float32Array([
    1, 1, 1,
    1, 1, 1,
    1, 1, 1,
  ]);
  const hm = { grid, resolution: 3 };
  const sm = smoothHeightmap(hm);
  assert.equal(sm.resolution, 3);
  assert.equal(sm.grid[1 * 3 + 1], 1);  // center
  assert.equal(sm.grid[0], 1);  // corners average over fewer neighbors but all = 1
});

test('smoothHeightmap: Infinity cells are excluded from the average', () => {
  // grid: center=2, all surrounding cells = -Inf → center smooth = 2 (only itself counts)
  const grid = new Float32Array(9).fill(Infinity);
  grid[1 * 3 + 1] = 2;
  const sm = smoothHeightmap({ grid, resolution: 3 });
  assert.equal(sm.grid[1 * 3 + 1], 2);
  // and a neighbor that was -Inf is now also 2 (its only defined neighbor is the center)
  assert.equal(sm.grid[0 * 3 + 1], 2);
});

test('smoothHeightmap: cell with no defined neighbors stays Infinity', () => {
  // all -Inf → stays -Inf
  const grid = new Float32Array(9).fill(Infinity);
  const sm = smoothHeightmap({ grid, resolution: 3 });
  for (const v of sm.grid) assert.equal(v, Infinity);
});

test('sampleHeightmap: returns exact value at cell center', () => {
  const grid = new Float32Array(100).fill(0);
  grid[5 * 10 + 5] = 7;
  const hm = { grid, resolution: 10 };
  // cell (5,5) center is at (5.5, 5.5) in bounds-relative units
  // mapped to world: x = bounds.min.x + (5.5/10) * 10 = 5.5
  const y = sampleHeightmap(hm, bounds10, 5.5, 5.5);
  assert.equal(y, 7);
});

test('sampleHeightmap: bilinear interpolation between two cells', () => {
  // two adjacent cells: (5,5)=0, (6,5)=10 — sample halfway → 5
  const grid = new Float32Array(100).fill(0);
  grid[5 * 10 + 6] = 10;
  const hm = { grid, resolution: 10 };
  // cell (5,5) center x = 5.5; cell (6,5) center x = 6.5; halfway x = 6.0
  const y = sampleHeightmap(hm, bounds10, 6.0, 5.5);
  assert.equal(y, 5);
});

test('sampleHeightmap: any Infinity corner → returns Infinity', () => {
  const grid = new Float32Array(100).fill(0);
  grid[5 * 10 + 5] = 1;
  grid[5 * 10 + 6] = Infinity;
  grid[6 * 10 + 5] = 1;
  grid[6 * 10 + 6] = 1;
  const hm = { grid, resolution: 10 };
  // sample in the cell that overlaps the -Inf corner
  const y = sampleHeightmap(hm, bounds10, 6.0, 6.0);
  assert.equal(y, Infinity);
});

test('sampleHeightmap: out-of-bounds returns Infinity', () => {
  const grid = new Float32Array(100).fill(5);
  const hm = { grid, resolution: 10 };
  assert.equal(sampleHeightmap(hm, bounds10, -1, 5), Infinity);
  assert.equal(sampleHeightmap(hm, bounds10, 5, -1), Infinity);
  assert.equal(sampleHeightmap(hm, bounds10, 11, 5), Infinity);
  assert.equal(sampleHeightmap(hm, bounds10, 5, 11), Infinity);
});

test('buildHeightmap: handles 1M points performantly (<200ms)', () => {
  // 1M points = 3M floats. Just verify it doesn't OOM and finishes.
  const n = 1_000_000;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = Math.random() * 10;
    positions[i * 3 + 1] = Math.random() * 5;
    positions[i * 3 + 2] = Math.random() * 10;
  }
  const t0 = performance.now();
  const hm = buildHeightmap(positions, bounds10, 128);
  const dt = performance.now() - t0;
  assert.equal(hm.resolution, 128);
  // sanity: every cell should have at least one point at 1M density
  let defined = 0;
  for (const v of hm.grid) if (v !== Infinity) defined++;
  assert.ok(defined > 0.95 * hm.grid.length, `${defined}/${hm.grid.length} cells defined`);
  assert.ok(dt < 200, `took ${dt.toFixed(1)}ms`);
});
