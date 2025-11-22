class TreeNode {
  constructor(cell) {
    this.cell = cell;
    this.left = null;
    this.right = null;
  }
}

class BinarySearchTree {
  constructor() {
    this.root = null;
    this.size = 0; // Added size property
  }

  insert(cell) {
    const newNode = new TreeNode(cell);

    if (!this.root) {
      this.root = newNode;
    } else {
      this.insertNode(this.root, newNode);
    }
    this.size++; // Increment size after insertion
  }

  insertNode(node, newNode) {
    if (newNode.cell.fCost < node.cell.fCost) {
      if (node.left === null) {
        node.left = newNode;
      } else {
        this.insertNode(node.left, newNode);
      }
    } else if (newNode.cell.fCost > node.cell.fCost) {
      if (node.right === null) {
        node.right = newNode;
      } else {
        this.insertNode(node.right, newNode);
      }
    } else {
      // Update the existing node with the new data
      node.cell = newNode.cell;
    }
  }

  update(cell) {
    this.updateNode(this.root, cell);
  }

  updateNode(node, updatedCell) {
    if (node === null) {
      return;
    }

    if (updatedCell.fCost < node.cell.fCost) {
      this.updateNode(node.left, updatedCell);
    } else if (updatedCell.fCost > node.cell.fCost) {
      this.updateNode(node.right, updatedCell);
    } else {
      // Update the existing node with the new data
      node.cell = updatedCell;
    }
  }

  getMin() {
    if (this.root === null) {
      return null;
    }
    return this.root.left ? this.root.left.cell : this.root.cell;
  }

  remove(cell) {
    this.root = this.removeNode(this.root, cell);
    this.size--; // Decrement size after removal
  }

  removeNode(node, cell) {
    if (node === null) {
      return null;
    } else if (cell.fCost < node.cell.fCost) {
      node.left = this.removeNode(node.left, cell);
      return node;
    } else if (cell.fCost > node.cell.fCost) {
      node.right = this.removeNode(node.right, cell);
      return node;
    } else {
      if (node.left === null && node.right === null) {
        node = null;
        return node;
      } else if (node.left === null) {
        node = node.right;
        return node;
      } else if (node.right === null) {
        node = node.left;
        return node;
      }

      const minRight = this.findMinNode(node.right);
      node.cell = minRight.cell;

      node.right = this.removeNode(node.right, minRight.cell);
      return node;
    }
  }

  findMinNode(node) {
    if (node.left === null) {
      return node;
    } else {
      return this.findMinNode(node.left);
    }
  }

  isEmpty() {
    return this.size === 0; // Check size instead of root
  }
}

class MinHeap {
  constructor(compare = (a, b) => a.fCost - b.fCost) {
    this.arr = [];
    this.compare = compare;
  }

  push(node) {
    this.arr.push(node);
    this.bubbleUp(this.arr.length - 1);
  }

  pop() {
    if (this.arr.length === 0) return null;
    if (this.arr.length === 1) return this.arr.pop();

    const top = this.arr[0];
    this.arr[0] = this.arr.pop();
    this.bubbleDown(0);

    return top;
  }

