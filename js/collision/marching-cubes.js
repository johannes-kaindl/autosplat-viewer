// marching-cubes.js — extract a triangle mesh from a flat voxel-density grid.
// Pure module: no DOM, no PlayCanvas. Standard Bourke 256-case algorithm.
//
// Convention (matches mc-tables.js): cube-corner bit set when density ≤ iso
// ("inside" the implicit surface). With this convention Bourke's table
// triangles wind such that surface normals point toward the inside (= the
// low-density region). For Splat data low-density is the empty surrounding
// space, so the surface is rendered correctly under standard front-face
// culling when viewed from outside the splat.
//
// Output is an indexed mesh: { positions: Float32Array (numVerts*3),
//   indices: Uint32Array (numTris*3), normals: Float32Array (numVerts*3) }.
// Vertices are de-duplicated by edge identity, so adjacent cells share verts
// and per-vertex normals can be accumulated for smooth shading.

import { edgeTable, triTable } from './mc-tables.js';

// Cube corner offsets (i, j, k) for corners 0..7 of an MC cell — matches
// Bourke's a2fVertexOffset.
const CORNER_OFFSETS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

// Edge i connects corner EDGE_CORNERS[i][0] to EDGE_CORNERS[i][1] — matches
// Bourke's a2iEdgeConnection.
const EDGE_CORNERS = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function marchingCubes({ density, resolution, bounds, iso }) {
  const r = resolution;
  const sx = (bounds.max.x - bounds.min.x) / r;
  const sy = (bounds.max.y - bounds.min.y) / r;
  const sz = (bounds.max.z - bounds.min.z) / r;
  const minX = bounds.min.x, minY = bounds.min.y, minZ = bounds.min.z;

  // Vertex de-dup map: edge identity → vertex index in positions[].
  // edgeKey = ((k * R + j) * R + i) * 3 + axis, where R = r+1, axis is
  // 0=x, 1=y, 2=z and (i,j,k) is the LOWER corner of the edge.
  const vertMap = new Map();
  const positions = [];
  const indices = [];

  const idx = (i, j, k) => k * r * r + j * r + i;
  const getDensity = (i, j, k) => density[idx(i, j, k)];

  function getVertex(i, j, k, edgeIdx) {
    const [a, b] = EDGE_CORNERS[edgeIdx];
    const [aoi, aoj, aok] = CORNER_OFFSETS[a];
    const [boi, boj, bok] = CORNER_OFFSETS[b];
    const ax = i + aoi, ay = j + aoj, az = k + aok;
    const bx = i + boi, by = j + boj, bz = k + bok;
    const lx = Math.min(ax, bx), ly = Math.min(ay, by), lz = Math.min(az, bz);
    const axis = (ax !== bx) ? 0 : (ay !== by) ? 1 : 2;
    const R = r + 1;
    const key = ((lz * R + ly) * R + lx) * 3 + axis;
    const existing = vertMap.get(key);
    if (existing !== undefined) return existing;

    const va = getDensity(ax, ay, az);
    const vb = getDensity(bx, by, bz);
    let t = 0.5;
    const diff = vb - va;
    if (Math.abs(diff) > 1e-6) t = (iso - va) / diff;
    if (t < 0) t = 0; else if (t > 1) t = 1;

    const wx = minX + (ax + t * (bx - ax)) * sx;
    const wy = minY + (ay + t * (by - ay)) * sy;
    const wz = minZ + (az + t * (bz - az)) * sz;
    const vi = positions.length / 3;
    positions.push(wx, wy, wz);
    vertMap.set(key, vi);
    return vi;
  }

  for (let k = 0; k < r - 1; k++) {
    for (let j = 0; j < r - 1; j++) {
      for (let i = 0; i < r - 1; i++) {
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNER_OFFSETS[c];
          if (getDensity(i + di, j + dj, k + dk) <= iso) cubeIndex |= (1 << c);
        }
        const edges = edgeTable[cubeIndex];
        if (edges === 0) continue;
        const tri = triTable[cubeIndex];
        for (let t = 0; tri[t] !== -1; t += 3) {
          const va = getVertex(i, j, k, tri[t]);
          const vb = getVertex(i, j, k, tri[t + 1]);
          const vc = getVertex(i, j, k, tri[t + 2]);
          indices.push(va, vb, vc);
        }
      }
    }
  }

  const pos = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  return { positions: pos, indices: idxArr, normals: computeNormals(pos, idxArr) };
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [ia, ib, ic]) {
      normals[i]     += nx;
      normals[i + 1] += ny;
      normals[i + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      normals[i]     = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  return normals;
}
