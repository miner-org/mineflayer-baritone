const { 
  DirectionalVec3, 
  getNeighbors2,
  getAllMoves,
  getMovesByCategory,
  getMovesByTag,
  getMoveMetadata,
  getAllMoveNames,
  getCompatibleMoves,
  moveRegistry
} = require("../movement");
const fs = require("fs");
const path = require("path");

/**
 * Comprehensive Move Testing System
 * Allows easy testing of movement algorithms with visual output and scenario building
 */
class MoveTestRunner {
  constructor() {
    this.scenarios = new Map();
    this.testResults = [];
    this.mockBot = new MockBot();
    this.mockConfig = new MockConfig();
    this.mockManager = new MockManager();
  }

  /**
   * Register a test scenario
   * @param {string} name - Scenario name
   * @param {TestScenario} scenario - Scenario configuration
   */
  addScenario(name, scenario) {
    this.scenarios.set(name, scenario);
    return this;
  }

  /**
   * Run a specific test scenario
   * @param {string} scenarioName - Name of scenario to run
   * @param {Object} options - Test options
   */
  async runScenario(scenarioName, options = {}) {
    const scenario = this.scenarios.get(scenarioName);
    if (!scenario) {
      throw new Error(`Scenario '${scenarioName}' not found`);
    }

    console.log(`\n🧪 Running scenario: ${scenarioName}`);
    console.log(`📋 Description: ${scenario.description}`);

    // Setup the world
    this.setupWorld(scenario.world);
    
    // Configure settings
    this.setupConfig(scenario.config || {});

    // Setup virtual blocks if provided
    if (scenario.virtualBlocks) {
      this.setupVirtualBlocks(scenario.virtualBlocks);
    }

    // Run the test
    const result = await this.executeTest(scenario, options);
    
    // Generate visual output
    if (options.visual !== false) {
      this.generateVisualOutput(scenario, result, scenarioName);
    }

    this.testResults.push({
      name: scenarioName,
      scenario,
      result,
      timestamp: new Date().toISOString()
    });

    return result;
  }

  /**
   * Run all registered scenarios
   */
  async runAll(options = {}) {
    const results = [];
    
    console.log(`\n🚀 Running ${this.scenarios.size} test scenarios...`);
    
    for (const [name, scenario] of this.scenarios) {
      try {
        const result = await this.runScenario(name, options);
        results.push({ name, result, success: true });
      } catch (error) {
        console.error(`❌ Scenario '${name}' failed:`, error.message);
        results.push({ name, error: error.message, success: false });
      }
    }

    // Generate summary report
    this.generateSummaryReport(results);
    
    return results;
  }

  /**
   * Setup the mock world with blocks
   */
  setupWorld(worldConfig) {
    this.mockBot.clearWorld();
    
    for (const blockData of worldConfig.blocks || []) {
      const pos = new DirectionalVec3(blockData.x, blockData.y, blockData.z, { x: 0, z: 0 });
      this.mockBot.setBlock(pos, {
        name: blockData.type,
        boundingBox: blockData.solid ? "block" : "empty",
        ...blockData.properties
      });
    }
  }

  /**
   * Setup test configuration
   */
  setupConfig(configData) {
    Object.assign(this.mockConfig, configData);
  }

  /**
   * Setup virtual blocks for testing pathfinding chains
   */
  setupVirtualBlocks(virtualBlocks) {
    this.mockBot.virtualBlocks = new Map();
    
    for (const [posStr, state] of Object.entries(virtualBlocks)) {
      this.mockBot.virtualBlocks.set(posStr, state);
    }
  }

  /**
   * Execute the actual movement test
   */
  async executeTest(scenario, options) {
    if (!scenario.origin) {
      throw new Error('Scenario missing origin property');
    }
    
    const origin = new DirectionalVec3(
      scenario.origin.x, 
      scenario.origin.y, 
      scenario.origin.z,
      { x: 0, z: 0 } // Default direction
    );

    // Create a mock cell with virtual blocks if provided
    const mockCell = {
      worldPos: origin,
      virtualBlocks: scenario.virtualBlocks ? 
        new Map(Object.entries(scenario.virtualBlocks)) : 
        new Map()
    };

    const startTime = performance.now();
    
    try {
      // Generate neighbors using the movement system
      const neighbors = getNeighbors2(
        mockCell,
        this.mockConfig,
        this.mockManager,
        this.mockBot
      );

      // console.log(neighbors);
      
      const endTime = performance.now();

      // Filter neighbors by expected moves if specified
      let relevantNeighbors = neighbors;
      if (scenario.expectedMoves) {
        relevantNeighbors = neighbors.filter(n => 
          scenario.expectedMoves.includes(n.attributes?.name)
        );
      }

      // Validate results
      const validation = this.validateResults(scenario, relevantNeighbors);

      return {
        executionTime: endTime - startTime,
        totalNeighbors: neighbors.length,
        relevantNeighbors: relevantNeighbors.length,
        neighbors: relevantNeighbors,
        allNeighbors: options.includeAll ? neighbors : undefined,
        validation,
        success: validation.passed
      };
      
    } catch (error) {
      throw new Error(`Failed to execute test: ${error.message}`);
    }
  }

