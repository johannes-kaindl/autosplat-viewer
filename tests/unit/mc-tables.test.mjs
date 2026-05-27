import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeTable, triTable } from '../../js/collision/mc-tables.js';

test('mc-tables: edgeTable has 256 entries', () => {
  assert.equal(edgeTable.length, 256);
});

test('mc-tables: triTable has 256 rows of 16 entries', () => {
  assert.equal(triTable.length, 256);
  for (const row of triTable) assert.equal(row.length, 16);
});

test('mc-tables: known cases', () => {
  // Case 0 (all corners outside surface): no triangles, no edges.
  assert.equal(edgeTable[0], 0x0);
  assert.equal(triTable[0][0], -1);
  // Case 255 (all corners inside surface): also no triangles.
  assert.equal(edgeTable[255], 0x0);
  assert.equal(triTable[255][0], -1);
  // Case 1 (only corner 0 inside): single triangle on edges 0, 8, 3.
  assert.equal(edgeTable[1], 0x109);
  assert.deepEqual(triTable[1].slice(0, 4), [0, 8, 3, -1]);
  // Case 254 (all corners except corner 0 inside): complementary triangle,
  // same edges, reversed winding → 0, 3, 8.
  assert.equal(edgeTable[254], 0x109);
  assert.deepEqual(triTable[254].slice(0, 4), [0, 3, 8, -1]);
});

test('mc-tables: every triTable row terminates with -1 in the correct spot', () => {
  for (let i = 0; i < 256; i++) {
    const row = triTable[i];
    // Triangle entries come in groups of 3; non-(-1) entries must be a
    // multiple of 3.
    let first = row.indexOf(-1);
    if (first === -1) first = 16;
    assert.equal(first % 3, 0, `row ${i}: ${first} non-(-1) entries`);
    // Everything after the first -1 must also be -1.
    for (let j = first; j < 16; j++) {
      assert.equal(row[j], -1, `row ${i}, col ${j}`);
    }
  }
});