  bubbleUp(idx) {
    const { arr, compare } = this;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (compare(arr[parent], arr[idx]) <= 0) break;
      [arr[parent], arr[idx]] = [arr[idx], arr[parent]];
      idx = parent;
    }
  }

  bubbleDown(idx) {
    const { arr, compare } = this;
    const length = arr.length;

    while (true) {
      let left = 2 * idx + 1;
      let right = 2 * idx + 2;
      let smallest = idx;

      if (left < length && compare(arr[left], arr[smallest]) < 0) {
        smallest = left;
      }

      if (right < length && compare(arr[right], arr[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === idx) break;

      [arr[idx], arr[smallest]] = [arr[smallest], arr[idx]];
      idx = smallest;
    }
  }

  size() {
    return this.arr.length;
  }
}

class BinaryHeapOpenSet {
  constructor(compare = (a, b) => a.fCost - b.fCost) {
    this.heap = [null]; // dummy at index 0
    this.indexMap = new Map(); // Cell object -> index
    this.compare = compare;
  }

  size() {
    return this.heap.length - 1;
  }

  isEmpty() {
    return this.heap.length === 1;
  }

  push(val) {
    this.heap.push(val);
    const current = this.heap.length - 1;
    this.indexMap.set(val, current);
    this.bubbleUp(current);
  }

  bubbleUp(current) {
    while (current > 1) {
      const parent = current >>> 1;
      if (this.compare(this.heap[current], this.heap[parent]) >= 0) {
        break; // Heap property satisfied
      }
      this.swap(current, parent);
      current = parent;
    }
  }

  update(val) {
    const current = this.indexMap.get(val);

    // Safety checks
    if (current === undefined) {
      console.warn("HEAP UPDATE: value not found in indexMap");
      return;
    }

    if (this.heap[current] !== val) {
      console.warn("HEAP UPDATE: indexMap desync detected");
      return;
    }

    // Try bubbling up first
    const parent = current >>> 1;
    if (
      current > 1 &&
      this.compare(this.heap[current], this.heap[parent]) < 0
    ) {
      this.bubbleUp(current);
      return; // ← CRITICAL: early return after bubbling up
    }

    // Otherwise try bubbling down
    this.bubbleDown(current);
  }

  pop() {
    if (this.isEmpty()) return null;

    const smallest = this.heap[1];
    const last = this.heap.pop();

    this.indexMap.delete(smallest);

    if (!this.isEmpty()) {
      this.heap[1] = last;
      this.indexMap.set(last, 1);
      this.bubbleDown(1);
    }

    return smallest;
  }

  remove(val) {
    const index = this.indexMap.get(val);

    if (index === undefined) {
      console.warn("HEAP REMOVE: value not found");
      return;
    }

    const last = this.heap.pop();
    this.indexMap.delete(val);

    // If we removed the last element, we're done
    if (index >= this.heap.length) {
      return;
    }

    // Replace removed element with last element
    this.heap[index] = last;
    this.indexMap.set(last, index);

    // Restore heap property - try both directions
    const parent = index >>> 1;
    if (index > 1 && this.compare(this.heap[index], this.heap[parent]) < 0) {
      this.bubbleUp(index);
    } else {
      this.bubbleDown(index);
    }
  }

  bubbleDown(index) {
    const size = this.size();

    while (true) {
      const leftChild = index * 2;
      const rightChild = leftChild + 1;
      let smallest = index;

      // Find smallest among node and its children
      if (
        leftChild <= size &&
        this.compare(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild <= size &&
        this.compare(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      // If current node is smallest, heap property satisfied
      if (smallest === index) break;

      this.swap(index, smallest);
      index = smallest;
    }
  }

  swap(a, b) {
    [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
    this.indexMap.set(this.heap[a], a);
    this.indexMap.set(this.heap[b], b);
  }

  validateHeap() {
    for (let i = 1; i <= this.size(); i++) {
      const left = i * 2;
      const right = i * 2 + 1;

      if (this.indexMap.get(this.heap[i]) !== i) {
        console.error("IndexMap desync at", i, this.heap[i]);
        return false;
      }

      if (
        left <= this.size() &&
        this.compare(this.heap[i], this.heap[left]) > 0
      ) {
        console.error("Heap property violated at index:", i, "with left child");
        return false;
      }

      if (
        right <= this.size() &&
        this.compare(this.heap[i], this.heap[right]) > 0
      ) {
        console.error(
          "Heap property violated at index:",
          i,
          "with right child"
        );
        return false;
      }
    }
    return true;
  }
}

module.exports = {
  BinarySearchTree,
  MinHeap,
  BinaryHeapOpenSet,
};
