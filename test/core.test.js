import { test } from "node:test";
import assert from "node:assert/strict";

import { KDTree, Node, squaredDistance } from "../src/index.js";

// ---- squaredDistance ------------------------------------------------------

test("squaredDistance matches manual computation", () => {
  assert.equal(squaredDistance([0, 0], [3, 4]), 25);
  assert.equal(squaredDistance([1, 1, 1], [1, 1, 1]), 0);
});

// ---- construction ---------------------------------------------------------

test("builds from a non-empty point set and exposes size", () => {
  const t = new KDTree([[2, 3], [5, 4], [9, 6], [4, 7], [8, 1], [7, 2]]);
  assert.equal(t.size, 6);
  assert.equal(t.dimensions, 2);
  assert.ok(t.root instanceof Node);
});

test("empty point set with explicit dimensions produces an empty tree", () => {
  const t = new KDTree([], 3);
  assert.equal(t.size, 0);
  assert.equal(t.root, null);
  assert.equal(t.dimensions, 3);
});

test("empty point set without dimensions throws", () => {
  assert.throws(() => new KDTree([]), /dimensions/);
});

test("constructor rejects non-positive dimensions", () => {
  assert.throws(() => new KDTree([], 0));
  assert.throws(() => new KDTree([], -1));
  assert.throws(() => new KDTree([], 1.5));
});

test("constructor rejects non-array input", () => {
  assert.throws(() => new KDTree("nope"), /array/);
});

test("insert validates point dimensions against the tree", () => {
  const t = new KDTree([], 2);
  t.insert([1, 2]);
  assert.throws(() => t.insert([1, 2, 3]), /expected 2/);
  assert.throws(() => t.insert([1]), /expected 2/);
});

test("insert rejects non-finite coordinates", () => {
  const t = new KDTree([], 2);
  assert.throws(() => t.insert([1, NaN]));
  assert.throws(() => t.insert([1, Infinity]));
  assert.throws(() => t.insert(["1", 2]));
});

test("insert grows the tree and updates size", () => {
  const t = new KDTree([], 2);
  assert.equal(t.size, 0);
  t.insert([1, 1]);
  assert.equal(t.size, 1);
  t.insert([2, 2]);
  assert.equal(t.size, 2);
});

// ---- nearest neighbor -----------------------------------------------------

test("nearest on an empty tree returns null with Infinity distance", () => {
  const t = new KDTree([], 2);
  const r = t.nearest([0, 0]);
  assert.deepEqual(r.point, null);
  assert.equal(r.distance, Infinity);
});

test("nearest returns the exact nearest of several points", () => {
  const t = new KDTree([[0, 0], [10, 10], [5, 5], [1, 7]]);
  // Query [4,4] is closest to [5,5].
  const r = t.nearest([4, 4]);
  assert.deepEqual(r.point, [5, 5]);
  assert.equal(r.distance, 2); // squared distance
});

test("nearest honors points lying exactly on the split plane", () => {
  // Constructed so the query must cross the split plane to find the true
  // nearest; this exercises the far-subtree pruning condition.
  const t = new KDTree([[5, 5], [5, 6], [5, 4], [10, 5]]);
  const r = t.nearest([5, 5]);
  assert.deepEqual(r.point, [5, 5]);
  assert.equal(r.distance, 0);
});

test("nearest handles a query that is itself a stored point", () => {
  const t = new KDTree([[1, 2], [3, 4], [5, 6]]);
  const r = t.nearest([3, 4]);
  assert.deepEqual(r.point, [3, 4]);
  assert.equal(r.distance, 0);
});

test("nearest is correct on duplicate points", () => {
  const t = new KDTree([[1, 1], [1, 1], [1, 1]]);
  const r = t.nearest([1, 1]);
  assert.deepEqual(r.point, [1, 1]);
  assert.equal(r.distance, 0);
});

test("nearest validates query dimensions", () => {
  const t = new KDTree([[1, 1]]);
  assert.throws(() => t.nearest([1, 1, 1]), /expected 2/);
  assert.throws(() => t.nearest([1]), /expected 2/);
});

// ---- range search ---------------------------------------------------------

test("range returns all points within the squared radius", () => {
  const t = new KDTree([[0, 0], [1, 0], [0, 1], [5, 5], [10, 10]]);
  const results = t.range([0, 0], 1.5); // radius ~1.22 -> includes the axis neighbors
  // [0,0] dist 0, [1,0] dist 1, [0,1] dist 1, [5,5] dist 50, [10,10] dist 200
  assert.equal(results.length, 3);
  for (const p of [[0, 0], [1, 0], [0, 1]]) {
    assert.ok(results.some((r) => r[0] === p[0] && r[1] === p[1]));
  }
});

test("range with radius 0 returns only exact matches", () => {
  const t = new KDTree([[1, 1], [2, 2]]);
  assert.equal(t.range([1, 1], 0).length, 1);
  assert.deepEqual(t.range([1, 1], 0)[0], [1, 1]);
  assert.equal(t.range([3, 3], 0).length, 0);
});

test("range on empty tree returns an empty array", () => {
  const t = new KDTree([], 2);
  assert.deepEqual(t.range([0, 0], 100), []);
});

test("range rejects invalid radii", () => {
  const t = new KDTree([[0, 0]]);
  assert.throws(() => t.range([0, 0], -1));
  assert.throws(() => t.range([0, 0], NaN));
  assert.throws(() => t.range([0, 0], "1"));
});

test("range validates query dimensions", () => {
  const t = new KDTree([[1, 1]]);
  assert.throws(() => t.range([1], 1), /expected 2/);
  assert.throws(() => t.range([1, 1, 1], 1), /expected 2/);
});
