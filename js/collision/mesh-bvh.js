// mesh-bvh.js — median-split bounding-volume hierarchy over triangle indices,
// plus raycast and capsule-sweep queries. Pure module: no PlayCanvas
// dependency; takes positions/indices arrays directly.

const LEAF_SIZE = 4;

export function buildBvh(positions, indices) {
  const triCount = indices.length / 3;
  if (triCount === 0) return { root: null, triCount: 0, positions, indices };

  const centroids = new Float32Array(triCount * 3);
  const bboxes = new Float32Array(triCount * 6);
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    const ax = positions[ia],     ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib],     by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic],     cy = positions[ic + 1], cz = positions[ic + 2];
    centroids[t * 3]     = (ax + bx + cx) / 3;
    centroids[t * 3 + 1] = (ay + by + cy) / 3;
    centroids[t * 3 + 2] = (az + bz + cz) / 3;
    bboxes[t * 6]     = Math.min(ax, bx, cx);
    bboxes[t * 6 + 1] = Math.min(ay, by, cy);
    bboxes[t * 6 + 2] = Math.min(az, bz, cz);
    bboxes[t * 6 + 3] = Math.max(ax, bx, cx);
    bboxes[t * 6 + 4] = Math.max(ay, by, cy);
    bboxes[t * 6 + 5] = Math.max(az, bz, cz);
  }

  const triIndices = new Int32Array(triCount);
  for (let t = 0; t < triCount; t++) triIndices[t] = t;

  const root = buildNode(triIndices, 0, triCount, centroids, bboxes);
  return { root, triCount, positions, indices };
}

function buildNode(tris, start, end, centroids, bboxes) {
  const node = { bbox: nodeBbox(tris, start, end, bboxes) };
  const count = end - start;
  if (count <= LEAF_SIZE) {
    node.tris = tris.slice(start, end);
    return node;
  }
  // Split on the axis with the largest centroid extent.
  let axisMin = [Infinity, Infinity, Infinity];
  let axisMax = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < end; i++) {
    const t = tris[i];
    for (let a = 0; a < 3; a++) {
      const c = centroids[t * 3 + a];
      if (c < axisMin[a]) axisMin[a] = c;
      if (c > axisMax[a]) axisMax[a] = c;
    }
  }
  let axis = 0;
  let ext = axisMax[0] - axisMin[0];
  if (axisMax[1] - axisMin[1] > ext) { axis = 1; ext = axisMax[1] - axisMin[1]; }
  if (axisMax[2] - axisMin[2] > ext) { axis = 2; }

  const slice = tris.subarray(start, end);
  const arr = Array.from(slice);
  arr.sort((a, b) => centroids[a * 3 + axis] - centroids[b * 3 + axis]);
  for (let i = 0; i < arr.length; i++) tris[start + i] = arr[i];
  const mid = start + (count >> 1);
  node.left  = buildNode(tris, start, mid, centroids, bboxes);
  node.right = buildNode(tris, mid, end, centroids, bboxes);
  return node;
}

function nodeBbox(tris, start, end, bboxes) {
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = start; i < end; i++) {
    const t = tris[i];
    if (bboxes[t * 6]     < mnx) mnx = bboxes[t * 6];
    if (bboxes[t * 6 + 1] < mny) mny = bboxes[t * 6 + 1];
    if (bboxes[t * 6 + 2] < mnz) mnz = bboxes[t * 6 + 2];
    if (bboxes[t * 6 + 3] > mxx) mxx = bboxes[t * 6 + 3];
    if (bboxes[t * 6 + 4] > mxy) mxy = bboxes[t * 6 + 4];
    if (bboxes[t * 6 + 5] > mxz) mxz = bboxes[t * 6 + 5];
  }
  return [mnx, mny, mnz, mxx, mxy, mxz];
}

// ---------- raycast ----------

/**
 * Cast a ray (origin + direction, direction need not be unit) against the BVH.
 * Returns { t, triIndex, point } for the nearest hit, or null. Möller-Trumbore
 * is configured two-sided so brush picking works from either side.
 */
