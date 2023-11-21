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

module.exports = {
  BinarySearchTree,
  MinHeap,
};
