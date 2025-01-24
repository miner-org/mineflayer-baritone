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
  constructor() {
    this.heap = [];
    this.deletedSet = new Set();
  }

  insert(cell) {
    this.heap.push(cell);
    this.bubbleUp(this.heap.length - 1);
  }

  bubbleUp(index) {
    let currentIdx = index;
    let parentIdx = Math.floor((currentIdx - 1) / 2);

    while (
      currentIdx > 0 &&
      this.heap[currentIdx].fCost < this.heap[parentIdx].fCost
    ) {
      [this.heap[currentIdx], this.heap[parentIdx]] = [
        this.heap[parentIdx],
        this.heap[currentIdx],
      ];
      currentIdx = parentIdx;
      parentIdx = Math.floor((currentIdx - 1) / 2);
    }
  }

  extractMin() {
    while (this.heap.length && this.deletedSet.has(this.heap[0])) {
      this.deletedSet.delete(this.heap[0]);
      this.heap[0] = this.heap.pop();
      this.heapify(0);
    }

    if (this.heap.length === 1) {
      return this.heap.pop();
    }

    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.heapify(0);
    return min;
  }

  update(nodeToUpdate, newCost) {
    const index = this.heap.findIndex((node) => node === nodeToUpdate);

    if (index !== -1) {
      this.heap[index].fCost = newCost; // Update the cost

      // Adjust the heap if necessary after updating the cost
      this.bubbleUp(index);
      this.heapify(index);
    }
  }

  heapify(index) {
    let smallest = index;
    const left = 2 * index + 1;
    const right = 2 * index + 2;
    const length = this.heap.length;

    if (left < length && this.heap[left].fCost < this.heap[smallest].fCost) {
      smallest = left;
    }

    if (right < length && this.heap[right].fCost < this.heap[smallest].fCost) {
      smallest = right;
    }

    if (smallest !== index) {
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      this.heapify(smallest);
    }
  }

  isEmpty() {
    return this.heap.length - this.deletedSet.size === 0;
  }
}

class BinaryHeapOpenSet {
  constructor(compare = (a, b) => a.fCost - b.fCost) {
    // Initialize the heap array with a dummy element at index 0
    this.heap = [null];
    this.indexMap = new Map(); // Map to store the index of each value
    this.compare = compare; // Comparison function for custom priorities
  }

  size() {
    return this.heap.length - 1; // Exclude the dummy element
  }

  isEmpty() {
    return this.heap.length === 1;
  }

  push(val) {
    // Insert the new node at the end of the heap
    this.heap.push(val);
    const current = this.heap.length - 1;
    this.indexMap.set(val, current); // Track the index of the value
    this.bubbleUp(current); // Restore the heap property
  }

  bubbleUp(current) {
    let parent = current >>> 1; // Integer division by 2
    while (
      current > 1 &&
      this.compare(this.heap[current], this.heap[parent]) < 0
    ) {
      this.swap(current, parent);
      current = parent;
      parent = current >>> 1;
    }
  }

  update(val) {
    const current = this.indexMap.get(val);
    if (current === undefined) return; // Value not found in the heap
    this.bubbleUp(current); // Try to move up
    this.bubbleDown(current); // Try to move down
  }

  pop() {
    if (this.isEmpty()) return null;
    if (this.size() === 1) {
      const smallest = this.heap.pop(); // Remove the only element
      this.indexMap.delete(smallest);
      return smallest;
    }

    const smallest = this.heap[1]; // Root of the heap
    this.heap[1] = this.heap.pop(); // Move the last element to the root
    this.indexMap.set(this.heap[1], 1); // Update index of the new root
    this.bubbleDown(1); // Restore the heap property
    this.indexMap.delete(smallest); // Remove from indexMap
    return smallest;
  }

  bubbleDown(index) {
    const size = this.size();
    let current = index;
    const value = this.heap[current];
    while (true) {
      const leftChild = current * 2;
      const rightChild = leftChild + 1;
      let smallest = current;

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

      if (smallest === current) break;

      this.swap(current, smallest);
      current = smallest;
    }
  }

  swap(a, b) {
    [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
    this.indexMap.set(this.heap[a], a);
    this.indexMap.set(this.heap[b], b);
  }

  validateHeap() {
    // Debugging method to check the integrity of the heap
    for (let i = 1; i <= this.size(); i++) {
      const left = i * 2;
      const right = i * 2 + 1;
      if (
        left <= this.size() &&
        this.compare(this.heap[i], this.heap[left]) > 0
      ) {
        console.error("Heap property violated at index:", i);
      }
      if (
        right <= this.size() &&
        this.compare(this.heap[i], this.heap[right]) > 0
      ) {
        console.error("Heap property violated at index:", i);
      }
    }
  }
}


module.exports = {
  BinarySearchTree,
  MinHeap,
  BinaryHeapOpenSet,
};