export function raycast(bvh, origin, direction) {
  if (!bvh.root) return null;
  const invDir = [
    direction[0] !== 0 ? 1 / direction[0] : Infinity,
    direction[1] !== 0 ? 1 / direction[1] : Infinity,
    direction[2] !== 0 ? 1 / direction[2] : Infinity,
  ];
  const state = { tNearest: Infinity, hitTri: -1 };
  raycastNode(bvh.root, origin, direction, invDir, bvh.positions, bvh.indices, state);
  if (state.hitTri < 0) return null;
  const t = state.tNearest;
  return {
    t,
    triIndex: state.hitTri,
    point: [
      origin[0] + t * direction[0],
      origin[1] + t * direction[1],
      origin[2] + t * direction[2],
    ],
  };
}

function raycastNode(node, origin, dir, invDir, positions, indices, state) {
  if (!intersectAabb(node.bbox, origin, invDir, state.tNearest)) return;
  if (node.tris) {
    for (const t of node.tris) {
      const ia = indices[t * 3] * 3;
      const ib = indices[t * 3 + 1] * 3;
      const ic = indices[t * 3 + 2] * 3;
      const tHit = intersectTriangle(
        origin, dir,
        positions[ia], positions[ia + 1], positions[ia + 2],
        positions[ib], positions[ib + 1], positions[ib + 2],
        positions[ic], positions[ic + 1], positions[ic + 2],
      );
      if (tHit > 0 && tHit < state.tNearest) {
        state.tNearest = tHit;
        state.hitTri = t;
      }
    }
    return;
  }
  raycastNode(node.left,  origin, dir, invDir, positions, indices, state);
  raycastNode(node.right, origin, dir, invDir, positions, indices, state);
}

function intersectAabb(bbox, origin, invDir, tMax) {
  let tmin = -Infinity, tCap = tMax;
  for (let a = 0; a < 3; a++) {
    const t1 = (bbox[a]     - origin[a]) * invDir[a];
    const t2 = (bbox[a + 3] - origin[a]) * invDir[a];
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    if (lo > tmin) tmin = lo;
    if (hi < tCap) tCap = hi;
    if (tmin > tCap) return false;
  }
  return tCap >= 0;
}

function intersectTriangle(o, d, ax, ay, az, bx, by, bz, cx, cy, cz) {
  // Möller-Trumbore, two-sided.
  const ex = bx - ax, ey = by - ay, ez = bz - az;
  const fx = cx - ax, fy = cy - ay, fz = cz - az;
  const px = d[1] * fz - d[2] * fy;
  const py = d[2] * fx - d[0] * fz;
  const pz = d[0] * fy - d[1] * fx;
  const det = ex * px + ey * py + ez * pz;
  if (Math.abs(det) < 1e-8) return -1;
  const inv = 1 / det;
  const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * ez - tz * ey;
  const qy = tz * ex - tx * ez;
  const qz = tx * ey - ty * ex;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  return (fx * qx + fy * qy + fz * qz) * inv;
}

// ---------- capsule sweep ----------

/**
 * Pragmatic capsule-vs-mesh sweep for walking-mode horizontal collision.
 *
 * Input:
 *   start, end:       capsule-bottom positions before/after the step [x, y, z]
 *   radius:           capsule radius
 *   height:           distance from capsule bottom to top
 *
 * Strategy:
 *   1. Build swept-AABB of (start..end) ± radius/height.
 *   2. Walk the BVH for triangles whose bbox overlaps that AABB.
 *   3. For each candidate, compute closest-point-on-triangle to the
 *      *final* capsule axis (segment from `end` to `end + height·Y`);
 *      if distance < radius, this triangle penetrates the destination.
 *   4. Push the destination's XZ back along the horizontal direction of
 *      penetration, just enough to clear the wall.
 *
 * Returns { hits: triIndex[], endX, endZ }. Y is not clipped here
 * (gravity/ground handle Y).
 */
