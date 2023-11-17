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
  }

  insert(cell) {
    const newNode = new TreeNode(cell);

    if (!this.root) {
      this.root = newNode;
    } else {
      this.insertNode(this.root, newNode);
    }
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
    let current = this.root;
    while (current.left !== null) {
      current = current.left;
    }
    return current.cell;
  }

  remove(cell) {
    this.root = this.removeNode(this.root, cell);
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
    return this.root === null;
  }
}

module.exports = {
  BinarySearchTree,
};
