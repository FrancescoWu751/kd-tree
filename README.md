# kdtree

A small KD tree for fixed-dimension numeric points. Builds a tree that cycles
the split axis 0,1,...,k-1 down each level, and answers nearest-neighbor and
radius queries with the standard plane-pruning.

```js
import { KDTree, squaredDistance } from "./src/index.js";

const tree = new KDTree([[2, 3], [5, 4], [9, 6], [4, 7], [8, 1]]);

// Squared-Euclidean nearest neighbor.
const { point, distance } = tree.nearest([4, 5]);
// point: [5, 4], distance: 2

// All points within a squared radius.
const nearby = tree.range([4, 5], 4);
```

## Why

Nearest-neighbor by brute force is O(n) per query. A KD tree gets it down to
~O(log n) for balanced, low-dimensional input, which is the case it's built
for. The trade-off: performance degrades toward O(n) as dimensionality grows
past ~20 or as the data becomes pathologically clustered, because the pruning
condition stops cutting off subtrees. This library is for tens of dimensions
or fewer and thousands to millions of points; beyond that you want an
approximate index.

## Edge cases

- An empty point set is allowed, but you must pass `dimensions` explicitly,
  because the tree can't infer k from zero points. Forgetting this throws.
- Distance is **squared** Euclidean in the public API (`nearest` returns
  `distance`, `range` takes `radiusSquared`). Squaring is monotonic with
  real distance, so it gives identical ordering without a sqrt per step.
  Take `Math.sqrt(distance)` if you want true Euclidean distance.
- Duplicate points are stored in the right subtree. `nearest` will return
  one of the duplicates but makes no guarantee which.
- Points must be arrays of finite numbers. NaN and Infinity are rejected at
  insert and query time, because they make distance comparisons undefined.

## Exports

- `KDTree` — the tree. Constructor `(points, dimensions?)`. Methods
  `insert(point)`, `nearest(query) -> {point, distance}`,
  `range(query, radiusSquared) -> number[][]`, plus `root`, `size`,
  `dimensions` properties.
- `Node` — internal node class. Exposed for tree inspection; not part of
  the query API.
- `squaredDistance(a, b)` — squared Euclidean distance between two points.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