export function capsuleSweep(bvh, start, end, radius, height) {
  const hits = [];
  let endX = end[0];
  let endZ = end[2];
  if (!bvh.root) return { hits, endX, endZ };

  const cy = end[1];
  const topY = cy + height;
  const aabb = [
    Math.min(start[0], end[0]) - radius,
    Math.min(start[1], end[1]) - radius,
    Math.min(start[2], end[2]) - radius,
    Math.max(start[0], end[0]) + radius,
    Math.max(start[1], end[1]) + height + radius,
    Math.max(start[2], end[2]) + radius,
  ];

  const candidates = [];
  collectCandidates(bvh.root, aabb, candidates);

  for (const t of candidates) {
    const i = bvh.indices[t * 3] * 3;
    const j = bvh.indices[t * 3 + 1] * 3;
    const k = bvh.indices[t * 3 + 2] * 3;
    const ax = bvh.positions[i],     ay = bvh.positions[i + 1], az = bvh.positions[i + 2];
    const bx = bvh.positions[j],     by = bvh.positions[j + 1], bz = bvh.positions[j + 2];
    const cx = bvh.positions[k],     cyv = bvh.positions[k + 1], cz = bvh.positions[k + 2];
    const cp = closestPointTriToSegment(
      ax, ay, az, bx, by, bz, cx, cyv, cz,
      endX, cy, endZ, endX, topY, endZ,
    );
    const dx = cp.sx - cp.tx;
    const dy = cp.sy - cp.ty;
    const dz = cp.sz - cp.tz;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq >= radius * radius) continue;
    hits.push(t);
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    const hx = dx, hz = dz;
    const hlen = Math.hypot(hx, hz);
    if (hlen > 1e-6) {
      endX += (hx / hlen) * push;
      endZ += (hz / hlen) * push;
    }
  }
  return { hits, endX, endZ };
}

function collectCandidates(node, aabb, out) {
  if (!aabbOverlap(node.bbox, aabb)) return;
  if (node.tris) {
    for (const t of node.tris) out.push(t);
    return;
  }
  collectCandidates(node.left, aabb, out);
  collectCandidates(node.right, aabb, out);
}

function aabbOverlap(a, b) {
  return a[0] <= b[3] && a[3] >= b[0]
      && a[1] <= b[4] && a[4] >= b[1]
      && a[2] <= b[5] && a[5] >= b[2];
}

function closestPointTriToSegment(ax, ay, az, bx, by, bz, cx, cy, cz,
                                  p0x, p0y, p0z, p1x, p1y, p1z) {
  const N = 5;
  let best = { sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, d2: Infinity };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const sx = p0x + t * (p1x - p0x);
    const sy = p0y + t * (p1y - p0y);
    const sz = p0z + t * (p1z - p0z);
    const cp = closestPointOnTri(ax, ay, az, bx, by, bz, cx, cy, cz, sx, sy, sz);
    const dx = cp.x - sx, dy = cp.y - sy, dz = cp.z - sz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best.d2) {
      best = { sx, sy, sz, tx: cp.x, ty: cp.y, tz: cp.z, d2 };
    }
  }
  return best;
}

// Ericson, Real-Time Collision Detection §5.1.5.
function closestPointOnTri(ax, ay, az, bx, by, bz, cx, cy, cz, px, py, pz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return { x: ax, y: ay, z: az };
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return { x: bx, y: by, z: bz };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { x: ax + v * abx, y: ay + v * aby, z: az + v * abz };
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return { x: cx, y: cy, z: cz };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { x: ax + w * acx, y: ay + w * acy, z: az + w * acz };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return {
      x: bx + w * (cx - bx),
      y: by + w * (cy - by),
      z: bz + w * (cz - bz),
    };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return {
    x: ax + abx * v + acx * w,
    y: ay + aby * v + acy * w,
    z: az + abz * v + acz * w,
  };
}
