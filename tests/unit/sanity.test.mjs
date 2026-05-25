import { test } from 'node:test';
import assert from 'node:assert/strict';

test('sanity: node:test runs ESM modules', () => {
  assert.equal(1 + 1, 2);
});

test('sanity: Float32Array available (used by heightmap)', () => {
  const a = new Float32Array(4);
  a[2] = 1.5;
  assert.equal(a[2], 1.5);
  assert.equal(a.length, 4);
});
