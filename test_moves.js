#!/usr/bin/env node

/**
 * Easy Movement Testing Script
 * 
 * Usage:
 * node test_moves.js                    # Run all tests
 * node test_moves.js basicForward       # Run specific test
 * node test_moves.js --list            # List all available tests
 * node test_moves.js --create custom   # Create a custom test interactively
 */

const { MoveTestRunner } = require('./src/testing/MoveTestRunner');
const testScenarios = require('./src/testing/TestScenarios');
const readline = require('readline');

class EasyMoveTestRunner {
  constructor() {
    this.testRunner = new MoveTestRunner();
    this.loadPredefinedScenarios();
  }

  loadPredefinedScenarios() {
    for (const [name, scenario] of Object.entries(testScenarios)) {
      this.testRunner.addScenario(name, scenario);
    }
  }

  async run() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      await this.runAllTests();
    } else if (args[0] === '--list') {
      this.listAvailableTests();
    } else if (args[0] === '--list-moves') {
      this.listAllMoves();
    } else if (args[0] === '--auto-test') {
      await this.runAutoTests();
    } else if (args[0] === '--analyze') {
      this.analyzeMoves(args[1]);
    } else if (args[0] === '--create') {
      await this.createCustomTest(args[1] || 'custom');
    } else if (args[0] === '--help') {
      this.showHelp();
    } else {
      await this.runSpecificTest(args[0]);
    }
  }

  async runAllTests() {
    console.log('🚀 Running all movement tests...\n');
    
    try {
      const results = await this.testRunner.runAll({ visual: true });
      
      // Export results
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `test-results-${timestamp}.json`;
      this.testRunner.exportResults(filename);
      
      console.log(`\n📄 Detailed results saved to: ${filename}`);
      
    } catch (error) {
      console.error('❌ Failed to run tests:', error.message);
      process.exit(1);
    }
  }

  async runSpecificTest(testName) {
    console.log(`🧪 Running specific test: ${testName}\n`);
    
    try {
      const result = await this.testRunner.runScenario(testName, { visual: true, includeAll: true });
      
      // Debug: Show ALL generated moves
      if (result.allNeighbors && result.allNeighbors.length > 0) {
        console.log('\n🔍 ALL Generated Moves (Debug):');
        result.allNeighbors.forEach((neighbor, i) => {
          const pos = `(${neighbor.x.toFixed(1)}, ${neighbor.y.toFixed(1)}, ${neighbor.z.toFixed(1)})`;
          const moveName = neighbor.attributes?.name || "Unknown";
          const cost = neighbor.attributes?.cost || neighbor.cost;
          console.log(`  ${i + 1}. ${moveName} -> ${pos} (cost: ${cost})`);
        });
      } else {
        console.log('\n🔍 DEBUG: No moves generated at all!');
      }
      
      if (result.success) {
        console.log(`\n✅ Test '${testName}' completed successfully!`);
      } else {
        console.log(`\n❌ Test '${testName}' failed.`);
        console.log('Issues:', result.validation.issues);
      }
      
    } catch (error) {
      console.error(`❌ Failed to run test '${testName}':`, error.message);
      process.exit(1);
    }
  }

  listAvailableTests() {
    console.log('📋 Available Test Scenarios:\n');
    
    for (const [name, scenario] of Object.entries(testScenarios)) {
      console.log(`🧪 ${name}`);
      console.log(`   ${scenario.description}`);
      console.log(`   Origin: (${scenario.origin.x}, ${scenario.origin.y}, ${scenario.origin.z})`);
      
      if (scenario.expectedMoves) {
        console.log(`   Expected: ${scenario.expectedMoves.join(', ')}`);
      }
      
      console.log('');
    }
    
    console.log('Usage:');
    console.log('  node test_moves.js [test_name]    # Run specific test');
    console.log('  node test_moves.js                # Run all tests');
    console.log('  node test_moves.js --create name  # Create custom test');
  }

  showHelp() {
    console.log('🎯 Easy Movement Testing System');
    console.log('===============================\n');
    
    console.log('Commands:');
    console.log('  node test_moves.js                    Run all predefined tests');
    console.log('  node test_moves.js [test_name]        Run a specific test scenario');
    console.log('  node test_moves.js --list             List available test scenarios');
    console.log('  node test_moves.js --list-moves       List all registered moves with metadata');
    console.log('  node test_moves.js --auto-test        Auto-generate and run tests for all moves');
    console.log('  node test_moves.js --analyze [move]   Analyze a specific move\'s variables and requirements');
    console.log('  node test_moves.js --create [name]    Create a custom test interactively');
    console.log('  node test_moves.js --help             Show this help message\n');
    
    console.log('Examples:');
    console.log('  node test_moves.js basicForward       # Test basic forward movement');
    console.log('  node test_moves.js --auto-test        # Test all registered moves automatically');
    console.log('  node test_moves.js --analyze MoveForward  # Analyze MoveForward variables');
    console.log('  node test_moves.js --list-moves       # See all available moves\n');
    
    console.log('Test Features:');
    console.log('  ✨ Visual ASCII representation of world and moves');
    console.log('  🎯 Validation of expected vs actual results');
    console.log('  🤖 Auto-discovery of all registered moves');
    console.log('  🔍 Variable access and move introspection');
    console.log('  ⏱️  Performance timing');
    console.log('  📊 Detailed move analysis (breaks, places, costs)');
    console.log('  🔍 Virtual blocks testing for pathfinding chains');
    console.log('  📄 JSON export of results');
  }

  async createCustomTest(name) {
    console.log(`🛠️  Creating custom test: ${name}\n`);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (question) => {
      return new Promise((resolve) => {
        rl.question(question, resolve);
      });
    };

    try {
      // Get basic info
      const description = await ask('Description: ');
      
      // Get origin
      const originX = parseInt(await ask('Origin X (default 0): ') || '0');
      const originY = parseInt(await ask('Origin Y (default 64): ') || '64');
      const originZ = parseInt(await ask('Origin Z (default 0): ') || '0');
      
      // Get configuration
      console.log('\n📋 Configuration (y/n):');
      const breakBlocks = (await ask('Enable breaking blocks? (y/n): ')).toLowerCase() === 'y';
      const placeBlocks = (await ask('Enable placing blocks? (y/n): ')).toLowerCase() === 'y';
      const parkour = (await ask('Enable parkour? (y/n): ')).toLowerCase() === 'y';
      const swimming = (await ask('Enable swimming? (y/n): ')).toLowerCase() === 'y';
      
      // Build blocks
      console.log('\n🧱 Add blocks to world (enter empty line to finish):');
      const blocks = [];
      
      while (true) {
        const blockInput = await ask('Block (x,y,z,type,solid): ');
        if (!blockInput.trim()) break;
        
        const parts = blockInput.split(',');
        if (parts.length >= 4) {
          blocks.push({
            x: parseInt(parts[0]),
            y: parseInt(parts[1]),
            z: parseInt(parts[2]),
            type: parts[3].trim(),
            solid: parts[4] ? parts[4].trim().toLowerCase() === 'true' : true
          });
        }
      }
      
      // Expected moves
      const expectedMovesInput = await ask('Expected move types (comma-separated): ');
      const expectedMoves = expectedMovesInput ? expectedMovesInput.split(',').map(s => s.trim()) : undefined;
      
      // Create the scenario
      const scenario = {
        description,
        origin: { x: originX, y: originY, z: originZ },
        world: { blocks },
        config: {
          breakBlocks,
          placeBlocks,
          parkour,
          swimming
        },
        expectedMoves
      };
      
      // Add and run the scenario
      this.testRunner.addScenario(name, scenario);
      
      console.log(`\n🧪 Running custom test: ${name}`);
      await this.testRunner.runScenario(name, { visual: true });
      
      // Save the scenario
      const scenarioCode = `const ${name} = ${JSON.stringify(scenario, null, 2)};`;
      console.log(`\n💾 To save this test permanently, add this to TestScenarios.js:`);
      console.log(scenarioCode);
      
    } catch (error) {
      console.error('❌ Error creating custom test:', error.message);
    } finally {
      rl.close();
    }
  }

  /**
   * List all registered moves with metadata
   */
  listAllMoves() {
    console.log('🔍 All Registered Moves:\n');
    
    const allMoves = this.testRunner.getAllRegisteredMoves();
    
    // Group by category
    const categories = {};
    for (const { move, metadata } of allMoves) {
      if (!categories[metadata.category]) {
        categories[metadata.category] = [];
      }
      categories[metadata.category].push({ move, metadata });
    }
    
    for (const [category, moves] of Object.entries(categories)) {
      console.log(`💻 ${category.toUpperCase()} MOVES:`);
      
      for (const { move, metadata } of moves) {
        console.log(`  🔄 ${move.name}`);
        console.log(`     Description: ${metadata.description}`);
        console.log(`     Priority: ${move.priority}`);
        console.log(`     Tags: [${metadata.tags.join(', ')}]`);
        console.log(`     Requirements: ${JSON.stringify(move.getConfigRequirements())}`);
        console.log('');
      }
    }
    
    console.log(`Total: ${allMoves.length} moves registered`);
  }

  /**
   * Run auto-generated tests for all moves
   */
  async runAutoTests() {
    console.log('🤖 Running auto-generated tests for all registered moves...\n');
    
    try {
      const results = await this.testRunner.runAutoTests({ visual: false });
      
      // Export results
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `auto-test-results-${timestamp}.json`;
      
      const exportData = {
        timestamp: new Date().toISOString(),
        type: 'auto-generated',
        results: results
      };
      
      require('fs').writeFileSync(filename, JSON.stringify(exportData, null, 2));
      console.log(`\n📄 Auto-test results saved to: ${filename}`);
      
    } catch (error) {
      console.error('❌ Failed to run auto-tests:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze move variables and requirements
   */
  analyzeMoves(moveName) {
    if (!moveName) {
      console.log('🔍 Available moves to analyze:');
      const allMoves = this.testRunner.getAllRegisteredMoves();
      allMoves.forEach(({ move }) => {
        console.log(`  - ${move.name}`);
      });
      console.log('\nUsage: node test_moves.js --analyze [MoveName]');
      return;
    }
    
    try {
      const analysis = this.testRunner.analyzeMoveVariables(moveName);
      
      console.log(`🔍 Analysis for: ${analysis.name}\n`);
      
      console.log('🏷️ Metadata:');
      console.log(`  Category: ${analysis.metadata.category}`);
      console.log(`  Description: ${analysis.metadata.description}`);
      console.log(`  Tags: [${analysis.metadata.tags.join(', ')}]`);
      console.log('');
      
      console.log('⚙️ Current State:');
      console.log(`  Priority: ${analysis.state.priority}`);
      console.log(`  Has Bot: ${analysis.state.hasBot}`);
      console.log(`  Has Config: ${analysis.state.hasConfig}`);
      console.log(`  Has Manager: ${analysis.state.hasManager}`);
      console.log('');
      
      console.log('💰 Cost Constants:');
      for (const [key, value] of Object.entries(analysis.costs)) {
        console.log(`  ${key}: ${value}`);
      }
      console.log('');
      
      console.log('📋 Configuration Requirements:');
      const reqs = Object.keys(analysis.requirements);
      if (reqs.length > 0) {
        reqs.forEach(req => console.log(`  - ${req}: required`));
      } else {
        console.log('  - No specific requirements detected');
      }
      console.log('');
      
      console.log('✅ Compatibility:');
      for (const [config, canRun] of Object.entries(analysis.canRunWith)) {
        console.log(`  ${config}: ${canRun ? '✅' : '❌'}`);
      }
      
    } catch (error) {
      console.error(`❌ Error analyzing move '${moveName}':`, error.message);
    }
  }
}

// Run the test system
if (require.main === module) {
  const runner = new EasyMoveTestRunner();
  runner.run().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = EasyMoveTestRunner;