  /**
   * Validate test results against expected outcomes
   */
  validateResults(scenario, neighbors) {
    const validation = {
      passed: true,
      issues: [],
      checks: []
    };

    // Check expected move count
    if (scenario.expectedCount !== undefined) {
      const check = {
        type: "count",
        expected: scenario.expectedCount,
        actual: neighbors.length,
        passed: neighbors.length === scenario.expectedCount
      };
      validation.checks.push(check);
      
      if (!check.passed) {
        validation.passed = false;
        validation.issues.push(`Expected ${scenario.expectedCount} moves, got ${neighbors.length}`);
      }
    }

    // Check specific positions
    if (scenario.expectedPositions) {
      for (const expectedPos of scenario.expectedPositions) {
        const found = neighbors.some(n => 
          Math.floor(n.x) === expectedPos.x && 
          Math.floor(n.y) === expectedPos.y && 
          Math.floor(n.z) === expectedPos.z
        );
        
        const check = {
          type: "position",
          position: expectedPos,
          found,
          passed: found
        };
        validation.checks.push(check);
        
        if (!found) {
          validation.passed = false;
          validation.issues.push(`Expected position ${expectedPos.x},${expectedPos.y},${expectedPos.z} not found`);
        }
      }
    }

    // Check forbidden positions
    if (scenario.forbiddenPositions) {
      for (const forbiddenPos of scenario.forbiddenPositions) {
        const found = neighbors.some(n => 
          Math.floor(n.x) === forbiddenPos.x && 
          Math.floor(n.y) === forbiddenPos.y && 
          Math.floor(n.z) === forbiddenPos.z
        );
        
        const check = {
          type: "forbidden",
          position: forbiddenPos,
          found,
          passed: !found
        };
        validation.checks.push(check);
        
        if (found) {
          validation.passed = false;
          validation.issues.push(`Forbidden position ${forbiddenPos.x},${forbiddenPos.y},${forbiddenPos.z} was generated`);
        }
      }
    }

    // Check move types
    if (scenario.expectedMoves) {
      const actualMoves = [...new Set(neighbors.map(n => n.attributes?.name))];
      const missingMoves = scenario.expectedMoves.filter(m => !actualMoves.includes(m));
      
      if (missingMoves.length > 0) {
        validation.passed = false;
        validation.issues.push(`Missing expected moves: ${missingMoves.join(", ")}`);
      }
    }

    return validation;
  }

