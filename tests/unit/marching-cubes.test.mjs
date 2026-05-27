import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marchingCubes } from '../../js/collision/marching-cubes.js';

const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };

test('marchingCubes: all-zero grid → empty mesh', () => {
  // All corners ≤ iso → cubeIndex = 255 → case 255 has no triangles.
  const density = new Float32Array(4 ** 3);
  const mesh = marchingCubes({ density, resolution: 4, bounds, iso: 0.5 });
  assert.equal(mesh.positions.length, 0);
  assert.equal(mesh.indices.length, 0);
});

test('marchingCubes: all-one grid → empty mesh (no inside-out surface)', () => {
  // All corners > iso → cubeIndex = 0 → case 0 has no triangles.
  const density = new Float32Array(4 ** 3).fill(1);
  const mesh = marchingCubes({ density, resolution: 4, bounds, iso: 0.5 });
  assert.equal(mesh.positions.length, 0);
});

test('marchingCubes: 2x2x2 single cell with corner 0 above iso → 1 triangle', () => {
  // 2x2x2 grid = exactly one MC cell.
  // Bourke convention: bit set when density ≤ iso.
  // Corner 0 has density 1.0 (> iso=0.5) → bit 0 = 0
  // Corners 1..7 have density 0 (≤ iso) → bits 1..7 = 1
  // cubeIndex = 0b11111110 = 254 → triTable[254] = [0, 3, 8, -1, ...] (one triangle)
  const density = new Float32Array(8);
  density[0] = 1.0;
  const mesh = marchingCubes({
    density, resolution: 2, bounds, iso: 0.5,
  });
  assert.equal(mesh.indices.length, 3);
  assert.equal(mesh.positions.length, 3 * 3);
});

test('marchingCubes: sphere density → closed-ish surface near unit radius', () => {
  const r = 16;
  const density = new Float32Array(r ** 3);
  const cx = (r - 1) / 2, cy = cx, cz = cx;
  const radius = r * 0.3;
  for (let k = 0; k < r; k++) {
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        const dx = i - cx, dy = j - cy, dz = k - cz;
        const d = Math.hypot(dx, dy, dz);
        density[k * r * r + j * r + i] = Math.max(0, 1 - d / radius);
      }
    }
  }
  const mesh = marchingCubes({
    density, resolution: r,
    bounds: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
    iso: 0.5,
  });
  assert.ok(mesh.indices.length > 300,
    `expected > 100 tris, got ${mesh.indices.length / 3}`);

  // Vertices should lie roughly on a sphere of world-radius proportional
  // to the cell extent. cellExtent = 2/r in world units; sphere radius in
  // cells = `radius` (in cell units); world radius = `radius` * cellExtent.
  // Iso = 0.5 cuts at half-way through `1 - d/radius` falloff, i.e. at
  // d = radius/2 cells.
  const cellExtent = 2 / r;
  const expectedR = radius * 0.5 * cellExtent;
  let inRange = 0;
  for (let v = 0; v < mesh.positions.length; v += 3) {
    const x = mesh.positions[v], y = mesh.positions[v + 1], z = mesh.positions[v + 2];
    const d = Math.hypot(x, y, z);
    if (d > expectedR * 0.6 && d < expectedR * 1.4) inRange++;
  }
  const ratio = inRange / (mesh.positions.length / 3);
  assert.ok(ratio > 0.8,
    `${(ratio * 100).toFixed(1)}% of vertices in [0.6R, 1.4R] (expected > 80%, R=${expectedR.toFixed(3)})`);
});
