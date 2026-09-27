/**
 * KD Tree core.
 *
 * Each node partitions a multidimensional point along an axis that cycles
 * 0,1,2,...,k-1,0,1,... as you descend the tree. Nearest-neighbor and range
 * queries prune subtrees whose splitting plane is farther than the current
 * best distance along the split axis.
 *
 * Design notes:
 * - Points are treated as immutable. The tree never mutates an input point.
 * - Distance is squared Euclidean. Comparing squared distances is equivalent
 *   to comparing actual distances and avoids a sqrt per step. If callers need
 *   true Euclidean distance they can sqrt the returned distance.
 * - Duplicate points are allowed and end up in the right subtree by convention.
 *   This keeps insertion deterministic for a given input order.
 * - We expose a Node class so callers can inspect or walk the tree if needed,
 *   but KDTree is the intended public surface for queries.
 */

/**
 * A node in the KD tree.
 *
 * Kept as a plain class rather than a frozen record so the construction
 * path can build bottom-up without allocating intermediate wrappers.
 */
export class Node {
  /**
   * @param {number[]} point The point stored at this node.
   * @param {number} axis The axis this node splits on.
   * @param {Node|null} left Subtree with points strictly less along axis.
 * @param {Node|null} right Subtree with points greater-or-equal along axis.
   */
  constructor(point, axis, left, right) {
    this.point = point;
    this.axis = axis;
    this.left = left;
    this.right = right;
  }
}

/**
 * Squared Euclidean distance. We avoid sqrt because it is monotonic:
 * a < b for squared distances iff sqrt(a) < sqrt(b) for real distances,
 * so nearest-neighbor comparisons give the same answer without the cost.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function squaredDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/**
 * A KD tree over fixed-dimension numeric points.
 */
export class KDTree {
  /**
   * @param {number[][]} points Points to index. The tree does not retain a
   *   reference to the outer array, but it does retain references to the
   *   individual point arrays. Callers must not mutate them after building.
   * @param {number} [dimensions] Number of dimensions per point. Required
   *   if points is empty so the tree can still validate later inserts.
   */
  constructor(points, dimensions) {
    if (!Array.isArray(points)) {
      throw new TypeError("points must be an array");
    }

    let k = dimensions;
    if (k === undefined) {
      if (points.length === 0) {
        throw new Error(
          "cannot infer dimensions from an empty point set; pass dimensions explicitly",
        );
      }
      k = points[0].length;
    }
    if (!Number.isInteger(k) || k <= 0) {
      throw new Error("dimensions must be a positive integer");
    }

    this.dimensions = k;
    this.root = null;
    this.size = 0;

    for (const p of points) {
      this.insert(p);
    }
  }

  /**
   * Validate that a point has the right number of dimensions. Throws on
   * mismatch because silent truncation or padding would produce a tree
   * whose queries are quietly wrong — the worst possible failure mode.
   *
   * @param {number[]} point
   * @private
   */
  _validatePoint(point) {
    if (!Array.isArray(point)) {
      throw new TypeError("point must be an array");
    }
    if (point.length !== this.dimensions) {
      throw new Error(
        `point has ${point.length} dimensions; expected ${this.dimensions}`,
      );
    }
    for (let i = 0; i < point.length; i++) {
      if (typeof point[i] !== "number" || !Number.isFinite(point[i])) {
        throw new TypeError("every coordinate must be a finite number");
      }
    }
  }

  /**
   * Insert a point. O(log n) on balanced input, O(n) worst case.
   *
   * @param {number[]} point
   */
  insert(point) {
    this._validatePoint(point);
    const newNode = new Node(point, 0, null, null);
    if (this.root === null) {
      this.root = newNode;
      this.size += 1;
      return;
    }
    let current = this.root;
    // Descend, rotating the split axis each level. Duplicates go right.
    while (true) {
      const axis = current.axis;
      const nextAxis = (axis + 1) % this.dimensions;
      if (point[axis] < current.point[axis]) {
        if (current.left === null) {
          newNode.axis = nextAxis;
          current.left = newNode;
          this.size += 1;
          return;
        }
        current = current.left;
      } else {
        if (current.right === null) {
          newNode.axis = nextAxis;
          current.right = newNode;
          this.size += 1;
          return;
        }
        current = current.right;
      }
    }
  }

  /**
   * Nearest neighbor search. Prunes the far subtree when the splitting plane
   * is farther than the current best along the split axis, which is the
   * standard KD-tree optimization. We still need to come back and check the
   * far subtree if the plane is within range, because the closest point can
   * straddle the plane even when the query is on one side.
   *
   * @param {number[]} query
   * @returns {{point: number[]|null, distance: number}} The nearest stored
   *   point and its squared Euclidean distance to the query, or
   *   {point: null, distance: Infinity} if the tree is empty.
   */
  nearest(query) {
    this._validatePoint(query);
    if (this.root === null) {
      return { point: null, distance: Infinity };
    }

    let best = this.root.point;
    let bestDist = squaredDistance(query, best);

    // Recursive walk with explicit pruning. We use recursion rather than
    // an explicit stack because the depth equals the tree depth, which for
    // balanced input is ~log2(n); the depth only becomes a concern for
    // degenerate input, which callers should avoid.
    const visit = (node) => {
      if (node === null) return;

      const dist = squaredDistance(query, node.point);
      if (dist < bestDist) {
        best = node.point;
        bestDist = dist;
      }

      const axis = node.axis;
      const diff = query[axis] - node.point[axis];
      const near = diff < 0 ? node.left : node.right;
      const far = diff < 0 ? node.right : node.left;

      visit(near);

      // Only descend the far side if the query is within `bestDist` of the
      // splitting plane along this axis. diff*diff is the squared distance
      // from the query to the plane; if that exceeds bestDist, no point on
      // the far side can beat the current best.
      if (diff * diff < bestDist) {
        visit(far);
      }
    };

    visit(this.root);
    return { point: best, distance: bestDist };
  }

  /**
   * Range search: return all points within a squared Euclidean radius of the
   * query. Uses the same plane-pruning as nearest().
   *
   * @param {number[]} query
   * @param {number} radiusSquared Squared Euclidean radius. Passing the
   *   squared radius lets callers avoid sqrt and keeps the contract explicit
   *   about which distance is being bounded.
   * @returns {number[][]} Points within the radius, in tree-traversal order.
   */
  range(query, radiusSquared) {
    this._validatePoint(query);
    if (typeof radiusSquared !== "number" || !Number.isFinite(radiusSquared) || radiusSquared < 0) {
      throw new Error("radiusSquared must be a non-negative finite number");
    }

    const results = [];
    const visit = (node) => {
      if (node === null) return;

      const dist = squaredDistance(query, node.point);
      if (dist <= radiusSquared) {
        results.push(node.point);
      }

      const axis = node.axis;
      const diff = query[axis] - node.point[axis];
      const near = diff < 0 ? node.left : node.right;
      const far = diff < 0 ? node.right : node.left;

      visit(near);
      if (diff * diff <= radiusSquared) {
        visit(far);
      }
    };

    visit(this.root);
    return results;
  }
}