  /**
   * Generate visual ASCII representation of the test
   */
  generateVisualOutput(scenario, result, scenarioName) {
    console.log(`\n📊 Visual Output for: ${scenarioName}`);
    console.log("═".repeat(50));

    // Create a 3D ASCII representation
    const bounds = this.calculateBounds(scenario, result.neighbors);
    
    for (let y = bounds.maxY; y >= bounds.minY; y--) {
      console.log(`\nY=${y}:`);
      
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        let line = "";
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          const pos = new DirectionalVec3(x, y, z, { x: 0, z: 0 });
          const block = this.mockBot.blockAt(pos);
          const isOrigin = x === scenario.origin.x && y === scenario.origin.y && z === scenario.origin.z;
          const isNeighbor = result.neighbors.some(n => 
            Math.floor(n.x) === x && Math.floor(n.y) === y && Math.floor(n.z) === z
          );

          let symbol = " ";
          if (isOrigin) symbol = "🤖";
          else if (isNeighbor) symbol = "✅";
          else if (block.name !== "air") symbol = "⬛";
          else symbol = "⬜";

          line += symbol;
        }
        console.log(`  Z=${z}: ${line}`);
      }
    }

    // Legend
    console.log("\n📖 Legend:");
    console.log("🤖 = Origin (bot position)");
    console.log("✅ = Generated move");
    console.log("⬛ = Solid block");
    console.log("⬜ = Air/empty");

    // Results summary
    console.log(`\n📈 Results:`);
    console.log(`⏱️  Execution time: ${result.executionTime.toFixed(2)}ms`);
    console.log(`🎯 Total neighbors: ${result.totalNeighbors}`);
    console.log(`✨ Relevant neighbors: ${result.relevantNeighbors}`);
    console.log(`${result.validation.passed ? "✅" : "❌"} Validation: ${result.validation.passed ? "PASSED" : "FAILED"}`);

    if (result.validation.issues.length > 0) {
      console.log("\n⚠️  Issues:");
      result.validation.issues.forEach(issue => console.log(`  - ${issue}`));
    }

    // Show generated moves
    if (result.neighbors.length > 0) {
      console.log("\n🎬 Generated Moves:");
      result.neighbors.forEach((neighbor, i) => {
        const pos = `(${neighbor.x.toFixed(1)}, ${neighbor.y.toFixed(1)}, ${neighbor.z.toFixed(1)})`;
        const moveName = neighbor.attributes?.name || "Unknown";
        const cost = neighbor.attributes?.cost || neighbor.cost;
        const breaks = neighbor.attributes?.break?.length || 0;
        const places = neighbor.attributes?.place?.length || 0;
        
        console.log(`  ${i + 1}. ${moveName} -> ${pos} (cost: ${cost}, breaks: ${breaks}, places: ${places})`);
      });
    }
  }

  /**
   * Calculate bounds for visual output
   */
  calculateBounds(scenario, neighbors) {
    let minX = scenario.origin.x, maxX = scenario.origin.x;
    let minY = scenario.origin.y, maxY = scenario.origin.y;
    let minZ = scenario.origin.z, maxZ = scenario.origin.z;

    // Include neighbors
    neighbors.forEach(n => {
      minX = Math.min(minX, Math.floor(n.x));
      maxX = Math.max(maxX, Math.floor(n.x));
      minY = Math.min(minY, Math.floor(n.y));
      maxY = Math.max(maxY, Math.floor(n.y));
      minZ = Math.min(minZ, Math.floor(n.z));
      maxZ = Math.max(maxZ, Math.floor(n.z));
    });

    // Include world blocks
    if (scenario.world?.blocks) {
      scenario.world.blocks.forEach(block => {
        minX = Math.min(minX, block.x);
        maxX = Math.max(maxX, block.x);
        minY = Math.min(minY, block.y);
        maxY = Math.max(maxY, block.y);
        minZ = Math.min(minZ, block.z);
        maxZ = Math.max(maxZ, block.z);
      });
    }

    // Expand by 1 block for context
    return {
      minX: minX - 1, maxX: maxX + 1,
      minY: minY - 1, maxY: maxY + 1,
      minZ: minZ - 1, maxZ: maxZ + 1
    };
  }

  /**
   * Generate summary report for all tests
   */
  generateSummaryReport(results) {
    console.log("\n" + "=".repeat(60));
    console.log("🎯 TEST SUMMARY REPORT");
    console.log("=".repeat(60));

    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;

    console.log(`📊 Overall: ${passed}/${results.length} tests passed`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log("\n❌ Failed tests:");
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    // Performance summary
    const successfulResults = results.filter(r => r.success && r.result);
    if (successfulResults.length > 0) {
      const avgTime = successfulResults.reduce((sum, r) => sum + r.result.executionTime, 0) / successfulResults.length;
      const maxTime = Math.max(...successfulResults.map(r => r.result.executionTime));
      const minTime = Math.min(...successfulResults.map(r => r.result.executionTime));

      console.log(`\n⏱️  Performance:`);
      console.log(`  Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  Min: ${minTime.toFixed(2)}ms`);
      console.log(`  Max: ${maxTime.toFixed(2)}ms`);
    }
  }

  /**
   * Export test results to JSON
   */
  exportResults(filename) {
    const data = {
      timestamp: new Date().toISOString(),
      results: this.testResults
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`📄 Results exported to: ${filename}`);
  }

  // === Enhanced Move Discovery and Introspection ===

  /**
   * Get all registered moves with their metadata
   * @returns {Array<{move: Move, metadata: Object}>} All registered moves with metadata
   */
  getAllRegisteredMoves() {
    return getAllMoves().map(move => ({
      move,
      metadata: move.metadata,
      state: move.getCurrentState(),
      costs: move.getCostConstants(),
      requirements: move.getConfigRequirements()
    }));
  }

  /**
   * Get moves by category
   * @param {string} category - Category to filter by
   * @returns {Array<Move>} Moves in the category
   */
  getMovesByCategory(category) {
    return getMovesByCategory(category);
  }

  /**
   * Get moves by tag
   * @param {string} tag - Tag to filter by
   * @returns {Array<Move>} Moves with the tag
   */
  getMovesByTag(tag) {
    return getMovesByTag(tag);
  }

  /**
   * Generate automatic test scenarios for all registered moves
   * @returns {Map<string, Object>} Generated test scenarios
   */
  generateAutoTestScenarios() {
    const scenarios = new Map();
    const allMoves = this.getAllRegisteredMoves();

    for (const { move, metadata } of allMoves) {
      const scenarioName = `auto_${move.name.toLowerCase()}`;
      
      scenarios.set(scenarioName, {
        description: `Auto-generated test for ${move.name}: ${metadata.description}`,
        origin: { x: 0, y: 64, z: 0 },
        world: this.generateWorldForMove(move, metadata),
        config: { 
          ...metadata.testConfig,
          debugMoves: false
        },
        expectedMoves: [move.name],
        autoGenerated: true,
        moveMetadata: metadata
      });
    }

    return scenarios;
  }

  /**
   * Generate appropriate world configuration for a move
   * @param {Move} move - The move to generate world for
   * @param {Object} metadata - Move metadata
   * @returns {Object} World configuration
   */
  generateWorldForMove(move, metadata) {
    const blocks = [
      { x: 0, y: 63, z: 0, type: "stone", solid: true }, // Ground under origin
    ];

    // Add blocks based on move category and tags
    if (metadata.category === 'basic') {
      // Basic moves need simple flat ground
      blocks.push(
        { x: 1, y: 63, z: 0, type: "stone", solid: true },
        { x: 2, y: 63, z: 0, type: "stone", solid: true }
      );
      
      if (metadata.tags.includes('up')) {
        // Add a step up
        blocks.push({ x: 1, y: 64, z: 0, type: "stone", solid: true });
      }
      
      if (metadata.tags.includes('breaking')) {
        // Add blocks to break
        blocks.push({ x: 1, y: 64, z: 0, type: "stone", solid: true });
        blocks.push({ x: 1, y: 65, z: 0, type: "stone", solid: true });
      }
    } else if (metadata.category === 'parkour') {
      // Parkour moves need gaps
      blocks.push({ x: 3, y: 63, z: 0, type: "stone", solid: true }); // Landing
    } else if (metadata.category === 'swimming') {
      // Swimming moves need water
      blocks.push(
        { x: 0, y: 64, z: 0, type: "water", solid: false },
        { x: 1, y: 64, z: 0, type: "water", solid: false },
        { x: 1, y: 63, z: 0, type: "stone", solid: true }
      );
    }

    return { blocks };
  }

  /**
   * Run auto-generated tests for all moves
   * @param {Object} options - Test options
   * @returns {Array} Test results
   */
  async runAutoTests(options = {}) {
    console.log('🤖 Generating automatic tests for all registered moves...');
    
    const autoScenarios = this.generateAutoTestScenarios();
    const originalScenarios = new Map(this.scenarios);
    
    // Temporarily add auto scenarios
    for (const [name, scenario] of autoScenarios) {
      this.scenarios.set(name, scenario);
    }
    
    const results = [];
    
    for (const [name, scenario] of autoScenarios) {
      try {
        console.log(`\n🧪 Auto-testing: ${scenario.moveMetadata.name}`);
        const result = await this.runScenario(name, { ...options, visual: false });
        results.push({ name, result, success: true, autoGenerated: true });
      } catch (error) {
        console.error(`❌ Auto-test '${name}' failed:`, error.message);
        results.push({ name, error: error.message, success: false, autoGenerated: true });
      }
    }
    
    // Restore original scenarios
    this.scenarios = originalScenarios;
    
    this.generateAutoTestReport(results);
    return results;
  }

  /**
   * Generate report for auto-generated tests
   */
  generateAutoTestReport(results) {
    console.log("\n" + "=".repeat(60));
    console.log("🤖 AUTO-GENERATED TESTS REPORT");
    console.log("=".repeat(60));

    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;

    console.log(`📊 Overall: ${passed}/${results.length} auto-tests passed`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log("\n❌ Failed auto-tests:");
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    // Show which moves generated neighbors
    console.log("\n🎯 Move Coverage:");
    results.filter(r => r.success).forEach(r => {
      const count = r.result.totalNeighbors || 0;
      console.log(`  - ${r.name}: ${count} neighbors generated`);
    });
  }

  /**
   * Analyze move variable access and requirements
   * @param {string} moveName - Name of move to analyze
   * @returns {Object} Analysis results
   */
  analyzeMoveVariables(moveName) {
    const allMoves = getAllMoves();
    const move = allMoves.find(m => m.name === moveName);
    
    if (!move) {
      throw new Error(`Move '${moveName}' not found`);
    }

    return {
      name: move.name,
      metadata: move.metadata,
      state: move.getCurrentState(),
      costs: move.getCostConstants(),
      requirements: move.getConfigRequirements(),
      canRunWith: {
        basic: move.canRunWithConfig({ breakBlocks: false, placeBlocks: false }),
        breaking: move.canRunWithConfig({ breakBlocks: true, placeBlocks: false }),
        placing: move.canRunWithConfig({ breakBlocks: false, placeBlocks: true }),
        parkour: move.canRunWithConfig({ parkour: true }),
        swimming: move.canRunWithConfig({ swimming: true })
      }
    };
  }
}

/**
 * Mock bot for testing
 */
class MockBot {
  constructor() {
    this.version = "1.21.1";
    this.blocks = new Map();
    this.virtualBlocks = new Map();
    
    // Mock inventory
    this.inventory = {
      items: () => [
        { name: "dirt", count: 64 },
        { name: "cobblestone", count: 64 },
        { name: "stone", count: 32 }
      ]
    };
  }

  blockAt(pos) {
    const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    const defaultAir = { 
      name: "air", 
      boundingBox: "empty",
      shapes: [[0, 0, 0, 1, 0, 1]] // Empty shape
    };
    
    const block = this.blocks.get(key);
    if (!block) return defaultAir;
    
    // Ensure block has required properties
    if (!block.shapes) {
      block.shapes = block.boundingBox === "block" ? 
        [[0, 0, 0, 1, 1, 1]] : // Full block shape
        [[0, 0, 0, 1, 0, 1]]; // Empty shape
    }
    
    return block;
  }

  setBlock(pos, block) {
    const key = `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
    this.blocks.set(key, block);
  }

  clearWorld() {
    this.blocks.clear();
    this.virtualBlocks.clear();
  }
}

/**
 * Mock configuration for testing
 */
class MockConfig {
  constructor() {
    this.breakBlocks = true;
    this.placeBlocks = true;
    this.debugMoves = false;
    this.parkour = true;
    this.swimming = false;
    this.fly = false;
    this.maxFallDist = 3;
    this.maxWaterDist = 256;
    this.unbreakableBlocks = ["bedrock", "barrier"];
    this.blocksToAvoid = ["chest", "furnace"];
    this.blocksToStayAway = ["cactus", "lava"];
    this.disposableBlocks = ["dirt", "cobblestone", "stone"];
    this.interactableBlocks = ["oak_door", "iron_door"];
    this.climbableBlocks = ["ladder", "vine"];
  }
}

/**
 * Mock node manager for testing
 */
class MockManager {
  constructor() {
    this.brokenNodes = new Set();
    this.placedNodes = new Set();
    this.areaMarkedNodes = new Set();
  }

  markNode(node, type) {
    const key = `${Math.floor(node.x)},${Math.floor(node.y)},${Math.floor(node.z)}`;
    if (type === "broken") this.brokenNodes.add(key);
    else if (type === "placed") this.placedNodes.add(key);
    else if (type === "areaMarked") this.areaMarkedNodes.add(key);
  }

  isNodeBroken(node) {
    const key = `${Math.floor(node.x)},${Math.floor(node.y)},${Math.floor(node.z)}`;
    return this.brokenNodes.has(key);
  }

  isNodePlaced(node) {
    const key = `${Math.floor(node.x)},${Math.floor(node.y)},${Math.floor(node.z)}`;
    return this.placedNodes.has(key);
  }

  isAreaMarkedNode(node) {
    const key = `${Math.floor(node.x)},${Math.floor(node.y)},${Math.floor(node.z)}`;
    return this.areaMarkedNodes.has(key);
  }

  clear() {
    this.brokenNodes.clear();
    this.placedNodes.clear();
    this.areaMarkedNodes.clear();
  }
}

module.exports = {
  MoveTestRunner,
  MockBot,
  MockConfig,
  MockManager
};
