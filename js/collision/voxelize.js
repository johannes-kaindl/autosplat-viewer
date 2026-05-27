// voxelize.js — turn a Gaussian-Splat point cloud into a voxel density grid.
// Pure module: no DOM, no PlayCanvas. Input positions are interleaved
// world-space (x, y, z) triples (Float32Array). Output is a flat Float32Array
// of length resolution³ indexed as density[k*res² + j*res + i] for cell
// (i, j, k) along (x, y, z).
//
// Each splat falling into a cell adds 1 to that cell's density. Callers
// typically apply a 3×3×3 box blur and a percentile-based iso threshold.

export function voxelize(positions, bounds, resolution = 64) {
  const cellCount = resolution ** 3;
  const density = new Float32Array(cellCount);
  const sx = bounds.max.x - bounds.min.x;
  const sy = bounds.max.y - bounds.min.y;
  const sz = bounds.max.z - bounds.min.z;
  if (sx <= 0 || sy <= 0 || sz <= 0) return { density, resolution };
  const minX = bounds.min.x, minY = bounds.min.y, minZ = bounds.min.z;
  const n = (positions.length / 3) | 0;
  for (let p = 0; p < n; p++) {
    const x = positions[p * 3];
    const y = positions[p * 3 + 1];
    const z = positions[p * 3 + 2];
    let i = Math.floor((x - minX) / sx * resolution);
    let j = Math.floor((y - minY) / sy * resolution);
    let k = Math.floor((z - minZ) / sz * resolution);
    if (i < 0 || i >= resolution) continue;
    if (j < 0 || j >= resolution) continue;
    if (k < 0 || k >= resolution) continue;
    density[k * resolution * resolution + j * resolution + i] += 1;
  }
  return { density, resolution };
}

/**
 * One pass of a 3×3×3 box-blur over a flat density grid. Edge cells average
 * only the in-bounds neighbours (no wrap). Returns a new Float32Array; the
 * input is not mutated. Always divides by 27 so edge cells fade softly
 * instead of getting an artificial bright rim.
 */
export function smoothDensity(density, resolution) {
  const out = new Float32Array(density.length);
  const r = resolution;
  for (let k = 0; k < r; k++) {
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        let sum = 0;
        for (let dk = -1; dk <= 1; dk++) {
          const nk = k + dk;
          if (nk < 0 || nk >= r) continue;
          for (let dj = -1; dj <= 1; dj++) {
            const nj = j + dj;
            if (nj < 0 || nj >= r) continue;
            for (let di = -1; di <= 1; di++) {
              const ni = i + di;
              if (ni < 0 || ni >= r) continue;
              sum += density[nk * r * r + nj * r + ni];
            }
          }
        }
        out[k * r * r + j * r + i] = sum / 27;
      }
    }
  }
  return out;
}

/**
 * Pick an iso threshold that survives both dense (church demo) and sparse
 * (outdoor) scans. Returns max(1.5, median(non-zero) * 0.5). 1.5 means
 * "more than one splat per cell after blur" — a useful baseline that avoids
 * meshing pure noise.
 */
export function defaultIso(density) {
  const nz = [];
  for (let i = 0; i < density.length; i++) {
    if (density[i] > 0) nz.push(density[i]);
  }
  if (nz.length === 0) return 1.5;
  nz.sort((a, b) => a - b);
  const median = nz[Math.floor((nz.length - 1) / 2)];
  return Math.max(1.5, median * 0.5);
}
