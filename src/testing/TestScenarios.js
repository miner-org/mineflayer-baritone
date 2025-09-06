/**
 * Predefined test scenarios for common movement patterns and edge cases
 */

const testScenarios = {
  // Basic movement tests
  basicForward: {
    description: "Basic forward movement on flat ground",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 2, y: 63, z: 0, type: "stone", solid: true },
      ]
    },
    config: {
      breakBlocks: false,
      placeBlocks: false,
    },
    expectedMoves: ["MoveForward"],
    expectedPositions: [
      { x: 1, y: 64, z: 0 }
    ]
  },

  // MoveForwardUp tests
  stepUp: {
    description: "Simple step up movement",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 64, z: 0, type: "stone", solid: true }, // step
      ]
    },
    config: {
      breakBlocks: false,
      placeBlocks: false,
    },
    expectedMoves: ["MoveForwardUp"],
    expectedPositions: [
      { x: 1, y: 65, z: 0 }
    ]
  },

  // The problematic MoveForwardUp chain scenario
  moveForwardUpChain: {
    description: "Chain of MoveForwardUp moves with breaking - tests virtual blocks issue",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        // Ground level
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 2, y: 63, z: 0, type: "stone", solid: true },
        { x: 3, y: 63, z: 0, type: "stone", solid: true },
        
        // Step platforms (1 block high)
        { x: 1, y: 64, z: 0, type: "stone", solid: true },
        { x: 2, y: 65, z: 0, type: "stone", solid: true },
        { x: 3, y: 66, z: 0, type: "stone", solid: true },
      ]
    },
    config: {
      breakBlocks: false, // Start without breaking to test basic step up
      placeBlocks: false,
    },
    expectedMoves: ["MoveForwardUp"],
    expectedPositions: [
      { x: 1, y: 65, z: 0 }
    ]
  },

  // MoveForwardUp with breaking chain - the actual issue test
  moveForwardUpBreakingChain: {
    description: "Test MoveForwardUp chain with breaking - reproduces virtual blocks issue",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        // Ground level
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 2, y: 63, z: 0, type: "stone", solid: true },
        
        // Blocks to break in sequence
        { x: 1, y: 64, z: 0, type: "stone", solid: true },
        { x: 2, y: 64, z: 0, type: "stone", solid: true },
        
        // Platform at higher level
        { x: 1, y: 64, z: 0, type: "stone", solid: true }, // This should be stood on
        { x: 2, y: 64, z: 0, type: "stone", solid: true }, // After breaking above
      ]
    },
    config: {
      breakBlocks: true,
      placeBlocks: false,
    },
    expectedMoves: ["MoveForward"], // Should be able to break and move forward
    expectedPositions: [
      { x: 1, y: 64, z: 0 },
      { x: 2, y: 64, z: 0 }
    ]
  },

  // Virtual blocks test
  virtualBlocksTest: {
    description: "Test movement with pre-existing virtual blocks",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true }, // This will be "broken" virtually
        { x: 2, y: 63, z: 0, type: "stone", solid: true },
      ]
    },
    virtualBlocks: {
      "1,63,0": "air" // Mark this block as virtually broken
    },
    config: {
      breakBlocks: false,
      placeBlocks: true,
    },
    expectedMoves: ["MoveForward"],
    forbiddenPositions: [
      { x: 1, y: 64, z: 0 } // Should not be able to stand here due to virtual air
    ]
  },

  // Breaking and placing test
  breakAndPlace: {
    description: "Test breaking blocks in feet and head, then placing scaffolding",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 64, z: 0, type: "stone", solid: true }, // block to break (feet)
        { x: 1, y: 65, z: 0, type: "stone", solid: true }, // block to break (head)
        // No support below, so should need scaffolding
      ]
    },
    config: {
      breakBlocks: true,
      placeBlocks: true,
      disposableBlocks: ["dirt", "cobblestone"]
    },
    expectedMoves: ["MoveForward"],
    expectedPositions: [
      { x: 1, y: 64, z: 0 }
    ]
  },

  // Parkour test
  parkourGap: {
    description: "Test parkour jumping across a gap",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        // Gap at x: 1, 2
        { x: 3, y: 63, z: 0, type: "stone", solid: true }, // landing
        { x: 4, y: 63, z: 0, type: "stone", solid: true },
      ]
    },
    config: {
      parkour: true,
      breakBlocks: false,
      placeBlocks: false,
    },
    // Remove expectedMoves temporarily to see all generated moves
    expectedMoves: ["MoveForwardParkour"],
    expectedPositions: [
      { x: 3, y: 64, z: 0 }
    ]
  },

  // Diagonal movement test
  diagonalMovement: {
    description: "Test diagonal movement",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 1, type: "stone", solid: true },
        { x: -1, y: 63, z: 1, type: "stone", solid: true },
        { x: 1, y: 63, z: -1, type: "stone", solid: true },
        { x: -1, y: 63, z: -1, type: "stone", solid: true },
      ]
    },
    config: {
      breakBlocks: false,
      placeBlocks: false,
    },
    expectedMoves: ["MoveDiagonal"],
    expectedCount: 4 // Should generate 4 diagonal moves
  },

  // Fall down test
  fallDown: {
    description: "Test falling down to lower level",
    origin: { x: 0, y: 66, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 65, z: 0, type: "stone", solid: true }, // current level
        { x: 1, y: 63, z: 0, type: "stone", solid: true }, // lower level to land on
      ]
    },
    config: {
      breakBlocks: false,
      placeBlocks: false,
      maxFallDist: 3,
    },
    expectedMoves: ["MoveForwardDown"],
    expectedPositions: [
      { x: 1, y: 64, z: 0 }
    ]
  },

  // Water/swimming test
  waterMovement: {
    description: "Test movement in water",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 64, z: 0, type: "water", solid: false },
        { x: 1, y: 64, z: 0, type: "water", solid: false },
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
      ]
    },
    config: {
      swimming: true,
      breakBlocks: false,
      placeBlocks: false,
    },
    expectedMoves: ["MoveSwimForward"],
  },

  // Obstacle avoidance test
  obstacleAvoidance: {
    description: "Test avoiding blocks in blocksToStayAway",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 64, z: 0, type: "cactus", solid: false }, // should avoid
      ]
    },
    config: {
      breakBlocks: false,
      placeBlocks: false,
      blocksToStayAway: ["cactus"]
    },
    forbiddenPositions: [
      { x: 1, y: 64, z: 0 } // Should not walk into cactus
    ]
  },

  // Unbreakable blocks test
  unbreakableBlocks: {
    description: "Test handling of unbreakable blocks",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 64, z: 0, type: "bedrock", solid: true }, // unbreakable
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
      ]
    },
    config: {
      breakBlocks: true,
      placeBlocks: false,
      unbreakableBlocks: ["bedrock"]
    },
    forbiddenPositions: [
      { x: 1, y: 64, z: 0 } // Should not be able to move through bedrock
    ]
  },

  // Complex scenario: tunneling
  tunneling: {
    description: "Test complex tunneling with breaking and placing",
    origin: { x: 0, y: 64, z: 0 },
    world: {
      blocks: [
        // Floor
        { x: 0, y: 63, z: 0, type: "stone", solid: true },
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 2, y: 63, z: 0, type: "stone", solid: true },
        
        // Wall to break through
        { x: 1, y: 64, z: 0, type: "stone", solid: true },
        { x: 1, y: 65, z: 0, type: "stone", solid: true },
      ]
    },
    config: {
      breakBlocks: true,
      placeBlocks: true,
    },
    expectedMoves: ["MoveForward"],
    expectedPositions: [
      { x: 1, y: 64, z: 0 }
    ]
  }
};

module.exports = testScenarios;
