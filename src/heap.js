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
  constructor() {
    // Initialing the array heap and adding a dummy element at index 0
    this.heap = [null];
    this.indexMap = new Map(); // Map to store index of each value
  }

  size() {
    return this.heap.length - 1;
  }

  isEmpty() {
    return this.heap.length === 1;
  }

  push(val) {
    // Inserting the new node at the end of the heap array
    this.heap.push(val);
    const current = this.heap.length - 1;
    this.indexMap.set(val, current);
    this.bubbleUp(current);
  }

  bubbleUp(current) {
    let parent = current >>> 1;
    while (current > 1 && this.heap[parent].fCost > this.heap[current].fCost) {
      this.swap(parent, current);
      current = parent;
      parent = current >>> 1;
    }
  }

  update(val) {
    const current = this.indexMap.get(val);
    if (current === undefined) return; // Value not found
    this.bubbleUp(current);
  }

  swap(a, b) {
    [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
    this.indexMap.set(this.heap[a], a);
    this.indexMap.set(this.heap[b], b);
  }

  pop() {
    if (this.isEmpty()) return null;
    const smallest = this.heap[1];
    this.heap[1] = this.heap.pop();
    if (!this.isEmpty()) {
      this.indexMap.set(this.heap[1], 1);
      this.bubbleDown(1);
    }
    this.indexMap.delete(smallest);
    return smallest;
  }

  bubbleDown(index) {
    const size = this.size();
    let current = index;
    let smallerChild = current * 2;
    const cost = this.heap[current].fCost;
    while (smallerChild <= size) {
      if (
        smallerChild < size &&
        this.heap[smallerChild].fCost > this.heap[smallerChild + 1].fCost
      ) {
        smallerChild++;
      }
      if (cost <= this.heap[smallerChild].fCost) break;
      this.swap(current, smallerChild);
      current = smallerChild;
      smallerChild *= 2;
    }
  }
}

module.exports = {
  BinarySearchTree,
  MinHeap,
  BinaryHeapOpenSet,
};
